document.addEventListener("DOMContentLoaded", () => {
    const rulesInput = document.getElementById("rules");
    const proxyInput = document.getElementById("proxyUrl");
    const rulesUrlInput = document.getElementById("rulesUrl");
    const fetchButton = document.getElementById("fetchRules");
    const saveButton = document.getElementById("save");
    const modeInputs = document.querySelectorAll('input[name="mode"]');
  
    function isValidPattern(pattern) {
      const isValid = pattern && /^[a-zA-Z0-9*.?-]+$/.test(pattern) && pattern.length <= 255;
      if (!isValid) console.log(`Invalid rule pattern: ${pattern}`);
      return isValid;
    }
  
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
  
    function isValidRulesUrl(url) {
      try {
        const parsed = new URL(url);
        return ["http", "https"].includes(parsed.protocol.replace(":", "").toLowerCase());
      } catch {
        return false;
      }
    }
  
    async function fetchRules() {
      const url = rulesUrlInput.value.trim();
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
        rulesInput.value = text;
        console.log(`Fetched rules from ${url}:\n${text}`);
        alert("规则已加载到输入框，请检查并保存");
      } catch (e) {
        console.error(`Failed to fetch rules from ${url}: ${e.message}`);
        alert(`加载规则失败：${e.message}`);
      }
    }
  
    chrome.storage.local.get(["rules", "mode", "proxyUrl", "rawRules", "rulesUrl"], (data) => {
      console.log("Loading popup config...");
      if (data.rawRules) {
        rulesInput.value = data.rawRules;
        console.log(`Loaded raw rules: ${data.rawRules}`);
      } else if (data.rules) {
        rulesInput.value = data.rules.join("\n");
        console.log(`Loaded rules: ${data.rules.join(", ")}`);
      }
      if (data.mode) {
        document.querySelector(`input[value="${data.mode}"]`).checked = true;
        console.log(`Loaded mode: ${data.mode}`);
      }
      if (data.proxyUrl) {
        proxyInput.value = data.proxyUrl;
        console.log(`Loaded proxy: ${data.proxyUrl}`);
      } else {
        proxyInput.value = "http://localhost:7890";
      }
      if (data.rulesUrl) {
        rulesUrlInput.value = data.rulesUrl;
        console.log(`Loaded rules URL: ${data.rulesUrl}`);
      }
    });
  
    fetchButton.addEventListener("click", fetchRules);
  
    saveButton.addEventListener("click", () => {
      const rawRules = rulesInput.value;
      const rules = rawRules
        .split("\n")
        .map(line => line.trim())
        .filter(line => {
          if (!line) return false;
          if (line.startsWith("#") || line.startsWith(";") || line.startsWith("//") || line.startsWith("[")) {
            console.log(`Ignoring comment line: ${line}`);
            return false;
          }
          return isValidPattern(line);
        });
      const mode = document.querySelector('input[name="mode"]:checked').value;
      const proxyUrl = proxyInput.value.trim();
      const rulesUrl = rulesUrlInput.value.trim();
  
      const config = { rules, mode, rawRules };
      if (isValidProxyUrl(proxyUrl)) {
        config.proxyUrl = proxyUrl;
      } else if (proxyUrl) {
        console.log(`Invalid proxy URL: ${proxyUrl}`);
        alert("代理地址无效，将使用默认 http://localhost:7890");
      }
      if (rulesUrl && isValidRulesUrl(rulesUrl)) {
        config.rulesUrl = rulesUrl;
      } else if (rulesUrl) {
        console.log(`Invalid rules URL: ${rulesUrl}`);
        alert("规则 URL 无效，将不保存");
      }
  
      console.log(`Saving config: rules=${rules.join(", ")}, mode=${mode}, proxy=${config.proxyUrl || "default"}, rulesUrl=${config.rulesUrl || "none"}`);
      chrome.storage.local.set(config, () => {
        console.log("Config saved");
        chrome.storage.local.get(["rules", "mode", "proxyUrl", "rawRules", "rulesUrl"], (data) => {
          console.log(`Stored config: rules=${(data.rules || []).join(", ")}, rawRules=${data.rawRules}, mode=${data.mode}, proxy=${data.proxyUrl || "default"}, rulesUrl=${data.rulesUrl || "none"}`);
        });
        if (rules.length < rawRules.split("\n").filter(line => line.trim()).length) {
          alert("已保存配置，注释或无效规则被忽略，仅显示在输入框！");
        } else {
          alert("配置已保存！");
        }
      });
    });
  });