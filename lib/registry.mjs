// ============================================================
// registry — Driver 注册表
//
// 按需动态加载：单个 driver 的依赖缺失（例如贴吧需要 iconv-lite）
// 只会让这一个站点失败，不会让整个青龙任务在启动阶段就崩掉。
// ============================================================

const LOADERS = {
  nodeseek: () => import("./drivers/nodeseek.mjs"),
  template: () => import("./drivers/template.mjs"),
  v2ex: () => import("./drivers/v2ex.mjs"),
  naixi: () => import("./drivers/naixi.mjs"),
  right: () => import("./drivers/right.mjs"),
  website: () => import("./drivers/website.mjs"),
  visit: () => import("./drivers/website.mjs"),
  pojie52: () => import("./drivers/pojie52.mjs"),
  nodeloc: () => import("./drivers/nodeloc.mjs"),
  pceva: () => import("./drivers/pceva.mjs"),
  chiphell: () => import("./drivers/chiphell.mjs"),
  nexusphp: () => import("./drivers/nexusphp.mjs"),
  qianmoju: () => import("./drivers/qianmoju.mjs"),
  kafan: () => import("./drivers/kafan.mjs"),
  feng: () => import("./drivers/feng.mjs"),
  tieba: () => import("./drivers/tieba.mjs"),
  mteam: () => import("./drivers/mteam.mjs"),
  pcbeta: () => import("./drivers/pcbeta.mjs"),
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
