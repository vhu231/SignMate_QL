# ============================================================
# SignMate_QL 环境变量示例
#
# 两种用法：
#   1. 照着变量名逐条录入青龙「环境变量」页面（推荐，便于单条增删）
#   2. 复制需要的行到 /ql/data/config/extra.sh —— 青龙执行任何任务前都会 source 它
#
# ⚠️ 真实的 Cookie / Token 不要提交到任何 Git 仓库。
# 准确的变量名以 `task repo/<订阅目录>/signmate_check.js` 的输出为准。
# ============================================================

# ---------- 站点凭据：配了哪个，哪个站点就自动启用 ----------
# 论坛
# export SIGNMATE_COOKIE_NODESEEK='session=...'
# export SIGNMATE_COOKIE_V2EX='A2=...; ...'
# export SIGNMATE_COOKIE_POJIE52='htVD_2132_saltkey=...; htVD_2132_auth=...'
# export SIGNMATE_COOKIE_NODELOC='_t=...'
# export SIGNMATE_COOKIE_PCEVA='...'
# export SIGNMATE_COOKIE_KAFAN='...'
# export SIGNMATE_COOKIE_NAIXI='...'
# export SIGNMATE_COOKIE_RIGHT='..._saltkey=...; ..._auth=...'
# export SIGNMATE_COOKIE_QIANMOJU='...'
# export SIGNMATE_COOKIE_FENG='...'
# export SIGNMATE_COOKIE_PCBETA='..._saltkey=...; ..._auth=...'
# export SIGNMATE_COOKIE_CHIPHELL='...'
# export SIGNMATE_COOKIE_BAIDU_TIEBA='BDUSS=...; STOKEN=...'

# PT 站点
# export SIGNMATE_APIKEY_MTEAM='后台「存取令牌」'
# export SIGNMATE_COOKIE_HDSKY='c_secure_uid=...; c_secure_pass=...'
# export SIGNMATE_COOKIE_HDHOME='...'
# export SIGNMATE_COOKIE_HDDOLBY='...'
# export SIGNMATE_COOKIE_HDFANS='...'
# export SIGNMATE_COOKIE_HHANCLUB='...'
# export SIGNMATE_COOKIE_OPEN_CD='...'
# export SIGNMATE_COOKIE_OURBITS='...'
# export SIGNMATE_COOKIE_PIGGO='...'
# export SIGNMATE_COOKIE_PTTIME='...'
# export SIGNMATE_COOKIE_PTERCLUB='c_secure_pass=...'
# export SIGNMATE_COOKIE_CARPT='...'
# export SIGNMATE_COOKIE_AUDIENCES='...'
# export SIGNMATE_COOKIE_PT_BTSCHOOL='...'
# export SIGNMATE_COOKIE_PT_0FF='...'
# 部分 NexusPHP 站点开了两步验证时补上：
# export SIGNMATE_TOTP_HDSKY='BASE32SECRET'

# ---------- 站点选择 ----------
# 显式指定要跑哪些站点（留空 = 配了凭据的都跑）
# export SIGNMATE_SITES='nodeseek,v2ex,mteam'
# export SIGNMATE_SITES_EXCLUDE='qianmoju'

# ---------- 运行模式 ----------
# 强制纯 HTTP（青龙里没装浏览器时其实会自动降级，通常不用设）
# export SIGNMATE_MODE='api'
# 单站点指定
# export SIGNMATE_MODE_V2EX='playwright'
# 禁止自动降级：缺 playwright-core 就直接报错
# export SIGNMATE_REQUIRE_PLAYWRIGHT='false'
# export CHROMIUM_PATH='/usr/bin/chromium'

# ---------- 代理 ----------
# export SIGNMATE_PROXY_URL='http://127.0.0.1:7890'
# auto 策略站点默认走向：direct（默认）/ proxy
# export SIGNMATE_PROXY_MODE='direct'
# 单站点：on / off / auto，或直接写一个代理地址
# export SIGNMATE_PROXY_QIANMOJU='on'
# export SIGNMATE_PROXY_NODESEEK='http://127.0.0.1:7890'

# ---------- 节奏控制 ----------
# 任务开始前随机延迟 0~600 秒，错峰
# export SIGNMATE_RANDOM_DELAY='600'
# 站点之间固定间隔（毫秒）
# export SIGNMATE_SITE_DELAY_MS='3000'
# export SIGNMATE_TIMEOUT='30000'
# export SIGNMATE_RETRY='1'

# ---------- 通知 ----------
# 默认自动复用青龙「通知设置」里的渠道，一般无需配置。
# export SIGNMATE_NOTIFY='on'
# export SIGNMATE_NOTIFY_ONLY_FAILURES='false'
# 找不到青龙通知模块时的内置兜底：
# export SIGNMATE_TG_BOT_TOKEN='123456:ABC...'
# export SIGNMATE_TG_USER_ID='123456789'
# export SIGNMATE_BARK_URL='https://api.day.app/yourkey'
# export SIGNMATE_NOTIFY_PROXY='http://127.0.0.1:7890'

# ---------- 其他 ----------
# export TZ='Asia/Shanghai'
# export LOG_LEVEL='info'
# export SIGNMATE_DATA_DIR='/ql/data/signmate'
# export SIGNMATE_CONFIG_DIR='/ql/data/config/signmate'
# 有站点失败时把青龙任务标记为失败
# export SIGNMATE_EXIT_CODE_ON_FAILURE='false'
