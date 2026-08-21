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

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][8] || "").trim() !== String(batchId || "").trim()) continue;
    if (String(values[i][7] || "").trim() !== "保留") continue;
    sheet.getRange(i + 1, 8).setValue(toStatus);
    updated++;
  }

  return { updated: updated, status: toStatus };
}
