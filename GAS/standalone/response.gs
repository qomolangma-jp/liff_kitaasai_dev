function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function okResponse(action, data) {
  return jsonResponse({
    ok: true,
    action: action,
    data: data || {}
  });
}

function errorResponse(action, message, details) {
  return jsonResponse({
    ok: false,
    action: action,
    error: {
      message: message || "Unknown error",
      details: details || ""
    }
  });
}
