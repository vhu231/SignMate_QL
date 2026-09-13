// ============================================================
// logger — 日志输出（青龙适配版）
//
// 青龙面板会把任务进程的 stdout 直接写进任务日志并在面板里展示，
// 所以这里只做标准输出，不再自己维护 logs/ 目录和日志轮转。
// 需要落盘时设置 SIGNMATE_LOG_FILE=/ql/data/log/signmate.log 即可额外追加一份。
// ============================================================

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { format, inspect } from "node:util";

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_COLORS = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

// 青龙日志面板不渲染 ANSI 颜色，默认关闭；本地调试可用 SIGNMATE_LOG_COLOR=true 打开。
const USE_COLOR = String(process.env.SIGNMATE_LOG_COLOR || "").trim().toLowerCase() === "true";
const LOG_FILE = String(process.env.SIGNMATE_LOG_FILE || "").trim();

class Logger {
  #minLevel;

  constructor(level = "info") {
    this.#minLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }

  #timestamp() {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: process.env.TZ || "Asia/Shanghai",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date()).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  #formatArgs(args) {
    if (args.length === 0) return "";
    if (args.length === 1) {
      const a = args[0];
      return typeof a === "string" ? a : inspect(a, { depth: 4, colors: false });
    }
    if (typeof args[0] === "string" && args[0].includes("%")) return format(...args);
    return args.map(a => (typeof a === "string" ? a : inspect(a, { depth: 3, colors: false }))).join(" ");
  }

  #write(level, args) {
    const lvl = LOG_LEVELS[level];
    if (lvl == null || lvl < this.#minLevel) return;

    const ts = this.#timestamp();
    const msg = this.#formatArgs(args);
    const plain = `[${ts}] [${level.toUpperCase()}] ${msg}`;
    const color = USE_COLOR ? (LOG_COLORS[level] ?? "") : "";
    console.log(color ? `${color}[${ts}] [${level.toUpperCase()}]${RESET} ${msg}` : plain);

    if (LOG_FILE) {
      try {
        mkdirSync(dirname(LOG_FILE), { recursive: true });
        appendFileSync(LOG_FILE, `${plain}\n`);
      } catch { /* 日志落盘失败不应影响签到 */ }
    }
  }

  debug(...args) { this.#write("debug", args); }
  info(...args) { this.#write("info", args); }
  warn(...args) { this.#write("warn", args); }
  error(...args) { this.#write("error", args); }

  setLevel(level) {
    if (LOG_LEVELS[level] != null) this.#minLevel = LOG_LEVELS[level];
  }
}

export const logger = new Logger(process.env.LOG_LEVEL || "info");

export default logger;
