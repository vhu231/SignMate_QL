# AGENTS.md — SignMate_QL 协作说明

## 这个仓库是什么

[HughRyu/SignMate](https://github.com/HughRyu/SignMate) 的青龙面板适配版。
上游是 Docker + Express Web 面板 + node-cron 的常驻服务；这里把它拆成
「青龙订阅仓库 + 单次执行的任务脚本」，配置改走环境变量。

## 目录职责

| 路径 | 来源 | 说明 |
| --- | --- | --- |
| `lib/drivers/` | 上游 `src/drivers/` | 站点驱动，**尽量保持与上游逐字一致**，方便同步 |
| `lib/utils/` | 上游 `src/utils/` | HTTP / 代理 / Discuz 等工具，同上 |
| `lib/builtin-sites.js` | 上游 `src/builtin-sites.js` | 内置站点目录，直接同步 |
| `lib/captcha-ocr.js` | 上游同名文件 | 已改为按需加载 sharp / tesseract.js |
| `lib/config.js` | 本仓库新增 | 环境变量 → 站点/凭据配置 |
| `lib/runner.js` | 本仓库重写 | 去掉批量状态文件与 yaml 回写 |
| `lib/notify.js` | 本仓库重写 | 优先复用青龙 `sendNotify.js` |
| `lib/store.js` | 本仓库重写 | 只保留「今天是否已成功」判断 |
| `lib/paths.js` | 本仓库新增 | 解析 `/ql/data` 下的配置与数据目录 |
| `signmate.js` | 本仓库新增 | 青龙任务入口，顶部带 `cron:` 注释 |
| `signmate_check.js` | 本仓库新增 | 配置自检，不发签到请求 |

## 从上游同步驱动时

1. 直接复制上游的 `src/drivers/*`、`src/utils/*`、`src/builtin-sites.js`
2. 复制完必须重新打上这两处青龙适配补丁：
   - 所有 `await import("playwright-core")` → `await importPlaywright()`，并在
     `import { ... } from "../utils/browser.js"` 里补上 `importPlaywright`
   - `lib/utils/logger.js` 保持本仓库版本（只写 stdout，不建 `logs/` 目录）
   - `lib/captcha-ocr.js` 保持本仓库版本（sharp / tesseract.js 动态加载）
3. 跑 `node scripts/syntax-check.js` 和 `node --test test/*.test.js`
4. 内置站点有增删时，同步更新 README 的站点表

## 工程约束

- 依赖保持最小：`crypto-js` / `iconv-lite` / `undici` / `yaml`。
  `playwright-core`、`sharp`、`tesseract.js` 是可选重型依赖，**不要**写进 `dependencies`
- 任何诊断输出只能包含凭据的长度与指纹，不能打印 Cookie / Token 明文
- 站点能力字段（`kind`、`enforced_kind`）以内置目录为准，不接受用户配置覆盖
- 不要提交真实配置：`config/sites.yaml`、`config/secrets.yaml`、`data/`、`.env` 都在 `.gitignore` 里
- `signmate.js` 顶部的 `cron:` 注释是青龙订阅自动建任务的依据，改动前先确认格式仍被识别
