(function (global) {
  var SHARED_GAS_URL = "https://script.google.com/macros/s/AKfycbxmI70LPhm1N9bVVLIp9lpSmnitUJDYl4B9rYN_llimMfPgDRTEjVM_6vgCgx9aDZs9/exec";

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
      liffId: "2008962357-JxnIosW0",
      gasUrl: SHARED_GAS_URL,
      registerFormUrl: "https://example.com/register"
    },
    attendance: {
      liffId: "2008893549-jeCNKx4Y",
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
