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
- SHEET_NOTICE_ITEMS (default: monthly_items)
- SHEET_AUDIT_LOG (default: access_log)
- SHEET_ATTENDANCE_QUESTIONS (default: questions)
- SHEET_ATTENDANCE_ANSWERS (default: answers)
- LINE_CHANNEL_ACCESS_TOKEN (optional if push API is not used)
- LINE_CHANNEL_SECRET
- WEBHOOK_SECRET (optional but recommended)
- LIFF_TOKEN_VERIFY_ENABLED (true/false)
- REGISTER_FORM_URL

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

## Trigger job

If chat matching is needed, set a time-driven trigger for runChatHistoryMatchJob.
