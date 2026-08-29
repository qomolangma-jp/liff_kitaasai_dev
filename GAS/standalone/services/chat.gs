function handleLineWebhook(events, options) {
  var opt = options || {};
  var requestId = String(opt.requestId || Utilities.getUuid());
  var safeEvents = Array.isArray(events) ? events : [];

  recordWebhookDiagnostic("info", "handler.start", "Webhook handler started", {
    request_id: requestId,
    event_count: safeEvents.length
  });

  if (safeEvents.length === 0) {
    recordWebhookDiagnostic("info", "handler.empty", "No events in payload", {
      request_id: requestId
    });
    return { result: "ok", request_id: requestId, event_count: 0 };
  }

  var chatRows = [];
  var processed = 0;
  var failed = 0;

  safeEvents.forEach(function (event, index) {
    var eventType = String(event && event.type || "");
    try {
      recordWebhookDiagnostic("info", "event.received", "Event received", {
        request_id: requestId,
        index: index,
        event_type: eventType,
        message_type: String(event && event.message && event.message.type || "")
      });

      if (eventType === "message" && event.message && event.message.type === "text") {
        var userId = String(event.source && event.source.userId || "");
        var text = String(event.message.text || "");
        var ts = new Date(event.timestamp || new Date().getTime());
        var memberName = getMemberNameByLineId(userId);
        var lineName = getLineProfileName(userId);

        chatRows.push({
          created_at: Utilities.formatDate(ts, "JST", "yyyy/MM/dd HH:mm:ss"),
          line_id: userId,
          line_name: lineName,
          name: memberName,
          message: text,
          memo: ""
        });

        recordWebhookDiagnostic("info", "event.message.text", "Text message prepared for sheet", {
          request_id: requestId,
          index: index,
          user_id: userId,
          text_length: text.length
        });
      }

      if (eventType === "postback") {
        handlePostbackEvent(event, requestId, index);
      }

      processed++;
    } catch (eventErr) {
      failed++;
      recordWebhookDiagnostic("error", "event.error", "Event handling failed", {
        request_id: requestId,
        index: index,
        event_type: eventType,
        error: String(eventErr)
      });
    }
  });

  if (chatRows.length > 0) {
    try {
      var sheet = getOrCreateSheet(
        APP_CONFIG.spreadsheets.chat,
        APP_CONFIG.sheets.chatLog,
        ["created_at", "line_id", "line_name", "name", "message", "memo"]
      );
      var expectedHeaders = ["created_at", "line_id", "line_name", "name", "message", "memo"];
      var headerValues = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
      var headerText = headerValues.join("|");
      var expectedText = expectedHeaders.join("|");

      if (headerText !== expectedText) {
        sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      }

      var rowsForSheet = chatRows.map(function (row) {
        return [
          row.created_at,
          row.line_id,
          row.line_name,
          row.name,
          row.message,
          row.memo
        ];
      });

      sheet.getRange(sheet.getLastRow() + 1, 1, rowsForSheet.length, expectedHeaders.length).setValues(rowsForSheet);

      recordWebhookDiagnostic("info", "sheet.write.success", "Chat history saved", {
        request_id: requestId,
        rows_written: chatRows.length,
        spreadsheet_id: APP_CONFIG.spreadsheets.chat,
        sheet_name: APP_CONFIG.sheets.chatLog
      });
    } catch (writeErr) {
      failed++;
      recordWebhookDiagnostic("error", "sheet.write.error", "Failed to write chat history", {
        request_id: requestId,
        rows_to_write: chatRows.length,
        spreadsheet_id: APP_CONFIG.spreadsheets.chat,
        sheet_name: APP_CONFIG.sheets.chatLog,
        error: String(writeErr)
      });
    }
  } else {
    recordWebhookDiagnostic("info", "sheet.write.skip", "No text message rows to save", {
      request_id: requestId
    });
  }

  return {
    result: "ok",
    request_id: requestId,
    event_count: safeEvents.length,
    processed: processed,
    failed: failed,
    rows_pending_write: chatRows.length
  };
}

function getMemberNameByLineId(userId) {
  var uid = String(userId || "").trim();
  if (!uid) return "Nodata";

  try {
    var member = handleMemberCheck({ userId: uid, displayName: "" });
    var fullName = member && member.fullName ? String(member.fullName).trim() : "";
    return fullName || "Nodata";
  } catch (_) {
    return "Nodata";
  }
}

function getLineProfileName(userId) {
  var uid = String(userId || "").trim();
  if (!uid) return "";

  var token = APP_CONFIG.line && APP_CONFIG.line.channelAccessToken
    ? String(APP_CONFIG.line.channelAccessToken).trim()
    : "";
  if (!token) return "";

  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/profile/" + encodeURIComponent(uid), {
      method: "get",
      headers: {
        Authorization: "Bearer " + token
      },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) return "";
    var data = JSON.parse(res.getContentText() || "{}");
    return String(data.displayName || "").trim();
  } catch (_) {
    return "";
  }
}

function handlePostbackEvent(event, requestId, index) {
  var data = String(event.postback && event.postback.data || "");
  if (!data) {
    recordWebhookDiagnostic("warn", "event.postback.empty", "Postback has no data", {
      request_id: requestId || "",
      index: index
    });
    return;
  }

  var params = {};
  data.split("&").forEach(function (pair) {
    var sp = pair.split("=");
    var k = sp[0];
    var v = sp.length > 1 ? decodeURIComponent(sp[1]) : "";
    params[k] = v;
  });

  if (!params.action || !params.batchId) {
    recordWebhookDiagnostic("warn", "event.postback.invalid", "Postback parameters missing", {
      request_id: requestId || "",
      index: index,
      data: data
    });
    return;
  }
  if (params.action !== "approve" && params.action !== "reject") {
    recordWebhookDiagnostic("warn", "event.postback.ignored", "Postback action ignored", {
      request_id: requestId || "",
      index: index,
      action: params.action
    });
    return;
  }

  var result = processBookroomApprovalByBatch(params.batchId, params.action);
  if (result && result.updated > 0) {
    notifyBookroomDecisionToApplicant(result, params.action);
  }
  recordWebhookDiagnostic("info", "event.postback.processed", "Postback action processed", {
    request_id: requestId || "",
    index: index,
    action: params.action,
    batch_id: params.batchId,
    updated: result && result.updated ? result.updated : 0
  });
}

function recordWebhookDiagnostic(level, phase, message, meta) {
  var record = {
    created_at: Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss"),
    level: String(level || "info"),
    phase: String(phase || ""),
    message: String(message || ""),
    meta: JSON.stringify(meta || {})
  };

  try {
    if (!APP_CONFIG.spreadsheets.chat) {
      Logger.log("[WEBHOOK_LOG][%s][%s] %s %s", record.level, record.phase, record.message, record.meta);
      return;
    }

    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.chat,
      APP_CONFIG.sheets.webhookLog,
      ["created_at", "level", "phase", "message", "meta"]
    );

    sheet.appendRow([record.created_at, record.level, record.phase, record.message, record.meta]);
  } catch (err) {
    Logger.log("[WEBHOOK_LOG_FALLBACK][%s][%s] %s %s / %s", record.level, record.phase, record.message, record.meta, String(err));
  }
}
