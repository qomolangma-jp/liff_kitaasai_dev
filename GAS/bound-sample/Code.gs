function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LINE送信メニュー')
    .addItem('表示中のユーザーにメッセージ送信', 'showSendDialog')
    .addToUi();
}

function showSendDialog() {
  var html = HtmlService.createHtmlOutputFromFile('dialog')
    .setWidth(450)
    .setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, 'LINEメッセージ一斉送信');
}

function getTargetUsers() {
  return MainScript.getTargetUsers();
}

function executeLineMessage(targetIds, message, targetNames) {
  return MainScript.executeLineMessage(targetIds, message, targetNames);
}
