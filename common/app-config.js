(function (global) {
  var SHARED_GAS_URL = "https://script.google.com/macros/s/AKfycbz48WTnbJlYOFc_bog41yu0KHXCUdEseuIc__LeEidJ9YbjkaMu59k32UwQvVJItGGk/exec";

  var PAGE_CONFIGS = {
    profile: {
      liffId: "2008893549-jeCNKx4Y",
      gasUrl: SHARED_GAS_URL
    },
    bookroom: {
      liffId: "2008962357-gLXhtSi2",
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
