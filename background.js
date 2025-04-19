// 默认代理地址
let proxyUrl = "http://localhost:7890";
let rules = ["*.cn", "*.qq.com", "*.baidu.com", "192.168.*.*"];
let mode = "whitelist";

// 全局存储图标
let proxyIcon = null;
let defaultIcon = null;

function init() {
  createIcons();
  // 设置默认图标
  chrome.action.setIcon({ imageData: defaultIcon });
  console.log(`Default icon set for all tab on initialization`);
}

init();

// 转换为 Punycode（处理非 ASCII 主机名）
function toPunycode(host) {
  try {
    return host.match(/^[a-zA-Z0-9.-]+$/) ? host : null; // 仅允许 ASCII
  } catch (e) {
    console.log(`Punycode conversion failed for host: ${host}`);
    return null;
  }
}

// 创建图标（只调用一次）
function createIcons() {
  function createSingleIcon(isProxy) {
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = isProxy ? "green" : "gray";
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("F", 16, 16);
    return ctx.getImageData(0, 0, 32, 32);
  }
  proxyIcon = { "32": createSingleIcon(true) };
  defaultIcon = { "32": createSingleIcon(false) };
  console.log("Icons created");
}

// 生成 PAC 脚本
function generatePacScript(proxyUrl, rules, mode) {
  let proxyHost = "localhost";
  let proxyPort = 7890;
  let proxyScheme = "http";
  try {
    const url = new URL(proxyUrl);
    proxyScheme = url.protocol.replace(":", "").toLowerCase();
    if (!["http", "https"].includes(proxyScheme)) throw new Error("Unsupported scheme");
    proxyHost = toPunycode(url.hostname);
    if (!proxyHost) throw new Error("Non-ASCII hostname not supported");
    proxyPort = parseInt(url.port, 10);
    if (!proxyPort || proxyPort < 1 || proxyPort > 65535) throw new Error("Invalid port");
    console.log(`PAC: Proxy ${proxyScheme}://${proxyHost}:${proxyPort}`);
  } catch (e) {
    console.log(`Invalid proxy URL: ${proxyUrl}, error: ${e.message}, using default http://localhost:7890`);
    proxyHost = "localhost";
    proxyPort = 7890;
    proxyScheme = "http";
  }

  const pacRules = rules.map(pattern => {
    if (!pattern.match(/^[a-zA-Z0-9*.?-]+$/)) {
      console.log(`Skipping non-ASCII rule: ${pattern}`);
      return null;
    }
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return `(host === "${base}" || host.endsWith(".${base}"))`;
    }
    const regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
    return `host.match(/^${regexStr}$/)`;
  }).filter(rule => rule !== null);

  const pacScript = `
    var cache = {};
    var tempCount = 0;
    function FindProxyForURL(url, host) {
      tempCount++;
      if (host in cache) {
        return cache[host];
      }
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        return "DIRECT";
      }
      var matched = ${pacRules.length > 0 ? pacRules.join(" || ") : "false"};
      var isProxy = ${mode === "whitelist" ? "!matched" : "matched"};
      var result = isProxy ? "PROXY ${proxyHost}:${proxyPort}" : "DIRECT";
      cache[host] = result;
      return result;
    }
  `;
  console.log(pacScript);
  console.log(`PAC generated: ${rules.length} rules, mode=${mode}, proxy=${proxyScheme}://${proxyHost}:${proxyPort}`);
  return pacScript;
}

// 设置 PAC 脚本
function setPacScript(proxyUrl, rules, mode) {
  const pacScript = generatePacScript(proxyUrl, rules, mode);
  chrome.proxy.settings.set(
    {
      value: {
        mode: "pac_script",
        pacScript: {
          data: pacScript
        }
      },
      scope: "regular"
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(`PAC setting error: ${chrome.runtime.lastError.message}`);
      } else {
        console.log("PAC set successfully");
      }
    }
  );
}

// 验证规则
function isValidPattern(pattern) {
  const isValid = pattern && /^[a-zA-Z0-9*.?-]+$/.test(pattern) && pattern.length <= 255;
  if (!isValid) console.log(`Invalid rule pattern: ${pattern}`);
  return isValid;
}

// 初始化
chrome.storage.local.get(["rules", "mode", "proxyUrl", "rawRules"], (data) => {
  console.log("Loading config...");
  if (data.rules) {
    rules = data.rules.filter(isValidPattern);
    console.log(`Loaded rules: ${rules.join(", ")}`);
  }
  if (data.mode) {
    mode = data.mode;
    console.log(`Loaded mode: ${mode}`);
  }
  if (data.proxyUrl) {
    proxyUrl = data.proxyUrl;
    console.log(`Loaded proxy: ${proxyUrl}`);
  }
  setPacScript(proxyUrl, rules, mode);

});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    console.log("Storage changed:", Object.keys(changes));
    let needsUpdate = false;
    if (changes.rules) {
      rules = (changes.rules.newValue || []).filter(isValidPattern);
      console.log(`Rules updated: ${rules.join(", ")}`);
      needsUpdate = true;
    }
    if (changes.mode) {
      mode = changes.mode.newValue || "whitelist";
      console.log(`Mode updated: ${mode}`);
      needsUpdate = true;
    }
    if (changes.proxyUrl) {
      proxyUrl = changes.proxyUrl.newValue || "http://localhost:7890";
      console.log(`Proxy updated: ${proxyUrl}`);
      needsUpdate = true;
    }
    if (needsUpdate) {
      setPacScript(proxyUrl, rules, mode);
    }
  }
});

// 新功能：监听 URL 并动态更改图标
function evaluateProxyForUrl(url, host) {
  let proxyHost = "localhost";
  let proxyPort = 7890;
  try {
    const urlObj = new URL(proxyUrl);
    proxyHost = toPunycode(urlObj.hostname);
    proxyPort = parseInt(urlObj.port, 10) || 7890;
  } catch (e) {
    console.log(`Error parsing proxy URL for icon logic: ${e.message}`);
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "DIRECT";
  }
  const matched = rules.some(pattern => {
    if (!pattern.match(/^[a-zA-Z0-9*.?-]+$/)) return false;
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    const regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${regexStr}$`).test(host);
  });

  const isProxy = mode === "whitelist" ? !matched : matched;
  return isProxy ? `PROXY ${proxyHost}:${proxyPort}` : "DIRECT";
}

// 更新图标
function updateIconForTab(tabId, url) {
  let newIcon;
  // 处理 new tab (about:blank) 和 extension pages (chrome://)
  if (!url || url === "about:blank" || url.startsWith("chrome://")||url.startsWith("edge://")) {
    console.log(`Special URL, using default icon: ${url || "no URL"}`);
    newIcon = defaultIcon;
  } else {
    let host;
    try {
      host = new URL(url).hostname;
    } catch (e) {
      console.log(`Invalid URL, using default icon: ${url}`);
      newIcon = defaultIcon;
    }

    if (host) {
      const result = evaluateProxyForUrl(url, host);
      const isProxy = result.startsWith("PROXY");
      console.log(`URL ${url} uses ${result}`);
      newIcon = isProxy ? proxyIcon : defaultIcon;
      console.log(`host: ${host}, result: ${result}, proxyIcon: ${isProxy}`);
    }
  }

  chrome.action.setIcon({ imageData: newIcon, tabId });
  console.log(`Icon updated to ${newIcon === proxyIcon ? "proxy" : "default"} for tab ${tabId},url: ${url}`);
}

// 监听 Tab 切换
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (chrome.runtime.lastError) {
      console.log(`Failed to get tab ${activeInfo.tabId}: ${chrome.runtime.lastError.message}`);
      return;
    }
    console.log(`Tab activated, tab ${activeInfo.tabId}, url: ${tab.url}`); 
    updateIconForTab(activeInfo.tabId, tab.url || "");
  });
});


chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
      console.log(`WebNavigation onBeforeNavigate, tab ${details.tabId}, url: ${details.url}`);  
      updateIconForTab(details.tabId, details.url || "");
    }
  },
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading") {
      console.log(`Tab updated, tab ${tabId}, url: ${tab.url}`);
      updateIconForTab(tabId, tab.url || "");
    }
  },
);  

// 监听 Tab 关闭
chrome.tabs.onRemoved.addListener(tabId => {
  console.log(`Tab ${tabId} closed, removed from lastIcon`);
});