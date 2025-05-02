// settings.js
document.addEventListener("DOMContentLoaded", () => {
  const proxyUrlInput = document.getElementById("proxyUrl");
  const whitelistRulesInput = document.getElementById("whitelistRules");
  const blacklistRulesInput = document.getElementById("blacklistRules");
  const whitelistRulesUrlInput = document.getElementById("whitelistRulesUrl");
  const blacklistRulesUrlInput = document.getElementById("blacklistRulesUrl");
  const fetchWhitelistRulesButton = document.getElementById("fetchWhitelistRules");
  const fetchBlacklistRulesButton = document.getElementById("fetchBlacklistRules");
  const previewWhitelistRulesButton = document.getElementById("previewWhitelistRules");
  const previewBlacklistRulesButton = document.getElementById("previewBlacklistRules");
  const saveSettingsButton = document.getElementById("saveSettings");
  const backToPopupButton = document.getElementById("backToPopup");
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");
  const whitelistUrlRulesCount = document.getElementById("whitelistUrlRulesCount");
  const blacklistUrlRulesCount = document.getElementById("blacklistUrlRulesCount");
  
  // Modal elements
  const rulesPreviewModal = document.getElementById("rulesPreviewModal");
  const previewModalTitle = document.getElementById("previewModalTitle");
  const rulesPreviewContent = document.getElementById("rulesPreviewContent");
  const rulesStats = document.getElementById("rulesStats");
  const closeModalButtons = document.querySelectorAll(".close-modal");
  const applyRulesButton = document.getElementById("applyRules");
  
  // Current preview state
  let currentPreviewType = null;
  let currentPreviewRules = "";
  
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
  
  // Open modal with rules preview
  function openRulesPreview(title, rules, type) {
    previewModalTitle.textContent = title;
    
    // Count valid rules
    const parsedRules = parseRules(rules);
    const validRulesCount = parsedRules.rules.length;
    const totalLines = rules.split("\n").filter(line => line.trim()).length;
    
    rulesStats.textContent = `共 ${totalLines} 行规则，其中 ${validRulesCount} 条有效规则`;
    rulesPreviewContent.textContent = rules;
    
    // Store current preview for "Apply" button
    currentPreviewType = type;
    currentPreviewRules = rules;
    
    // Show modal
    rulesPreviewModal.style.display = "block";
  }
  
  // Close modal
  closeModalButtons.forEach(button => {
    button.addEventListener("click", () => {
      rulesPreviewModal.style.display = "none";
    });
  });
  
  // Close modal if clicked outside the content
  window.addEventListener("click", (event) => {
    if (event.target === rulesPreviewModal) {
      rulesPreviewModal.style.display = "none";
    }
  });
  
  // Apply rules button click
  applyRulesButton.addEventListener("click", () => {
    if (currentPreviewType === "whitelist") {
      // Save to storage
      chrome.storage.local.set({
        whitelistUrlRules: currentPreviewRules,
        whitelistUrlRulesParsed: parseRules(currentPreviewRules).rules
      }, () => {
        updateWhitelistUrlRulesCount();
        rulesPreviewModal.style.display = "none";
        alert("白名单URL规则已应用，请记得保存设置");
      });
    } else if (currentPreviewType === "blacklist") {
      // Save to storage
      chrome.storage.local.set({
        blacklistUrlRules: currentPreviewRules,
        blacklistUrlRulesParsed: parseRules(currentPreviewRules).rules
      }, () => {
        updateBlacklistUrlRulesCount();
        rulesPreviewModal.style.display = "none";
        alert("黑名单URL规则已应用，请记得保存设置");
      });
    }
  });
  
  // Rule validation
  function isValidPattern(pattern) {
    // Allow patterns starting with a dot (.)
    const isValid = pattern && /^[a-zA-Z0-9*.?-]+$/.test(pattern) && pattern.length <= 255;
    if (!isValid) console.log(`Invalid rule pattern: ${pattern}`);
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
  
  // Update whitelist URL rules count badge
  function updateWhitelistUrlRulesCount() {
    chrome.storage.local.get(["whitelistUrlRulesParsed"], (data) => {
      if (data.whitelistUrlRulesParsed && data.whitelistUrlRulesParsed.length > 0) {
        whitelistUrlRulesCount.textContent = data.whitelistUrlRulesParsed.length;
        whitelistUrlRulesCount.classList.remove("hidden");
      } else {
        whitelistUrlRulesCount.classList.add("hidden");
      }
    });
  }
  
  // Update blacklist URL rules count badge
  function updateBlacklistUrlRulesCount() {
    chrome.storage.local.get(["blacklistUrlRulesParsed"], (data) => {
      if (data.blacklistUrlRulesParsed && data.blacklistUrlRulesParsed.length > 0) {
        blacklistUrlRulesCount.textContent = data.blacklistUrlRulesParsed.length;
        blacklistUrlRulesCount.classList.remove("hidden");
      } else {
        blacklistUrlRulesCount.classList.add("hidden");
      }
    });
  }
  
  // Fetch rules from URL
  async function fetchRules(url, type) {
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
      
      // Open the preview modal with the fetched rules
      const title = type === "whitelist" ? "白名单URL规则预览" : "黑名单URL规则预览";
      openRulesPreview(title, text, type);
      
      console.log(`Fetched rules from ${url}`);
    } catch (e) {
      console.error(`Failed to fetch rules from ${url}: ${e.message}`);
      alert(`加载规则失败：${e.message}`);
    }
  }
  
  // Preview existing URL rules
  function previewExistingRules(type) {
    const storageKey = type === "whitelist" ? "whitelistUrlRules" : "blacklistUrlRules";
    const title = type === "whitelist" ? "白名单URL规则预览" : "黑名单URL规则预览";
    
    chrome.storage.local.get([storageKey], (data) => {
      if (data[storageKey] && data[storageKey].trim()) {
        openRulesPreview(title, data[storageKey], type);
      } else {
        alert("暂无URL规则，请先从URL加载规则");
      }
    });
  }
  
  // Load saved configuration
  chrome.storage.local.get([
    "proxyUrl", 
    "whitelistRules", 
    "blacklistRules", 
    "whitelistRawRules", 
    "blacklistRawRules",
    "whitelistRulesUrl",
    "blacklistRulesUrl",
    "whitelistUrlRules",
    "blacklistUrlRules"
  ], (data) => {
    console.log("Loading settings...");
    
    // Set proxy URL
    if (data.proxyUrl) {
      proxyUrlInput.value = data.proxyUrl;
      console.log(`Loaded proxy: ${data.proxyUrl}`);
    } else {
      proxyUrlInput.value = "http://localhost:7890";
    }
    
    // Set whitelist rules (manual only)
    if (data.whitelistRawRules) {
      whitelistRulesInput.value = data.whitelistRawRules;
      console.log(`Loaded whitelist raw rules`);
    } else if (data.whitelistRules) {
      whitelistRulesInput.value = data.whitelistRules.join("\n");
      console.log(`Loaded whitelist rules: ${data.whitelistRules.length} rules`);
    }
    
    // Set blacklist rules (manual only)
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
    
    // Update URL rules counts
    updateWhitelistUrlRulesCount();
    updateBlacklistUrlRulesCount();
  });
  
  // Fetch whitelist rules
  fetchWhitelistRulesButton.addEventListener("click", () => {
    fetchRules(whitelistRulesUrlInput.value.trim(), "whitelist");
  });
  
  // Fetch blacklist rules
  fetchBlacklistRulesButton.addEventListener("click", () => {
    fetchRules(blacklistRulesUrlInput.value.trim(), "blacklist");
  });
  
  // Preview whitelist rules
  previewWhitelistRulesButton.addEventListener("click", () => {
    if (whitelistRulesUrlInput.value.trim()) {
      fetchRules(whitelistRulesUrlInput.value.trim(), "whitelist");
    } else {
      previewExistingRules("whitelist");
    }
  });
  
  // Preview blacklist rules
  previewBlacklistRulesButton.addEventListener("click", () => {
    if (blacklistRulesUrlInput.value.trim()) {
      fetchRules(blacklistRulesUrlInput.value.trim(), "blacklist");
    } else {
      previewExistingRules("blacklist");
    }
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
    
    // Get URL rules
    chrome.storage.local.get([
      "whitelistUrlRulesParsed", 
      "blacklistUrlRulesParsed"
    ], (data) => {
      // Combine manual rules with URL rules
      const combinedWhitelistRules = [
        ...(whitelistResult.rules || []),
        ...(data.whitelistUrlRulesParsed || [])
      ];
      
      const combinedBlacklistRules = [
        ...(blacklistResult.rules || []),
        ...(data.blacklistUrlRulesParsed || [])
      ];
      
      // Prepare data to save
      const dataToSave = {
        proxyUrl: proxyUrl || "http://localhost:7890",
        whitelistRules: combinedWhitelistRules,
        blacklistRules: combinedBlacklistRules,
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
            const currentRules = data.mode === "whitelist" ? combinedWhitelistRules : combinedBlacklistRules;
            
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
  });
  
  // Back to popup
  backToPopupButton.addEventListener("click", () => {
    window.close();
  });
});