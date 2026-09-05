(function (global) {
  var SHARED_GAS_URL = "https://script.google.com/macros/s/AKfycbzMI_ssF1Lvd5xVq6oyxZpYzWGlfVyU2edi7Lcq2cvyr_ADZjJfhvmQHRJfbB-1JmFn/exec";

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
      liffId: "2008893549-jeCNKx4Y",
      gasUrl: SHARED_GAS_URL
    },
    safetycheck: {
      liffId: "2008893549-RZBPRM9X",
      gasUrl: SHARED_GAS_URL
    }
  };

  function getPageConfig(pageKey) {
    var key = String(pageKey || "").trim();
    return PAGE_CONFIGS[key] || {};
  }

  global.AppConfig = {
    SHARED_GAS_URL: SHARED_GAS_URL,
    PAGE_CONFIGS: PAGE_CONFIGS,
    getPageConfig: getPageConfig
  };
})(typeof window !== "undefined" ? window : globalThis);
