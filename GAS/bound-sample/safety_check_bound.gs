function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('安否確認')
    .addItem('URL発行', 'issueSafetyCheckUrlFromSheet')
    .addToUi();
}

function issueSafetyCheckUrlFromSheet() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    '安否確認の見出し',
    '見出しを入力してください。',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) {
    return { status: 'cancelled' };
  }

  var title = String(result.getResponseText() || '').trim();
  if (!title) {
    title = '安否確認';
  }

  var output = issueSafetyCheckUrl(title);
  ui.alert('URL発行完了', 'URL: ' + output.issued_url, ui.ButtonSet.OK);
  return output;
}

function issueSafetyCheckUrl(title) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSafetyCheckSheets(ss);

  var sheet = ss.getSheetByName('survey_settings');
  var now = new Date();
  var surveyId = 'sc_' + Utilities.formatDate(now, 'JST', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 6);
  var baseUrl = String(PropertiesService.getScriptProperties().getProperty('SURVEY_BASE_URL') || '').trim();

  if (!baseUrl) {
    throw new Error('SURVEY_BASE_URL is not set. Set it to the standalone GAS Web App URL.');
  }

  var issuedUrl = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'action=safety_check&sid=' + encodeURIComponent(surveyId);

  sheet.appendRow([
    surveyId,
    title,
    Utilities.formatDate(now, 'JST', 'yyyy-MM-dd HH:mm:ss'),
    Utilities.formatDate(now, 'JST', 'yyyy-MM-dd HH:mm:ss'),
    issuedUrl,
    'published'
  ]);

  return {
    status: 'success',
    survey_id: surveyId,
    title: title,
    issued_url: issuedUrl,
    created_at: Utilities.formatDate(now, 'JST', 'yyyy-MM-dd HH:mm:ss')
  };
}

function ensureSafetyCheckSheets(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  var settings = ss.getSheetByName('survey_settings');
  if (!settings) {
    settings = ss.insertSheet('survey_settings');
  }
  if (settings.getLastRow() === 0) {
    settings.appendRow(['survey_id', 'title', 'created_at', 'published_at', 'issued_url', 'status']);
  }

  var responses = ss.getSheetByName('survey_responses');
  if (!responses) {
    responses = ss.insertSheet('survey_responses');
  }
  if (responses.getLastRow() === 0) {
    responses.appendRow(['response_id', 'survey_id', 'line_user_id', 'accessed_at', 'submitted_at', 'user_name', 'group_name', 'answer_status', 'is_registered', 'target_id', 'remarks']);
  }

  var accessLog = ss.getSheetByName('survey_access_log');
  if (!accessLog) {
    accessLog = ss.insertSheet('survey_access_log');
  }
  if (accessLog.getLastRow() === 0) {
    accessLog.appendRow(['log_id', 'survey_id', 'line_user_id', 'event_type', 'event_at', 'detail']);
  }
}
