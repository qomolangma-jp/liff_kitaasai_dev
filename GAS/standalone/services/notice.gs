function handleGetMonthlyItems(input) {
  var req = input || {};
  var ym = String(req.ym || "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ym = Utilities.formatDate(new Date(), "JST", "yyyy-MM");
  }
  var cacheKey = "notice_monthly_items_v1_" + ym;
  var cached = cacheGetJson(cacheKey);
  if (cached && Array.isArray(cached)) {
    return filterMonthlyItemsForViewer(cached, req);
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
  cachePutJson(cacheKey, out, 180);
  return filterMonthlyItemsForViewer(out, req);
}

function filterMonthlyItemsForViewer(items, input) {
  var req = input || {};
  var member = null;
  if (req.userId) {
    member = handleMemberCheckCached({
      userId: req.userId,
      displayName: req.displayName || "",
      pictureUrl: req.pictureUrl || ""
    });
  }

  var canViewNotice = !!(
    member &&
    member.isRegistered === true &&
    member.status === "ok" &&
    member.canViewNotice === true
  );

  return (Array.isArray(items) ? items : []).filter(function (item) {
    return isPublicDistributionItem(item) || canViewNotice;
  });
}

function isPublicDistributionItem(item) {
  var type = String(item && item.type || "").trim().toLowerCase();
  return type === "distribution" || type.indexOf("配布") >= 0;
}

function handleNoticeBootstrap(input) {
  var req = input || {};
  var ym = String(req.ym || "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    ym = Utilities.formatDate(new Date(), "JST", "yyyy-MM");
  }

  var member = handleMemberCheckCached({
    userId: req.userId || "",
    displayName: req.displayName || "",
    pictureUrl: req.pictureUrl || ""
  });

  var items = handleGetMonthlyItems({
    ym: ym,
    userId: req.userId || "",
    displayName: req.displayName || "",
    pictureUrl: req.pictureUrl || ""
  });

  return {
    ym: ym,
    member: member,
    items: items
  };
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

function handleSafetyCheckLineMessage(payload) {
  var data = payload || {};
  var eventId = String(data.eventId || "").trim();

  if (eventId && hasSafetyCheckLineEvent(eventId)) {
    recordWebhookDiagnostic("info", "safety_check.duplicate", "Duplicate safety check message skipped", {
      event_id: eventId,
      user_id: String(data.userId || "")
    });
    return { status: "duplicate" };
  }

  var member = handleMemberCheck({
    userId: data.userId || "",
    displayName: data.lineName || ""
  });
  var targetMonth = Utilities.formatDate(
    data.timestamp ? new Date(data.timestamp) : new Date(),
    "JST",
    "yyyy-MM"
  );

  var result = handleClientLog({
    user_id: data.userId || "",
    user_name: member.fullName || data.userName || data.lineName || "",
    group: member.group || "",
    target_month: targetMonth,
    action_type: "safety_check_message",
    item_label: "[安否]確認",
    url: "LINE",
    meta: {
      event_id: eventId,
      answer_status: "確認済み",
      source: "line_rich_menu",
      message: data.message || "[安否]確認",
      line_name: data.lineName || "",
      received_at: data.timestamp || new Date()
    }
  });

  recordWebhookDiagnostic("info", "safety_check.saved", "Safety check message saved", {
    event_id: eventId,
    user_id: String(data.userId || ""),
    status: member.status || "not_registered"
  });

  result.isRegistered = member.isRegistered === true;
  result.memberStatus = member.status || "not_registered";
  result.userName = member.fullName || data.userName || data.lineName || "";
  result.group = member.group || "";
  result.registerFormUrl = member.registerFormUrl || APP_CONFIG.registration.formUrl || "";
  return result;
}

function hasSafetyCheckLineEvent(eventId) {
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
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) return false;

  var headers = buildHeaderIndexMap(values[0]);
  var actionCol = headers["action_type"];
  var metaCol = headers["meta"];
  if (actionCol === undefined || metaCol === undefined) return false;

  for (var i = values.length - 1; i > 0; i--) {
    if (String(values[i][actionCol] || "").trim() !== "safety_check_message") continue;
    if (String(values[i][metaCol] || "").indexOf('"event_id":"' + eventId + '"') >= 0) {
      return true;
    }
  }
  return false;
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
