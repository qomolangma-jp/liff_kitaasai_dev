var APP_CONFIG = (function buildConfig() {
  var p = PropertiesService.getScriptProperties();

  function get(key, fallback) {
    var v = p.getProperty(key);
    if (v === null || v === undefined || String(v).trim() === "") {
      return fallback;
    }
    return String(v).trim();
  }

  function getRequired(key) {
    var v = get(key, "");
    if (!v) {
      throw new Error("Script property is missing: " + key);
    }
    return v;
  }

  return {
    get: get,
    getRequired: getRequired,
    line: {
      channelAccessToken: get("LINE_CHANNEL_ACCESS_TOKEN", ""),
      channelSecret: get("LINE_CHANNEL_SECRET", ""),
      webhookSecret: get("WEBHOOK_SECRET", "")
    },
    auth: {
      liffTokenVerifyEnabled: get("LIFF_TOKEN_VERIFY_ENABLED", "false").toLowerCase() === "true",
      lineSignatureVerifyRequired: get("LINE_SIGNATURE_VERIFY_REQUIRED", "false").toLowerCase() === "true"
    },
    spreadsheets: {
      member: get("SS_MEMBER_ID", ""),
      bookroom: get("SS_BOOKROOM_ID", ""),
      chat: get("SS_CHAT_ID", get("SS_BOOKROOM_ID", "")),
      notice: get("SS_NOTICE_ID", ""),
      attendance: get("SS_ATTENDANCE_ID", "")
    },
    sheets: {
      memberMain: get("SHEET_MEMBER_MAIN", "名簿"),
      bookroomMain: get("SHEET_BOOKROOM_MAIN", "予約台帳"),
      chatLog: get("SHEET_CHAT_LOG", "chat"),
      webhookLog: get("SHEET_WEBHOOK_LOG", "webhook_log"),
      pushLog: get("SHEET_PUSH_LOG", "push_log"),
      noticeItems: get("SHEET_NOTICE_ITEMS", "monthly_items"),
      auditLog: get("SHEET_AUDIT_LOG", "access_log"),
      attendanceQuestions: get("SHEET_ATTENDANCE_QUESTIONS", "questions"),
      attendanceAnswers: get("SHEET_ATTENDANCE_ANSWERS", "answers")
    },
    registration: {
      formUrl: get("REGISTER_FORM_URL", "https://example.com/register")
    },
    push: {
      historySpreadsheetId: get("HISTORY_SS_ID", ""),
      historySheetName: get("HISTORY_SHEET_NAME", "line_send_history"),
      dialogTargetSheet: get("DIALOG_TARGET_SHEET", "名簿")
    }
  };
})();
