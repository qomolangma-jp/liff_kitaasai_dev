var ATTENDANCE_OPTIONS = ["出席", "欠席", "未定"];
var ATTENDANCE_EVENT_HEADERS = [
  "event_id",
  "event_name",
  "event_datetime",
  "event_location",
  "description",
  "response_deadline",
  "status",
  "response_url",
  "response_count",
  "attending_count",
  "absent_count",
  "undecided_count"
];
var ATTENDANCE_ANSWER_HEADERS = [
  "event_id",
  "updated_at",
  "member_name",
  "group_name",
  "answer",
  "memo",
  "line_id"
];

function handleAttendanceQuestion(input) {
  var eventId = String((input && input.qid) || "").trim();
  if (!eventId) {
    return { error: true, message: "イベントIDが指定されていません。" };
  }

  var eventSheet = getSheetOrThrow(
    APP_CONFIG.spreadsheets.attendance,
    APP_CONFIG.sheets.attendanceEvents
  );
  var eventValues = eventSheet.getDataRange().getDisplayValues();
  var eventHeader = buildHeaderIndexMap(eventValues[0] || []);
  requireAttendanceHeaders(eventHeader, ATTENDANCE_EVENT_HEADERS, "events");

  var event = null;
  for (var i = 1; i < eventValues.length; i++) {
    if (String(eventValues[i][eventHeader["event_id"]] || "").trim() === eventId) {
      event = eventValues[i];
      break;
    }
  }

  if (!event) {
    return { error: true, message: "イベントが見つかりません。リンクをご確認ください。" };
  }
  if (String(event[eventHeader["status"]] || "").trim() !== "受付中") {
    return { error: true, message: "このイベントは回答を受け付けていません。" };
  }

  var userId = String((input && input.userId) || "").trim();
  var previous = readAttendanceAnswer(userId, eventId);
  return {
    error: false,
    event_id: eventId,
    event_name: String(event[eventHeader["event_name"]] || ""),
    event_datetime: String(event[eventHeader["event_datetime"]] || ""),
    event_location: String(event[eventHeader["event_location"]] || ""),
    description: String(event[eventHeader["description"]] || ""),
    response_deadline: String(event[eventHeader["response_deadline"]] || ""),
    selections: ATTENDANCE_OPTIONS,
    previousAnswer: previous.answer,
    previousMemo: previous.memo
  };
}

function handleAttendanceAnswer(payload) {
  var data = payload || {};
  var userId = String(data.lineId || data.line_id || "").trim();
  var eventId = String(data.qid || data.event_id || "").trim();
  var answer = String(data.answer || "").trim();
  var memo = String(data.memo || "").trim();

  if (!userId || !eventId || !answer) {
    return { success: false, message: "回答に必要な情報が不足しています。" };
  }
  if (ATTENDANCE_OPTIONS.indexOf(answer) < 0) {
    return { success: false, message: "選択された回答が正しくありません。" };
  }

  var eventResult = handleAttendanceQuestion({ qid: eventId });
  if (eventResult.error) {
    return { success: false, message: eventResult.message };
  }

  var member = handleMemberCheck({ userId: userId });
  if (!member.isRegistered || member.status !== "ok") {
    return { success: false, message: "住民名簿への登録を確認できません。役員にお問い合わせください。" };
  }

  var sheet = getSheetOrThrow(
    APP_CONFIG.spreadsheets.attendance,
    APP_CONFIG.sheets.attendanceAnswers
  );
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var values = sheet.getDataRange().getDisplayValues();
    var header = buildHeaderIndexMap(values[0] || []);
    requireAttendanceHeaders(header, ATTENDANCE_ANSWER_HEADERS, "answers");
    var targetRow = -1;
    for (var i = 1; i < values.length; i++) {
      if (
        String(values[i][header["event_id"]] || "").trim() === eventId &&
        String(values[i][header["line_id"]] || "").trim() === userId
      ) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow > 0) {
      sheet.getRange(targetRow, header["updated_at"] + 1).setValue(new Date());
      sheet.getRange(targetRow, header["member_name"] + 1).setValue(member.fullName);
      sheet.getRange(targetRow, header["group_name"] + 1).setValue(member.group);
      sheet.getRange(targetRow, header["answer"] + 1).setValue(answer);
      sheet.getRange(targetRow, header["memo"] + 1).setValue(memo);
    } else {
      var row = new Array(values[0].length).fill("");
      row[header["event_id"]] = eventId;
      row[header["updated_at"]] = new Date();
      row[header["member_name"]] = member.fullName;
      row[header["group_name"]] = member.group;
      row[header["answer"]] = answer;
      row[header["memo"]] = memo;
      row[header["line_id"]] = userId;
      sheet.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }

  return { success: true };
}

function readAttendanceAnswer(userId, eventId) {
  if (!userId) return { answer: "", memo: "" };

  var sheet = getSheetOrThrow(
    APP_CONFIG.spreadsheets.attendance,
    APP_CONFIG.sheets.attendanceAnswers
  );
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) return { answer: "", memo: "" };

  var header = buildHeaderIndexMap(values[0]);
  requireAttendanceHeaders(header, ATTENDANCE_ANSWER_HEADERS, "answers");
  for (var i = 1; i < values.length; i++) {
    if (
      String(values[i][header["event_id"]] || "").trim() === eventId &&
      String(values[i][header["line_id"]] || "").trim() === userId
    ) {
      return {
        answer: String(values[i][header["answer"]] || ""),
        memo: String(values[i][header["memo"]] || "")
      };
    }
  }
  return { answer: "", memo: "" };
}

function requireAttendanceHeaders(header, requiredHeaders, sheetName) {
  var missing = requiredHeaders.filter(function (name) {
    return header[name] === undefined;
  });
  if (missing.length) {
    throw new Error(
      "Missing required headers in " + sheetName + " sheet: " + missing.join(", ")
    );
  }
}
