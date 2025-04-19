document.addEventListener("DOMContentLoaded", () => {
    const proxyUrlInput = document.getElementById("proxyUrl");
    const whitelistRulesInput = document.getElementById("whitelistRules");
    const blacklistRulesInput = document.getElementById("blacklistRules");
    const whitelistRulesUrlInput = document.getElementById("whitelistRulesUrl");
    const blacklistRulesUrlInput = document.getElementById("blacklistRulesUrl");
    const fetchWhitelistRulesButton = document.getElementById("fetchWhitelistRules");
    const fetchBlacklistRulesButton = document.getElementById("fetchBlacklistRules");
    const saveSettingsButton = document.getElementById("saveSettings");
    const backToPopupButton = document.getElementById("backToPopup");
    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll(".tab-content");
  
    // Tab switching
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const tabId = tab.getAttribute("data-tab");
        
        // Update active tab
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        // Update active content
        tabContents.forEach(content => {
          content.classList.remove("active");
          if (content.id === `${tabId}-tab`) {
            content.classList.add("active");
          }
        });
      });
    });
  
    // Rule validation
    function isValidPattern(pattern) {
      const isValid = pattern && /^[a-zA-Z0-9*.?-]+$/.test(pattern) && pattern.length <= 255;
      if (!isValid && pattern && !/^[#;\/\[]/.test(pattern)) {
        console.log(`Invalid rule pattern: ${pattern}`);
      }
      return isValid;
    }
  
    // Proxy URL validation
    function isValidProxyUrl(url) {
      try {
        const parsed = new URL(url);
        const scheme = parsed.protocol.replace(":", "").toLowerCase();
        const port = parseInt(parsed.port, 10);
        return (
          ["http", "https"].includes(scheme) &&
          parsed.hostname &&
          port >= 1 &&
          port <= 65535
        );
      } catch {
        return false;
      }
    }
  
    // Rules URL validation
    function isValidRulesUrl(url) {
      try {
        const parsed = new URL(url);
        return ["http", "https"].includes(parsed.protocol.replace(":", "").toLowerCase());
      } catch {
        return false;
      }
    }
  
    // Parse rules from text input
    function parseRules(rawRules) {
      return {
        rawRules: rawRules,
        rules: rawRules
          .split("\n")
          .map(line => line.trim())
          .filter(line => {
            if (!line) return false;
            if (line.startsWith("#") || line.startsWith(";") || line.startsWith("//") || line.startsWith("[")) {
              return false;
            }
            return isValidPattern(line);
          })
      };
    }
  
    // Fetch rules from URL
    async function fetchRules(url, rulesTextarea) {
      if (!url) {
        alert("请输入规则文件的 URL");
        return;
      }
      
      if (!isValidRulesUrl(url)) {
        alert("无效的 URL，仅支持 http:// 或 https:// 协议");
        return;
      }
      
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const text = await response.text();
        if (!text.trim()) {
          alert("规则文件为空");
          return;
        }
        
        rulesTextarea.value = text;
        console.log(`Fetched rules from ${url}`);
        alert("规则已加载，请检查并保存");
      } catch (e) {
        console.error(`Failed to fetch rules from ${url}: ${e.message}`);
        alert(`加载规则失败：${e.message}`);
      }
    }
  
    // Load saved configuration
    chrome.storage.local.get([
      "proxyUrl", 
      "whitelistRules", 
      "blacklistRules", 
      "whitelistRawRules", 
      "blacklistRawRules",
      "whitelistRulesUrl",
      "blacklistRulesUrl"
    ], (data) => {
      console.log("Loading settings...");
      
      // Set proxy URL
      if (data.proxyUrl) {
        proxyUrlInput.value = data.proxyUrl;
        console.log(`Loaded proxy: ${data.proxyUrl}`);
      } else {
        proxyUrlInput.value = "http://localhost:7890";
      }
      
      // Set whitelist rules
      if (data.whitelistRawRules) {
        whitelistRulesInput.value = data.whitelistRawRules;
        console.log(`Loaded whitelist raw rules`);
      } else if (data.whitelistRules) {
        whitelistRulesInput.value = data.whitelistRules.join("\n");
        console.log(`Loaded whitelist rules: ${data.whitelistRules.length} rules`);
      }
      
      // Set blacklist rules
      if (data.blacklistRawRules) {
        blacklistRulesInput.value = data.blacklistRawRules;
        console.log(`Loaded blacklist raw rules`);
      } else if (data.blacklistRules) {
        blacklistRulesInput.value = data.blacklistRules.join("\n");
        console.log(`Loaded blacklist rules: ${data.blacklistRules.length} rules`);
      }
      
      // Set rules URLs
      if (data.whitelistRulesUrl) {
        whitelistRulesUrlInput.value = data.whitelistRulesUrl;
      }
      
      if (data.blacklistRulesUrl) {
        blacklistRulesUrlInput.value = data.blacklistRulesUrl;
      }
    });
  
    // Fetch whitelist rules
    fetchWhitelistRulesButton.addEventListener("click", () => {
      fetchRules(whitelistRulesUrlInput.value.trim(), whitelistRulesInput);
    });
  
    // Fetch blacklist rules
    fetchBlacklistRulesButton.addEventListener("click", () => {
      fetchRules(blacklistRulesUrlInput.value.trim(), blacklistRulesInput);
    });
  
    // Save settings
    saveSettingsButton.addEventListener("click", () => {
      const proxyUrl = proxyUrlInput.value.trim();
      const whitelistRawRules = whitelistRulesInput.value;
      const blacklistRawRules = blacklistRulesInput.value;
      const whitelistRulesUrl = whitelistRulesUrlInput.value.trim();
      const blacklistRulesUrl = blacklistRulesUrlInput.value.trim();
      
      const whitelistResult = parseRules(whitelistRawRules);
      const blacklistResult = parseRules(blacklistRawRules);
      
      // Validate proxy URL
      if (proxyUrl && !isValidProxyUrl(proxyUrl)) {
        alert("代理地址无效，格式应为：http://host:port 或 https://host:port");
        return;
      }
      
      // Prepare data to save
      const dataToSave = {
        proxyUrl: proxyUrl || "http://localhost:7890",
        whitelistRules: whitelistResult.rules,
        blacklistRules: blacklistResult.rules,
        whitelistRawRules: whitelistRawRules,
        blacklistRawRules: blacklistRawRules
      };
      
      // Save rules URLs if valid
      if (whitelistRulesUrl && isValidRulesUrl(whitelistRulesUrl)) {
        dataToSave.whitelistRulesUrl = whitelistRulesUrl;
      }
      
      if (blacklistRulesUrl && isValidRulesUrl(blacklistRulesUrl)) {
        dataToSave.blacklistRulesUrl = blacklistRulesUrl;
      }
      
      // Save to storage
      chrome.storage.local.set(dataToSave, () => {
        console.log("Settings saved");
        
        // Update current proxy settings if needed
        chrome.storage.local.get(["proxyEnabled", "mode"], (data) => {
          if (data.proxyEnabled) {
            const currentRules = data.mode === "whitelist" ? whitelistResult.rules : blacklistResult.rules;
            
            chrome.runtime.sendMessage({
              action: "updateProxy",
              proxyEnabled: true,
              proxyUrl: dataToSave.proxyUrl,
              rules: currentRules,
              mode: data.mode
            }, (response) => {
              console.log("Proxy update response:", response);
            });
          }
          
          alert("设置已保存！");
        });
      });
    });
  
    // Back to popup
    backToPopupButton.addEventListener("click", () => {
      window.close();
    });
  });