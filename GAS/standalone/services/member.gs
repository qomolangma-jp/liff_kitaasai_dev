function handleMemberCheck(input) {
  var uid = String(input.userId || "").trim().toLowerCase();
  if (!uid) {
    return {
      isRegistered: false,
      status: "not_registered",
      registerFormUrl: APP_CONFIG.registration.formUrl
    };
  }

  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.member, APP_CONFIG.sheets.memberMain);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) {
    return {
      isRegistered: false,
      status: "not_registered",
      registerFormUrl: APP_CONFIG.registration.formUrl
    };
  }

  var headers = buildHeaderIndexMap(values[0]);
  var idCol = headers["line_id"];
  var lnCol = headers["name_2nd"];
  var fnCol = headers["name_1st"];
  var statusCol = headers["status"];
  var groupCol = headers["group"];

  if (idCol === undefined) {
    return {
      isRegistered: false,
      status: "not_registered",
      registerFormUrl: APP_CONFIG.registration.formUrl,
      error: "line_id column missing"
    };
  }

  var row = null;
  for (var i = 1; i < values.length; i++) {
    var rowId = String(values[i][idCol] || "").trim().toLowerCase();
    if (rowId && rowId === uid) {
      row = values[i];
      break;
    }
  }

  if (!row) {
    return {
      isRegistered: false,
      status: "not_registered",
      registerFormUrl: APP_CONFIG.registration.formUrl
    };
  }

  var fullName = ((lnCol !== undefined ? row[lnCol] : "") + " " + (fnCol !== undefined ? row[fnCol] : "")).trim();
  var status = (statusCol !== undefined ? String(row[statusCol] || "") : "OK").trim().toLowerCase();
  var groupValue = groupCol !== undefined ? String(row[groupCol] || "").trim() : "";

  return {
    isRegistered: true,
    fullName: fullName || (input.displayName || "町民"),
    group: groupValue,
    status: status === "ng" ? "suspended" : "ok",
    registerFormUrl: APP_CONFIG.registration.formUrl
  };
}

function handleMemberProfileGet(input) {
  var lineId = String(input.lineId || "").trim();
  if (!lineId) {
    return {};
  }

  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.member, APP_CONFIG.sheets.memberMain);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) return {};

  var header = values[0];
  var map = buildHeaderIndexMap(header);
  var idCol = map["line_id"];
  if (idCol === undefined) return {};

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || "").trim() === lineId) {
      var out = {};
      for (var c = 0; c < header.length; c++) {
        var key = String(header[c] || "").trim();
        if (!key) continue;
        out[key] = values[i][c];
      }
      return out;
    }
  }

  return {};
}

function handleMemberProfileUpsert(payload) {
  var lineId = String(payload.line_id || "").trim();
  if (!lineId) {
    return { status: "error", message: "line_id is required" };
  }

  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.member, APP_CONFIG.sheets.memberMain);
  var values = sheet.getDataRange().getDisplayValues();

  if (values.length === 0) {
    var defaultHeader = ["line_id", "line_name", "name_1st", "name_2nd", "status", "updated_at"];
    sheet.appendRow(defaultHeader);
    values = [defaultHeader];
  }

  var headers = values[0].map(function (h) { return String(h || "").trim(); });
  var map = buildHeaderIndexMap(headers);

  function ensureColumn(colName) {
    var key = String(colName || "").trim();
    if (!key) return;
    if (map[key.toLowerCase()] !== undefined) return;
    headers.push(key);
    map[key.toLowerCase()] = headers.length - 1;
    sheet.getRange(1, headers.length).setValue(key);
  }

  Object.keys(payload).forEach(function (k) {
    if (k === "action" || k === "liff_token") return;
    ensureColumn(k);
  });
  ensureColumn("updated_at");

  var targetRow = -1;
  var idCol = map["line_id"];
  var lastRow = sheet.getLastRow();

  if (idCol !== undefined && lastRow >= 2) {
    var idValues = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0] || "").trim() === lineId) {
        targetRow = i + 2;
        break;
      }
    }
  }

  var rowData = new Array(headers.length).fill("");
  if (targetRow > 0) {
    rowData = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  }

  Object.keys(payload).forEach(function (k) {
    if (k === "action" || k === "liff_token") return;
    var idx = map[k.toLowerCase()];
    if (idx === undefined) return;
    rowData[idx] = payload[k];
  });

  rowData[map["updated_at"]] = new Date();

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return { status: "success" };
}

function getBookroomAdminIds() {
  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.member, APP_CONFIG.sheets.memberMain);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) return [];

  var map = buildHeaderIndexMap(values[0]);
  var idCol = map["line_id"];
  var alertCol = map["alert"];
  if (idCol === undefined || alertCol === undefined) return [];

  var admins = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][idCol] || "").trim();
    var alert = String(values[i][alertCol] || "").trim();
    if (!id || !alert) continue;
    var scopes = alert.split(",").map(function (s) { return String(s).trim(); });
    if (scopes.indexOf("bookroom") >= 0) {
      admins.push(id);
    }
  }
  return admins;
}
