function handleBookroomList() {
  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.bookroom, APP_CONFIG.sheets.bookroomMain);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = String(row[7] || "").trim();
    if (status !== "確定" && status !== "保留") continue;

    out.push({
      date: Utilities.formatDate(new Date(row[3]), "JST", "yyyy-MM-dd"),
      time_slot: String(row[4] || ""),
      room: String(row[5] || ""),
      line_id: String(row[1] || ""),
      name: String(row[2] || ""),
      status: status
    });
  }
  return out;
}

function handleBookroomSubmit(payload) {
  var lineId = String(payload.line_id || "").trim();
  var lineName = String(payload.line_name || "").trim();
  var date = String(payload.date || "").trim();
  var room = String(payload.room || "").trim();
  var requestText = String(payload.request || "").trim();

  if (!lineId || !date || !room) {
    return { status: "error", message: "line_id/date/room are required" };
  }

  var targetSlots = [];
  if (payload.time_slots && payload.time_slots.length) {
    targetSlots = payload.time_slots.slice();
  } else if (payload.time_slot === "終日") {
    targetSlots = ["午前", "午後", "夜間"];
  } else if (payload.time_slot) {
    targetSlots = [payload.time_slot];
  }

  if (targetSlots.length === 0) {
    return { status: "error", message: "time_slot or time_slots is required" };
  }

  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.bookroom, APP_CONFIG.sheets.bookroomMain);
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    var rowDate = Utilities.formatDate(new Date(values[i][3]), "JST", "yyyy-MM-dd");
    var rowSlot = String(values[i][4] || "").trim();
    var rowRoom = String(values[i][5] || "").trim();
    var rowStatus = String(values[i][7] || "").trim();

    if (rowDate === date && rowRoom === room && (rowStatus === "確定" || rowStatus === "保留") && targetSlots.indexOf(rowSlot) >= 0) {
      return { status: "error", message: "selected slot already booked" };
    }
  }

  var member = handleMemberCheck({ userId: lineId, displayName: lineName });
  var realName = member && member.fullName ? member.fullName : lineName;
  var now = new Date();
  var batchId = "BATCH_" + now.getTime();

  recordWebhookDiagnostic("info", "bookroom.submit.start", "Bookroom submit accepted", {
    line_id: lineId,
    date: date,
    room: room,
    slots: targetSlots,
    batch_id: batchId
  });

  targetSlots.forEach(function (slot) {
    sheet.appendRow([
      now,
      lineId,
      realName,
      date,
      slot,
      room,
      requestText,
      "保留",
      batchId
    ]);
  });

  // 申請者へ受付通知
  sendBookroomApplicantReceipt(lineId, {
    date: date,
    room: room,
    slots: targetSlots,
    request: requestText
  });

  // 管理者へ承認依頼（postback ボタン付き）
  notifyBookroomAdmins(batchId, {
    applicantId: lineId,
    applicantName: realName || lineName || "申請者",
    date: date,
    room: room,
    slots: targetSlots,
    request: requestText
  });

  return {
    status: "success",
    batch_id: batchId,
    accepted_slots: targetSlots
  };
}

function processBookroomApprovalByBatch(batchId, action) {
  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.bookroom, APP_CONFIG.sheets.bookroomMain);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { updated: 0 };

  var toStatus = action === "approve" ? "確定" : "却下";
  var updated = 0;
  var firstMatched = null;
  var slots = [];

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][8] || "").trim() !== String(batchId || "").trim()) continue;
    if (!firstMatched) {
      firstMatched = values[i];
    }
    slots.push(String(values[i][4] || "").trim());
    if (String(values[i][7] || "").trim() !== "保留") continue;
    sheet.getRange(i + 1, 8).setValue(toStatus);
    updated++;
  }

  var uniqueSlots = Array.from(new Set(slots.filter(Boolean)));
  return {
    updated: updated,
    status: toStatus,
    applicantId: firstMatched ? String(firstMatched[1] || "").trim() : "",
    applicantName: firstMatched ? String(firstMatched[2] || "").trim() : "",
    date: firstMatched ? Utilities.formatDate(new Date(firstMatched[3]), "JST", "yyyy-MM-dd") : "",
    room: firstMatched ? String(firstMatched[5] || "").trim() : "",
    slots: uniqueSlots,
    batchId: String(batchId || "")
  };
}

function sendBookroomApplicantReceipt(lineUserId, info) {
  var uid = String(lineUserId || "").trim();
  if (!uid) {
    recordWebhookDiagnostic("warn", "bookroom.receipt.skip", "Applicant receipt skipped: uid missing", {
      line_user_id: String(lineUserId || "")
    });
    return;
  }

  var slots = Array.isArray(info.slots) ? info.slots : [];
  var slotText = formatBookroomSlotText(slots);
  var requestText = String(info.request || "").trim() || "なし";

  recordWebhookDiagnostic("info", "bookroom.receipt.start", "Sending applicant receipt", {
    to: uid,
    date: String(info.date || ""),
    room: String(info.room || ""),
    slot_count: slots.length
  });

  sendLinePushMessage(uid, [buildApplicantReceiptFlexMessage({
    date: String(info.date || ""),
    room: String(info.room || ""),
    slotText: slotText,
    requestText: requestText
  })]);
}

function notifyBookroomAdmins(batchId, info) {
  var adminIds = getBookroomAdminIds();
  recordWebhookDiagnostic("info", "bookroom.admins.resolved", "Bookroom admin lookup", {
    batch_id: String(batchId || ""),
    admin_count: adminIds ? adminIds.length : 0,
    admin_ids: adminIds || []
  });

  if (!adminIds || adminIds.length === 0) {
    recordWebhookDiagnostic("warn", "bookroom.admins.empty", "No admins found for bookroom alert", {
      batch_id: String(batchId || "")
    });
    return;
  }

  var slotText = formatBookroomSlotText(info.slots);
  var shortName = String(info.applicantName || "申請者");
  var requestText = String(info.request || "").trim() || "なし";
  var flexMessage = buildAdminApprovalFlexMessage({
    batchId: String(batchId || ""),
    applicantName: shortName,
    date: String(info.date || ""),
    room: String(info.room || ""),
    slotText: slotText,
    requestText: requestText
  });

  adminIds.forEach(function (adminId) {
    var uid = String(adminId || "").trim();
    if (!uid) {
      recordWebhookDiagnostic("warn", "bookroom.admin.uid.empty", "Admin uid is empty", {
        batch_id: String(batchId || "")
      });
      return;
    }
    sendLinePushMessage(uid, [flexMessage]);
  });
}

function notifyBookroomDecisionToApplicant(result, action) {
  if (!result || !result.applicantId) {
    recordWebhookDiagnostic("warn", "bookroom.decision.skip", "Decision notify skipped: applicantId missing", {
      action: String(action || ""),
      result: result || {}
    });
    return;
  }

  var uid = String(result.applicantId || "").trim();
  if (!uid) return;

  var slotText = formatBookroomSlotText(result.slots);
  var approved = action === "approve";
  sendLinePushMessage(uid, [buildApplicantDecisionFlexMessage({
    approved: approved,
    date: String(result.date || ""),
    room: String(result.room || ""),
    slotText: slotText
  })]);
}

function formatBookroomSlotText(slots) {
  var list = Array.isArray(slots) ? slots.filter(Boolean) : [];
  if (list.length === 3) return "終日 (午前・午後・夜間)";
  return list.join(" / ");
}

function trimToLength(text, maxLen) {
  var value = String(text || "");
  if (value.length <= maxLen) return value;
  return value.substring(0, Math.max(0, maxLen - 1)) + "…";
}

function buildAdminApprovalFlexMessage(info) {
  var room = trimToLength(info.room, 24);
  var slotText = trimToLength(info.slotText, 34);
  var applicantName = trimToLength(info.applicantName, 24);
  var requestText = trimToLength(info.requestText, 90);
  var batchId = String(info.batchId || "");

  return {
    type: "flex",
    altText: "公民館予約の承認依頼: " + info.date + " " + room + " " + slotText,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: "#0f766e",
        contents: [
          {
            type: "text",
            text: "公民館予約 承認リクエスト",
            color: "#ffffff",
            weight: "bold",
            size: "md"
          },
          {
            type: "text",
            text: "新しい申請が届いています",
            color: "#ccfbf1",
            size: "xs",
            margin: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f0fdfa",
            cornerRadius: "12px",
            paddingAll: "12px",
            spacing: "sm",
            contents: [
              { type: "text", text: "申請者: " + applicantName, size: "sm", color: "#134e4a", weight: "bold", wrap: true },
              { type: "text", text: "日付: " + info.date, size: "sm", color: "#0f172a" },
              { type: "text", text: "施設: " + room, size: "sm", color: "#0f172a", wrap: true },
              { type: "text", text: "時間帯: " + slotText, size: "sm", color: "#0f172a", wrap: true }
            ]
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "xs",
            contents: [
              { type: "text", text: "要望", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: requestText, size: "sm", color: "#334155", wrap: true }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          {
            type: "button",
            flex: 1,
            style: "primary",
            color: "#059669",
            action: {
              type: "postback",
              label: "承認する",
              data: "action=approve&batchId=" + encodeURIComponent(batchId)
            }
          },
          {
            type: "button",
            flex: 1,
            style: "secondary",
            action: {
              type: "postback",
              label: "却下する",
              data: "action=reject&batchId=" + encodeURIComponent(batchId)
            }
          }
        ]
      }
    }
  };
}

function buildApplicantReceiptFlexMessage(info) {
  var room = trimToLength(info.room, 24);
  var slotText = trimToLength(info.slotText, 34);
  var requestText = trimToLength(info.requestText, 90);

  return {
    type: "flex",
    altText: "予約申請を受け付けました: " + info.date + " " + room,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#166534",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "予約申請 受付完了", color: "#ffffff", weight: "bold", size: "lg" },
          { type: "text", text: "管理者の確認待ちです", color: "#dcfce7", size: "xs", margin: "sm" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "日付: " + info.date, size: "sm", color: "#1e293b" },
          { type: "text", text: "施設: " + room, size: "sm", color: "#1e293b", wrap: true },
          { type: "text", text: "時間帯: " + slotText, size: "sm", color: "#1e293b", wrap: true },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            backgroundColor: "#f8fafc",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "要望", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: requestText, size: "sm", color: "#334155", wrap: true }
            ]
          },
          { type: "text", text: "審査結果はこのトークで自動通知されます。", size: "xs", color: "#475569", margin: "md", wrap: true }
        ]
      }
    }
  };
}

function buildApplicantDecisionFlexMessage(info) {
  var accent = info.approved ? "#047857" : "#b91c1c";
  var title = info.approved ? "予約が承認されました" : "予約は却下されました";
  var sub = info.approved ? "ご利用ありがとうございます" : "別日程での再申請をお願いします";

  return {
    type: "flex",
    altText: "予約審査結果: " + title,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: accent,
        paddingAll: "16px",
        contents: [
          { type: "text", text: title, color: "#ffffff", weight: "bold", size: "lg", wrap: true },
          { type: "text", text: sub, color: "#fee2e2", size: "xs", margin: "sm", wrap: true }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "日付: " + String(info.date || ""), size: "sm", color: "#1e293b" },
          { type: "text", text: "施設: " + String(info.room || ""), size: "sm", color: "#1e293b", wrap: true },
          { type: "text", text: "時間帯: " + String(info.slotText || ""), size: "sm", color: "#1e293b", wrap: true }
        ]
      }
    }
  };
}

function sendLinePushMessage(toUserId, messages) {
  var uid = String(toUserId || "").trim();
  var token = APP_CONFIG.line && APP_CONFIG.line.channelAccessToken
    ? String(APP_CONFIG.line.channelAccessToken).trim()
    : "";

  if (!uid || !token) {
    recordWebhookDiagnostic("warn", "bookroom.push.skip", "Push skipped: uid or token missing", {
      has_uid: !!uid,
      has_token: !!token,
      uid: uid
    });
    return;
  }

  var payload = {
    to: uid,
    messages: Array.isArray(messages) ? messages : []
  };
  if (!payload.messages.length) {
    recordWebhookDiagnostic("warn", "bookroom.push.skip", "Push skipped: messages empty", {
      to: uid
    });
    return;
  }

  try {
    var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        Authorization: "Bearer " + token
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      recordWebhookDiagnostic("error", "bookroom.push.error", "Push message failed", {
        to: uid,
        code: code,
        body: res.getContentText() || ""
      });
    } else {
      recordWebhookDiagnostic("info", "bookroom.push.success", "Push message sent", {
        to: uid,
        code: code,
        message_count: payload.messages.length
      });
    }
  } catch (err) {
    recordWebhookDiagnostic("error", "bookroom.push.exception", "Push message exception", {
      to: uid,
      error: String(err)
    });
  }
}
