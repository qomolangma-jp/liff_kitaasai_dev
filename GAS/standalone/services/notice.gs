function handleGetMonthlyItems(input) {
  var ym = String(input.ym || "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ym = Utilities.formatDate(new Date(), "JST", "yyyy-MM");
  }

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
    if (norm.indexOf(ym + "/") !== 0) continue;

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
      "action",
      "action_type",
      "item_label",
      "target_month",
      "ym",
      "url",
      "user_id",
      "user_name",
      "group",
      "meta"
    ]
  );

  sheet.appendRow([
    new Date(),
    "log",
    data.action_type || "",
    data.item_label || "",
    data.target_month || data.ym || "",
    data.ym || data.target_month || "",
    data.url || "",
    data.user_id || "",
    data.user_name || "",
    data.group || "",
    JSON.stringify(data.meta || data || {})
  ]);

  return { status: "success" };
}

function writeAuditLog(record) {
  try {
    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.notice,
      APP_CONFIG.sheets.auditLog,
      ["created_at", "action", "method", "status", "latency_ms", "user_id", "error_message"]
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
