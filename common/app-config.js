(function (global) {
  var SHARED_GAS_URL = "https://script.google.com/macros/s/AKfycbzFqNc9tAB_TDqyNIXe_rkbHB6gorUGFljSGtc8boyRsW6zcztZ8-2JgRVipe9WOnuA/exec";

  var PAGE_CONFIGS = {
    profile: {
      liffId: "2011489610-3P5OEF1C",
      gasUrl: SHARED_GAS_URL
    },
    bookroom: {
      liffId: "2011489610-2trNDx6c",
      gasUrl: SHARED_GAS_URL
    },
    notice: {
      liffId: "2011489610-y90vBXBu",
      gasUrl: SHARED_GAS_URL,
      registerFormUrl: "https://liff.line.me/2011489610-3P5OEF1C"
    },
    attendance: {
      liffId: "2011489610-IM9eN1yu",
      gasUrl: SHARED_GAS_URL
    },
    safetycheck: {
      liffId: "2011489610-RZBPRM9X",
      gasUrl: SHARED_GAS_URL,
      gatewayUrl: ""
    }
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
