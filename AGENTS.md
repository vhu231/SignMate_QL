# AGENTS.md — SignMate_QL 协作说明

## 这个仓库是什么

[HughRyu/SignMate](https://github.com/HughRyu/SignMate) 的青龙面板适配版。
上游是 Docker + Express Web 面板 + node-cron 的常驻服务；这里把它拆成
「青龙订阅仓库 + 单次执行的任务脚本」，配置改走环境变量。

## 目录职责

| 路径 | 来源 | 说明 |
| --- | --- | --- |
| `lib/drivers/*.mjs` | 上游 `src/drivers/*.js` | 站点驱动，**尽量保持与上游逐字一致**，方便同步 |
| `lib/utils/*.mjs` | 上游 `src/utils/*.js` | HTTP / 代理 / Discuz 等工具，同上 |
| `lib/builtin-sites.mjs` | 上游 `src/builtin-sites.js` | 内置站点目录，直接同步 |
| `lib/captcha-ocr.mjs` | 上游同名文件 | 已改为按需加载 sharp / tesseract.js |
| `lib/config.mjs` | 本仓库新增 | 环境变量 → 站点/凭据配置，含默认运行模式决策 |
| `lib/capabilities.mjs` | 本仓库新增 | 站点能力：能否纯 HTTP、是否默认走 HTTP |
| `lib/runner.mjs` | 本仓库重写 | 去掉批量状态文件与 yaml 回写 |
| `lib/notify.mjs` | 本仓库重写 | 优先复用青龙 `sendNotify.js` |
| `lib/store.mjs` | 本仓库重写 | 只保留「今天是否已成功」判断 |
| `lib/paths.mjs` | 本仓库新增 | 解析 `/ql/data` 下的配置与数据目录 |
| `signmate.mjs` | 本仓库新增 | 青龙任务入口，顶部带 `cron:` 注释 |
| `signmate_check.mjs` | 本仓库新增 | 配置自检，不发签到请求 |

## 青龙的两个硬约束（改结构前必读）

**1. 任务是按文件扫出来的，只有白名单能挡。**
青龙用 `find` 按 `RepoFileExtensions` 递归扫整个仓库，命中的每个文件都会被建成定时任务
（没有 `cron:` 就套默认 cron，任务名从 `grep "name:" | awk -F ":" '{print $2}'` 里猜）。
2.21 的默认后缀是 `js mjs py pyc`，**换后缀躲不掉**——早期版本试过用 `.mjs` 规避，失败了。
README 里白名单已列为必填项。

**2. 脚本是被复制出去执行的，不是在克隆目录里跑。**
青龙把白名单匹配到的脚本 + 「依赖文件」匹配到的文件复制到 `/ql/data/scripts/<别名>/` 再执行。
所以订阅必须填「依赖文件」= `lib/`，否则 `ERR_MODULE_NOT_FOUND`。
而且依赖文件同样只对扫描后缀内的文件生效，**`package.json` 永远复制不过去** ——
这就是全仓库必须用 `.mjs` 的真正原因：模块类型由后缀确定，不能依赖 `package.json` 的 `"type": "module"`。

`node scripts/to-mjs.mjs` 负责改名 + 重写相对导入，并在发现 `.js` 时以非零码退出；CI 里作为守卫步骤运行。
它只重写 `./` `../` 开头的相对导入，不会碰 `/ql/data/scripts/sendNotify.js` 这类青龙自己的文件路径。

## 从上游同步驱动时

1. 直接复制上游的 `src/drivers/*`、`src/utils/*`、`src/builtin-sites.js` 到 `lib/`
2. 跑 `node scripts/to-mjs.mjs` 完成 `.js → .mjs` 改名与相对导入重写
3. 复制完必须重新打上这几处青龙适配补丁：
   - `lib/utils/discuz-http.mjs` 的 `openText()` 必须先过 `unwrapDiscuzAjax()`
     （Discuz 的 inajax 响应是 XML+CDATA+script，上游直接 htmlToText 只会得到 "]]>"），
     且 `runNaixi()` 提交后要复查签到页状态
   - `lib/drivers/v2ex.mjs` 的领取链接必须绝对化后再 `page.goto`
     （上游直接传相对路径，Playwright 会报 Cannot navigate to invalid URL），
     配套的 `absoluteV2EXRedeemUrl()` 在 `lib/drivers/v2ex-utils.mjs`
   - 所有 `await import("playwright-core")` → `await importPlaywright()`，并在
     `import { ... } from "../utils/browser.mjs"` 里补上 `importPlaywright`
   - `lib/utils/logger.mjs` 保持本仓库版本（只写 stdout，不建 `logs/` 目录）
   - `lib/captcha-ocr.mjs` 保持本仓库版本（sharp / tesseract.js 动态加载）
4. 跑 `node scripts/syntax-check.mjs` 和 `node --test test/*.test.mjs`
5. 内置站点有增删时，同步更新 README 的站点表

## 工程约束

- 依赖保持最小：`crypto-js` / `iconv-lite` / `undici` / `yaml`。
  `playwright-core`、`sharp`、`tesseract.js` 是可选重型依赖，**不要**写进 `dependencies`
- 任何诊断输出只能包含凭据的长度与指纹，不能打印 Cookie / Token 明文
- 站点能力字段（`kind`、`enforced_kind`）以内置目录为准，不接受用户配置覆盖
- 不要提交真实配置：`config/sites.yaml`、`config/secrets.yaml`、`data/`、`.env` 都在 `.gitignore` 里
- `signmate.mjs` 顶部的 `cron:` 注释是青龙订阅自动建任务的依据，改动前先确认格式仍被识别
- 新增任何文件一律用 `.mjs`，不要往仓库里加 `.js`（模块类型会变得不确定）
