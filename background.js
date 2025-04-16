// 默认代理地址
let proxyUrl = "http://localhost:1080";
let rules = ["*.cn", "*.qq.com", "*.baidu.com", "192.168.*.*"];
let mode = "whitelist";

// 转换为 Punycode（处理非 ASCII 主机名）
function toPunycode(host) {
  try {
    return host.match(/^[a-zA-Z0-9.-]+$/) ? host : null; // 仅允许 ASCII
  } catch (e) {
    console.warn(`Punycode conversion failed for host: ${host}`);
    return null;
  }
}

// 生成 PAC 脚本
function generatePacScript(proxyUrl, rules, mode) {
  // 解析代理地址
  let proxyHost = "localhost";
  let proxyPort = 1080;
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
    console.warn(`Invalid proxy URL: ${proxyUrl}, error: ${e.message}, using default http://localhost:1080`);
    proxyHost = "localhost";
    proxyPort = 1080;
    proxyScheme = "http";
  }

  // 转换为 PAC 规则
  const pacRules = rules.map(pattern => {
    if (!pattern.match(/^[a-zA-Z0-9*.?-]+$/)) {
      console.warn(`Skipping non-ASCII rule: ${pattern}`);
      return null;
    }
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return `(host === "${base}" || host.endsWith(".${base}"))`;
    }
    const regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
    return `host.match(/^${regexStr}$/)`;
  }).filter(rule => rule !== null);

  // PAC 脚本（纯 ASCII）
  const pacScript = `
    var cache = {};
    var tempCount = 0;
    function FindProxyForURL(url, host) {
      tempCount++;
      if (host in cache) {
        return cache[host];
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
  if (!isValid) console.warn(`Invalid rule pattern: ${pattern}`);
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
      proxyUrl = changes.proxyUrl.newValue || "http://localhost:1080";
      console.log(`Proxy updated: ${proxyUrl}`);
      needsUpdate = true;
    }
    if (needsUpdate) {
      setPacScript(proxyUrl, rules, mode);
    }
  }
});