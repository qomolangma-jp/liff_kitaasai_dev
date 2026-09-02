function handleGetMonthlyItems(input) {
  var ym = String(input.ym || "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ym = Utilities.formatDate(new Date(), "JST", "yyyy-MM");
  }
  var ymSlash = ym.replace("-", "/");

  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.notice, APP_CONFIG.sheets.noticeItems);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) return [];

  var headers = buildHeaderIndexMap(values[0]);
  var dateCol = headers["ymd"] !== undefined ? headers["ymd"] : headers["date"];
  var typeCol = headers["type"];
  var labelCol = headers["label"] !== undefined ? headers["label"] : headers["title"];
  var urlCol = headers["url"] !== undefined ? headers["url"] : headers["link"];
  var memoCol = headers["memo"];

  var out = [];
  for (var i = 1; i < values.length; i++) {
    var dateText = String(values[i][dateCol] || "").trim();
    if (!dateText) continue;
    var norm = normalizeDateForNotice(dateText);
    if (norm.indexOf(ymSlash + "/") !== 0) continue;

    out.push({
      ymd: norm,
      type: String(values[i][typeCol] || "").trim(),
      label: String(values[i][labelCol] || "").trim(),
      url: String(values[i][urlCol] || "").trim(),
      memo: String(values[i][memoCol] || "").trim()
    });
  }

  out.sort(function (a, b) { return a.ymd < b.ymd ? 1 : -1; });
  return out;
}

function normalizeDateForNotice(input) {
  var s = String(input || "").trim();
  var m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!m) return s;
  return m[1] + "/" + ("0" + m[2]).slice(-2) + "/" + ("0" + m[3]).slice(-2);
}

function handleClientLog(payload) {
  var data = payload || {};
  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.notice,
    APP_CONFIG.sheets.auditLog,
    [
      "timestamp",
      "user_id",
      "user_name",
      "group",
      "target_month",
      "action_type",
      "item_label",
      "url",
      "meta"
    ]
  );

  var row = [
    new Date(),
    data.user_id || "",
    data.user_name || "",
    data.group || "",
    data.target_month || data.ym || "",
    data.action_type || "",
    data.item_label || "",
    data.url || "",
    JSON.stringify(data.meta || data || {})
  ];

  sheet.appendRow(row);
  updateMemberLastSeen(data);
  updateMonthlySummary(data);

  return { status: "success" };
}

function updateMemberLastSeen(data) {
  try {
    var userId = String(data.user_id || "").trim();
    if (!userId) return;

    var targetMonth = String(data.target_month || data.ym || Utilities.formatDate(new Date(), "JST", "yyyy-MM")).trim();
    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.notice,
      APP_CONFIG.sheets.memberLastSeen,
      ["user_id", "user_name", "group", "last_seen_at", "last_seen_month", "last_action_type", "item_label", "url"]
    );

    var values = sheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || "").trim() === userId) {
        rowIndex = i;
        break;
      }
    }

    var row = [
      userId,
      data.user_name || "",
      data.group || "",
      new Date(),
      targetMonth,
      data.action_type || "",
      data.item_label || "",
      data.url || ""
    ];

    if (rowIndex === -1) {
      sheet.appendRow(row);
    } else {
      var range = sheet.getRange(rowIndex + 1, 1, 1, row.length);
      range.setValues([row]);
    }
  } catch (_) {
    // Member last-seen logging must never block user flow.
  }
}

function updateMonthlySummary(data) {
  try {
    var targetMonth = String(data.target_month || data.ym || Utilities.formatDate(new Date(), "JST", "yyyy-MM")).trim();
    var groupName = String(data.group || "未分類").trim();
    var actionType = String(data.action_type || "").trim();
    var userId = String(data.user_id || "").trim();
    if (!targetMonth || !userId) return;

    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.notice,
      APP_CONFIG.sheets.summaryMonthly,
      ["target_month", "group_name", "page_view_count", "item_click_count", "item_redirect_count", "user_ids", "active_user_count", "updated_at"]
    );

    var values = sheet.getDataRange().getValues();
    var targetRow = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || "").trim() === targetMonth && String(values[i][1] || "").trim() === groupName) {
        targetRow = i;
        break;
      }
    }

    var pageViewCount = 0;
    var itemClickCount = 0;
    var itemRedirectCount = 0;
    var userIds = [];

    if (targetRow !== -1) {
      pageViewCount = Number(values[targetRow][2] || 0);
      itemClickCount = Number(values[targetRow][3] || 0);
      itemRedirectCount = Number(values[targetRow][4] || 0);
      userIds = String(values[targetRow][5] || "").split("|").filter(function (id) { return id; });
    }

    if (actionType === "page_view") {
      pageViewCount += 1;
    } else if (actionType === "item_click") {
      itemClickCount += 1;
    } else if (actionType === "item_redirect") {
      itemRedirectCount += 1;
    }

    if (userIds.indexOf(userId) === -1) {
      userIds.push(userId);
    }

    var row = [
      targetMonth,
      groupName,
      pageViewCount,
      itemClickCount,
      itemRedirectCount,
      userIds.join("|"),
      userIds.length,
      new Date()
    ];

    if (targetRow === -1) {
      sheet.appendRow(row);
    } else {
      var range = sheet.getRange(targetRow + 1, 1, 1, row.length);
      range.setValues([row]);
    }
  } catch (_) {
    // Summary logging must never block user flow.
  }
}

function writeAuditLog(record) {
  try {
    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.notice,
      APP_CONFIG.sheets.apiAuditLog,
      ["timestamp", "action", "method", "status", "latency_ms", "user_id", "error_message"]
    );

    sheet.appendRow([
      new Date(),
      record.action || "",
      record.method || "",
      record.status || "",
      record.latencyMs || 0,
      record.userId || "",
      record.errorMessage || ""
    ]);
  } catch (_) {
    // Audit logging must never block API responses.
  }
}
