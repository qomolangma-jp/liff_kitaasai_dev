function maskId(value) {
  var s = String(value || "").trim();
  if (!s) return "";
  if (s.length <= 10) return "***";
  return s.substring(0, 6) + "..." + s.substring(s.length - 4);
}

function handleDiagnosticsStatus() {
  var bookroomSsId = String(APP_CONFIG.spreadsheets.bookroom || "").trim();
  var chatSsId = String(APP_CONFIG.spreadsheets.chat || "").trim();
  var webhookSheet = String(APP_CONFIG.sheets.webhookLog || "webhook_log");
  var bookroomSheet = String(APP_CONFIG.sheets.bookroomMain || "予約台帳");

  var status = {
    ok: true,
    timestamp: Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss"),
    runtime: {
      webAppUrl: ScriptApp.getService().getUrl(),
      liffTokenVerifyEnabled: !!APP_CONFIG.auth.liffTokenVerifyEnabled,
      lineSignatureVerifyRequired: !!APP_CONFIG.auth.lineSignatureVerifyRequired
    },
    properties: {
      hasLineAccessToken: !!String(APP_CONFIG.line.channelAccessToken || "").trim(),
      hasLineChannelSecret: !!String(APP_CONFIG.line.channelSecret || "").trim(),
      hasWebhookSecret: !!String(APP_CONFIG.line.webhookSecret || "").trim(),
      hasSsBookroomId: !!bookroomSsId,
      hasSsChatId: !!chatSsId
    },
    targets: {
      ssBookroomIdMasked: maskId(bookroomSsId),
      ssChatIdMasked: maskId(chatSsId),
      webhookSheetName: webhookSheet,
      bookroomSheetName: bookroomSheet
    },
    checks: {
      webhookSheetWritable: false,
      bookroomSheetReadable: false,
      adminCount: 0
    }
  };

  try {
    var webhookSheet = getOrCreateSheet(APP_CONFIG.spreadsheets.chat, APP_CONFIG.sheets.webhookLog, ["created_at", "level", "phase", "message", "meta"]);
    status.checks.webhookSheetWritable = !!webhookSheet;
  } catch (err1) {
    status.ok = false;
    status.checks.webhookSheetWritable = false;
    status.checks.webhookSheetError = String(err1);
  }

  try {
    var bookroomSheetObj = getSheetOrThrow(APP_CONFIG.spreadsheets.bookroom, APP_CONFIG.sheets.bookroomMain);
    status.checks.bookroomSheetReadable = !!bookroomSheetObj;
  } catch (err2) {
    status.ok = false;
    status.checks.bookroomSheetReadable = false;
    status.checks.bookroomSheetError = String(err2);
  }

  try {
    status.checks.adminCount = getBookroomAdminIds().length;
  } catch (err3) {
    status.ok = false;
    status.checks.adminCountError = String(err3);
  }

  return status;
}

function handleDiagnosticsWrite(payload) {
  var note = payload && payload.note ? String(payload.note).trim() : "manual";
  recordWebhookDiagnostic("info", "diagnostics.manual", "Manual diagnostics write", {
    note: note,
    time: Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss")
  });
  return {
    status: "ok",
    message: "diagnostics log appended",
    note: note
  };
}
