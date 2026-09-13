// ============================================================
// registry — Driver 注册表
//
// 按需动态加载：单个 driver 的依赖缺失（例如贴吧需要 iconv-lite）
// 只会让这一个站点失败，不会让整个青龙任务在启动阶段就崩掉。
// ============================================================

const LOADERS = {
  nodeseek: () => import("./drivers/nodeseek.js"),
  template: () => import("./drivers/template.js"),
  v2ex: () => import("./drivers/v2ex.js"),
  naixi: () => import("./drivers/naixi.js"),
  right: () => import("./drivers/right.js"),
  website: () => import("./drivers/website.js"),
  visit: () => import("./drivers/website.js"),
  pojie52: () => import("./drivers/pojie52.js"),
  nodeloc: () => import("./drivers/nodeloc.js"),
  pceva: () => import("./drivers/pceva.js"),
  chiphell: () => import("./drivers/chiphell.js"),
  nexusphp: () => import("./drivers/nexusphp.js"),
  qianmoju: () => import("./drivers/qianmoju.js"),
  kafan: () => import("./drivers/kafan.js"),
  feng: () => import("./drivers/feng.js"),
  tieba: () => import("./drivers/tieba.js"),
  mteam: () => import("./drivers/mteam.js"),
  pcbeta: () => import("./drivers/pcbeta.js"),
};

const cache = new Map();

export function driverNames() {
  return Object.keys(LOADERS);
}

export function hasDriver(name = "") {
  return Object.prototype.hasOwnProperty.call(LOADERS, String(name));
}

export async function loadDriver(name = "") {
  const key = String(name);
  if (cache.has(key)) return cache.get(key);
  const loader = LOADERS[key];
  if (!loader) throw new Error('Driver "' + key + '" 不存在，可用: ' + driverNames().join(", "));
  const mod = await loader();
  const DriverClass = mod.default || mod[Object.keys(mod)[0]];
  if (typeof DriverClass !== "function") throw new Error('Driver "' + key + '" 未导出可用的类');
  cache.set(key, DriverClass);
  return DriverClass;
}
