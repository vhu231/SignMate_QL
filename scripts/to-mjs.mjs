// ============================================================
// to-mjs — 把 lib/ 下的 .js 改名为 .mjs，并重写相对导入
//
// 为什么需要：青龙订阅用 `find -name "*.js"` 递归扫描整个仓库，
// 扫到的每个 .js 都会被建成一条定时任务（没有 cron 注释就用默认 cron，
// 任务名从 `grep "name:"` 里瞎猜）。所以仓库里只保留 signmate.js 一个 .js，
// 其余全部用 .mjs —— `*.js` 这个 glob 匹配不到 `.mjs` 结尾的文件。
//
// 从上游同步 src/drivers、src/utils 之后跑一次即可（幂等）：
//   node scripts/to-mjs.mjs
// ============================================================

import { readdirSync, renameSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKIP_DIRS = new Set(["node_modules", ".git", "data", "logs", ".tmp"]);
// 只有这些文件允许带青龙可识别的后缀 —— 它们就是要被建成任务的入口。
const KEEP_TASK_FILES = new Set(["signmate.js"]);
// 青龙订阅默认的「文件后缀」列表，命中任何一个都会被建成定时任务。
const QL_TASK_EXTENSIONS = ["js", "py", "sh", "ts"];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function isScript(path) {
  return path.endsWith(".js") || path.endsWith(".mjs");
}

// 只重写相对路径（./ 或 ../ 开头）的 .js 导入，
// 绝不碰 "/ql/data/scripts/sendNotify.js" 这类青龙自己的文件路径。
const RELATIVE_JS = /(from\s*|import\s*\(\s*|require\s*\(\s*)(["'])(\.{1,2}\/[^"']*?)\.js\2/g;

function main() {
  const libDir = join(ROOT, "lib");
  const renamed = [];

  if (existsSync(libDir)) {
    for (const path of walk(libDir)) {
      if (!path.endsWith(".js")) continue;
      const target = path.slice(0, -3) + ".mjs";
      renameSync(path, target);
      renamed.push(relative(ROOT, path));
    }
  }

  let rewritten = 0;
  for (const path of walk(ROOT)) {
    if (!isScript(path)) continue;
    const source = readFileSync(path, "utf-8");
    const updated = source.replace(RELATIVE_JS, (_, head, quote, spec) => `${head}${quote}${spec}.mjs${quote}`);
    if (updated !== source) {
      writeFileSync(path, updated, "utf-8");
      rewritten += 1;
    }
  }

  const stray = walk(ROOT)
    .filter(path => QL_TASK_EXTENSIONS.some(ext => path.endsWith("." + ext)))
    .map(path => relative(ROOT, path).replace(/\\/g, "/"))
    .filter(path => !KEEP_TASK_FILES.has(path));

  console.log(`改名 ${renamed.length} 个文件，重写 ${rewritten} 个文件的导入`);
  if (stray.length) {
    console.error(`\n⚠️ 仓库里还有会被青龙建成定时任务的文件（后缀 ${QL_TASK_EXTENSIONS.join(" / ")}）：\n  ${stray.join("\n  ")}`);
    console.error("如果它们不该成为定时任务，请改成 .mjs / .txt 等青龙不扫描的后缀。");
    process.exit(1);
  }
  console.log("✅ 仓库里只有 signmate.js 会被青龙扫到，最多只会建出一条任务");
}

main();
