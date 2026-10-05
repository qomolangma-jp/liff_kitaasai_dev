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

function resolveSheetNameWithFallback(spreadsheetId, requestedSheetName) {
  var ss = openSpreadsheetCached(spreadsheetId);
  var name = String(requestedSheetName || "").trim();
  if (!name) {
    return name;
  }

  var candidates = [];
  var seen = {};

  function pushCandidate(candidate) {
    var value = String(candidate || "").trim();
    if (!value || seen[value]) return;
    seen[value] = true;
    candidates.push(value);
  }

  pushCandidate(name);
  if (name === "users" || name === "名簿") {
    pushCandidate(name === "users" ? "名簿" : "users");
  } else if (name === "booklist" || name === "予約台帳") {
    pushCandidate(name === "booklist" ? "予約台帳" : "booklist");
  } else {
    pushCandidate("users");
    pushCandidate("名簿");
    pushCandidate("booklist");
    pushCandidate("予約台帳");
  }

  for (var i = 0; i < candidates.length; i++) {
    if (ss.getSheetByName(candidates[i])) {
      return candidates[i];
    }
  }

  return name;
}

function getSheetOrThrow(spreadsheetId, sheetName) {
  var ss = openSpreadsheetCached(spreadsheetId);
  var resolvedSheetName = resolveSheetNameWithFallback(spreadsheetId, sheetName);
  var sheet = ss.getSheetByName(resolvedSheetName);
  if (!sheet) {
    throw new Error("Sheet not found: " + resolvedSheetName + " (spreadsheet: " + spreadsheetId + ")");
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
