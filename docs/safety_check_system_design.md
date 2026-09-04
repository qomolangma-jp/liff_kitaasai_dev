# Safety Check System Design

## 1. Summary

This design keeps the system simple and consistent with the notice access log pattern.

The key point is:
- do not create a separate `member_master`
- use the existing member spreadsheet as the source of truth
- store only the safety-check response log in the survey sheet
- use the member sheet to fetch user information such as name and group when needed

This is enough to answer the essential questions:
- Can we confirm the user is safe?
- Who answered?
- When did they answer?

---

## 2. Spreadsheet and sheet naming

Target spreadsheet name:
- [Dev] Safety Check - LINE to Member Directory

Required sheet names in English:
- `survey_settings`
- `survey_responses`
- `survey_access_log`

No `member_master` is required.

The member data comes from the existing member spreadsheet already configured by `SS_MEMBER_ID` and `SHEET_MEMBER_MAIN` in the GAS config.

---

## 3. Source of truth for user data

Use the existing member sheet as the master record.

The member sheet should contain, at minimum:
- `line_id`
- `name_1st`
- `name_2nd`
- `group`
- `status`
- `updated_at`

The survey system then does this:
1. read the LINE user ID from the access URL or LIFF session
2. search the member sheet by `line_id`
3. if found, read `user_name` and `group`
4. if not found, record the access as unregistered and keep the answer log

This is the same pattern as notice's access log, which stores user information in the log record instead of duplicating the member table.

---

## 4. Sheet structure

### 4.1 `survey_settings`

Columns:
- `survey_id`
- `title`
- `created_at`
- `published_at`
- `issued_url`
- `status`

Example:
- `survey_id`: `sc_20260904_001`
- `title`: `Daily safety confirmation`
- `created_at`: `2026-09-04 09:00:00`
- `issued_url`: `https://.../exec?action=survey&sid=sc_20260904_001`
- `status`: `published`

This is the minimum needed to create and issue a safety-check link.

### 4.2 `survey_responses`

This is the main log sheet for answers.

Columns:
- `response_id`
- `survey_id`
- `line_user_id`
- `accessed_at`
- `submitted_at`
- `user_name`
- `group_name`
- `answer_status`
- `is_registered`
- `target_id`
- `remarks`

Required values:
- `survey_id`: which survey was answered
- `line_user_id`: LINE account of the responder
- `accessed_at`: first time the user opened the link
- `submitted_at`: time of answer submission
- `user_name`: from the member sheet if available; otherwise use the LINE name
- `group_name`: from the member sheet if available
- `answer_status`: `safe`, `needs_help`, `unknown`, or `not_answered`
- `is_registered`: `true` or `false`
- `target_id`: survey record ID or target identifier

This single table is enough for the core requirement.

### 4.3 `survey_access_log`

Optional but recommended.

Columns:
- `log_id`
- `survey_id`
- `line_user_id`
- `event_type`
- `event_at`
- `detail`

This is helpful for troubleshooting and for checking whether the user opened the survey link.

---

## 5. User registration flow

The simple answer is:
- no separate `member_master` table is required
- registration check is done by looking up the member sheet

### 5.1 If the user is already in the member sheet
- show the completed safety-check page directly
- save the answer to `survey_responses`

### 5.2 If the user is not in the member sheet
- route to a simple registration form
- ask only for:
  - name
  - group
- after submit, save the minimal data back to the member sheet
- then redirect to `/index.html`

At `/index.html`, if the remaining profile is incomplete, show:
- 「安否確認は受け付けました。引き続き、ユーザー登録を行ってください。」

This matches the requirement without creating a duplicate master table.

---

## 6. Simplified logic

### 6.1 During access

When user opens the survey link:
1. read `survey_id`
2. find the survey in `survey_settings`
3. read the current `line_user_id`
4. search the member sheet by `line_id`
5. if found, get `user_name` and `group`
6. if not found, mark as unregistered
7. save access log to `survey_access_log`

### 6.2 During answer submission

Write one row to `survey_responses` with:
- `survey_id`
- `line_user_id`
- `accessed_at`
- `submitted_at`
- `user_name`
- `group_name`
- `answer_status`
- `is_registered`
- `target_id`

This is the minimum necessary for admin review.

---

## 7. Why this is better than member_master

Using the member sheet directly has several benefits:
- no duplicated user data
- consistent with the notice system
- no extra maintenance for two user tables
- easier for admins because all member records are already in one place

The survey system only needs to log the answer, not maintain a separate user database.

---

## 8. Minimal GAS implementation approach

The GAS code can be kept very simple:
- `survey_settings` read/write functions
- `survey_responses` append row
- `survey_access_log` append row
- helper to find member by `line_id` in the existing member sheet

The implementation should follow the same pattern as notice:
- read from the existing member sheet
- append to the survey log sheet
- never duplicate the member master

---

## 9. Final design recommendation

Use this as the final target design:

### `survey_settings`
- `survey_id`
- `title`
- `created_at`
- `published_at`
- `issued_url`
- `status`

### `survey_responses`
- `response_id`
- `survey_id`
- `line_user_id`
- `accessed_at`
- `submitted_at`
- `user_name`
- `group_name`
- `answer_status`
- `is_registered`
- `target_id`

### `survey_access_log`
- `log_id`
- `survey_id`
- `line_user_id`
- `event_type`
- `event_at`
- `detail`

This is the simple form that satisfies the requirement while keeping the system easy to maintain.

---

## 10. Conclusion

The answer is: no, `member_master` is not necessary for this minimal version.

The existing member sheet is enough as the source of truth, and the safety-check system can simply log:
- who answered
- when they answered
- whether the user was registered
- what their answer status was

That is enough to confirm safety and review response records without adding redundant user tables.
