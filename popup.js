document.addEventListener("DOMContentLoaded", () => {
  const proxyEnabledToggle = document.getElementById("proxyEnabled");
  const proxyUrlDisplay = document.getElementById("proxyUrlDisplay");
  const modeOptions = document.querySelectorAll(".mode-option");
  const openSettingsButton = document.getElementById("openSettings");
  const showRulesButton = document.getElementById("showRules");

  // Initialize state
  let proxyEnabled = true;
  let currentMode = "whitelist";
  let proxyUrl = "http://localhost:7890";
  let whitelistRules = [];
  let blacklistRules = [];
  let whitelistRawRules = "";
  let blacklistRawRules = "";

  // Load saved configuration
  chrome.storage.local.get([
    "proxyEnabled", 
    "mode", 
    "proxyUrl", 
    "whitelistRules", 
    "blacklistRules", 
    "whitelistRawRules", 
    "blacklistRawRules"
  ], (data) => {
    console.log("Loading popup config...");
    
    // Set proxy enabled state
    if (data.proxyEnabled !== undefined) {
      proxyEnabled = data.proxyEnabled;
      proxyEnabledToggle.checked = proxyEnabled;
      console.log(`Loaded proxy enabled: ${proxyEnabled}`);
    }
    
    // Set proxy mode (whitelist/blacklist)
    if (data.mode) {
      currentMode = data.mode;
      updateModeUI(currentMode);
      console.log(`Loaded mode: ${currentMode}`);
    }
    
    // Set proxy URL
    if (data.proxyUrl) {
      proxyUrl = data.proxyUrl;
      proxyUrlDisplay.textContent = proxyUrl;
      console.log(`Loaded proxy: ${proxyUrl}`);
    }
    
    // Load rules
    if (data.whitelistRules) {
      whitelistRules = data.whitelistRules;
      console.log(`Loaded whitelist rules: ${whitelistRules.length} rules`);
    }
    
    if (data.blacklistRules) {
      blacklistRules = data.blacklistRules;
      console.log(`Loaded blacklist rules: ${blacklistRules.length} rules`);
    }
    
    if (data.whitelistRawRules) {
      whitelistRawRules = data.whitelistRawRules;
    }
    
    if (data.blacklistRawRules) {
      blacklistRawRules = data.blacklistRawRules;
    }
    
    // Update proxy state
    updateProxyState();
  });

  // Toggle proxy enabled/disabled
  proxyEnabledToggle.addEventListener("change", () => {
    proxyEnabled = proxyEnabledToggle.checked;
    console.log(`Proxy enabled changed to: ${proxyEnabled}`);
    
    chrome.storage.local.set({ proxyEnabled }, () => {
      console.log("Proxy enabled state saved");
      updateProxyState();
    });
  });

  // Mode selector
  modeOptions.forEach(option => {
    option.addEventListener("click", () => {
      const newMode = option.getAttribute("data-mode");
      if (newMode !== currentMode) {
        currentMode = newMode;
        updateModeUI(currentMode);
        
        chrome.storage.local.set({ mode: currentMode }, () => {
          console.log(`Mode changed to: ${currentMode}`);
          updateProxyState();
        });
      }
    });
  });

  // Open detailed settings
  openSettingsButton.addEventListener("click", () => {
    chrome.tabs.create({ url: "settings.html" });
  });

  // Show current rules
  showRulesButton.addEventListener("click", () => {
    const currentRules = currentMode === "whitelist" ? whitelistRawRules : blacklistRawRules;
    const ruleCount = currentMode === "whitelist" ? whitelistRules.length : blacklistRules.length;
    
    let message = `当前使用${currentMode === "whitelist" ? "白名单" : "黑名单"}模式，共${ruleCount}条有效规则。`;
    
    if (ruleCount > 0) {
      message += "\n\n有效规则列表：\n" + 
        (currentMode === "whitelist" ? whitelistRules : blacklistRules).join("\n");
    } else {
      message += "\n\n暂无有效规则，请在详细设置中添加。";
    }
    
    alert(message);
  });

  // Update mode UI
  function updateModeUI(mode) {
    modeOptions.forEach(option => {
      if (option.getAttribute("data-mode") === mode) {
        option.classList.add("active");
      } else {
        option.classList.remove("active");
      }
    });
  }

  // Update proxy state
  function updateProxyState() {
    if (proxyEnabled) {
      // Get current rules based on mode
      const rules = currentMode === "whitelist" ? whitelistRules : blacklistRules;
      
      // Set PAC script
      chrome.runtime.sendMessage({
        action: "updateProxy",
        proxyEnabled: true,
        proxyUrl: proxyUrl,
        rules: rules,
        mode: currentMode
      }, (response) => {
        console.log("Proxy update response:", response);
      });
    } else {
      // Disable proxy
      chrome.runtime.sendMessage({
        action: "updateProxy",
        proxyEnabled: false
      }, (response) => {
        console.log("Proxy disable response:", response);
      });
    }
  }
});