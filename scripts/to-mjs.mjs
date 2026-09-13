// ============================================================
// to-mjs — 把 lib/ 下的 .js 统一改名为 .mjs，并重写相对导入
//
// 为什么全仓库都用 .mjs：
//   1. 青龙订阅把「白名单匹配到的脚本」复制到 /ql/data/scripts/<别名>/ 再执行，
//      package.json 不在扫描后缀内、永远复制不过去，所以入口不能靠
//      package.json 的 "type": "module" 来确定模块类型 —— .mjs 才是明确的 ESM。
//   2. 顺带保持整仓一致，避免 .js/.mjs 混用时导入后缀写错。
//
// ⚠️ 后缀不能替代白名单：青龙 2.21 的默认 RepoFileExtensions 是
//    "js mjs py pyc"，.mjs 一样会被扫成定时任务。唯一可靠的控制点是订阅的
//    「白名单」，README 里已列为必填项。
//
// 从上游同步 src/drivers、src/utils 之后跑一次即可（幂等）：
//   node scripts/to-mjs.mjs
// ============================================================

import { readdirSync, renameSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKIP_DIRS = new Set(["node_modules", ".git", "data", "logs", ".tmp"]);
// 整个仓库都应该是 .mjs；出现 .js 通常意味着从上游复制后忘了跑这个脚本。
const ALLOWED_JS = new Set([]);

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
    .filter(path => path.endsWith(".js"))
    .map(path => relative(ROOT, path).replace(/\\/g, "/"))
    .filter(path => !ALLOWED_JS.has(path));

  console.log(`改名 ${renamed.length} 个文件，重写 ${rewritten} 个文件的导入`);
  if (stray.length) {
    console.error(`\n⚠️ 仓库里还有 .js 文件：\n  ${stray.join("\n  ")}`);
    console.error("青龙复制脚本时带不走 package.json，.js 的模块类型会变得不确定，请改名为 .mjs。");
    process.exit(1);
  }
  console.log("✅ 全仓库均为 .mjs，模块类型明确");
}

main();
