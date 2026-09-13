# SignMate_QL（签伴 · 青龙面板版）

把 [SignMate 签伴](https://github.com/HughRyu/SignMate) 的多站点自动签到 / 保活能力搬到 **青龙面板**：
去掉了 Web 管理面板、node-cron 调度器和 Docker 运行时，改成一个可以被青龙「订阅」直接拉取的脚本仓库，
配置全部通过青龙的**环境变量**维护，通知直接复用青龙面板里已经配好的推送渠道。

- 站点驱动（Driver）逻辑与上游保持一致，上游修了站点，这边同步即可
- 一条订阅拉取，自动生成定时任务，无需自己写 cron
- 不需要 Docker、不需要 9999 端口、不需要维护 `sites.yaml`
- 自带配置自检脚本，不打印任何 Cookie / Token 明文

## 免责声明

SignMate_QL 仅作为开源的自托管自动化工具，供学习、研究及合法的个人使用。使用者在部署和运行前，必须自行确认目标站点的服务条款、自动化政策及适用法律法规，并确保对所使用的账号、Cookie、Token、2FA Secret、代理和通知配置拥有合法授权。严禁将本项目用于未授权访问、绕过验证码或风控、规避站点限制、批量骚扰请求、账号共享或其他违反站点规则及法律法规的行为；遇到验证码、人机验证或访问限制时，应按站点要求人工处理，不得尝试绕过。

项目不保证第三方站点始终可访问、登录态持续有效、签到必然成功或任何特定功能持续可用。因使用本项目导致的账号限制、封禁、数据丢失、凭据泄露、服务中断或其他直接、间接损失，由部署者和使用者自行承担。请勿将包含真实凭据的配置提交到公开仓库。

---

## 一、安装：青龙订阅

青龙面板 → **订阅管理 → 新建订阅**，按下表填写：

| 字段 | 值 |
| --- | --- |
| 名称 | `SignMate_QL` |
| 类型 | 公开仓库 |
| 链接 | `https://github.com/vhu231/SignMate_QL.git` |
| 分支 | `main` |
| 定时类型 | crontab |
| 定时规则 | `0 2 * * *`（每天凌晨更新一次仓库） |
| 白名单 | `signmate.js` |
| 黑名单 | 留空 |
| 依赖文件 | `lib\|scripts` |

保存后点「运行」拉取仓库。青龙会：

1. 把仓库克隆到 `/ql/data/repo/<你的订阅目录>/`
2. 读取 `signmate.js` 顶部的 `cron: 25 8 * * *`，自动创建一条名为 **SignMate 签到** 的定时任务
3. 检测到 `package.json` 后自动安装依赖（`crypto-js` / `iconv-lite` / `undici` / `yaml`）

> **白名单为什么只写 `signmate.js`？**
> 仓库里还有自检脚本 `signmate_check.js`，它不需要定时跑。仓库文件会被完整克隆下来，
> 想手动执行时在「任务管理」里新建一条命令为 `task repo/<订阅目录>/signmate_check.js` 的任务即可。

### 依赖没装上怎么办

在青龙「依赖管理 → NodeJs」里手动添加这四个：`undici`、`crypto-js`、`iconv-lite`、`yaml`。

---

## 二、配置：青龙环境变量

**核心规则：给哪个站点配了 Cookie，哪个站点就会自动启用。** 不需要额外的开关。

青龙面板 → **环境变量 → 新建变量**，名称按下面的规则拼：

```
SIGNMATE_COOKIE_<站点后缀>     站点 Cookie（从浏览器 F12 → Application → Cookies 复制整段）
SIGNMATE_APIKEY_<站点后缀>     API 令牌（M-Team 用这个，不是 Cookie）
SIGNMATE_TOTP_<站点后缀>       两步验证 Secret（部分 NexusPHP 站点需要）
SIGNMATE_USERNAME_<站点后缀>   用户名（少数站点）
SIGNMATE_PASSWORD_<站点后缀>   密码（少数站点）
```

举例：

| 你要签到的站点 | 环境变量名称 | 值 |
| --- | --- | --- |
| NodeSeek | `SIGNMATE_COOKIE_NODESEEK` | `session=xxxxx; ...` |
| V2EX | `SIGNMATE_COOKIE_V2EX` | `A2=xxxxx; ...` |
| M-Team | `SIGNMATE_APIKEY_MTEAM` | 后台「存取令牌」 |
| HDSky | `SIGNMATE_COOKIE_HDSKY` | `c_secure_uid=...; c_secure_pass=...` |

配完后先跑一次自检确认变量被读到（自检只输出长度和指纹，不会打印凭据本身）：

```bash
task repo/<你的订阅目录>/signmate_check.js
```

### 内置站点与对应的环境变量

| 站点 | key | 分类 | 类型 | 默认模式 | 主凭据环境变量 | 可用简写后缀 |
| --- | --- | --- | --- | --- | --- | --- |
| Audiences | `audiences-me` | PT | 保活 | playwright | `SIGNMATE_COOKIE_AUDIENCES_ME` | `AUDIENCES` |
| BTSCHOOL | `pt-btschool-club` | PT | 保活 | playwright | `SIGNMATE_COOKIE_PT_BTSCHOOL_CLUB` | `PT_BTSCHOOL` / `BTSCHOOL` |
| CarPT | `carpt-net` | PT | 签到 | playwright | `SIGNMATE_COOKIE_CARPT_NET` | `CARPT` |
| Chiphell | `chiphell-com` | 论坛 | 保活 | playwright | `SIGNMATE_COOKIE_CHIPHELL_COM` | `CHIPHELL` |
| FARMM | `pt-0ff-cc` | PT | 签到 | playwright | `SIGNMATE_COOKIE_PT_0FF_CC` | `PT_0FF` / `0FF` |
| HDDolby | `hddolby-com` | PT | 签到 | playwright | `SIGNMATE_COOKIE_HDDOLBY_COM` | `HDDOLBY` |
| HDFans | `hdfans-org` | PT | 签到 | playwright | `SIGNMATE_COOKIE_HDFANS_ORG` | `HDFANS` |
| HDHome | `hdhome-org` | PT | 签到 | playwright | `SIGNMATE_COOKIE_HDHOME_ORG` | `HDHOME` |
| HDSky | `hdsky-me` | PT | 保活 | visit | `SIGNMATE_COOKIE_HDSKY_ME` | `HDSKY` |
| HHanClub | `hhanclub-net` | PT | 签到 | playwright | `SIGNMATE_COOKIE_HHANCLUB_NET` | `HHANCLUB` |
| M-Team | `mteam` | PT | 保活 | api | `SIGNMATE_APIKEY_MTEAM` | — |
| NodeLoc | `nodeloc` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_NODELOC` | — |
| NodeSeek | `nodeseek` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_NODESEEK` | — |
| OpenCD | `open-cd` | PT | 保活 | visit | `SIGNMATE_COOKIE_OPEN_CD` | `OPEN` |
| OurBits | `ourbits-club` | PT | 保活 | visit | `SIGNMATE_COOKIE_OURBITS_CLUB` | `OURBITS` |
| PCBeta | `pcbeta` | 论坛 | 签到 | api | `SIGNMATE_COOKIE_PCBETA` | — |
| PCEVA | `pceva` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_PCEVA` | — |
| PTTime | `pttime-org` | PT | 保活 | playwright | `SIGNMATE_COOKIE_PTTIME_ORG` | `PTTIME` |
| Piggo | `piggo-me` | PT | 保活 | playwright | `SIGNMATE_COOKIE_PIGGO_ME` | `PIGGO` |
| PterClub | `pterclub-net` | PT | 签到 | playwright | `SIGNMATE_COOKIE_PTERCLUB_NET` | `PTERCLUB` |
| V2EX | `v2ex` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_V2EX` | — |
| 卡饭论坛 | `kafan` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_KAFAN` | — |
| 吾爱破解 | `pojie52` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_POJIE52` | — |
| 奶昔论坛 | `naixi` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_NAIXI` | — |
| 威锋论坛 | `feng-com` | 论坛 | 签到 | api | `SIGNMATE_COOKIE_FENG_COM` | `FENG` |
| 恩山无线论坛 | `right` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_RIGHT` | — |
| 百度贴吧 | `baidu-tieba` | 论坛 | 签到 | api | `SIGNMATE_COOKIE_BAIDU_TIEBA` | — |
| 阡陌居 | `qianmoju` | 论坛 | 签到 | playwright | `SIGNMATE_COOKIE_QIANMOJU` | — |

「签到」会触发站点的每日签到动作，「保活」只是带登录态访问一次以维持账号活跃。
「默认模式」里标 `playwright` 的站点在没装浏览器时会自动降级为 HTTP 模式，见下文。

---

## 三、全局环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SIGNMATE_SITES` | 空 | 显式指定要跑的站点，逗号分隔（如 `nodeseek,v2ex`）；填 `all` 表示所有已配凭据的站点。留空时按「配了凭据就启用」处理 |
| `SIGNMATE_SITES_EXCLUDE` | 空 | 排除某些站点，逗号分隔 |
| `SIGNMATE_MODE` | 空 | 全局运行模式，`api` 强制纯 HTTP，`playwright` 强制浏览器 |
| `SIGNMATE_MODE_<站点后缀>` | 空 | 单站点运行模式，优先于全局 |
| `SIGNMATE_REQUIRE_PLAYWRIGHT` | `false` | 设为 `true` 时禁止自动降级，缺浏览器就直接报错 |
| `SIGNMATE_PROXY_URL` | 空 | 全局代理地址，支持 `http://`、`socks5://`，多个用逗号分隔。未设置时会读 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` |
| `SIGNMATE_PROXY_MODE` | `direct` | `auto` 策略站点的默认走向；设为 `proxy` 则统一走代理 |
| `SIGNMATE_PROXY_<站点后缀>` | 空 | 单站点代理：`on` / `off` / `auto`，或直接填一个代理地址（等同强制走代理） |
| `SIGNMATE_TIMEOUT` | 站点默认 | 单次请求超时（毫秒） |
| `SIGNMATE_RETRY` | 站点默认 | 失败重试次数 |
| `SIGNMATE_RANDOM_DELAY` | `0` | 任务开始前的随机延迟上限（秒），错峰用 |
| `SIGNMATE_SITE_DELAY_MS` | `0` | 站点之间的固定间隔（毫秒） |
| `SIGNMATE_NOTIFY` | `on` | 设为 `off` 只写任务日志、不推送 |
| `SIGNMATE_NOTIFY_ONLY_FAILURES` | `false` | 设为 `true` 只在有失败时推送 |
| `SIGNMATE_NOTIFY_BUILTIN` | `false` | 设为 `true` 时即使青龙通知可用也额外走内置 Telegram / Bark |
| `SIGNMATE_EXIT_CODE_ON_FAILURE` | `false` | 设为 `true` 时只要有站点失败，任务就标记为失败（红色） |
| `SIGNMATE_DATA_DIR` | `/ql/data/signmate` | 签到历史存放目录 |
| `SIGNMATE_CONFIG_DIR` | `/ql/data/config/signmate` | 可选的 YAML/JSON 配置目录 |
| `SIGNMATE_LOG_FILE` | 空 | 额外把日志追加到这个文件 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `TZ` | `Asia/Shanghai` | 时区，影响「今天是否已签到」的判断 |

---

## 四、通知

**默认不需要任何配置。** 脚本会自动加载青龙自带的 `/ql/data/scripts/sendNotify.js`，
你在青龙「系统设置 → 通知设置」里配好的渠道（Telegram / Bark / 企业微信 / 钉钉 / PushPlus / Gotify / 飞书……）都会直接生效。

只有在找不到青龙通知模块时，才会回落到内置通道：

| 变量 | 说明 |
| --- | --- |
| `SIGNMATE_TG_BOT_TOKEN` / `TG_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `SIGNMATE_TG_USER_ID` / `TG_USER_ID` / `TELEGRAM_CHAT_ID` | Telegram Chat ID |
| `SIGNMATE_BARK_URL` / `BARK_PUSH` | Bark 推送地址或 Key |
| `SIGNMATE_NOTIFY_PROXY` | 通知走的代理（Telegram 常用） |

---

## 五、浏览器模式（Playwright）

上游有一部分站点默认用 Playwright 驱动真实浏览器。青龙镜像里默认**没有** Chromium，
所以本项目做了自动降级：**检测不到 `playwright-core` 时，这些站点会自动改用 HTTP 模式**，
任务日志里会给出一行提示。大多数论坛站点（Discuz 系、V2EX、NodeLoc、Chiphell 等）和
NexusPHP 系 PT 站点都有完整的 HTTP 实现，降级后依然可用。

确实需要浏览器模式时：

1. 青龙「依赖管理 → NodeJs」安装 `playwright-core`
2. 容器里装好 Chromium，并设置环境变量 `CHROMIUM_PATH=/usr/bin/chromium`（按实际路径填）
3. 需要时设 `SIGNMATE_REQUIRE_PLAYWRIGHT=true`，避免静默降级

验证码 OCR（OpenCD 一类的字符验证码）还需要额外安装 `sharp` 和 `tesseract.js`，这两个包体积较大，按需安装。

---

## 六、手动运行与自定义任务

在青龙「任务管理 → 新建任务」里，命令栏可以这样写：

```bash
task repo/<订阅目录>/signmate.js                 # 全部已配置站点
task repo/<订阅目录>/signmate.js --kind=signin   # 只跑签到类站点
task repo/<订阅目录>/signmate.js --kind=visit    # 只跑保活类站点
task repo/<订阅目录>/signmate.js nodeseek v2ex   # 只跑指定站点
task repo/<订阅目录>/signmate.js --force         # 忽略「今天已成功」记录，强制重跑
task repo/<订阅目录>/signmate_check.js           # 配置自检，不发任何签到请求
```

想给 PT 保活单独排一个时间，就新建一条 `--kind=visit` 的任务、配自己的 cron 即可。

**重复运行是安全的**：同一天已经成功过的站点会被自动跳过，记录存在 `/ql/data/signmate/history.json`。

---

## 七、添加内置目录以外的站点

大多数 PT 站点是 NexusPHP 架构，直接用 `nexusphp` 驱动即可。新增一个环境变量：

```
名称：SIGNMATE_CUSTOM_SITES
值：  {"my-pt":{"driver":"nexusphp","note":"MyPT","base_url":"https://my-pt.org/","category":"pt","kind":"signin"}}
```

然后按 key 配 Cookie：`SIGNMATE_COOKIE_MY_PT`。

可用的 `driver`：`nexusphp`、`website`（纯访问保活）、以及内置站点用到的各专用驱动。

---

## 八、从 Docker 版 SignMate 迁移

在原来跑 SignMate 的机器上执行：

```bash
node scripts/from-signmate-config.js /opt/docker/signmate/config
```

会按你现有的 `sites.yaml` / `secrets.yaml` 打印出对应的青龙环境变量（`export NAME='value'` 形式）。
把输出粘进 `/ql/data/config/extra.sh`（青龙每次执行任务前都会 source 它），或者照着变量名逐条录入「环境变量」页面。

> 输出里包含真实 Cookie / Token，**不要**贴到公开场合、截图或提交进 Git。

也可以把原来的 `sites.yaml` / `secrets.yaml` 直接放到 `/ql/data/config/signmate/` 下，
脚本会读取它们（环境变量优先级更高）。这个目录在订阅更新时不会被覆盖。

---

## 九、常见问题

**任务跑完提示「没有可执行的站点」**
说明一个 `SIGNMATE_COOKIE_*` 变量都没读到。跑一次 `signmate_check.js`，对照输出里给的准确变量名重新添加。

**某个站点一直「登录态异常」**
Cookie 过期了。重新从浏览器复制完整 Cookie 串（不要只复制单个字段），更新对应环境变量。

**青龙任务一直显示「运行中」不结束**
脚本内置了收尾保护，默认 8 秒后强制退出。可以用 `SIGNMATE_EXIT_GRACE_MS` 调整。

**订阅更新后配置丢了吗**
不会。配置在青龙环境变量里，历史数据在 `/ql/data/signmate/`，两者都在仓库目录之外。

**想同时保留 Docker 版**
可以。两边用的是各自独立的配置和历史记录，但同一个账号同一天被签两次没有意义，建议只留一边跑。

---

## 与上游的关系

- 上游：[HughRyu/SignMate](https://github.com/HughRyu/SignMate)（MIT）— Docker + Web 面板版本
- 本仓库：青龙面板适配版，站点驱动代码来自上游并保持同步，运行时（配置 / 调度 / 通知 / 存储）为青龙重写

站点本身的适配问题（某站点签到失败、页面改版）建议优先反馈到上游；青龙运行相关的问题（环境变量、订阅、依赖）提到本仓库。

## License

MIT，与上游一致。
