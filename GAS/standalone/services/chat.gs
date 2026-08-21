function handleLineWebhook(events) {
  if (!events || events.length === 0) {
    return { result: "ok" };
  }

  var chatRows = [];

  events.forEach(function (event) {
    if (event.type === "message" && event.message && event.message.type === "text") {
      var userId = String(event.source && event.source.userId || "");
      var text = String(event.message.text || "");
      var ts = new Date(event.timestamp || new Date().getTime());
      var member = handleMemberCheck({ userId: userId, displayName: "" });
      var displayName = member && member.fullName ? member.fullName : "LINE User";

      chatRows.push([
        Utilities.formatDate(ts, "JST", "yyyy/MM/dd HH:mm:ss"),
        displayName,
        text,
        userId,
        ""
      ]);
    }

    if (event.type === "postback") {
      handlePostbackEvent(event);
    }
  });

  if (chatRows.length > 0) {
    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.chat,
      APP_CONFIG.sheets.chatLog,
      ["created_at", "line_name", "message", "line_id", "status"]
    );
    sheet.getRange(sheet.getLastRow() + 1, 1, chatRows.length, chatRows[0].length).setValues(chatRows);
  }

  return { result: "ok" };
}

function handlePostbackEvent(event) {
  var data = String(event.postback && event.postback.data || "");
  if (!data) return;

  var params = {};
  data.split("&").forEach(function (pair) {
    var sp = pair.split("=");
    var k = sp[0];
    var v = sp.length > 1 ? decodeURIComponent(sp[1]) : "";
    params[k] = v;
  });

  if (!params.action || !params.batchId) return;
  if (params.action !== "approve" && params.action !== "reject") return;

  processBookroomApprovalByBatch(params.batchId, params.action);
}
