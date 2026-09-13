import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 让配置读写落在临时目录，不碰真实的 /ql/data。
const sandbox = mkdtempSync(join(tmpdir(), "signmate-ql-"));
process.env.SIGNMATE_CONFIG_DIR = join(sandbox, "config");
process.env.SIGNMATE_DATA_DIR = join(sandbox, "data");

const { buildEnvSuffixes, loadConfig } = await import("../lib/config.mjs");
const { inferResultStatus, requiresBrowser, siteKind, siteCategory } = await import("../lib/runner.mjs");
const BUILTIN_SITES = (await import("../lib/builtin-sites.mjs")).default;

function withEnv(vars, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function clearSignmateEnv(extra = {}) {
  const cleared = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SIGNMATE_") && key !== "SIGNMATE_CONFIG_DIR" && key !== "SIGNMATE_DATA_DIR") cleared[key] = undefined;
  }
  return { ...cleared, ...extra };
}

test("站点 key 会生成完整与简写两种环境变量后缀", () => {
  const map = buildEnvSuffixes(["hdsky-me", "pt-btschool-club", "nodeseek", "baidu-tieba"]);
  assert.deepEqual(map.get("hdsky-me"), ["HDSKY_ME", "HDSKY"]);
  assert.deepEqual(map.get("pt-btschool-club"), ["PT_BTSCHOOL_CLUB", "PT_BTSCHOOL", "BTSCHOOL"]);
  assert.deepEqual(map.get("nodeseek"), ["NODESEEK"]);
  assert.deepEqual(map.get("baidu-tieba"), ["BAIDU_TIEBA"]);
});

test("简写与其他站点撞名时只保留完整形式", () => {
  const map = buildEnvSuffixes(["demo-com", "demo-net"]);
  assert.deepEqual(map.get("demo-com"), ["DEMO_COM"]);
  assert.deepEqual(map.get("demo-net"), ["DEMO_NET"]);
});

test("配置了 Cookie 的站点会自动启用，其余站点不会被带上", () => {
  const { sites } = withEnv(clearSignmateEnv({ SIGNMATE_COOKIE_NODESEEK: "session=abc" }), () => loadConfig());
  assert.deepEqual(sites.map(s => s.key), ["nodeseek"]);
  assert.equal(sites[0].driver, "nodeseek");
});

test("SIGNMATE_SITES 可以显式指定站点，缺凭据的会被跳过并给出提示", () => {
  const { sites, diagnostics } = withEnv(
    clearSignmateEnv({ SIGNMATE_SITES: "nodeseek,v2ex", SIGNMATE_COOKIE_NODESEEK: "session=abc" }),
    () => loadConfig()
  );
  assert.deepEqual(sites.map(s => s.key), ["nodeseek"]);
  const skippedV2ex = diagnostics.skipped.find(item => item.key === "v2ex");
  assert.ok(skippedV2ex, "v2ex 应出现在跳过列表里");
  assert.equal(skippedV2ex.envHint, "SIGNMATE_COOKIE_V2EX");
});

test("站点简写也能命中 Cookie 环境变量", () => {
  const { sites } = withEnv(clearSignmateEnv({ SIGNMATE_COOKIE_HDSKY: "c_secure_uid=1" }), () => loadConfig());
  assert.deepEqual(sites.map(s => s.key), ["hdsky-me"]);
});

test("SIGNMATE_SITES_EXCLUDE 能排除已配置的站点", () => {
  const { sites } = withEnv(
    clearSignmateEnv({ SIGNMATE_COOKIE_NODESEEK: "session=abc", SIGNMATE_SITES_EXCLUDE: "nodeseek" }),
    () => loadConfig()
  );
  assert.deepEqual(sites, []);
});

test("mteam 用 API Key 而不是 Cookie 也会被启用", () => {
  const { sites } = withEnv(clearSignmateEnv({ SIGNMATE_APIKEY_MTEAM: "token-value" }), () => loadConfig());
  assert.deepEqual(sites.map(s => s.key), ["mteam"]);
});

test("代理：给具体地址等同于强制走代理", () => {
  const { sites } = withEnv(
    clearSignmateEnv({ SIGNMATE_COOKIE_NODESEEK: "session=abc", SIGNMATE_PROXY_NODESEEK: "127.0.0.1:7890" }),
    () => loadConfig()
  );
  assert.equal(sites[0].proxy_mode, "on");
  assert.equal(sites[0].proxy_url, "http://127.0.0.1:7890");
});

test("SIGNMATE_CUSTOM_SITES 可以加内置目录以外的站点", () => {
  const custom = JSON.stringify({ "my-pt": { driver: "nexusphp", note: "MyPT", base_url: "https://my.pt/", category: "pt" } });
  const { sites } = withEnv(
    clearSignmateEnv({ SIGNMATE_CUSTOM_SITES: custom, SIGNMATE_COOKIE_MY_PT: "c_secure_uid=2" }),
    () => loadConfig()
  );
  assert.deepEqual(sites.map(s => s.key), ["my-pt"]);
  assert.equal(sites[0].base_url, "https://my.pt/");
});

test("结果状态推断与原版保持一致", () => {
  assert.equal(inferResultStatus({ success: true, message: "签到成功，获得 5 金币" }), "✓ 签到成功");
  assert.equal(inferResultStatus({ success: true, message: "今日已签到" }), "✓ 今日已签到");
  assert.equal(inferResultStatus({ success: false, message: "Cookie 未配置" }), "⚠ 登录态异常");
  assert.equal(inferResultStatus({ success: false, message: "连接超时 ETIMEDOUT" }), "⚠ 站点不可达");
});

test("站点类型与分类推断", () => {
  assert.equal(siteKind({ driver: "website" }), "visit");
  assert.equal(siteKind({ driver: "nodeseek" }), "signin");
  assert.equal(siteCategory({ category: "PT" }), "pt");
  assert.equal(siteCategory({ kind: "visit" }), "pt");
  assert.equal(siteCategory({}), "forum");
});

test("PterClub 在内置目录里，且由 nexusphp 驱动", () => {
  const site = BUILTIN_SITES["pterclub-net"];
  assert.ok(site, "内置目录里必须有 pterclub-net");
  assert.equal(site.driver, "nexusphp");
  assert.equal(site.kind, "signin");
  assert.deepEqual(site.cookie_required_names, ["c_secure_pass"]);
});

test("配了 PterClub Cookie 就会启用", () => {
  const { sites } = withEnv(clearSignmateEnv({ SIGNMATE_COOKIE_PTERCLUB: "c_secure_uid=1; c_secure_pass=x" }), () => loadConfig());
  assert.deepEqual(sites.map(s => s.key), ["pterclub-net"]);
});

test("NexusPHP 签到站点需要浏览器，保活站点不需要", () => {
  // HTTP 路径只能读出「今日已签到」，真正的签到提交必须回退 Playwright。
  assert.equal(requiresBrowser({ driver: "nexusphp", kind: "signin" }), true);
  assert.equal(requiresBrowser({ driver: "nexusphp", kind: "visit" }), false);
  // NodeSeek 没有任何 HTTP 实现。
  assert.equal(requiresBrowser({ driver: "nodeseek" }), true);
  // Discuz / 纯 API driver 不需要浏览器。
  for (const driver of ["pojie52", "right", "pceva", "kafan", "naixi", "qianmoju", "v2ex", "nodeloc", "chiphell", "feng", "pcbeta", "tieba", "mteam"]) {
    assert.equal(requiresBrowser({ driver }), false, driver + " 应该是纯 HTTP 可用");
  }
});

test("内置目录里需要浏览器的站点清单是已知的 8 个", () => {
  const needs = Object.entries(BUILTIN_SITES)
    .filter(([key, site]) => requiresBrowser({ ...site, key }))
    .map(([key]) => key)
    .sort();
  assert.deepEqual(needs, [
    "carpt-net", "hddolby-com", "hdfans-org", "hdhome-org",
    "hhanclub-net", "nodeseek", "pt-0ff-cc", "pterclub-net",
  ]);
});
