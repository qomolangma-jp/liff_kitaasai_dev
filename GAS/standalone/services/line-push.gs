function sendMulticastToFilteredMembers() {
  var token = APP_CONFIG.line && APP_CONFIG.line.channelAccessToken
    ? String(APP_CONFIG.line.channelAccessToken).trim()
    : "";
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set.");
  }

  var messageText = APP_CONFIG.get("PUSH_MESSAGE_TEXT", "");
  if (!messageText) {
    throw new Error("PUSH_MESSAGE_TEXT is not set.");
  }

  var settings = {
    dryRun: APP_CONFIG.get("PUSH_DRY_RUN", "true").toLowerCase() === "true",
    requireDigital: APP_CONFIG.get("PUSH_REQUIRE_DIGITAL", "true").toLowerCase() === "true",
    includeRoles: parseCsv(APP_CONFIG.get("PUSH_INCLUDE_ROLES", "")),
    excludeStatuses: parseCsv(APP_CONFIG.get("PUSH_EXCLUDE_STATUSES", "ng,suspended,blocked,inactive")),
    notificationDisabled: APP_CONFIG.get("PUSH_NOTIFICATION_DISABLED", "false").toLowerCase() === "true"
  };

  var targets = collectPushTargets(settings);
  var chunks = chunkArray(targets.userIds, 500);
  var result = {
    ok: true,
    dryRun: settings.dryRun,
    totalCandidates: targets.totalCandidates,
    filteredOut: targets.filteredOut,
    targetCount: targets.userIds.length,
    chunks: chunks.length,
    sentChunks: 0,
    failedChunks: 0,
    details: []
  };

  writePushLog("info", "push.start", "Multicast job started", {
    dry_run: settings.dryRun,
    target_count: result.targetCount,
    chunks: result.chunks,
    message_length: messageText.length
  });

  if (targets.userIds.length === 0) {
    writePushLog("warn", "push.no_targets", "No target members matched the filters", {
      total_candidates: targets.totalCandidates,
      filtered_out: targets.filteredOut
    });
    return result;
  }

  if (settings.dryRun) {
    writePushLog("info", "push.dry_run", "Dry run completed without API calls", {
      target_count: targets.userIds.length
    });
    return result;
  }

  chunks.forEach(function (ids, idx) {
    var payload = {
      to: ids,
      messages: [{ type: "text", text: messageText }],
      notificationDisabled: settings.notificationDisabled
    };

    try {
      var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "post",
        contentType: "application/json; charset=UTF-8",
        headers: {
          Authorization: "Bearer " + token
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = res.getResponseCode();
      var body = res.getContentText() || "";
      var ok = code >= 200 && code < 300;

      result.details.push({ chunk: idx + 1, size: ids.length, code: code, ok: ok });
      if (ok) {
        result.sentChunks++;
        writePushLog("info", "push.chunk.success", "Multicast chunk sent", {
          chunk: idx + 1,
          size: ids.length,
          code: code
        });
      } else {
        result.failedChunks++;
        writePushLog("error", "push.chunk.error", "Multicast chunk failed", {
          chunk: idx + 1,
          size: ids.length,
          code: code,
          body: body
        });
      }
    } catch (err) {
      result.failedChunks++;
      result.details.push({ chunk: idx + 1, size: ids.length, code: 0, ok: false, error: String(err) });
      writePushLog("error", "push.chunk.exception", "Multicast exception", {
        chunk: idx + 1,
        size: ids.length,
        error: String(err)
      });
    }
  });

  writePushLog("info", "push.finish", "Multicast job finished", {
    sent_chunks: result.sentChunks,
    failed_chunks: result.failedChunks,
    target_count: result.targetCount
  });

  return result;
}

/**
 * Dialog flow helper:
 * Get visible target users from the active spreadsheet's member sheet.
 * This is intended to be called from a container-bound script through library reference.
 */
function getTargetUsers() {
  SpreadsheetApp.flush();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("Active spreadsheet is not available.");
  }

  var targetSheetName = APP_CONFIG.get("DIALOG_TARGET_SHEET", APP_CONFIG.sheets.memberMain || "名簿");
  var sheet = ss.getSheetByName(targetSheetName);
  if (!sheet) {
    throw new Error("Target sheet not found: " + targetSheetName);
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) {
    return { count: 0, names: [], ids: [] };
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var headers = buildHeaderIndexMap(values[0]);
  var idCol = headers["line_id"];
  var nameCol = headers["name"];
  var lineNameCol = headers["line_name"];
  var name2ndCol = headers["name_2nd"];
  var name1stCol = headers["name_1st"];

  if (idCol === undefined) {
    throw new Error("line_id column is required in target sheet.");
  }

  var targets = { count: 0, names: [], ids: [] };

  for (var i = 1; i < values.length; i++) {
    var rowIndex = i + 1;
    if (sheet.isRowHiddenByFilter(rowIndex) || sheet.isRowHiddenByUser(rowIndex)) {
      continue;
    }

    var row = values[i];
    var lineId = String(row[idCol] || "").trim();
    if (!lineId) continue;

    var resolvedName = resolveTargetNameFromRow(row, {
      nameCol: nameCol,
      lineNameCol: lineNameCol,
      name2ndCol: name2ndCol,
      name1stCol: name1stCol
    });

    targets.ids.push(lineId);
    targets.names.push(resolvedName || "名前なし");
  }

  targets.count = targets.ids.length;
  return targets;
}

/**
 * Dialog flow helper:
 * Get targets from active sheet again and send with input message.
 */
function sendLineFromDialog(message) {
  var msg = String(message || "").trim();
  if (!msg) {
    throw new Error("送信メッセージが空です。");
  }

  var targets = getTargetUsers();
  if (targets.count === 0) {
    throw new Error("送信対象が見つかりません。名簿シートのフィルタ設定を確認してください。");
  }

  return executeLineMessage(targets.ids, msg, targets.names);
}

/**
 * Main send function for dialog flow.
 */
function executeLineMessage(targetIds, message, targetNames) {
  var ids = Array.isArray(targetIds) ? targetIds.map(function (x) { return String(x || "").trim(); }).filter(Boolean) : [];
  var names = Array.isArray(targetNames) ? targetNames : [];
  var msg = String(message || "").trim();

  if (!msg) {
    throw new Error("メッセージを入力してください。");
  }
  if (ids.length === 0) {
    throw new Error("送信対象が0件です。");
  }

  var dryRun = APP_CONFIG.get("PUSH_DRY_RUN", "false").toLowerCase() === "true";
  var status = "成功";
  try {
    if (!dryRun) {
      var chunks = chunkArray(ids, 500);
      chunks.forEach(function (chunkIds) {
        executeMulticast(chunkIds, msg);
      });
    } else {
      status = "成功(DRY_RUN)";
      writePushLog("warn", "push.dialog.dry_run", "Dialog send skipped by dry run", {
        count: ids.length
      });
    }
  } catch (e) {
    status = "失敗: " + e.message;
    saveHistory(names, msg, status);
    writePushLog("error", "push.dialog.error", "Dialog send failed", {
      count: ids.length,
      error: String(e)
    });
    throw e;
  }

  saveHistory(names, msg, status);
  writePushLog("info", "push.dialog.success", "Dialog send completed", {
    count: ids.length,
    dry_run: dryRun
  });

  return dryRun
    ? ids.length + "名が送信対象です（DRY_RUNのため未送信）。"
    : ids.length + "名にメッセージを送信しました。";
}

function executeMulticast(toIds, messageText) {
  var token = APP_CONFIG.line && APP_CONFIG.line.channelAccessToken
    ? String(APP_CONFIG.line.channelAccessToken).trim()
    : "";
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set.");
  }

  var payload = {
    to: toIds,
    messages: [{ type: "text", text: String(messageText || "") }],
    notificationDisabled: APP_CONFIG.get("PUSH_NOTIFICATION_DISABLED", "false").toLowerCase() === "true"
  };

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/multicast", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("LINE APIエラー(Code:" + code + "): " + response.getContentText());
  }
}

function saveHistory(names, message, status) {
  try {
    var historySsId = APP_CONFIG.get("HISTORY_SS_ID", APP_CONFIG.spreadsheets.member || "");
    if (!historySsId) {
      throw new Error("HISTORY_SS_ID and SS_MEMBER_ID are both empty.");
    }

    var historySheetName = APP_CONFIG.get("HISTORY_SHEET_NAME", "line_send_history");
    var historySheet = getOrCreateSheet(
      historySsId,
      historySheetName,
      ["created_at", "target", "message", "send_status"]
    );

    var targetNamesString = (names && names.length > 0) ? names.join(", ") : "不明";
    historySheet.appendRow([
      new Date(),
      targetNamesString,
      String(message || ""),
      String(status || "")
    ]);
  } catch (e) {
    Logger.log("[PUSH_HISTORY_FALLBACK] %s", String(e));
  }
}

function resolveTargetNameFromRow(row, idx) {
  if (idx.nameCol !== undefined) {
    var n = String(row[idx.nameCol] || "").trim();
    if (n) return n;
  }
  if (idx.lineNameCol !== undefined) {
    var ln = String(row[idx.lineNameCol] || "").trim();
    if (ln) return ln;
  }

  var last = idx.name2ndCol !== undefined ? String(row[idx.name2ndCol] || "").trim() : "";
  var first = idx.name1stCol !== undefined ? String(row[idx.name1stCol] || "").trim() : "";
  var full = (last + " " + first).trim();
  return full;
}

function collectPushTargets(settings) {
  var sheet = getSheetOrThrow(APP_CONFIG.spreadsheets.member, APP_CONFIG.sheets.memberMain);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) {
    return { totalCandidates: 0, filteredOut: 0, userIds: [] };
  }

  var headers = buildHeaderIndexMap(values[0]);
  var idCol = headers["line_id"];
  if (idCol === undefined) {
    throw new Error("line_id column is required in member sheet.");
  }

  var statusCol = headers["status"];
  var digitalCol = headers["is_digital"];
  var roleCol = headers["role"];

  var ids = [];
  var seen = {};
  var filteredOut = 0;

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var uid = String(row[idCol] || "").trim();
    if (!uid) {
      filteredOut++;
      continue;
    }

    var status = statusCol !== undefined ? String(row[statusCol] || "").trim().toLowerCase() : "ok";
    if (settings.excludeStatuses.indexOf(status) >= 0) {
      filteredOut++;
      continue;
    }

    if (settings.requireDigital) {
      var digital = digitalCol !== undefined ? String(row[digitalCol] || "").trim().toLowerCase() : "";
      if (!isDigitalAllowed(digital)) {
        filteredOut++;
        continue;
      }
    }

    if (settings.includeRoles.length > 0) {
      var roleText = roleCol !== undefined ? String(row[roleCol] || "") : "";
      if (!matchAnyRole(roleText, settings.includeRoles)) {
        filteredOut++;
        continue;
      }
    }

    if (!seen[uid]) {
      seen[uid] = true;
      ids.push(uid);
    }
  }

  return {
    totalCandidates: values.length - 1,
    filteredOut: filteredOut,
    userIds: ids
  };
}

function isDigitalAllowed(value) {
  var v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v.indexOf("スマホ") >= 0 || v.indexOf("デジタル") >= 0;
}

function matchAnyRole(rowRoleText, includeRoles) {
  var text = String(rowRoleText || "");
  return includeRoles.some(function (role) {
    return text.indexOf(role) >= 0;
  });
}

function parseCsv(text) {
  var raw = String(text || "").trim();
  if (!raw) return [];
  return raw.split(",").map(function (x) { return String(x || "").trim().toLowerCase(); }).filter(Boolean);
}

function chunkArray(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function writePushLog(level, phase, message, meta) {
  try {
    var sheet = getOrCreateSheet(
      APP_CONFIG.spreadsheets.member,
      APP_CONFIG.sheets.pushLog,
      ["created_at", "level", "phase", "message", "meta"]
    );
    sheet.appendRow([
      Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss"),
      String(level || "info"),
      String(phase || ""),
      String(message || ""),
      JSON.stringify(meta || {})
    ]);
  } catch (err) {
    Logger.log("[PUSH_LOG_FALLBACK] %s", String(err));
  }
}
