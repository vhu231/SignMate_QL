// ============================================================
// paths — 青龙环境下的配置目录 / 数据目录解析
//
// 订阅仓库目录（/ql/data/repo/xxx）会在每次订阅更新时被 git 重置，
// 因此配置与运行数据都要落在仓库之外的持久化目录里。
// ============================================================

import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** 青龙持久化根目录：/ql/data（官方镜像的挂载卷）。 */
export function qlDataRoot() {
  const explicit = String(process.env.QL_DATA_DIR || "").trim();
  if (explicit) return explicit;
  const qlDir = String(process.env.QL_DIR || "").trim();
  if (qlDir && existsSync(join(qlDir, "data"))) return join(qlDir, "data");
  if (existsSync("/ql/data")) return "/ql/data";
  return "";
}

/**
 * 运行数据目录（签到历史）。
 * 优先 SIGNMATE_DATA_DIR；青龙环境默认 /ql/data/signmate；否则回落到仓库内 data/。
 */
export function dataDir() {
  const explicit = String(process.env.SIGNMATE_DATA_DIR || "").trim();
  const root = qlDataRoot();
  const dir = explicit || (root ? join(root, "signmate") : join(REPO_DIR, "data"));
  try { mkdirSync(dir, { recursive: true }); } catch { /* 只读环境下由调用方处理 */ }
  return dir;
}

/**
 * 可选的 YAML/JSON 配置目录。
 * 优先 SIGNMATE_CONFIG_DIR；青龙环境默认 /ql/data/config/signmate；否则回落到仓库内 config/。
 */
export function configDir() {
  const explicit = String(process.env.SIGNMATE_CONFIG_DIR || "").trim();
  if (explicit) return explicit;
  const root = qlDataRoot();
  if (root) return join(root, "config", "signmate");
  return join(REPO_DIR, "config");
}
