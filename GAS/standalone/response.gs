function normalizeCallbackName(callbackName) {
  var value = String(callbackName || '').trim();
  if (!value) {
    return '';
  }

  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(value) ? value : '';
}

function jsonResponse(data, callbackName) {
  var callback = normalizeCallbackName(callbackName);
  var json = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function okResponse(action, data, callbackName) {
  return jsonResponse({
    ok: true,
    action: action,
    data: data || {}
  }, callbackName);
}

function errorResponse(action, message, details, callbackName) {
  return jsonResponse({
    ok: false,
    action: action,
    error: {
      message: message || "Unknown error",
      details: details || ""
    }
  }, callbackName);
}
