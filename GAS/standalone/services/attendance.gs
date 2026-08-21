function handleAttendanceQuestion(input) {
  var qid = String(input.qid || "q_1").trim();
  var userId = String(input.userId || "").trim();

  var qSheet = getSheetOrThrow(APP_CONFIG.spreadsheets.attendance, APP_CONFIG.sheets.attendanceQuestions);
  var qValues = qSheet.getDataRange().getDisplayValues();
  if (qValues.length <= 1) {
    return { error: true, message: "question data not found" };
  }

  var qHeader = buildHeaderIndexMap(qValues[0]);
  var qidCol = qHeader["qid"];
  var titleCol = qHeader["title"];
  var textCol = qHeader["text"];
  var selectionsCol = qHeader["selections"];

  var questionRow = null;
  for (var i = 1; i < qValues.length; i++) {
    if (String(qValues[i][qidCol] || "").trim() === qid) {
      questionRow = qValues[i];
      break;
    }
  }

  if (!questionRow) {
    return { error: true, message: "qid not found" };
  }

  var previous = readAttendanceAnswer(userId, qid);
  return {
    error: false,
    qid: qid,
    title: String(questionRow[titleCol] || ""),
    text: String(questionRow[textCol] || ""),
    selections: parseSelectionList(questionRow[selectionsCol]),
    previousAnswer: previous.answer,
    previousMemo: previous.memo
  };
}

function handleAttendanceAnswer(payload) {
  var userId = String(payload.lineId || payload.line_id || "").trim();
  var qid = String(payload.qid || "").trim();
  var answer = String(payload.answer || "").trim();
  var memo = String(payload.memo || "").trim();

  if (!userId || !qid || !answer) {
    return { success: false, message: "lineId/qid/answer are required" };
  }

  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.attendance,
    APP_CONFIG.sheets.attendanceAnswers,
    ["created_at", "updated_at", "line_id", "qid", "answer", "memo"]
  );

  var values = sheet.getDataRange().getDisplayValues();
  var header = buildHeaderIndexMap(values[0]);
  var idCol = header["line_id"];
  var qidCol = header["qid"];

  var targetRow = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || "").trim() === userId && String(values[i][qidCol] || "").trim() === qid) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, header["updated_at"] + 1).setValue(new Date());
    sheet.getRange(targetRow, header["answer"] + 1).setValue(answer);
    sheet.getRange(targetRow, header["memo"] + 1).setValue(memo);
  } else {
    sheet.appendRow([new Date(), new Date(), userId, qid, answer, memo]);
  }

  return { success: true };
}

function readAttendanceAnswer(userId, qid) {
  if (!userId) return { answer: "", memo: "" };

  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.attendance,
    APP_CONFIG.sheets.attendanceAnswers,
    ["created_at", "updated_at", "line_id", "qid", "answer", "memo"]
  );

  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) return { answer: "", memo: "" };

  var header = buildHeaderIndexMap(values[0]);
  var idCol = header["line_id"];
  var qidCol = header["qid"];
  var ansCol = header["answer"];
  var memoCol = header["memo"];

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || "").trim() === userId && String(values[i][qidCol] || "").trim() === qid) {
      return {
        answer: String(values[i][ansCol] || ""),
        memo: String(values[i][memoCol] || "")
      };
    }
  }

  return { answer: "", memo: "" };
}

function parseSelectionList(raw) {
  var s = String(raw || "").trim();
  if (!s) return [];
  return s.split(/[\n\r\t,、]/).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
}
