// ============================================================
// 从原版 SignMate 的 config/ 目录生成青龙环境变量
//
// 用法（在装了原版 SignMate 的机器上执行）：
//   node scripts/from-signmate-config.js /opt/docker/signmate/config
//
// 输出是可以直接粘进青龙 /ql/data/config/extra.sh 的 export 语句，
// 也可以照着变量名一条条录到青龙「环境变量」里。
//
// ⚠️ 输出包含真实 Cookie / Token，请勿贴到公开场合或提交进 Git。
// ============================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import BUILTIN_SITES from "../lib/builtin-sites.js";
import { buildEnvSuffixes } from "../lib/config.js";

const FIELD_PREFIX = {
  cookie: "COOKIE",
  api_key: "APIKEY",
  token: "TOKEN",
  totp_secret: "TOTP",
  username: "USERNAME",
  password: "PASSWORD",
};

function readYaml(path) {
  if (!existsSync(path)) return null;
  try {
    return parse(readFileSync(path, "utf-8")) || {};
  } catch (err) {
    console.error(`读取 ${path} 失败: ${err.message}`);
    return null;
  }
}

function shellQuote(value = "") {
  // 单引号包裹，内部的单引号按 shell 惯例转义。
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function main() {
  const dir = process.argv[2] || "config";
  const sitesRaw = readYaml(join(dir, "sites.yaml"));
  const secretsRaw = readYaml(join(dir, "secrets.yaml"));

  if (!sitesRaw && !secretsRaw) {
    console.error(`在 ${dir} 里没有找到 sites.yaml / secrets.yaml`);
    process.exit(1);
  }

  const sites = sitesRaw?.sites || {};
  const secrets = secretsRaw || {};
  const allKeys = [...new Set([...Object.keys(BUILTIN_SITES), ...Object.keys(sites), ...Object.keys(secrets)])];
  const suffixMap = buildEnvSuffixes(allKeys);

  const lines = [];
  const enabled = [];
  const customSites = {};

  for (const key of allKeys) {
    const site = sites[key];
    const secret = secrets[key];
    if (!site && !secret) continue;
    const suffix = (suffixMap.get(key) || [key.toUpperCase()])[0];

    if (site && site.enabled !== false) enabled.push(key);

    // 内置目录里没有的站点，需要用 SIGNMATE_CUSTOM_SITES 带过去。
    if (site && !BUILTIN_SITES[key]) {
      const { proxy_last_mode: _a, proxy_checked_at: _b, proxy_direct_ok: _c, ...clean } = site;
      customSites[key] = clean;
    }

    for (const [field, prefix] of Object.entries(FIELD_PREFIX)) {
      const value = secret?.[field];
      if (!value) continue;
      lines.push(`export SIGNMATE_${prefix}_${suffix}=${shellQuote(value)}`);
    }

    // 站点级代理策略
    const proxy = site?.proxy;
    if (proxy === "on" || proxy === true) lines.push(`export SIGNMATE_PROXY_${suffix}='on'`);
    else if (proxy === "off" || proxy === false) lines.push(`export SIGNMATE_PROXY_${suffix}='off'`);
  }

  const globalProxy = sitesRaw?.proxy?.urls || sitesRaw?.proxy?.url || "";
  const proxyList = Array.isArray(globalProxy) ? globalProxy.join(",") : String(globalProxy || "");

  console.log("# ============================================================");
  console.log("# SignMate → 青龙环境变量");
  console.log("# 粘贴到 /ql/data/config/extra.sh，或按变量名逐条录入「环境变量」");
  console.log("# ⚠️ 包含真实凭据，不要提交到 Git 或发到公开渠道");
  console.log("# ============================================================");
  console.log("");
  if (enabled.length) console.log(`export SIGNMATE_SITES=${shellQuote(enabled.join(","))}`);
  if (proxyList) console.log(`export SIGNMATE_PROXY_URL=${shellQuote(proxyList)}`);
  if (Object.keys(customSites).length) {
    console.log(`export SIGNMATE_CUSTOM_SITES=${shellQuote(JSON.stringify(customSites))}`);
  }
  console.log("");
  for (const line of lines) console.log(line);
  console.log("");
  console.log(`# 共导出 ${enabled.length} 个站点、${lines.length} 条凭据/代理变量`);
}

main();
