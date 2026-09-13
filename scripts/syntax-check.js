// 对仓库里所有 .js 做一次语法检查（node --check），CI 与本地自检共用。
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SKIP = new Set(["node_modules", ".git", "data", "logs"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

const files = walk(ROOT);
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failures.push(`${relative(ROOT, file)}\n${err.stderr?.toString() || err.message}`);
  }
}

console.log(`已检查 ${files.length} 个 JS 文件`);
if (failures.length) {
  console.error(`\n语法错误 ${failures.length} 处：\n${failures.join("\n\n")}`);
  process.exit(1);
}
console.log("全部通过 ✅");
