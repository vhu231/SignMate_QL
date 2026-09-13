/**
 * SignMate 签伴 · 青龙面板版
 *
 * cron: 25 8 * * *
 * const $ = new Env('SignMate 签到');
 *
 * 多站点自动签到 / 保活。配置全部通过青龙「环境变量」维护，详见仓库 README。
 *
 * 手动运行示例（青龙「任务管理 → 新建任务」的命令）：
 *   task repo/<订阅目录>/signmate.js                 # 全部已配置站点
 *   task repo/<订阅目录>/signmate.js --kind=signin   # 只跑签到类站点
 *   task repo/<订阅目录>/signmate.js --kind=visit    # 只跑保活类站点
 *   task repo/<订阅目录>/signmate.js nodeseek v2ex   # 只跑指定站点
 */

import logger from "./lib/utils/logger.mjs";
import { loadConfig, preloadRuntime } from "./lib/config.mjs";
import { runSites, buildCategorizedNotifyMessages, sleep } from "./lib/runner.mjs";
import { notify, onlyFailures } from "./lib/notify.mjs";

function parseArgs(argv = []) {
  const only = [];
  let kind = null;
  let skipTodaySuccess = true;

  for (const raw of argv) {
    const arg = String(raw || "").trim();
    if (!arg) continue;
    if (arg === "--all" || arg === "-a") { kind = null; continue; }
    if (arg === "--force" || arg === "--no-skip") { skipTodaySuccess = false; continue; }
    if (arg.startsWith("--kind=")) { kind = arg.slice(7).toLowerCase(); continue; }
    if (arg === "--signin") { kind = "signin"; continue; }
    if (arg === "--visit") { kind = "visit"; continue; }
    if (arg.startsWith("-")) { logger.warn(`[参数] 忽略无法识别的参数: ${arg}`); continue; }
    only.push(arg.toLowerCase());
  }
  if (kind && !["signin", "visit"].includes(kind)) {
    logger.warn(`[参数] --kind 只支持 signin / visit，已忽略: ${kind}`);
    kind = null;
  }
  return { only, kind, skipTodaySuccess };
}

function matchesOnly(site, only = []) {
  if (!only.length) return true;
  const names = [site.key, site.driver, site.note].filter(Boolean).map(v => String(v).toLowerCase());
  return only.some(want => names.includes(want) || names.some(name => name.replace(/[^a-z0-9]+/g, "") === want.replace(/[^a-z0-9]+/g, "")));
}

async function randomStartDelay() {
  const max = Number(process.env.SIGNMATE_RANDOM_DELAY || 0);
  if (!Number.isFinite(max) || max <= 0) return;
  const seconds = Math.floor(Math.random() * (max + 1));
  if (seconds <= 0) return;
  logger.info(`[启动] 随机延迟 ${seconds} 秒后开始（SIGNMATE_RANDOM_DELAY=${max}）`);
  await sleep(seconds * 1000);
}

async function main() {
  const { only, kind, skipTodaySuccess } = parseArgs(process.argv.slice(2));

  logger.info("=".repeat(48));
  logger.info("  SignMate 签伴 · 青龙版");
  logger.info("=".repeat(48));

  await preloadRuntime();
  const { sites, secrets, proxy, diagnostics } = loadConfig();

  const selected = sites.filter(site => matchesOnly(site, only));
  if (diagnostics.skipped.length) {
    logger.info(`[配置] ${diagnostics.skipped.length} 个站点因缺少凭据未启用: ${diagnostics.skipped.map(s => s.key).join(", ")}`);
  }
  logger.info(`[配置] 已启用 ${sites.length} 个站点${only.length ? `，本次筛选出 ${selected.length} 个` : ""}${proxy.enabled ? `；代理: ${proxy.urls.length} 个` : "；未配置代理"}`);

  if (!selected.length) {
    logger.warn("[配置] 没有可执行的站点。请先在青龙「环境变量」里添加 SIGNMATE_COOKIE_<站点> 等凭据，再运行 signmate_check.mjs 自检。");
    return 0;
  }

  await randomStartDelay();

  const { results, skippedToday } = await runSites(selected, secrets, { kind, skipTodaySuccess });

  if (!results.length) {
    if (skippedToday.length) logger.info("[完成] 所有候选站点今天都已经成功过，本次无需执行");
    return 0;
  }

  const successCount = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success);
  const scope = kind === "visit" ? "访问保活" : (kind === "signin" ? "自动签到" : "签到/保活");
  const title = `SignMate ${scope}报告 (${successCount}/${results.length})`;

  const notifyResults = onlyFailures() ? failures : results;
  if (notifyResults.length) {
    const lines = buildCategorizedNotifyMessages(notifyResults);
    if (lines.length) await notify(title, lines);
  } else {
    logger.info(`[通知] ${title}：全部成功，且已设置只在失败时推送`);
  }

  const exitOnFailure = ["1", "true", "yes", "on"].includes(String(process.env.SIGNMATE_EXIT_CODE_ON_FAILURE || "").toLowerCase());
  return exitOnFailure && failures.length ? 1 : 0;
}

function forceExitSoon(code) {
  // Playwright / OCR 有时会留下未回收的句柄，导致进程迟迟不退出、
  // 青龙任务一直显示“运行中”。给日志留出缓冲时间后强制收尾。
  const grace = Number(process.env.SIGNMATE_EXIT_GRACE_MS || 8000);
  if (!Number.isFinite(grace) || grace <= 0) return;
  const timer = setTimeout(() => process.exit(code), grace);
  timer.unref?.();
}

main()
  .then(code => {
    process.exitCode = code || 0;
    forceExitSoon(code || 0);
  })
  .catch(err => {
    logger.error(`[致命错误] ${err?.message || String(err)}`);
    if (err?.stack) console.error(err.stack);
    process.exitCode = 1;
    forceExitSoon(1);
  });
