// ============================================================
// runner — 执行引擎（青龙版）
//
// 与原版的区别：
//   - 不读写 config/sites.yaml，配置全部来自 config.js
//   - 不维护 Web 面板用的批量状态文件
//   - 通知统一交给 notify.js（优先走青龙自带通知）
// 结果格式化逻辑与原版保持一致，方便两边的通知看起来一样。
// ============================================================

import logger from "./utils/logger.mjs";
import { loadDriver } from "./registry.mjs";
import * as store from "./store.mjs";
import { siteProxyMode } from "./utils/proxy.mjs";
import { requiresBrowser } from "./capabilities.mjs";

const CATEGORY_META = new Map([
  ["forum", { key: "forum", label: "论坛", emoji: "💬" }],
  ["pt", { key: "pt", label: "PT站点", emoji: "📀" }],
]);

function normalizeCategoryKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function siteCategory(siteConfig = {}) {
  return normalizeCategoryKey(siteConfig.category || (siteConfig.kind === "visit" ? "pt" : "forum")) || "forum";
}

export function siteKind(site = {}) {
  return site.kind || (site.driver === "website" || site.driver === "visit" ? "visit" : "signin");
}

export { requiresBrowser };

export function localDateKey(value = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value || Date.now()));
}

export function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 今天已经成功执行过的站点 key（用于重复触发时跳过） */
function successfulSiteKeysToday(sites = []) {
  const today = localDateKey();
  const kindByKey = new Map();
  const nameToKey = new Map();
  for (const site of sites) {
    const key = String(site.key || site.driver || "");
    if (!key) continue;
    kindByKey.set(key, siteKind(site));
    for (const name of [site.key, site.driver, site.note, site.name].filter(Boolean)) nameToKey.set(String(name), key);
  }
  if (!nameToKey.size) return new Set();

  const successful = new Set();
  for (const entry of store.getHistory(800)) {
    if (entry.success !== true) continue;
    if (localDateKey(entry.timestamp || entry.time || Date.now()) !== today) continue;
    const matchedKey = [entry.siteKey, entry.key, entry.site].filter(Boolean)
      .map(v => nameToKey.get(String(v)) || "").find(Boolean);
    if (!matchedKey) continue;
    const entryKind = entry.kind || entry.details?.kind || "signin";
    if (entryKind !== kindByKey.get(matchedKey)) continue;
    successful.add(matchedKey);
  }
  return successful;
}

// --------------------------------------------------
// 结果 → 通知文案（与原版保持一致）
// --------------------------------------------------

export function inferResultStatus(result = {}) {
  const details = result.details || {};
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const message = String(result.message || "");
  const stepText = steps.map(s => `${s.label || ""} ${s.detail || ""}`).join("；");
  const allText = `${message}；${stepText}`;
  const kind = result.kind || "signin";

  if (details.checkinAction === "already_signed_before_run"
    || (details.alreadySigned === true && details.clickedSignIn !== true && details.submitted !== true)
    || /运行前已是已签到状态|今日已完成签到|今天已完成签到|今日已签到|今天已签到|已签到\d+天/.test(allText)) return "✓ 今日已签到";
  if (details.checkinAction === "captcha_solved" || (result.success && /OCR 验证码通过|验证码通过/.test(allText))) return "✓ 验证码通过，签到成功";
  // 成功结果优先按成功摘要处理，避免步骤名“验证码/OCR”导致通知误判为拦截。
  if (result.success && /已点击|点击签到|签到成功|签到已得|本次签到获得|签到获得|领取|获得|奖励|魔力值|分享率|check.?in/i.test(allText)) return kind === "visit" ? "✓ 保活成功" : "✓ 签到成功";
  if (details.checkinBlockedByCaptcha || details.verificationBlocked || /验证码|极验|captcha|人机|验证措施|验证码输入错误/.test(allText)) return "⚠ 验证码拦截";
  if (result.success) return kind === "visit" ? "✓ 保活完成" : "✓ 状态正常";
  if (/Cookie 未配置|登录态异常|访问失败或登录态异常|未识别到登录用户|未登录|账号态|请更新 Cookie|Cookie.*失效|HTTP 401|HTTP 403/.test(allText)) return "⚠ 登录态异常";
  if (/站点离线|直连失败|没有可用代理|ENOTFOUND|ETIMEDOUT|ECONN|timeout/i.test(allText)) return "⚠ 站点不可达";
  return kind === "visit" ? "✗ 保活失败" : "✗ 签到失败";
}

function compactNotifyHead(result = {}, lines = []) {
  const icon = result.success ? "✅" : "❌";
  const site = String(result.site || result.name || result.key || result.siteKey || "站点").trim();
  if (site && site !== "站点") return `${icon} ${site}`;
  const first = String(lines[0] || "").trim();
  const match = first.match(/^([✅❌⚠️⚠✗✓]\s*)?([^:：\n]+)[:：]/);
  return match ? `${icon} ${match[2].trim()}` : (first || `${icon} 站点`);
}

function compactMTeamResultForNotify(result = {}, status = "✓ 保活成功") {
  const details = result.details || {};
  if (!result.success) return null;
  const site = String(result.site || result.name || result.key || result.siteKey || "M-Team").trim() || "M-Team";
  return [`✅ ${site}: 保活完成，API 令牌有效；用户 ${details.username || "-"}；魔力 ${details.bonus || "-"}；`, `📝 ${status}`].join("\n");
}

export function compactResultForNotify(result = {}) {
  const formatted = String(result.formatted || "");
  const lines = formatted.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const head = compactNotifyHead(result, lines);
  const detailLine = lines.find(line => line.startsWith("📝")) || `📝 ${result.message || ""}`;
  const detail = detailLine.replace(/^📝\s*/, "").trim();
  const details = result.details || {};
  const status = inferResultStatus(result);

  if (details.checkinAction === "api_token_keepalive") {
    const mteam = compactMTeamResultForNotify(result, status);
    if (mteam) return mteam;
  }

  const seenParts = new Set();
  const parts = detail.split(/[；;]+/).map(part => part.trim()).filter(Boolean)
    .filter(part => part !== status && !/^✓\s*(签到成功|今日已签到|保活成功|保活完成)$/.test(part))
    .filter(part => {
      const normalized = part.replace(/\s+/g, " ");
      if (seenParts.has(normalized)) return false;
      seenParts.add(normalized);
      return true;
    });
  const picked = [];
  const prefer = [/连续签到|累计签到|已签到\s*\d+\s*天/, /总签到/, /魔力值|魔力|分享率|积分|金币|鸡腿|经验|碎银子|等级|用户|活跃|能量/, /检查时间|签到时间/];
  for (const re of prefer) {
    const idx = parts.findIndex(part => re.test(part) && !picked.includes(part));
    if (idx >= 0) picked.push(parts[idx]);
  }
  for (const part of parts) {
    if (picked.length >= 3) break;
    if (!picked.includes(part)) picked.push(part);
  }

  if (details.beforeDays !== null && details.beforeDays !== undefined && details.afterDays !== null && details.afterDays !== undefined) {
    const delta = Number(details.daysDelta ?? (details.afterDays - details.beforeDays));
    const summary = `天数 ${details.beforeDays} → ${details.afterDays}${Number.isFinite(delta) ? `（+${delta}）` : ""}`;
    if (!picked.some(part => part.includes("天数 "))) picked.unshift(summary);
  }

  const detailLines = [`📝 ${status}`];
  for (let i = 0; i < Math.min(picked.length, 2); i++) detailLines.push(`   ${picked[i]}`);
  if (picked.length > 2) detailLines.push(`   ${picked.slice(2).join("；")}`);
  return [head, ...detailLines].join("\n");
}

export function buildCategorizedNotifyMessages(results = []) {
  const groups = new Map();
  for (const result of results) {
    if (!result?.formatted) continue;
    const key = result.category || "forum";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }

  const out = [];
  for (const key of [...new Set(["forum", "pt", ...groups.keys()])]) {
    if (!groups.has(key)) continue;
    const items = groups.get(key);
    const meta = CATEGORY_META.get(key) || { label: key, emoji: "🏷️" };
    out.push(`${meta.emoji} ${meta.label}（${items.filter(item => item.success).length}/${items.length}）`);
    for (const item of items) out.push(compactResultForNotify(item));
  }
  return out;
}

// --------------------------------------------------
// 执行
// --------------------------------------------------

function resolveProxyForSite(siteConfig = {}) {
  const mode = siteConfig.proxy_mode || siteProxyMode(siteConfig);
  const proxyUrl = siteConfig.proxy_url || "";

  if (mode === "off") {
    return { ...siteConfig, proxy_url: "", proxy_used: false, proxy_reason: "disabled", proxy_mode_used: "direct" };
  }
  if (mode === "on") {
    if (!proxyUrl) {
      return {
        ...siteConfig,
        proxy_used: false,
        proxy_reason: "no_valid_proxy",
        proxy_mode_used: "offline",
        site_offline: true,
        offline_reason: "该站点要求走代理，但没有配置代理地址（设置环境变量 SIGNMATE_PROXY_URL，或把该站点改为 SIGNMATE_PROXY_<KEY>=auto）",
      };
    }
    return { ...siteConfig, proxy_url: proxyUrl, proxy_used: true, proxy_reason: "forced", proxy_mode_used: "proxy" };
  }
  // auto：默认直连；SIGNMATE_PROXY_MODE=proxy 时（config.js 会把 proxy_direct_ok 置 false）统一走代理。
  if (siteConfig.proxy_direct_ok === false && proxyUrl) {
    return { ...siteConfig, proxy_url: proxyUrl, proxy_used: true, proxy_reason: "auto_proxy", proxy_mode_used: "proxy" };
  }
  return { ...siteConfig, proxy_url: "", proxy_candidate_url: proxyUrl, proxy_used: false, proxy_reason: "auto_direct", proxy_mode_used: "direct" };
}

/** 执行单个站点 */
export async function runSingle(siteConfig, secrets = {}) {
  const driverName = siteConfig.driver;
  const label = siteConfig.note || siteConfig.key || driverName;
  const base = {
    site: label,
    siteKey: siteConfig.key || driverName,
    kind: siteKind(siteConfig),
    category: siteCategory(siteConfig),
  };

  let DriverClass;
  try {
    DriverClass = await loadDriver(driverName);
  } catch (err) {
    logger.warn(`[跳过] ${label}: ${err.message}`);
    return { ...base, success: false, message: err.message, formatted: `❌ ${label}\n📝 ${err.message}`, steps: [{ label: "加载 Driver", ok: false, detail: err.message }] };
  }

  const effective = resolveProxyForSite(siteConfig);
  if (effective.site_offline) {
    const reason = effective.offline_reason || "站点离线：直连和代理均不可用";
    return {
      ...base,
      success: false,
      message: reason,
      formatted: `❌ ${label}\n📝 ${reason}`,
      details: { proxyModeUsed: "offline", proxyUsed: false, proxyReason: effective.proxy_reason },
      steps: [{ label: "判断站点连通性", ok: false, detail: reason }],
    };
  }

  const driver = new DriverClass(effective, secrets);
  const result = await driver.runWithRetry();
  result.details = { ...(result.details || {}), proxyModeUsed: effective.proxy_mode_used, proxyUsed: effective.proxy_used, proxyReason: effective.proxy_reason };
  const logLine = driver.formatResult(result);
  logger.info(logLine);

  return {
    ...base,
    success: result.success,
    message: result.message,
    formatted: logLine,
    details: result.details || null,
    steps: result.steps || [],
  };
}

/**
 * 执行一批站点。
 * @param {Array} sites   已解析的站点配置
 * @param {object} secrets 凭据
 * @param {object} options { kind, skipTodaySuccess, delayMs }
 */
export async function runSites(sites = [], secrets = {}, options = {}) {
  const kind = options.kind || null;
  const candidates = sites.filter(site => !kind || siteKind(site) === kind);
  if (!candidates.length) return { results: [], skippedToday: [] };

  const skipTodaySuccess = options.skipTodaySuccess !== false;
  const todaySuccessful = skipTodaySuccess ? successfulSiteKeysToday(candidates) : new Set();
  const enabled = candidates
    .filter(site => !todaySuccessful.has(String(site.key || site.driver || "")))
    // 先签到后保活，和原版顺序一致。
    .sort((a, b) => (siteKind(a) === "signin" ? 0 : 1) - (siteKind(b) === "signin" ? 0 : 1));

  if (todaySuccessful.size) {
    logger.info(`[跳过] 今日已有成功记录: ${[...todaySuccessful].join(", ")}`);
  }
  if (!enabled.length) {
    logger.info("[执行] 本次没有需要运行的站点");
    return { results: [], skippedToday: [...todaySuccessful] };
  }

  logger.info(`[执行] 开始处理 ${enabled.length} 个站点`);
  const delayMs = Number(options.delayMs || process.env.SIGNMATE_SITE_DELAY_MS || 0) || 0;
  const results = [];

  for (let i = 0; i < enabled.length; i++) {
    const site = enabled[i];
    const label = site.note || site.key || site.driver;
    logger.info("-".repeat(48));
    logger.info(`[${i + 1}/${enabled.length}] ${label}`);
    try {
      const result = await runSingle(site, secrets);
      results.push(result);
    } catch (err) {
      const message = `执行异常：${err?.message || String(err)}`;
      logger.error(`[${label}] ${message}`);
      results.push({
        site: label,
        siteKey: site.key || site.driver,
        kind: siteKind(site),
        category: siteCategory(site),
        success: false,
        message,
        formatted: `❌ ${label}\n📝 ${message}`,
        details: { error: err?.stack || String(err) },
        steps: [{ label: "执行异常", ok: false, detail: err?.message || String(err) }],
      });
    }
    try {
      store.addEntry(results[results.length - 1].site, results[results.length - 1]);
    } catch (err) {
      logger.warn(`[Store] 记录结果失败: ${err.message}`);
    }
    if (delayMs > 0 && i < enabled.length - 1) await sleep(delayMs);
  }

  logger.info("-".repeat(48));
  logger.info(`[执行] 完成: ${results.filter(r => r.success).length}/${results.length} 成功`);
  return { results, skippedToday: [...todaySuccessful] };
}
