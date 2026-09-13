import { existsSync, readdirSync } from "fs";
import { join } from "path";

function firstExisting(candidates = []) {
  return candidates.find(path => path && existsSync(path));
}

function discoverLocalChromiumPath() {
  return firstExisting([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
}

function discoverPlaywrightChromiumPath() {
  const root = "/ms-playwright";
  if (!existsSync(root)) return undefined;
  const candidates = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.startsWith("chromium")) continue;
    const base = join(root, dir.name);
    candidates.push(
      join(base, "chrome-linux64", "chrome"),
      join(base, "chrome-linux", "chrome"),
      join(base, "chrome-linux", "headless_shell"),
    );
  }
  return candidates.find(path => existsSync(path));
}

export async function resolveChromiumExecutablePath(chromium) {
  const configured = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configured) return configured;
  const detected = typeof chromium?.executablePath === "function" ? chromium.executablePath() : "";
  if (detected && existsSync(detected)) return detected;
  return discoverPlaywrightChromiumPath() || discoverLocalChromiumPath() || detected;
}

function truthy(value = "") {
  return ["1", "true", "yes", "on", "cloak"].includes(String(value || "").trim().toLowerCase());
}

const DEFAULT_BROWSER_ARGS = [
  "--disable-crashpad",
  "--disable-crash-reporter",
  "--disable-breakpad",
  "--crash-dumps-dir=/tmp/signmate-chrome-crashes",
];

function mergeBrowserArgs(args = []) {
  const merged = [];
  for (const arg of [...DEFAULT_BROWSER_ARGS, ...(Array.isArray(args) ? args : [])]) {
    if (arg && !merged.includes(arg)) merged.push(arg);
  }
  return merged;
}

export function buildPlaywrightLaunchOptions(launchOptions = {}) {
  return {
    ...launchOptions,
    args: mergeBrowserArgs(launchOptions.args),
  };
}

export function browserEngine() {
  return String(process.env.SIGNMATE_BROWSER_ENGINE || "playwright").trim().toLowerCase();
}

export function shouldUseCloakBrowser(siteConfig = {}) {
  const siteEngine = String(siteConfig.browser_engine || siteConfig.browserEngine || "").trim().toLowerCase();
  if (siteEngine) return siteEngine === "cloak" || siteEngine === "cloakbrowser";
  return browserEngine() === "cloak" || truthy(process.env.SIGNMATE_CLOAK_ENABLED);
}

export function buildCloakLaunchOptions({ headless = true, proxy, args = [], timeout, siteConfig = {} } = {}) {
  const mergedArgs = mergeBrowserArgs(args);
  if (process.env.SIGNMATE_CLOAK_ARGS) mergedArgs.push(...process.env.SIGNMATE_CLOAK_ARGS.split(/\s+/).filter(Boolean));
  const options = {
    headless: String(process.env.SIGNMATE_CLOAK_HEADLESS || "").trim() === "false" ? false : headless,
    humanize: truthy(process.env.SIGNMATE_CLOAK_HUMANIZE ?? siteConfig.cloak_humanize),
    geoip: truthy(process.env.SIGNMATE_CLOAK_GEOIP ?? siteConfig.cloak_geoip),
    args: mergedArgs,
  };
  if (proxy) options.proxy = typeof proxy === "string" ? proxy : proxy.server || proxy;
  if (timeout) options.timeout = timeout;
  if (process.env.SIGNMATE_CLOAK_LOCALE || siteConfig.cloak_locale) options.locale = process.env.SIGNMATE_CLOAK_LOCALE || siteConfig.cloak_locale;
  if (process.env.SIGNMATE_CLOAK_TIMEZONE || siteConfig.cloak_timezone) options.timezone = process.env.SIGNMATE_CLOAK_TIMEZONE || siteConfig.cloak_timezone;
  return options;
}

export async function launchBrowser({ chromium, siteConfig = {}, launchOptions = {} } = {}) {
  if (shouldUseCloakBrowser(siteConfig)) {
    const cloak = await import("cloakbrowser");
    return cloak.launch(buildCloakLaunchOptions({ ...launchOptions, siteConfig }));
  }
  return chromium.launch(buildPlaywrightLaunchOptions(launchOptions));
}

// 青龙适配：playwright-core 与 Chromium 在青龙环境里属于可选组件。
// 缺失时给出可执行的中文提示，而不是抛出难以理解的模块解析错误。
export async function importPlaywright() {
  try {
    return await import("playwright-core");
  } catch (err) {
    throw new Error(
      "未安装 playwright-core，无法使用浏览器模式。"
      + "请在青龙「依赖管理 → NodeJs」添加 playwright-core，并确保容器内有 Chromium（设置 CHROMIUM_PATH 指向可执行文件）；"
      + "或把该站点切换为 HTTP 模式（环境变量 SIGNMATE_MODE_<站点KEY>=api）。"
      + ` 原始错误：${err.message}`
    );
  }
}

/**
 * 探测浏览器是否真的可用。
 *
 * 只判断「playwright-core 装没装」是不够的：青龙里很常见的情况是包装了、
 * 但容器内没有 Chromium 二进制（尤其 arm64），这时浏览器模式一样跑不起来。
 */
export async function probeBrowser() {
  let chromium;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    return { ok: false, playwright: false, executablePath: "", reason: "未安装 playwright-core" };
  }
  const executablePath = await resolveChromiumExecutablePath(chromium).catch(() => "");
  if (!executablePath || !existsSync(executablePath)) {
    return {
      ok: false,
      playwright: true,
      executablePath: executablePath || "",
      reason: executablePath
        ? `已装 playwright-core，但 Chromium 可执行文件不存在：${executablePath}`
        : "已装 playwright-core，但没有找到任何 Chromium 可执行文件",
    };
  }
  return { ok: true, playwright: true, executablePath, reason: "" };
}
