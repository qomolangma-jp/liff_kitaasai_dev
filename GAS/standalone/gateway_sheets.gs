var SS_CACHE = {};

function openSpreadsheetCached(id) {
  if (!id) {
    throw new Error("Spreadsheet ID is empty");
  }
  if (!SS_CACHE[id]) {
    SS_CACHE[id] = SpreadsheetApp.openById(id);
  }
  return SS_CACHE[id];
}

function getSheetOrThrow(spreadsheetId, sheetName) {
  var ss = openSpreadsheetCached(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName + " (spreadsheet: " + spreadsheetId + ")");
  }
  return sheet;
}

function getOrCreateSheet(spreadsheetId, sheetName, headerRow) {
  var ss = openSpreadsheetCached(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (headerRow && headerRow.length > 0 && sheet.getLastRow() === 0) {
    sheet.appendRow(headerRow);
  }
  return sheet;
}

function buildHeaderIndexMap(headers) {
  var map = {};
  headers.forEach(function (h, i) {
    map[String(h || "").trim().toLowerCase()] = i;
  });
  return map;
}

function cacheGetJson(cacheKey) {
  try {
    if (!cacheKey) return null;
    var cache = CacheService.getScriptCache();
    var raw = cache.get(String(cacheKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function cachePutJson(cacheKey, value, ttlSeconds) {
  try {
    if (!cacheKey) return;
    var cache = CacheService.getScriptCache();
    var payload = JSON.stringify(value);
    var ttl = Number(ttlSeconds || 0);
    if (!ttl || ttl < 1) ttl = 60;
    cache.put(String(cacheKey), payload, ttl);
  } catch (_) {
    // Cache failures must never break main flow.
  }
}
