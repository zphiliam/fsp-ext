// background.js
// Default proxy settings
let proxyUrl = "http://localhost:7890";
let whitelistRules = [];
let blacklistRules = [];
let currentRules = [];
let mode = "whitelist";
let proxyEnabled = false;

// Global icons storage
let proxyIcon = null;
let defaultIcon = null;
let proxyTitle = "当前网页使用了代理";
let defaultTitle = "当前网页未使用代理";

// Icon update debouncing
let iconUpdateTimeouts = new Map();

// 防止 worker 休眠
chrome.alarms.clearAll(() => {
  console.log("Cleared all alarms");
});
// Create a heartbeat alarm to keep the background script alive
chrome.alarms.create('heartbeat', { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') {
    console.log('Heartbeat at:', new Date());
    // chrome.storage.local.set({ lastHeartbeat: Date.now() });
  }
});
// Initialize extension
function init() {
  createIcons();
  // Set default icon
  chrome.action.setIcon({ imageData: defaultIcon })
    .then(() => {
      console.log(`Default icon set for all tabs on initialization`);
    })
    .catch((error) => {
      console.error("Failed to set default icon on initialization:", error);
    });
  
  // Load saved configuration
  loadConfig();
}

// Load saved configuration from storage
function loadConfig() {
  chrome.storage.local.get([
    "proxyEnabled",
    "proxyUrl", 
    "whitelistRules", 
    "blacklistRules", 
    "whitelistUrlRulesParsed",
    "blacklistUrlRulesParsed",
    "mode"
  ], (data) => {
    console.log("Loading background config...");
    
    if (data.proxyEnabled !== undefined) {
      proxyEnabled = data.proxyEnabled;
      console.log(`Loaded proxy enabled: ${proxyEnabled}`);
    }
    
    if (data.proxyUrl) {
      proxyUrl = data.proxyUrl;
      console.log(`Loaded proxy: ${proxyUrl}`);
    }
    
    // Load whitelist rules (combine manual and URL rules)
    let manualWhitelistRules = [];
    if (data.whitelistRules) {
      manualWhitelistRules = data.whitelistRules.filter(isValidPattern);
      console.log(`Loaded manual whitelist rules: ${manualWhitelistRules.length} rules`);
    }
    
    let urlWhitelistRules = [];
    if (data.whitelistUrlRulesParsed) {
      urlWhitelistRules = data.whitelistUrlRulesParsed.filter(isValidPattern);
      console.log(`Loaded URL whitelist rules: ${urlWhitelistRules.length} rules`);
    }
    
    whitelistRules = [...manualWhitelistRules, ...urlWhitelistRules];
    console.log(`Combined whitelist rules: ${whitelistRules.length} rules`);
    
    // Load blacklist rules (combine manual and URL rules)
    let manualBlacklistRules = [];
    if (data.blacklistRules) {
      manualBlacklistRules = data.blacklistRules.filter(isValidPattern);
      console.log(`Loaded manual blacklist rules: ${manualBlacklistRules.length} rules`);
    }
    
    let urlBlacklistRules = [];
    if (data.blacklistUrlRulesParsed) {
      urlBlacklistRules = data.blacklistUrlRulesParsed.filter(isValidPattern);
      console.log(`Loaded URL blacklist rules: ${urlBlacklistRules.length} rules`);
    }
    
    blacklistRules = [...manualBlacklistRules, ...urlBlacklistRules];
    console.log(`Combined blacklist rules: ${blacklistRules.length} rules`);
    
    if (data.mode) {
      mode = data.mode;
      console.log(`Loaded mode: ${mode}`);
    }
    
    // Set current rules based on mode
    currentRules = mode === "whitelist" ? whitelistRules : blacklistRules;
    
    // Apply proxy settings
    updateProxySettings();
  });
}

// Initialize extension
init();

// Convert to Punycode (handle non-ASCII hostnames)
function toPunycode(host) {
  try {
    return host.match(/^[a-zA-Z0-9.-]+$/) ? host : null; // ASCII only
  } catch (e) {
    console.log(`Punycode conversion failed for host: ${host}`);
    return null;
  }
}

// Create icons (called once)
function createIcons() {
  function createSingleIcon(isProxy) {
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = isProxy ? "#4f46e5" : "#9ca3af";
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "white";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("F", 16, 16);
    return ctx.getImageData(0, 0, 32, 32);
  }
  proxyIcon = { "32": createSingleIcon(true) };
  defaultIcon = { "32": createSingleIcon(false) };
  console.log("Icons created");
}

// Generate PAC script
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
    
    // New logic for ".domain.com" pattern (match domain and subdomains)
    if (pattern.startsWith(".")) {
      const base = pattern.slice(1);
      return `(host === "${base}" || host.endsWith("${pattern}"))`;
    }
    
    // Updated logic for "*.domain.com" pattern (match only subdomains)
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return `host.endsWith(".${base}")`;
    }
    
    const regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
    return `host.match(/^${regexStr}$/)`;
  }).filter(rule => rule !== null);

  const pacScript = `
    var cache = {};
    function FindProxyForURL(url, host) {
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
  
  console.log(`PAC generated: ${rules.length} rules, mode=${mode}, proxy=${proxyScheme}://${proxyHost}:${proxyPort}`);
  return pacScript;
}

// Set proxy using PAC script
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

// Clear proxy settings (use system settings)
function clearProxySettings() {
  chrome.proxy.settings.set(
    {
      value: { mode: "system" },
      scope: "regular"
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(`Proxy clear error: ${chrome.runtime.lastError.message}`);
      } else {
        console.log("Proxy cleared successfully");
      }
    }
  );
}

// Update proxy settings based on current state
function updateProxySettings() {
  if (proxyEnabled) {
    setPacScript(proxyUrl, currentRules, mode);
  } else {
    clearProxySettings();
  }
}

// Validate rule pattern
function isValidPattern(pattern) {
  // Allow patterns starting with a dot (.)
  const isValid = pattern && /^[a-zA-Z0-9*.?-]+$/.test(pattern) && pattern.length <= 255;
  if (!isValid) console.log(`Invalid rule pattern: ${pattern}`);
  return isValid;
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    console.log("Storage changed:", Object.keys(changes));
    let needsUpdate = false;
    
    if (changes.proxyEnabled !== undefined) {
      proxyEnabled = changes.proxyEnabled.newValue;
      console.log(`Proxy enabled updated: ${proxyEnabled}`);
      needsUpdate = true;
    }
    
    let whitelistChanged = false;
    let blacklistChanged = false;
    
    // Check for manual whitelist rules changes
    if (changes.whitelistRules) {
      whitelistChanged = true;
    }
    
    // Check for URL whitelist rules changes
    if (changes.whitelistUrlRulesParsed) {
      whitelistChanged = true;
    }
    
    // Check for manual blacklist rules changes
    if (changes.blacklistRules) {
      blacklistChanged = true;
    }
    
    // Check for URL blacklist rules changes
    if (changes.blacklistUrlRulesParsed) {
      blacklistChanged = true;
    }
    
    // If relevant rules changed, load them again
    if (whitelistChanged || blacklistChanged) {
      chrome.storage.local.get([
        "whitelistRules", 
        "blacklistRules",
        "whitelistUrlRulesParsed",
        "blacklistUrlRulesParsed"
      ], (data) => {
        // Update whitelist rules if changed
        if (whitelistChanged) {
          let manualRules = [];
          if (data.whitelistRules) {
            manualRules = data.whitelistRules.filter(isValidPattern);
          }
          
          let urlRules = [];
          if (data.whitelistUrlRulesParsed) {
            urlRules = data.whitelistUrlRulesParsed.filter(isValidPattern);
          }
          
          whitelistRules = [...manualRules, ...urlRules];
          console.log(`Updated whitelist rules: ${whitelistRules.length} total rules`);
        }
        
        // Update blacklist rules if changed
        if (blacklistChanged) {
          let manualRules = [];
          if (data.blacklistRules) {
            manualRules = data.blacklistRules.filter(isValidPattern);
          }
          
          let urlRules = [];
          if (data.blacklistUrlRulesParsed) {
            urlRules = data.blacklistUrlRulesParsed.filter(isValidPattern);
          }
          
          blacklistRules = [...manualRules, ...urlRules];
          console.log(`Updated blacklist rules: ${blacklistRules.length} total rules`);
        }
        
        // Update current rules based on mode
        currentRules = mode === "whitelist" ? whitelistRules : blacklistRules;
        
        // Update proxy settings if enabled
        if (proxyEnabled) {
          updateProxySettings();
        }
      });
    }
    
    if (changes.mode) {
      mode = changes.mode.newValue || "whitelist";
      currentRules = mode === "whitelist" ? whitelistRules : blacklistRules;
      console.log(`Mode updated: ${mode}`);
      needsUpdate = true;
    }
    
    if (changes.proxyUrl) {
      proxyUrl = changes.proxyUrl.newValue || "http://localhost:7890";
      console.log(`Proxy updated: ${proxyUrl}`);
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      updateProxySettings();
    }
  }
});

// Message listener for popup and settings page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);
  
  if (request.action === "updateProxy") {
    if (request.proxyEnabled !== undefined) {
      proxyEnabled = request.proxyEnabled;
    }
    
    if (request.proxyUrl) {
      proxyUrl = request.proxyUrl;
    }
    
    if (request.rules) {
      currentRules = request.rules.filter(isValidPattern);
    }
    
    if (request.mode) {
      mode = request.mode;
    }
    
    updateProxySettings();
    sendResponse({ success: true });
  }
  
  return true; // Keep the message channel open for async response
});


// Evaluate proxy for URL
function evaluateProxyForUrl(url, host) {
  if (!proxyEnabled) {
    return "DIRECT"; // System proxy (effectively direct)
  }
  
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
  
  const matched = currentRules.some(pattern => {
    if (!pattern.match(/^[a-zA-Z0-9*.?-]+$/)) return false;
    
    // New logic for ".domain.com" pattern
    if (pattern.startsWith(".")) {
      const base = pattern.slice(1);
      return host === base || host.endsWith(pattern);
    }
    
    // Updated logic for "*.domain.com" pattern
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return host.endsWith(`.${base}`);
    }
    
    const regexStr = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${regexStr}$`).test(host);
  });

  const isProxy = mode === "whitelist" ? !matched : matched;
  return isProxy ? `PROXY ${proxyHost}:${proxyPort}` : "DIRECT";
}

// Update icon for tab with debouncing
function updateIconForTab(tabId, url) {
  // Clear existing timeout for this tab
  if (iconUpdateTimeouts.has(tabId)) {
    clearTimeout(iconUpdateTimeouts.get(tabId));
  }
  
  // Set a new timeout for this tab
  const timeoutId = setTimeout(() => {
    doUpdateIconForTab(tabId, url);
    iconUpdateTimeouts.delete(tabId);
  }, 100); // 100ms debounce
  
  iconUpdateTimeouts.set(tabId, timeoutId);
}

// Actual icon update function
function doUpdateIconForTab(tabId, url) {
  let newIcon;
  
  // Handle special URLs (about:blank, chrome://, etc.)
  // const ignorePrefixes = ["about:", "chrome:", "edge:", "file:", "javascript:", "extensions:", "chrome-extension:", "chrome-error:"];

  if (!url || url === "about:blank" || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("extensions://") || url.startsWith("chrome-extension://") || url.startsWith("chrome-error://")) {
    console.log(`Special URL, using default icon: ${url || "no URL"}`);
    newIcon = defaultIcon;
  } else {
    let host;
    try {
      host = new URL(url).hostname;
    } catch (e) {
      console.log(`Invalid URL, using default icon: ${url}`);
      newIcon = defaultIcon;
      host = null;
    }

    if (host) {
      const result = evaluateProxyForUrl(url, host);
      const isProxy = result.startsWith("PROXY");
      console.log(`URL ${url} uses ${result}`);
      newIcon = isProxy ? proxyIcon : defaultIcon;
      console.log(`host: ${host}, result: ${result}, proxyIcon: ${isProxy}`);
    }
  }

  chrome.action.setIcon({ imageData: newIcon, tabId })
    .then(() => {
      chrome.action.setTitle({ title: newIcon === proxyIcon ? proxyTitle : defaultTitle, tabId });
      console.log(`Icon updated to ${newIcon === proxyIcon ? "proxy" : "default"} for tab ${tabId}, url: ${url}`);
    })
    .catch((error) => {
      console.error("setIcon error: ", error);
      // Fallback: try setting icon without tabId
      chrome.action.setIcon({ imageData: newIcon })
        .catch((fallbackError) => {
          console.error("Fallback setIcon also failed: ", fallbackError);
        });
    });
}

// Listen for tab activation
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

// Listen for navigation
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    if (details.frameId === 0) {
      console.log(`WebNavigation onBeforeNavigate, tab ${details.tabId}, url: ${details.url}`);  
      updateIconForTab(details.tabId, details.url || "");
    }
  }
);

// Listen for tab updates
chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading") {
      console.log(`Tab updated, tab ${tabId}, url: ${tab.url}`);
      updateIconForTab(tabId, tab.url || "");
    }
  }
);