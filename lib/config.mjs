// ============================================================
// config — 青龙环境变量 → SignMate 站点 / 凭据配置
//
// 原版 SignMate 的配置来自 config/sites.yaml + config/secrets.yaml，
// 并由 Web 面板维护。青龙版没有面板，配置来源按优先级从低到高是：
//
//   1. 内置站点目录 builtin-sites.js（站点默认参数，不含任何凭据）
//   2. 可选的持久化配置文件 <configDir>/sites.(yaml|json) / secrets.(yaml|json)
//   3. 青龙环境变量 SIGNMATE_*（优先级最高）
// ============================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import logger from "./utils/logger.mjs";
import BUILTIN_SITES from "./builtin-sites.mjs";
import { configDir } from "./paths.mjs";
import { normalizeProxyUrl, siteProxyMode } from "./utils/proxy.mjs";

// 站点 key 里可以被剥掉的“域名尾巴”，让 SIGNMATE_COOKIE_HDSKY 这种简写可用。
const TLD_SUFFIXES = new Set(["com", "me", "net", "org", "cc", "club", "cd", "vip", "io", "xyz", "cn", "top", "info", "co"]);

/** 凭据字段 → 可用的环境变量前缀（按顺序取第一个非空值）。 */
const SECRET_FIELDS = {
  cookie: ["COOKIE", "CK"],
  api_key: ["APIKEY", "API_KEY", "ACCESS_TOKEN"],
  token: ["TOKEN"],
  totp_secret: ["TOTP", "TOTP_SECRET", "2FA"],
  username: ["USERNAME", "USER"],
  password: ["PASSWORD", "PASS"],
};

let yamlParser = null;
let playwrightAvailable = null;

export function envName(text = "") {
  return String(text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function env(name = "") {
  return String(process.env[name] ?? "").trim();
}

export function truthy(value = "") {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function splitList(value = "") {
  return String(value || "").split(/[\s,;，、]+/).map(v => v.trim()).filter(Boolean);
}

/**
 * 为每个站点 key 生成环境变量后缀候选（完整 → 简写）。
 * 例：hdsky-me → ["HDSKY_ME", "HDSKY"]；pt-btschool-club → ["PT_BTSCHOOL_CLUB", "PT_BTSCHOOL", "BTSCHOOL"]
 */
export function buildEnvSuffixes(siteKeys = []) {
  const candidates = new Map();
  const counts = new Map();

  for (const key of siteKeys) {
    const parts = String(key).split(/[^A-Za-z0-9]+/).filter(Boolean);
    const forms = [parts.join("_")];
    if (parts.length > 1 && TLD_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
      forms.push(parts.slice(0, -1).join("_"));
    }
    const last = forms[forms.length - 1].split("_");
    if (last.length > 1 && last[0].toLowerCase() === "pt") forms.push(last.slice(1).join("_"));

    const unique = [...new Set(forms.map(envName).filter(Boolean))];
    candidates.set(key, unique);
    for (const form of unique) counts.set(form, (counts.get(form) || 0) + 1);
  }

  // 简写和别的站点撞名时只保留完整形式，避免同一个 Cookie 被两个站点读到。
  const out = new Map();
  for (const [key, forms] of candidates) {
    out.set(key, forms.filter((form, index) => index === 0 || counts.get(form) === 1));
  }
  return out;
}

/** 预加载可选依赖 yaml；未安装时静默跳过，JSON 与环境变量依然可用。 */
export async function preloadYaml() {
  if (yamlParser) return;
  try {
    const mod = await import("yaml");
    yamlParser = mod.parse;
  } catch { /* yaml 是可选依赖 */ }
}

/** 探测 playwright-core 是否可用，供“浏览器模式自动降级”使用。 */
export async function preloadPlaywright() {
  if (playwrightAvailable !== null) return playwrightAvailable;
  try {
    await import("playwright-core");
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }
  return playwrightAvailable;
}

/** 一次性准备所有可选依赖，入口脚本在 loadConfig() 之前调用。 */
export async function preloadRuntime() {
  await preloadYaml();
  await preloadPlaywright();
}

function readConfigFile(dir, basename) {
  for (const ext of ["yaml", "yml", "json"]) {
    const path = join(dir, basename + "." + ext);
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf-8");
      if (ext === "json") return JSON.parse(raw) || {};
      if (!yamlParser) {
        logger.warn("[配置] 发现 " + path + " 但未安装 yaml 依赖，已跳过（可改用同名 .json）");
        continue;
      }
      return yamlParser(raw) || {};
    } catch (err) {
      logger.warn("[配置] 读取 " + path + " 失败: " + err.message);
    }
  }
  return {};
}

function parseJsonEnv(name) {
  const raw = env(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.warn("[配置] 环境变量 " + name + " 不是合法 JSON，已忽略: " + err.message);
    return null;
  }
}

function readSiteSecretsFromEnv(suffixes = []) {
  const out = {};
  for (const [field, prefixes] of Object.entries(SECRET_FIELDS)) {
    for (const prefix of prefixes) {
      const value = suffixes.map(suffix => env("SIGNMATE_" + prefix + "_" + suffix)).find(Boolean);
      if (value) { out[field] = value; break; }
    }
  }
  return out;
}

export function hasCredential(secret = {}) {
  return Boolean(secret.cookie || secret.api_key || secret.token || (secret.username && secret.password));
}

function globalProxyUrls() {
  const raw = env("SIGNMATE_PROXY_URL") || env("SIGNMATE_PROXY")
    || env("HTTPS_PROXY") || env("https_proxy")
    || env("HTTP_PROXY") || env("http_proxy")
    || env("ALL_PROXY") || env("all_proxy");
  return splitList(raw).map(normalizeProxyUrl).filter(Boolean);
}

/**
 * 组装青龙运行所需的站点与凭据配置。
 * @returns {{sites: Array, secrets: object, proxy: object, diagnostics: object}}
 */
export function loadConfig() {
  const dir = configDir();
  const fileSitesRaw = readConfigFile(dir, "sites");
  const fileSecrets = readConfigFile(dir, "secrets");

  const envSitesJson = parseJsonEnv("SIGNMATE_SITES_JSON") || {};
  const envSecretsJson = parseJsonEnv("SIGNMATE_SECRETS_JSON") || {};
  const customSites = parseJsonEnv("SIGNMATE_CUSTOM_SITES") || {};

  const overrides = { ...(fileSitesRaw.sites || fileSitesRaw), ...customSites, ...envSitesJson };
  const allKeys = [...new Set([...Object.keys(BUILTIN_SITES), ...Object.keys(overrides)])];
  const suffixMap = buildEnvSuffixes(allKeys);

  // ---- 凭据：配置文件 < SIGNMATE_SECRETS_JSON < 单独的 SIGNMATE_<字段>_<站点> ----
  const secrets = {};
  for (const key of allKeys) {
    const merged = {
      ...(fileSecrets[key] || {}),
      ...(envSecretsJson[key] || {}),
      ...readSiteSecretsFromEnv(suffixMap.get(key) || []),
    };
    if (Object.keys(merged).length) secrets[key] = merged;
  }

  // ---- 启用哪些站点 ----
  const requested = splitList(env("SIGNMATE_SITES"));
  const excluded = new Set(splitList(env("SIGNMATE_SITES_EXCLUDE")).map(v => v.toLowerCase()));
  const enableAll = requested.length === 1 && requested[0].toLowerCase() === "all";
  const requestedSet = new Set(requested.map(v => v.toLowerCase()));

  const proxyUrls = globalProxyUrls();
  const proxy = { enabled: proxyUrls.length > 0, url: proxyUrls[0] || "", urls: proxyUrls };
  // auto 模式的默认走向：SIGNMATE_PROXY_MODE=proxy 时统一走代理，否则直连。
  const autoPrefersProxy = env("SIGNMATE_PROXY_MODE").toLowerCase() === "proxy" && proxy.enabled;

  const defaultTimeout = Number(env("SIGNMATE_TIMEOUT") || env("HTTP_TIMEOUT") || 0) || 0;
  const rawRetry = env("SIGNMATE_RETRY");
  const defaultRetry = rawRetry === "" ? null : Number(rawRetry);

  const requirePlaywright = truthy(env("SIGNMATE_REQUIRE_PLAYWRIGHT"));
  const sites = [];
  const skipped = [];
  const downgraded = [];

  for (const key of allKeys) {
    const suffixes = suffixMap.get(key) || [];
    const names = [key.toLowerCase(), ...suffixes.map(s => s.toLowerCase())];
    const builtin = BUILTIN_SITES[key] || {};
    // kind / enforced_kind 是站点能力字段，以内置目录为准，不接受用户覆盖。
    const { kind: _kind, enforced_kind: _enforcedKind, ...userOverride } = overrides[key] || {};
    const perSiteJson = suffixes.map(suffix => parseJsonEnv("SIGNMATE_SITE_" + suffix)).find(Boolean) || {};
    const site = { ...builtin, ...userOverride, ...perSiteJson, key };

    const credential = secrets[key] || {};
    const wanted = enableAll
      ? true
      : requested.length
        ? names.some(name => requestedSet.has(name))
        : hasCredential(credential);

    if (!wanted) continue;
    if (names.some(name => excluded.has(name))) continue;
    if (site.enabled === false) continue;

    if (!hasCredential(credential)) {
      skipped.push({ key, note: site.note || key, reason: "未配置 Cookie / Token", envHint: "SIGNMATE_COOKIE_" + suffixes[0] });
      continue;
    }

    // ---- 代理策略：on / off / auto，或直接给一个代理地址 ----
    const rawProxy = suffixes.map(suffix => env("SIGNMATE_PROXY_" + suffix)).find(Boolean);
    if (rawProxy) {
      if (/^(on|off|auto)$/i.test(rawProxy)) site.proxy = rawProxy.toLowerCase();
      else { site.proxy = "on"; site.proxy_url = normalizeProxyUrl(rawProxy); }
    }
    const mode = siteProxyMode(site);
    const siteProxyUrl = site.proxy_url ? normalizeProxyUrl(site.proxy_url) : proxy.url;

    // ---- 运行模式：api（纯 HTTP）/ playwright（浏览器）----
    const rawMode = suffixes.map(suffix => env("SIGNMATE_MODE_" + suffix)).find(Boolean) || env("SIGNMATE_MODE");
    if (rawMode) {
      site.signin_mode = rawMode.toLowerCase();
    } else if (playwrightAvailable === false && !requirePlaywright && /^(playwright|browser)$/.test(String(site.signin_mode || ""))) {
      // 青龙里默认没有 playwright-core：自动退回 HTTP 模式，让绝大多数站点仍可工作，
      // 而不是所有浏览器模式站点一起失败。想强制浏览器模式设 SIGNMATE_REQUIRE_PLAYWRIGHT=true。
      site.signin_mode = "api";
      downgraded.push(key);
    }

    if (defaultTimeout) site.timeout = site.timeout ?? defaultTimeout;
    if (Number.isFinite(defaultRetry)) site.retry = defaultRetry;

    sites.push({
      ...site,
      proxy_mode: mode,
      proxy_url: siteProxyUrl,
      proxy_available: (mode === "on" || mode === "auto") ? Boolean(siteProxyUrl) : false,
      // 青龙版没有面板保存的探测结果：auto 默认直连，除非 SIGNMATE_PROXY_MODE=proxy。
      proxy_direct_ok: mode === "auto" ? !autoPrefersProxy : null,
      proxy_global_enabled: proxy.enabled,
    });
  }

  if (downgraded.length) {
    logger.warn("[配置] 未安装 playwright-core，以下站点已自动改用 HTTP 模式: " + downgraded.join(", "));
    logger.warn("[配置] 如需浏览器模式，请在青龙「依赖管理 → NodeJs」安装 playwright-core 并配置 CHROMIUM_PATH");
  }

  return { sites, secrets, proxy, diagnostics: { skipped, downgraded, suffixMap, allKeys } };
}

export { BUILTIN_SITES };
