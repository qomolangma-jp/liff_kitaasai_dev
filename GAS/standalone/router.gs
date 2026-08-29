function routeRequest(method, e, payload) {
  var startedAt = new Date();
  var action = resolveAction(method, e, payload);

  try {
    var result;

    if (method === "GET") {
      result = routeGet(action, e);
    } else if (method === "POST") {
      result = routePost(action, e, payload || {});
    } else {
      return errorResponse(action, "Unsupported method", method);
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
    return errorResponse(action, "Request failed", String(err));
  }
}

function resolveAction(method, e, payload) {
  var p = (e && e.parameter) ? e.parameter : {};
  var body = payload || {};

  if (method === "GET") {
    if (p.action) return String(p.action).trim();
    if (p.type === "user") return "member_check";
    if (p.line_id) return "member_profile_get";
    if (p.qid) return "attendance_question";
    return "bookroom_list";
  }

  if (method === "POST") {
    if (body.action) return String(body.action).trim();
    if (body.events) return "line_webhook";
    if (body.lineId && body.qid) return "attendance_answer";
    if (body.date && body.room) return "bookroom_submit";
    if (body.line_id && (body.name_1st || body.address || body.is_digital)) return "member_profile_upsert";
    if (body.action_type) return "log";
  }

  return "unknown";
}

function routeGet(action, e) {
  var p = (e && e.parameter) ? e.parameter : {};

  switch (action) {
    case "diagnostics":
      return jsonResponse(handleDiagnosticsStatus());

    case "member_check":
      return jsonResponse(handleMemberCheck({
        userId: p.user_id || p.uid || "",
        displayName: p.display_name || "",
        pictureUrl: p.picture_url || ""
      }));

    case "bookroom_list":
      return jsonResponse(handleBookroomList());

    case "get_monthly_items":
      return okResponse(action, {
        items: handleGetMonthlyItems({ ym: p.ym || "" })
      });

    case "attendance_question":
      return jsonResponse(handleAttendanceQuestion({
        userId: p.uid || p.user_id || "",
        qid: p.qid || ""
      }));

    case "member_profile_get":
      return jsonResponse(handleMemberProfileGet({ lineId: p.line_id || "" }));

    default:
      return errorResponse(action, "Unknown GET action", action);
  }
}

function routePost(action, e, payload) {
  switch (action) {
    case "diagnostics_write":
      return jsonResponse(handleDiagnosticsWrite(payload));

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
        return errorResponse(action, "Invalid LIFF token", "");
      }

      var submitResult = handleBookroomSubmit(payload);
      recordWebhookDiagnostic("info", "bookroom.route.result", "Bookroom submit handled", {
        status: submitResult && submitResult.status ? String(submitResult.status) : "",
        message: submitResult && submitResult.message ? String(submitResult.message) : "",
        batch_id: submitResult && submitResult.batch_id ? String(submitResult.batch_id) : ""
      });
      return jsonResponse(submitResult);
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
        return errorResponse(action, "Webhook secret mismatch", "");
      }

      if (signature) {
        if (!validateLineSignature(bodyString, signature)) {
          recordWebhookDiagnostic("warn", "route.signature.reject", "Invalid LINE signature", {
            request_id: requestId
          });
          return errorResponse(action, "Invalid LINE signature", "");
        }
      } else if (APP_CONFIG.auth.lineSignatureVerifyRequired) {
        recordWebhookDiagnostic("warn", "route.signature.reject", "Invalid LINE signature", {
          request_id: requestId,
          reason: "header_missing"
        });
        return errorResponse(action, "LINE signature header is missing", "Set LINE_SIGNATURE_VERIFY_REQUIRED=false for GAS fallback");
      } else {
        recordWebhookDiagnostic("warn", "route.signature.skip", "LINE signature header missing, skipped by config", {
          request_id: requestId
        });
      }

      recordWebhookDiagnostic("info", "route.accept", "Webhook checks passed", {
        request_id: requestId
      });
      return jsonResponse(handleLineWebhook(payload.events || [], { requestId: requestId }));
    }

    case "attendance_answer":
      return jsonResponse(handleAttendanceAnswer(payload));

    case "member_profile_upsert":
      if (!verifyLiffToken(payload.liff_token)) {
        return errorResponse(action, "Invalid LIFF token", "");
      }
      return jsonResponse(handleMemberProfileUpsert(payload));

    case "log":
      return jsonResponse(handleClientLog(payload));

    default:
      return errorResponse(action, "Unknown POST action", action);
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
