document.addEventListener("DOMContentLoaded", () => {
    const rulesInput = document.getElementById("rules");
    const proxyInput = document.getElementById("proxyUrl");
    const saveButton = document.getElementById("save");
    const modeInputs = document.querySelectorAll('input[name="mode"]');
  
    // 验证规则
    function isValidPattern(pattern) {
      const isValid = pattern && /^[a-zA-Z0-9*.?-]+$/.test(pattern) && pattern.length <= 255;
      if (!isValid) console.warn(`Invalid rule pattern: ${pattern}`);
      return isValid;
    }
  
    // 验证代理地址
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
  
    // 加载配置
    chrome.storage.local.get(["rules", "mode", "proxyUrl", "rawRules"], (data) => {
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
        proxyInput.value = "http://localhost:1080";
      }
    });
  
    // 保存配置
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
      
      const config = { rules, mode, rawRules };
      if (isValidProxyUrl(proxyUrl)) {
        config.proxyUrl = proxyUrl;
      } else if (proxyUrl) {
        console.warn(`Invalid proxy URL: ${proxyUrl}`);
        alert("代理地址无效，将使用默认 http://localhost:1080");
      }
      
      console.log(`Saving config: rules=${rules.join(", ")}, mode=${mode}, proxy=${config.proxyUrl || "default"}`);
      chrome.storage.local.set(config, () => {
        console.log("Config saved");
        chrome.storage.local.get(["rules", "mode", "proxyUrl", "rawRules"], (data) => {
          console.log(`Stored config: rules=${(data.rules || []).join(", ")}, rawRules=${data.rawRules}, mode=${data.mode}, proxy=${data.proxyUrl || "default"}`);
        });
        if (rules.length < rawRules.split("\n").filter(line => line.trim()).length) {
          alert("已保存配置，注释或无效规则被忽略，仅显示在输入框！");
        } else {
          alert("配置已保存！");
        }
      });
    });
  });