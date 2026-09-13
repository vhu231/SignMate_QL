// ============================================================
// store — 签到历史（青龙版）
//
// 只保留“当天是否已经成功过”这一个刚需能力：青龙的定时任务经常会
// 重试或手动补跑，已经签到成功的站点不应该被重复触发。
// 数据落在 SIGNMATE_DATA_DIR（默认 /ql/data/signmate/history.json）。
// ============================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import logger from "./utils/logger.mjs";
import { dataDir } from "./paths.mjs";

const MAX_ENTRIES = 500;

let cache = null;
let storePath = "";

function path() {
  if (!storePath) storePath = join(dataDir(), "history.json");
  return storePath;
}

function load() {
  if (cache) return cache;
  try {
    cache = existsSync(path()) ? (JSON.parse(readFileSync(path(), "utf-8")) || []) : [];
  } catch (err) {
    logger.warn("[Store] 读取历史失败，按空历史继续: " + err.message);
    cache = [];
  }
  if (!Array.isArray(cache)) cache = [];
  return cache;
}

function persist() {
  try {
    writeFileSync(path(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    logger.warn("[Store] 写入历史失败: " + err.message);
  }
}

/** 写入一条执行记录 */
export function addEntry(siteName, result = {}) {
  load();
  const entry = {
    site: siteName,
    siteKey: result.siteKey || result.key || null,
    kind: result.kind || result.details?.kind || "signin",
    category: result.category || null,
    success: result.success === true,
    message: String(result.message || "").slice(0, 500),
    timestamp: new Date().toISOString(),
    time: Date.now(),
  };
  cache.unshift(entry);
  if (cache.length > MAX_ENTRIES) cache.length = MAX_ENTRIES;
  persist();
  return entry;
}

/** 读取历史记录（最新在前） */
export function getHistory(limit = 200) {
  return load().slice(0, limit);
}

/** 清空历史 */
export function clearHistory() {
  cache = [];
  persist();
}
