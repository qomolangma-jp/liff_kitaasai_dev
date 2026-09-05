function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('安否確認')
    .addItem('URL発行', 'issueSafetyCheckUrlByPrompt')
    .addToUi();
}

function issueSafetyCheckUrlByPrompt() {
  var ui = SpreadsheetApp.getUi();
  var title = ui.prompt('安否確認の見出し', '見出しを入力してください。', ui.ButtonSet.OK_CANCEL).getResponseText();
  if (!title) {
    return { status: 'cancelled' };
  }
  return issueSafetyCheckUrl({ title: title });
}

function issueSafetyCheckUrl(input) {
  var title = String(input && input.title ? input.title : '安否確認').trim();
  if (!title) {
    title = '安否確認';
  }

  var now = new Date();
  var surveyId = 'sc_' + Utilities.formatDate(now, 'JST', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 6);
  var baseUrl = String(APP_CONFIG.get('SURVEY_BASE_URL', '') || '').trim();

  if (!baseUrl) {
    try {
      baseUrl = ScriptApp.getService().getUrl();
    } catch (e) {
      baseUrl = '';
    }
  }

  if (!baseUrl) {
    throw new Error('SURVEY_BASE_URL is missing. Set it to the deployed Web App URL.');
  }

  var issuedUrl = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'action=safety_check&sid=' + encodeURIComponent(surveyId);
  var liffUrl = buildSafetyCheckLiffUrl(surveyId);

  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.safetyCheck || APP_CONFIG.spreadsheets.member,
    APP_CONFIG.sheets.safetyCheckSettings,
    ['survey_id', 'title', 'created_at', 'published_at', 'issued_url', 'liff_url', 'status']
  );

  sheet.appendRow([surveyId, title, now, now, issuedUrl, liffUrl, 'published']);

  return {
    status: 'success',
    survey_id: surveyId,
    title: title,
    issued_url: issuedUrl,
    liff_url: liffUrl,
    created_at: now
  };
}

function buildSafetyCheckLiffUrl(surveyId) {
  var liffBase = String(APP_CONFIG.get('LIFF_SAFETY_CHECK_BASE_URL', '') || '').trim();

  if (!liffBase) {
    liffBase = String(APP_CONFIG.get('LIFF_BASE_URL', '') || '').trim();
  }

  if (!liffBase) {
    var appId = String(APP_CONFIG.get('LIFF_SAFETY_CHECK_APP_ID', '2008893549-RZBPRM9X') || '2008893549-RZBPRM9X').trim();
    liffBase = 'https://liff.line.me/' + appId;
  }

  return liffBase + (liffBase.indexOf('?') === -1 ? '?' : '&') + 'action=safety_check&sid=' + encodeURIComponent(surveyId);
}

function handleSafetyCheckOpen(input) {
  var surveyId = String(input && input.surveyId ? input.surveyId : input && input.sid ? input.sid : '').trim();
  var lineId = String(input && input.lineId ? input.lineId : input && input.line_id ? input.line_id : '').trim();

  if (!surveyId) {
    return { status: 'error', message: 'survey_id is required' };
  }

  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.safetyCheck || APP_CONFIG.spreadsheets.member,
    APP_CONFIG.sheets.safetyCheckSettings,
    ['survey_id', 'title', 'created_at', 'published_at', 'issued_url', 'status']
  );
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) {
    return { status: 'error', message: 'survey not found' };
  }

  var headers = buildHeaderIndexMap(values[0]);
  var idCol = headers['survey_id'];
  var titleCol = headers['title'];
  var row = null;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || '').trim() === surveyId) {
      row = values[i];
      break;
    }
  }

  if (!row) {
    return { status: 'error', message: 'survey not found' };
  }

  var member = findMemberByLineId(lineId);
  var result = {
    status: member && member.isRegistered ? 'registered' : 'unregistered',
    survey_id: surveyId,
    title: String(row[titleCol] || '安否確認'),
    user_name: member && member.fullName ? member.fullName : '',
    group_name: member && member.group ? member.group : '',
    is_registered: !!(member && member.isRegistered),
    register_required: !(member && member.isRegistered)
  };

  appendSafetyAccessLog({
    surveyId: surveyId,
    lineUserId: lineId,
    eventType: 'open',
    detail: JSON.stringify({
      user_name: result.user_name,
      group_name: result.group_name,
      is_registered: result.is_registered
    })
  });

  return result;
}

function handleSafetyCheckRegister(payload) {
  var lineId = String(payload && payload.line_id ? payload.line_id : payload && payload.lineId ? payload.lineId : '').trim();
  var name = String(payload && payload.name ? payload.name : '').trim();
  var groupName = String(payload && payload.group ? payload.group : payload && payload.group_name ? payload.group_name : '').trim();

  if (!lineId) {
    return { status: 'error', message: 'line_id is required' };
  }

  if (!name || !groupName) {
    return { status: 'error', message: 'name and group are required' };
  }

  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.member,
    APP_CONFIG.sheets.memberMain,
    ['line_id', 'name_1st', 'name_2nd', 'group', 'status', 'updated_at']
  );
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) {
    sheet.appendRow(['line_id', 'name_1st', 'name_2nd', 'group', 'status', 'updated_at']);
    values = sheet.getDataRange().getDisplayValues();
  }

  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var map = buildHeaderIndexMap(headers);

  function ensureColumn(colName) {
    var key = String(colName || '').trim();
    if (!key) return;
    if (map[key.toLowerCase()] !== undefined) return;
    headers.push(key);
    map[key.toLowerCase()] = headers.length - 1;
    sheet.getRange(1, headers.length).setValue(key);
  }

  ensureColumn('line_id');
  ensureColumn('name_1st');
  ensureColumn('name_2nd');
  ensureColumn('group');
  ensureColumn('status');
  ensureColumn('updated_at');

  var targetRow = -1;
  var idCol = map['line_id'];
  var lastRow = sheet.getLastRow();
  if (idCol !== undefined && lastRow >= 2) {
    var idValues = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0] || '').trim() === lineId) {
        targetRow = i + 2;
        break;
      }
    }
  }

  var rowData = new Array(headers.length).fill('');
  if (targetRow > 0) {
    rowData = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  }

  rowData[map['line_id']] = lineId;
  rowData[map['name_1st']] = name;
  rowData[map['name_2nd']] = '';
  rowData[map['group']] = groupName;
  rowData[map['status']] = 'ok';
  rowData[map['updated_at']] = new Date();

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  appendSafetyAccessLog({
    surveyId: String(payload && payload.survey_id ? payload.survey_id : ''),
    lineUserId: lineId,
    eventType: 'register',
    detail: JSON.stringify({ name: name, group: groupName })
  });

  return {
    status: 'success',
    message: 'registration completed',
    line_id: lineId,
    name: name,
    group: groupName
  };
}

function handleSafetyCheckSubmit(payload) {
  var surveyId = String(payload && payload.survey_id ? payload.survey_id : '').trim();
  var lineId = String(payload && payload.line_id ? payload.line_id : payload && payload.lineId ? payload.lineId : '').trim();
  var answerStatus = String(payload && payload.answer_status ? payload.answer_status : '').trim();
  var remarks = String(payload && payload.remarks ? payload.remarks : '').trim();

  if (!surveyId || !lineId || !answerStatus) {
    return { status: 'error', message: 'survey_id, line_id and answer_status are required' };
  }

  var member = findMemberByLineId(lineId);
  var memberName = member && member.fullName ? member.fullName : (payload && payload.user_name ? payload.user_name : '');
  var groupName = member && member.group ? member.group : (payload && payload.group_name ? payload.group_name : '');

  var sheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.safetyCheck || APP_CONFIG.spreadsheets.member,
    APP_CONFIG.sheets.safetyCheckResponses,
    ['response_id', 'survey_id', 'line_user_id', 'accessed_at', 'submitted_at', 'user_name', 'group_name', 'answer_status', 'is_registered', 'target_id', 'remarks']
  );

  var responseId = Utilities.getUuid();
  var now = new Date();
  sheet.appendRow([
    responseId,
    surveyId,
    lineId,
    payload && payload.accessed_at ? payload.accessed_at : now,
    now,
    memberName,
    groupName,
    answerStatus,
    member && member.isRegistered ? 'true' : 'false',
    String(payload && payload.target_id ? payload.target_id : surveyId),
    remarks
  ]);

  appendSafetyAccessLog({
    surveyId: surveyId,
    lineUserId: lineId,
    eventType: 'submit',
    detail: JSON.stringify({ answer_status: answerStatus, user_name: memberName, group_name: groupName })
  });

  return {
    status: 'success',
    survey_id: surveyId,
    response_id: responseId,
    user_name: memberName,
    group_name: groupName,
    answer_status: answerStatus,
    is_registered: !!(member && member.isRegistered)
  };
}

function appendSafetyAccessLog(data) {
  try {
    var record = data || {};
    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.safetyCheck || APP_CONFIG.spreadsheets.member,
      APP_CONFIG.sheets.safetyCheckAccessLog,
      ['log_id', 'survey_id', 'line_user_id', 'event_type', 'event_at', 'detail']
    );

    sheet.appendRow([
      Utilities.getUuid(),
      record.surveyId || '',
      record.lineUserId || '',
      record.eventType || '',
      new Date(),
      record.detail || ''
    ]);
  } catch (err) {
    // Logging should never block the main flow.
  }
}

function findMemberByLineId(lineId) {
  var memberSheet = getOrCreateSheet(
    APP_CONFIG.spreadsheets.member,
    APP_CONFIG.sheets.memberMain,
    ['line_id', 'name_1st', 'name_2nd', 'group', 'status', 'updated_at']
  );
  var values = memberSheet.getDataRange().getDisplayValues();
  if (values.length <= 1) {
    return { isRegistered: false, fullName: '', group: '' };
  }

  var headers = buildHeaderIndexMap(values[0]);
  var idCol = headers['line_id'];
  var firstCol = headers['name_1st'];
  var secondCol = headers['name_2nd'];
  var groupCol = headers['group'];

  if (idCol === undefined) {
    return { isRegistered: false, fullName: '', group: '' };
  }

  var targetRow = null;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || '').trim() === lineId) {
      targetRow = values[i];
      break;
    }
  }

  if (!targetRow) {
    return { isRegistered: false, fullName: '', group: '' };
  }

  var firstName = firstCol !== undefined ? String(targetRow[firstCol] || '').trim() : '';
  var secondName = secondCol !== undefined ? String(targetRow[secondCol] || '').trim() : '';
  var group = groupCol !== undefined ? String(targetRow[groupCol] || '').trim() : '';

  return {
    isRegistered: true,
    fullName: (firstName + ' ' + secondName).trim() || firstName || secondName,
    group: group
  };
}

function getSafetyCheckConfig() {
  return {
    settingsSheet: APP_CONFIG.sheets.safetyCheckSettings || 'survey_settings',
    responsesSheet: APP_CONFIG.sheets.safetyCheckResponses || 'survey_responses',
    accessLogSheet: APP_CONFIG.sheets.safetyCheckAccessLog || 'survey_access_log'
  };
}

function debugSafetyCheckOpen() {
  var testSurveyId = 'sc_20260905_162817_0989e6';
  var testLineId = 'U55a2432dba0568deec6854f249cd06c0';
  var result = handleSafetyCheckOpen({
    surveyId: testSurveyId,
    lineId: testLineId
  });
  Logger.log('debugSafetyCheckOpen result: ' + JSON.stringify(result));
  return result;
}

function debugSafetyCheckRoute() {
  var e = {
    parameter: {
      action: 'safety_check',
      sid: 'sc_20260905_162817_0989e6',
      line_id: 'U55a2432dba0568deec6854f249cd06c0'
    }
  };

  var result = doGet(e);
  Logger.log('debugSafetyCheckRoute response: ' + result.getContent());
  return result;
}

function debugSafetyCheckPostSubmit() {
  var payload = {
    action: 'safety_check_submit',
    survey_id: 'sc_20260905_162817_0989e6',
    line_id: 'U55a2432dba0568deec6854f249cd06c0',
    answer_status: 'safe',
    remarks: 'debug test',
    user_name: 'デバッグユーザー',
    group_name: '1班',
    accessed_at: new Date().toISOString()
  };

  var result = doPost({
    postData: {
      contents: JSON.stringify(payload)
    }
  });
  Logger.log('debugSafetyCheckPostSubmit response: ' + result.getContent());
  return result;
}
