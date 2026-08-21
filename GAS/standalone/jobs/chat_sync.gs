function runChatHistoryMatchJob() {
  var chatSheet = getSheetOrThrow(APP_CONFIG.spreadsheets.chat, APP_CONFIG.sheets.chatLog);
  var memberSheet = getSheetOrThrow(APP_CONFIG.spreadsheets.member, APP_CONFIG.sheets.memberMain);

  var chatValues = chatSheet.getDataRange().getDisplayValues();
  var memberValues = memberSheet.getDataRange().getDisplayValues();
  if (chatValues.length <= 1 || memberValues.length <= 1) {
    return { updated: 0, message: "no data" };
  }

  var cMap = buildHeaderIndexMap(chatValues[0]);
  var mMap = buildHeaderIndexMap(memberValues[0]);

  var cLineId = cMap["line_id"];
  var cStatus = cMap["status"];
  var mLineId = mMap["line_id"];
  var mStatus = mMap["status"];

  if (cLineId === undefined || cStatus === undefined || mLineId === undefined) {
    return { updated: 0, message: "required columns missing" };
  }

  var memberById = {};
  for (var i = 1; i < memberValues.length; i++) {
    var id = String(memberValues[i][mLineId] || "").trim();
    if (!id) continue;
    memberById[id] = {
      status: mStatus !== undefined ? String(memberValues[i][mStatus] || "") : ""
    };
  }

  var updated = 0;
  for (var r = 1; r < chatValues.length; r++) {
    if (String(chatValues[r][cStatus] || "").trim()) continue;
    var uid = String(chatValues[r][cLineId] || "").trim();
    if (!uid) continue;

    if (memberById[uid]) {
      chatSheet.getRange(r + 1, cStatus + 1).setValue("match");
      updated++;
    }
  }

  return { updated: updated, message: "ok" };
}
