# Standalone GAS Hub for LIFF + Multi Spreadsheet

This folder contains a standalone Google Apps Script design that treats multiple spreadsheets as one logical backend.

## Project goal

- Single Web App endpoint for all LIFF apps
- Multiple Spreadsheet IDs managed via Script Properties
- Service split by business domain

## Structure

- main.gs: doGet/doPost entry points
- router.gs: action router with backward compatibility
- config.gs: Script Properties loader
- auth.gs: webhook and token checks
- response.gs: JSON response helpers
- gateway_sheets.gs: Spreadsheet gateway and header mapping
- services/member.gs: member check and profile upsert
- services/bookroom.gs: reservation list and submit
- services/chat.gs: LINE webhook and postback processing
- services/line-push.gs: LINE multicast push sender for library calls
- services/notice.gs: monthly items and access logs
- services/attendance.gs: question and answer APIs
- jobs/chat_sync.gs: scheduled matching job

## Required Script Properties

Set these before deployment:

- SS_MEMBER_ID
- SS_BOOKROOM_ID
- SS_NOTICE_ID
- SS_ATTENDANCE_ID
- SS_CHAT_ID (optional, defaults to SS_BOOKROOM_ID)
- SHEET_MEMBER_MAIN (default: 名簿)
- SHEET_BOOKROOM_MAIN (default: 予約台帳)
- SHEET_CHAT_LOG (default: chat)
- SHEET_WEBHOOK_LOG (default: webhook_log)
- SHEET_PUSH_LOG (default: push_log)
- SHEET_NOTICE_ITEMS (default: monthly_items)
- SHEET_AUDIT_LOG (default: access_log)
- SHEET_ATTENDANCE_QUESTIONS (default: questions)
- SHEET_ATTENDANCE_ANSWERS (default: answers)
- LINE_CHANNEL_ACCESS_TOKEN (optional if push API is not used)
- LINE_CHANNEL_SECRET
- WEBHOOK_SECRET (optional but recommended)
- LINE_SIGNATURE_VERIFY_REQUIRED (default: false)
- LIFF_TOKEN_VERIFY_ENABLED (true/false)
- REGISTER_FORM_URL

Optional properties for multicast push:

- PUSH_MESSAGE_TEXT (required only for sendMulticastToFilteredMembers)
- PUSH_DRY_RUN (default: true)
- PUSH_REQUIRE_DIGITAL (default: true)
- PUSH_INCLUDE_ROLES (comma-separated, optional)
- PUSH_EXCLUDE_STATUSES (default: ng,suspended,blocked,inactive)
- PUSH_NOTIFICATION_DISABLED (default: false)
- DIALOG_TARGET_SHEET (default: 名簿)
- HISTORY_SS_ID (optional, fallback: SS_MEMBER_ID)
- HISTORY_SHEET_NAME (default: line_send_history)

Webhook notes:

- If WEBHOOK_SECRET is set, configure LINE Developers webhook URL as:
   https://script.google.com/macros/s/XXXXX/exec?secret=YOUR_SECRET
- In GAS Web App, request headers may be unavailable depending on runtime/route.
   Keep LINE_SIGNATURE_VERIFY_REQUIRED=false unless you confirmed X-Line-Signature is readable.

Bookroom push notification notes:

- Reservation submit now sends a receipt message to applicant and approval request to admins.
- Admin approval/reject postback sends decision message to applicant.
- Required for these notifications:
   - LINE_CHANNEL_ACCESS_TOKEN must be valid (Messaging API channel token)
   - Member sheet must have alert column containing "bookroom" for admin rows
   - Applicant and admins must have friended the official LINE account

## Action mapping

GET:

- action=member_check
- action=bookroom_list
- action=get_monthly_items&ym=YYYY-MM
- action=attendance_question&qid=q_1&uid=LINE_USER_ID
- action=member_profile_get&line_id=LINE_USER_ID

POST:

- action=bookroom_submit
- action=line_webhook
- action=attendance_answer
- action=member_profile_upsert
- action=log
- action=diagnostics_write

Diagnostics:

- GET `?action=diagnostics`
   - Returns runtime config flags and connectivity checks for bookroom/chat sheets.
   - Useful when reservation succeeds but webhook_log/push do not work.
- POST `{"action":"diagnostics_write","note":"manual test"}`
   - Writes a `diagnostics.manual` row to webhook_log to verify write path.

## Backward compatibility handled by router

- type=user&uid=... -> member_check
- GET without action -> bookroom_list
- qid=... -> attendance_question
- POST with events -> line_webhook
- POST with lineId + qid -> attendance_answer
- POST with date + room -> bookroom_submit

## Deployment notes

1. Create a standalone GAS project.
2. Copy all files in this folder into the project.
3. Set Script Properties.
4. Deploy as Web App with:
   - Execute as: User deploying the app
   - Who has access: Anyone
5. Replace each LIFF page GAS URL with the new single endpoint.

## Library call (container-bound script)

You can call push from a bound script via library reference:

function onOpen() {
   SpreadsheetApp.getUi()
      .createMenu('LINE送信機能')
      .addItem('一括送信を実行', 'runPush')
      .addToUi();
}

function runPush() {
   var result = MainScript.sendMulticastToFilteredMembers();
   Logger.log(JSON.stringify(result));
}

Dialog flow (message input from UI) can call:

- MainScript.getTargetUsers()
- MainScript.executeLineMessage(targetIds, message, targetNames)
- MainScript.sendLineFromDialog(message)

## Trigger job

If chat matching is needed, set a time-driven trigger for runChatHistoryMatchJob.
