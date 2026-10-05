(function (global) {
  var SHARED_GAS_URL = "https://script.google.com/macros/s/AKfycbxIuL_-Fe71orznhpQ2pnGM8MY-ofUp8csuX-d2KPKGnR01SjFIDfkdbkFdY5HhLk8A_Q/exec";

  var PAGE_CONFIGS = {
    profile: {
      liffId: "2008893549-jeCNKx4Y",
      gasUrl: SHARED_GAS_URL
    },
    bookroom: {
      liffId: "2008893549-vbVJOMEv",
      gasUrl: SHARED_GAS_URL
    },
    notice: {
      liffId: "2008893549-d75d72lX",
      gasUrl: SHARED_GAS_URL,
      registerFormUrl: "https://liff.line.me/2008893549-jeCNKx4Y"
    },
    attendance: {
      liffId: "2008893549-bATZDh34",
      gasUrl: SHARED_GAS_URL
    },
  };

  function getPageConfig(pageKey) {
    var key = String(pageKey || "").trim();
    return PAGE_CONFIGS[key] || {};
  }

  function getRequiredPageConfig(pageKey) {
    var key = String(pageKey || "").trim();
    var config = PAGE_CONFIGS[key] || {};
    if (!config.liffId || !config.gasUrl) {
      throw new Error("AppConfig is missing required config for page: " + key);
    }
    return config;
  }

  global.AppConfig = {
    SHARED_GAS_URL: SHARED_GAS_URL,
    PAGE_CONFIGS: PAGE_CONFIGS,
    getPageConfig: getPageConfig,
    getRequiredPageConfig: getRequiredPageConfig
  };
})(typeof window !== "undefined" ? window : globalThis);
