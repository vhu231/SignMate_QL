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
import { join } from "node:path";
import { createRequire } from "node:module";
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

function qlNotifyCandidates() {
  const root = qlDataRoot();
  const paths = [];
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
  if (ql) {
    try {
      await ql.fn(title, content);
      sent.push("青龙通知");
      logger.info("[通知] 已通过青龙通知模块发送 (" + ql.path + ")");
    } catch (err) {
      failures.push("青龙通知: " + (err.message || String(err)));
      logger.warn("[通知] 青龙通知模块发送失败: " + err.message);
    }
  }

  // 青龙通知不可用（或显式要求）时，用内置通道兜底。
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
    logger.info("[通知] 未配置任何通知渠道（青龙「通知设置」或 SIGNMATE_TG_BOT_TOKEN / SIGNMATE_BARK_URL）");
  }
  return { sent: sent.length > 0, channels: sent, failures };
}

export default notify;
