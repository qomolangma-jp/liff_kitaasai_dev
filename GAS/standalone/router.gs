function routeRequest(method, e, payload) {
  var startedAt = new Date();
  var action = resolveAction(method, e, payload);
  var callback = getRequestCallback(e, payload);

  try {
    var result;

    if (method === "GET") {
      result = routeGet(action, e);
    } else if (method === "POST") {
      result = routePost(action, e, payload || {});
    } else {
      return errorResponse(action, "Unsupported method", method, callback);
    }

    writeAuditLog({
      action: action,
      method: method,
      status: "ok",
      latencyMs: new Date().getTime() - startedAt.getTime(),
      userId: getUserIdFromRequest(e, payload)
    });

    return result;
  } catch (err) {
    writeAuditLog({
      action: action,
      method: method,
      status: "error",
      latencyMs: new Date().getTime() - startedAt.getTime(),
      userId: getUserIdFromRequest(e, payload),
      errorMessage: String(err)
    });
    return errorResponse(action, "Request failed", String(err), callback);
  }
}

function getRequestCallback(e, payload) {
  var p = (e && e.parameter) ? e.parameter : {};
  var body = payload || {};
  return normalizeCallbackName(p.callback || body.callback || '');
}

function resolveAction(method, e, payload) {
  var p = (e && e.parameter) ? e.parameter : {};
  var body = payload || {};

  if (method === "GET") {
    if (p.action) return String(p.action).trim();
    if (p.type === "user") return "member_check";
    if (p.line_id) return "member_profile_get";
    if (p.qid) return "attendance_question";
    if (p.sid) return "safety_check";
    return "bookroom_list";
  }

  if (method === "POST") {
    if (body.action) return String(body.action).trim();
    if (body.events) return "line_webhook";
    if (body.lineId && body.qid) return "attendance_answer";
    if (body.date && body.room) return "bookroom_submit";
    if (body.line_id && (body.name_1st || body.address || body.is_digital)) return "member_profile_upsert";
    if (body.action === 'safety_check_register') return 'safety_check_register';
    if (body.action === 'safety_check_submit') return 'safety_check_submit';
    if (body.action_type) return "log";
  }

  return "unknown";
}

function routeGet(action, e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var callback = getRequestCallback(e, null);

  switch (action) {
    case "diagnostics":
      return jsonResponse(handleDiagnosticsStatus());

    case "member_check":
      return jsonResponse(handleMemberCheck({
        userId: p.user_id || p.uid || "",
        displayName: p.display_name || "",
        pictureUrl: p.picture_url || ""
      }), callback);

    case "bookroom_list":
      return jsonResponse(handleBookroomList(), callback);

    case "get_monthly_items":
      return okResponse(action, {
        items: handleGetMonthlyItems({ ym: p.ym || "" })
      }, callback);

    case "attendance_question":
      return jsonResponse(handleAttendanceQuestion({
        userId: p.uid || p.user_id || "",
        qid: p.qid || ""
      }), callback);

    case "member_profile_get":
      return jsonResponse(handleMemberProfileGet({ lineId: p.line_id || "" }), callback);

    case "safety_check":
      return jsonResponse(handleSafetyCheckOpen({
        surveyId: p.sid || "",
        lineId: p.line_id || p.lineId || ""
      }), callback);

    case "safety_check_register":
      return jsonResponse(handleSafetyCheckRegister({
        survey_id: p.survey_id || p.sid || "",
        line_id: p.line_id || p.lineId || "",
        name: p.name || "",
        group: p.group || p.group_name || ""
      }), callback);

    case "safety_check_submit":
      return jsonResponse(handleSafetyCheckSubmit({
        survey_id: p.survey_id || p.sid || "",
        line_id: p.line_id || p.lineId || "",
        answer_status: p.answer_status || p.answer || "",
        remarks: p.remarks || "",
        user_name: p.user_name || "",
        group_name: p.group_name || "",
        accessed_at: p.accessed_at || ""
      }), callback);

    default:
      return errorResponse(action, "Unknown GET action", action, callback);
  }
}

function routePost(action, e, payload) {
  var callback = getRequestCallback(e, payload);

  switch (action) {
    case "diagnostics_write":
      return jsonResponse(handleDiagnosticsWrite(payload), callback);

    case "safety_check_register":
      return jsonResponse(handleSafetyCheckRegister(payload), callback);

    case "safety_check_submit":
      return jsonResponse(handleSafetyCheckSubmit(payload), callback);

    case "bookroom_submit": {
      recordWebhookDiagnostic("info", "bookroom.route.enter", "Bookroom submit route entered", {
        has_line_id: !!(payload && payload.line_id),
        has_date: !!(payload && payload.date),
        has_room: !!(payload && payload.room),
        has_token: !!(payload && payload.liff_token)
      });

      if (!verifyLiffToken(payload.liff_token)) {
        recordWebhookDiagnostic("warn", "bookroom.route.reject", "Bookroom submit rejected: invalid LIFF token", {
          has_token: !!(payload && payload.liff_token)
        });
        return errorResponse(action, "Invalid LIFF token", "", callback);
      }

      var submitResult = handleBookroomSubmit(payload);
      recordWebhookDiagnostic("info", "bookroom.route.result", "Bookroom submit handled", {
        status: submitResult && submitResult.status ? String(submitResult.status) : "",
        message: submitResult && submitResult.message ? String(submitResult.message) : "",
        batch_id: submitResult && submitResult.batch_id ? String(submitResult.batch_id) : ""
      });
      return jsonResponse(submitResult, callback);
    }

    case "line_webhook": {
      var bodyString = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
      var signature = e && e.headers ? (e.headers["X-Line-Signature"] || e.headers["x-line-signature"]) : "";
      var requestId = Utilities.getUuid();

      recordWebhookDiagnostic("info", "route.enter", "Webhook request received", {
        request_id: requestId,
        event_count: Array.isArray(payload.events) ? payload.events.length : 0,
        has_signature: !!signature,
        has_secret_param: !!(e && e.parameter && e.parameter.secret),
        has_body: !!bodyString
      });

      if (!validateWebhookSecret(e)) {
        recordWebhookDiagnostic("warn", "route.secret.reject", "Webhook secret mismatch", {
          request_id: requestId
        });
        return errorResponse(action, "Webhook secret mismatch", "", callback);
      }

      if (signature) {
        if (!validateLineSignature(bodyString, signature)) {
          recordWebhookDiagnostic("warn", "route.signature.reject", "Invalid LINE signature", {
            request_id: requestId
          });
          return errorResponse(action, "Invalid LINE signature", "", callback);
        }
      } else if (APP_CONFIG.auth.lineSignatureVerifyRequired) {
        recordWebhookDiagnostic("warn", "route.signature.reject", "Invalid LINE signature", {
          request_id: requestId,
          reason: "header_missing"
        });
        return errorResponse(action, "LINE signature header is missing", "Set LINE_SIGNATURE_VERIFY_REQUIRED=false for GAS fallback", callback);
      } else {
        recordWebhookDiagnostic("warn", "route.signature.skip", "LINE signature header missing, skipped by config", {
          request_id: requestId
        });
      }

      recordWebhookDiagnostic("info", "route.accept", "Webhook checks passed", {
        request_id: requestId
      });
      return jsonResponse(handleLineWebhook(payload.events || [], { requestId: requestId }), callback);
    }

    case "attendance_answer":
      return jsonResponse(handleAttendanceAnswer(payload), callback);

    case "member_profile_upsert":
      if (!verifyLiffToken(payload.liff_token)) {
        return errorResponse(action, "Invalid LIFF token", "");
      }
      return jsonResponse(handleMemberProfileUpsert(payload), callback);

    case "log":
      return jsonResponse(handleClientLog(payload), callback);

    default:
      return errorResponse(action, "Unknown POST action", action, callback);
  }
}

function getUserIdFromRequest(e, payload) {
  var p = (e && e.parameter) ? e.parameter : {};
  var body = payload || {};
  return String(
    p.user_id || p.uid || p.line_id ||
    body.user_id || body.uid || body.line_id || body.lineId || ""
  );
}
