// ============================================================
// notify — 通知发送（青龙版）
//
// 优先复用青龙自带的 sendNotify.js：这样用户在面板里配好的
// 任意通知渠道（Telegram / Bark / 企业微信 / 钉钉 / PushPlus / Gotify…）
// 都能直接生效，不需要在本项目里重复实现一遍。
//
// 找不到青龙通知模块时，回落到内置的 Telegram / Bark 通道，
// 环境变量同时兼容青龙习惯（TG_BOT_TOKEN / BARK_PUSH）和 SignMate 原有命名。
// ============================================================

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import logger from "./utils/logger.mjs";
import { qlDataRoot } from "./paths.mjs";

const require = createRequire(import.meta.url);

function env(name) {
  return String(process.env[name] ?? "").trim();
}

function notifyDisabled() {
  return ["0", "false", "off", "no"].includes(env("SIGNMATE_NOTIFY").toLowerCase());
}

/** 只在有失败站点时才推送 */
export function onlyFailures() {
  return ["1", "true", "yes", "on"].includes(env("SIGNMATE_NOTIFY_ONLY_FAILURES").toLowerCase());
}

// 青龙 sendNotify.js 认的渠道环境变量。青龙会把这些变量名**全部**注入任务环境
// （值为空字符串），所以必须判断「有没有值」，不能判断「有没有这个变量」。
//
// 注意：面板「系统设置 → 通知设置」那份配置只供青龙自身的系统通知使用，
// 不会注入给 sendNotify.js。脚本要发通知，得在「环境变量」里单独配 —— 例如
// 面板里配了飞书(lark)，这里就要有 FSKEY。
const QL_NOTIFY_ENV_KEYS = [
  ["Bark", ["BARK_PUSH"]],
  ["Telegram", ["TG_BOT_TOKEN", "TG_USER_ID"]],
  ["钉钉", ["DD_BOT_TOKEN", "DD_BOT_SECRET"]],
  ["企业微信", ["QYWX_KEY", "QYWX_AM"]],
  ["飞书", ["FSKEY", "LARK_KEY"]],
  ["Server酱", ["PUSH_KEY"]],
  ["PushPlus", ["PUSH_PLUS_TOKEN"]],
  ["WxPusher", ["WXPUSHER_APP_TOKEN", "WXPUSHER_SPT_LIST"]],
  ["iGot", ["IGOT_PUSH_KEY"]],
  ["Gotify", ["GOTIFY_URL", "GOTIFY_TOKEN"]],
  ["PushMe", ["PUSHME_KEY"]],
  ["自定义 Webhook", ["WEBHOOK_URL"]],
  ["Chat", ["CHAT_URL", "CHAT_TOKEN"]],
  ["SMTP 邮件", ["SMTP_SERVER", "SMTP_EMAIL"]],
  ["PushDeer", ["DEER_KEY", "PUSHDEER_KEY"]],
  ["Synology Chat", ["SYNOLOGY_CHAT_URL"]],
  ["ntfy", ["NTFY_URL", "NTFY_TOPIC"]],
];

/** 青龙通知里实际配好了哪些渠道（只看变量有没有值）。 */
function qlConfiguredChannels() {
  return QL_NOTIFY_ENV_KEYS.filter(([, keys]) => keys.some(key => env(key))).map(([name]) => name);
}

function qlNotifyCandidates() {
  const root = qlDataRoot();
  const paths = [];
  // 青龙会把 sendNotify.js 复制进每个订阅自己的脚本目录，优先用同目录的那份。
  const selfDir = dirname(dirname(fileURLToPath(import.meta.url)));
  paths.push(join(selfDir, "sendNotify.js"), join(selfDir, "notify.js"));
  if (root) paths.push(join(root, "scripts", "sendNotify.js"), join(root, "scripts", "notify.js"));
  paths.push("/ql/data/scripts/sendNotify.js", "/ql/data/scripts/notify.js", "/ql/scripts/sendNotify.js", "/ql/scripts/notify.js");
  const custom = env("SIGNMATE_QL_NOTIFY_PATH");
  if (custom) paths.unshift(custom);
  return [...new Set(paths)];
}

/** 加载青龙自带的通知模块，返回 sendNotify(title, content) 或 null */
function loadQlNotify() {
  for (const path of qlNotifyCandidates()) {
    if (!existsSync(path)) continue;
    try {
      const mod = require(path);
      const fn = mod?.sendNotify || mod?.default?.sendNotify || (typeof mod === "function" ? mod : null);
      if (typeof fn === "function") return { fn, path };
    } catch (err) {
      logger.warn("[通知] 加载青龙通知模块失败 (" + path + "): " + err.message);
    }
  }
  return null;
}

function proxyUrl() {
  return env("SIGNMATE_NOTIFY_PROXY") || env("SIGNMATE_PROXY_URL") || "";
}

function chunkText(text = "", limit = 3900) {
  const out = [];
  let rest = String(text || "");
  while (rest.length > limit) {
    const cut = rest.lastIndexOf("\n", limit);
    const at = cut > limit / 2 ? cut : limit;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest.trim()) out.push(rest);
  return out.length ? out : [text];
}

async function sendTelegram(title, content) {
  const token = env("SIGNMATE_TG_BOT_TOKEN") || env("TELEGRAM_BOT_TOKEN") || env("TG_BOT_TOKEN");
  const chatId = env("SIGNMATE_TG_USER_ID") || env("TELEGRAM_CHAT_ID") || env("TG_USER_ID");
  if (!token || !chatId) return false;

  const proxy = proxyUrl();
  const url = "https://api.telegram.org/bot" + token + "/sendMessage";
  const escape = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const chunks = chunkText(escape(content));

  for (let i = 0; i < chunks.length; i++) {
    const heading = "<b>📋 " + escape(title) + (chunks.length > 1 ? " (" + (i + 1) + "/" + chunks.length + ")" : "") + "</b>";
    const payload = {
      chat_id: chatId,
      text: heading + "\n\n" + chunks[i],
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    const attempts = proxy ? [proxy, ""] : [""];
    let sent = false;
    let lastError = "";
    for (const attempt of attempts) {
      try {
        const options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25_000),
        };
        if (attempt) options.dispatcher = new ProxyAgent(attempt);
        const response = await undiciFetch(url, options);
        if (response.ok) { sent = true; break; }
        lastError = "HTTP " + response.status + " — " + (await response.text().catch(() => "")).slice(0, 200);
        // 4xx 多半是内容/配置问题，换网络路径没有意义。
        if (response.status >= 400 && response.status < 500) break;
      } catch (err) {
        lastError = err.message || String(err);
      }
    }
    if (!sent) throw new Error("Telegram: " + (lastError || "发送失败"));
  }
  logger.info("[通知] Telegram 发送成功");
  return true;
}

async function sendBark(title, content) {
  const raw = env("SIGNMATE_BARK_URL") || env("BARK_PUSH");
  if (!raw) return false;
  const base = /^https?:\/\//i.test(raw) ? raw.replace(/\/+$/, "") : "https://api.day.app/" + raw.replace(/^\/+|\/+$/g, "");
  const endpoint = base + "/" + encodeURIComponent(title) + "/" + encodeURIComponent(content) + "?automaticallyCopy=1";
  const response = await undiciFetch(endpoint, { method: "GET", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Bark: HTTP " + response.status);
  logger.info("[通知] Bark 发送成功");
  return true;
}

/**
 * 发送通知。
 * @param {string} title 通知标题
 * @param {string|string[]} body 通知正文
 */
export async function notify(title, body) {
  const content = Array.isArray(body) ? body.join("\n\n") : String(body || "");
  logger.info("\n===== " + title + " =====\n" + content + "\n");

  if (notifyDisabled()) {
    logger.info("[通知] SIGNMATE_NOTIFY 已关闭，仅输出到任务日志");
    return { sent: false, channels: [] };
  }

  const sent = [];
  const failures = [];

  const ql = loadQlNotify();
  const qlChannels = qlConfiguredChannels();
  if (ql) {
    try {
      await ql.fn(title, content);
      if (qlChannels.length) {
        // 只有确认配了渠道才敢说“已发送” —— sendNotify.js 在一个渠道都没配时
        // 也是静默正常返回的，仅凭“没抛异常”判断成功会误报。
        sent.push("青龙通知(" + qlChannels.join("/") + ")");
        logger.info("[通知] 已通过青龙通知发送，渠道: " + qlChannels.join("、"));
      } else {
        logger.warn("[通知] 已调用青龙通知模块，但没有检测到任何已配置的渠道变量，消息很可能没有真正发出。");
        logger.warn("[通知] 面板「通知设置」只作用于青龙自身的系统通知，不会注入给 sendNotify.js；");
        logger.warn("[通知] 脚本要推送，请在青龙「环境变量」里配置对应变量（飞书=FSKEY，Telegram=TG_BOT_TOKEN+TG_USER_ID，Bark=BARK_PUSH…）。");
      }
    } catch (err) {
      failures.push("青龙通知: " + (err.message || String(err)));
      logger.warn("[通知] 青龙通知模块发送失败: " + err.message);
    }
  }

  // 青龙通知没配好（或显式要求）时，用内置通道兜底。
  const forceBuiltin = ["1", "true", "yes", "on"].includes(env("SIGNMATE_NOTIFY_BUILTIN").toLowerCase());
  if (!sent.length || forceBuiltin) {
    for (const [name, fn] of [["Telegram", sendTelegram], ["Bark", sendBark]]) {
      try {
        if (await fn(title, content)) sent.push(name);
      } catch (err) {
        failures.push(name + ": " + (err.message || String(err)));
        logger.warn("[通知] " + name + " 发送失败: " + err.message);
      }
    }
  }

  if (!sent.length && !failures.length) {
    logger.warn("[通知] 本次没有任何渠道真正发出消息。请在青龙「环境变量」里配置 FSKEY / TG_BOT_TOKEN+TG_USER_ID / BARK_PUSH 等，或配置 SIGNMATE_TG_BOT_TOKEN / SIGNMATE_BARK_URL。");
  }
  return { sent: sent.length > 0, channels: sent, failures };
}

export { qlConfiguredChannels };
export default notify;
