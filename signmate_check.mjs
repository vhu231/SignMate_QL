/**
 * SignMate 签伴 · 青龙版配置自检
 *
 * 不会执行任何签到请求，只检查环境：站点凭据是否读到、代理与通知是否可用、
 * 可选依赖是否安装。输出里只有凭据的长度和指纹，不会打印 Cookie / Token 本身。
 *
 * 运行：task repo/<订阅目录>/signmate_check.js
 */

import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import BUILTIN_SITES from "./lib/builtin-sites.mjs";
import { buildEnvSuffixes, hasCredential, isPlaywrightAvailable, loadConfig, preloadRuntime } from "./lib/config.mjs";
import { configDir, dataDir, qlDataRoot } from "./lib/paths.mjs";
import { requiresBrowser, siteKind } from "./lib/runner.mjs";

function line(text = "") {
  console.log(text);
}

function fingerprint(value = "") {
  const text = String(value || "");
  if (!text) return "未配置";
  return `已配置（${text.length} 字符, sha1:${createHash("sha1").update(text).digest("hex").slice(0, 8)}）`;
}

async function optionalDep(name) {
  try {
    await import(name);
    return "✅ 已安装";
  } catch {
    return "❌ 未安装";
  }
}

async function main() {
  await preloadRuntime();
  const { sites, secrets, proxy, diagnostics } = loadConfig();
  const suffixMap = buildEnvSuffixes(diagnostics.allKeys);

  line("=".repeat(60));
  line("  SignMate 签伴 · 青龙版自检");
  line("=".repeat(60));

  line("");
  line("【运行环境】");
  line(`  Node.js        : ${process.version}`);
  line(`  时区 TZ        : ${process.env.TZ || "(未设置，默认按 Asia/Shanghai 计算日期)"}`);
  line(`  青龙数据目录   : ${qlDataRoot() || "(未检测到 /ql/data，按独立进程运行)"}`);
  line(`  配置目录       : ${configDir()}${existsSync(configDir()) ? "" : " (不存在，纯环境变量模式)"}`);
  line(`  历史数据目录   : ${dataDir()}`);

  line("");
  line("【可选依赖】");
  line(`  playwright-core: ${await optionalDep("playwright-core")}  — 浏览器模式站点需要`);
  line(`  sharp          : ${await optionalDep("sharp")}  — OpenCD 等验证码 OCR 需要`);
  line(`  tesseract.js   : ${await optionalDep("tesseract.js")}  — OpenCD 等验证码 OCR 需要`);
  line(`  yaml           : ${await optionalDep("yaml")}  — 使用 sites.yaml / secrets.yaml 时需要`);
  const chromium = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "";
  line(`  Chromium 路径  : ${chromium ? (existsSync(chromium) ? `✅ ${chromium}` : `❌ ${chromium}（文件不存在）`) : "未设置 CHROMIUM_PATH（将尝试自动探测）"}`);

  line("");
  line("【代理】");
  if (proxy.enabled) {
    line(`  已配置 ${proxy.urls.length} 个代理地址；auto 模式默认${String(process.env.SIGNMATE_PROXY_MODE || "").toLowerCase() === "proxy" ? "走代理" : "直连"}`);
    for (const url of proxy.urls) {
      try {
        const parsed = new URL(url);
        line(`  - ${parsed.protocol}//${parsed.hostname}:${parsed.port || "(默认端口)"}`);
      } catch {
        line("  - (地址格式无法解析)");
      }
    }
  } else {
    line("  未配置代理（SIGNMATE_PROXY_URL）。默认 proxy=on 的站点会被判定为不可达。");
  }

  line("");
  line("【通知】");
  const qlNotify = ["/ql/data/scripts/sendNotify.js", "/ql/data/scripts/notify.js"].find(p => existsSync(p));
  line(`  青龙通知模块   : ${qlNotify ? `✅ ${qlNotify}（面板「通知设置」里的渠道都可用）` : "❌ 未找到，将回落到内置 Telegram / Bark"}`);
  line(`  Telegram       : ${(process.env.SIGNMATE_TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN) ? "✅ 已配置 Bot Token" : "未配置"}`);
  line(`  Bark           : ${(process.env.SIGNMATE_BARK_URL || process.env.BARK_PUSH) ? "✅ 已配置" : "未配置"}`);

  line("");
  line("【站点】");
  const enabledKeys = new Set(sites.map(s => s.key));
  const rows = [...new Set([...Object.keys(BUILTIN_SITES), ...diagnostics.allKeys])].sort();
  let enabledCount = 0;
  const blockedByBrowser = [];

  for (const key of rows) {
    const site = sites.find(s => s.key === key) || BUILTIN_SITES[key] || {};
    const suffixes = suffixMap.get(key) || [];
    const secret = secrets[key] || {};
    const on = enabledKeys.has(key);
    if (on) enabledCount += 1;
    const kindLabel = siteKind(site) === "visit" ? "保活" : "签到";
    const status = on ? "✅ 启用" : (hasCredential(secret) ? "⏸ 已配置但未启用" : "— 未配置");
    line(`  ${status.padEnd(10)} ${key.padEnd(20)} ${kindLabel}  ${site.note || ""}`);
    line(`      环境变量   : SIGNMATE_COOKIE_${suffixes[0]}${suffixes.length > 1 ? `（简写 SIGNMATE_COOKIE_${suffixes[1]} 亦可）` : ""}`);
    if (secret.cookie) line(`      Cookie     : ${fingerprint(secret.cookie)}`);
    if (secret.api_key) line(`      API Key    : ${fingerprint(secret.api_key)}`);
    if (secret.token) line(`      Token      : ${fingerprint(secret.token)}`);
    if (secret.totp_secret) line(`      2FA Secret : ${fingerprint(secret.totp_secret)}`);
    const needsBrowser = requiresBrowser({ ...site, key });
    if (on) line(`      运行模式   : ${site.signin_mode || "api-first"}；代理 ${site.proxy_mode || "auto"}；${needsBrowser ? "需要浏览器" : "纯 HTTP 可用"}`);
    if (on && needsBrowser && !isPlaywrightAvailable()) {
      line("      ⚠️ 该站点必须有浏览器才能完成动作，当前未安装 playwright-core，运行会失败");
      blockedByBrowser.push(site.note || key);
    }
  }

  line("");
  line("=".repeat(60));
  line(`  已启用 ${enabledCount} 个站点；未配置凭据而跳过 ${diagnostics.skipped.length} 个`);
  if (blockedByBrowser.length) {
    line(`  ⚠️ 其中 ${blockedByBrowser.length} 个必须有浏览器：${blockedByBrowser.join("、")}`);
    line("     NexusPHP 系 PT 站点的 HTTP 路径只能读出「今日已签到」状态，真正的签到提交要浏览器；");
    line("     请安装 playwright-core + Chromium（设 CHROMIUM_PATH），或用 SIGNMATE_SITES_EXCLUDE 排除它们。");
  }
  line("  提示：只要设置了对应站点的 SIGNMATE_COOKIE_*，站点就会自动启用；");
  line("        也可以用 SIGNMATE_SITES 显式指定要跑哪些站点。");
  line("=".repeat(60));
}

main().catch(err => {
  console.error(`自检失败: ${err?.stack || err?.message || err}`);
  process.exitCode = 1;
});
