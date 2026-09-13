// ============================================================
// capabilities — 站点能力：能不能纯 HTTP 跑，要不要浏览器
//
// 这些判断同时被配置层（决定默认运行模式）和入口脚本（运行前预警）使用，
// 单独放一个模块避免两边各写一份、后续改不同步。
// ============================================================

/**
 * 有真正可用 HTTP 实现的 driver —— 不装浏览器也能完成动作：
 *   - feng / pcbeta / tieba / mteam                        纯 API driver
 *   - pojie52 / right / pceva / kafan / naixi / qianmoju    Discuz HTTP 会 POST 提交签到
 *   - v2ex / nodeloc                                       site-http 会真正领取 / 签到
 *   - chiphell                                             保活访问，HTTP 足够
 *
 * 不在表里的（如 nodeseek）只有 Playwright 实现。
 */
export const HTTP_CAPABLE_DRIVERS = new Set([
  "feng", "pcbeta", "tieba", "mteam",
  "pojie52", "right", "pceva", "kafan", "naixi", "qianmoju",
  "v2ex", "nodeloc", "chiphell",
]);

export function siteKindOf(site = {}) {
  return site.kind || (site.driver === "website" || site.driver === "visit" ? "visit" : "signin");
}

/**
 * 该站点是否必须有浏览器才能完成动作。
 *
 * NexusPHP 的 HTTP 路径只能**读出**「今日已签到」状态，真正的签到提交是
 * signin_submit_api_not_implemented，必须回退 Playwright；但 kind=visit 的保活
 * 站点只需要带登录态打开页面，HTTP 就够了。
 */
export function requiresBrowser(site = {}) {
  const driver = String(site.driver || "");
  if (driver === "nexusphp") return siteKindOf(site) !== "visit";
  if (HTTP_CAPABLE_DRIVERS.has(driver)) return false;
  // website / visit / nodeseek 等只有 Playwright 实现。
  return true;
}

/**
 * 是否默认走 HTTP。
 *
 * 内置目录沿用上游的 signin_mode: "playwright"，那是给「常驻 Docker + 自带 Chromium」
 * 的部署准备的。青龙这边容器更瘦、任务是一次性进程，能用 HTTP 就别开浏览器：
 * 更快、更省内存，而且 driver 在 HTTP 失败时本来就会自动回退 Playwright。
 * 想要上游行为设 SIGNMATE_MODE=playwright，或单站点 SIGNMATE_MODE_<KEY>=playwright。
 */
export function prefersHttp(site = {}) {
  return HTTP_CAPABLE_DRIVERS.has(String(site.driver || ""));
}
