/**
 * MatrixNode 云端后台 (Google Apps Script)
 * ------------------------------------------------------------
 * 职能：
 *   1. 记录全站访问 / 操作流水（写入 Google 表格）
 *   2. 保存并下发站点配置（在线人数、软路由开关等）
 *   3. 保存并下发站点内容（WiFi 卡片、音乐、背景、教程）
 *   4. 接收文件上传（二维码图片 / 音乐），存入 Google Drive 并返回外链
 *
 * 部署方式见 README.md「部署云端后台」章节。
 */

/* ====================== 配置区（按需修改） ====================== */

var ADMIN_TOKEN     = 'Qq112233';   // 后台管理密钥（强烈建议改成自己的）
var SPREADSHEET_ID  = '';           // 留空 = 使用脚本所绑定的表格
var LOG_SHEET_NAME  = 'MN_Logs';    // 流水工作表名（不存在会自动创建）
var UPLOAD_FOLDER   = 'MatrixNode_Uploads'; // Drive 上传目录（不存在会自动创建）
var LOG_LIMIT       = 500;          // 单次 doGet 最多回传的流水条数
var MAX_UPLOAD_MB   = 8;            // 单文件上传体积上限（Apps Script 请求体限制）

var LOG_HEADERS = ['时间', '类型', '操作IP', '地区', '操作人', '行为', '详情', 'UA', '原始JSON'];

/* ====================== 入口 ====================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';

  try {
    if (action === 'content') {
      return jsonOut({ ok: true, content: getContent() });
    }
    if (action === 'config') {
      return jsonOut({ ok: true, config: getConfig() });
    }
    if (action === 'ping') {
      return jsonOut({ ok: true, time: nowStr() });
    }

    var limit = parseInt(p.limit || LOG_LIMIT, 10);
    if (isNaN(limit)) limit = LOG_LIMIT;
    var res = readLogs(limit);
    return jsonOut({
      ok: true,
      logs: res.logs,
      total: res.total,
      config: getConfig(),
      content: getContent()
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String((err && err.message) || err) });
  }
}

function doPost(e) {
  var data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut({ ok: false, error: '请求体不是合法 JSON' });
  }

  var action = data.action || data.dataType || '';

  try {
    switch (action) {
      // ---------- 后台管理类（需密钥） ----------
      case 'ADMIN_LOGIN':
        requireToken_(data);
        return jsonOut({ ok: true, role: 'admin' });

      case 'SAVE_CONTENT':
        requireToken_(data);
        saveContent(data.content || {});
        return jsonOut({ ok: true, content: getContent() });

      case 'UPLOAD_FILE':
        requireToken_(data);
        return jsonOut({ ok: true, file: handleUpload_(data) });

      case 'DELETE_FILE':
        requireToken_(data);
        return jsonOut({ ok: true, deleted: handleDelete_(data.fileId) });

      case 'UPDATE_CONFIG':
        requireToken_(data);
        saveConfig(data);
        return jsonOut({ ok: true, config: getConfig() });

      // ---------- 普通流水上报（无需密钥） ----------
      default:
        appendLog(data);
        return jsonOut({ ok: true });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ====================== 权限 ====================== */

function requireToken_(data) {
  if (!data.token || String(data.token) !== String(ADMIN_TOKEN)) {
    throw new Error('密钥校验失败，无权执行该操作');
  }
}

/* ====================== 流水记录 ====================== */

function appendLog(data) {
  if (!data || !data.dataType) return;
  var sh = getSheet_(LOG_SHEET_NAME, LOG_HEADERS);
  sh.appendRow([
    data.time || nowStr(),
    data.dataType || '',
    data.operatorIp || data.ip || '',
    data.operatorGeo || data.geo || '',
    data.user || '',
    data.action || '',
    data.rawContent || data.content || '',
    data.ua || '',
    JSON.stringify(data)
  ]);
}

function readLogs(limit) {
  var sh = getSheet_(LOG_SHEET_NAME, LOG_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return { logs: [], total: 0 };

  var start = Math.max(2, last - limit + 1);
  var rows = sh.getRange(start, 1, last - start + 1, LOG_HEADERS.length).getValues();
  var logs = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var obj = {};
    try { obj = JSON.parse(r[8]) || {}; } catch (e) { obj = {}; }
    if (!obj.time) obj.time = r[0];
    if (!obj.dataType) obj.dataType = r[1];
    if (!obj.operatorIp && r[2]) obj.operatorIp = r[2];
    if (!obj.operatorGeo && r[3]) obj.operatorGeo = r[3];
    // 兼容前端旧字段命名
    if (!obj.ip) obj.ip = obj.operatorIp || r[2] || '';
    if (!obj.geo) obj.geo = obj.operatorGeo || r[3] || '';
    logs.push(obj);
  }
  return { logs: logs, total: last - 1 };
}

/* ====================== 配置 / 内容存储 ====================== */

function getConfig() {
  var raw = PropertiesService.getScriptProperties().getProperty('SITE_CONFIG');
  var cfg = {};
  if (raw) { try { cfg = JSON.parse(raw) || {}; } catch (e) { cfg = {}; } }
  return cfg;
}

function saveConfig(data) {
  var cfg = getConfig();
  ['cfgDataMode', 'cfgTotalMode', 'cfgTotalOffset', 'cfgTotalFixed', 'cfgOnlineFixed',
   'cfgShowSoftRouter', 'cfgShowWifiCards'].forEach(function (k) {
    if (data[k] !== undefined) cfg[k] = data[k];
  });
  PropertiesService.getScriptProperties().setProperty('SITE_CONFIG', JSON.stringify(cfg));
}

function getContent() {
  var raw = PropertiesService.getScriptProperties().getProperty('SITE_CONTENT');
  var c = {};
  if (raw) { try { c = JSON.parse(raw) || {}; } catch (e) { c = {}; } }
  return c;
}

function saveContent(content) {
  PropertiesService.getScriptProperties()
    .setProperty('SITE_CONTENT', JSON.stringify(content || {}));
}

/* ====================== 文件上传 (Google Drive) ====================== */

function handleUpload_(p) {
  if (!p.base64) throw new Error('缺少文件数据');
  var bytes = Utilities.base64Decode(p.base64);
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error('文件超过 ' + MAX_UPLOAD_MB + 'MB 上限');
  }
  var folder = getFolder_();
  var blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream',
                               p.fileName || ('upload_' + Date.now()));
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // 若域策略禁止公开分享，仍返回直链，管理员可手动设置共享
  }
  return {
    id: file.getId(),
    name: file.getName(),
    size: file.getSize(),
    url: mediaUrl_(file.getId(), p.kind || 'image')
  };
}

function handleDelete_(fileId) {
  if (!fileId) return false;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return true;
  } catch (e) {
    return false;
  }
}

function mediaUrl_(id, kind) {
  // 图片用 export=view（浏览器可直接 <img> 显示，跟随 302 跳转）
  // 音频用 export=download（小文件可直接 <audio> 播放）
  return kind === 'audio'
    ? 'https://drive.google.com/uc?export=download&id=' + id
    : 'https://drive.google.com/uc?export=view&id=' + id;
}

/* ====================== 通用工具 ====================== */

function getSheet_(name, headers) {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.appendRow(headers);
  }
  return sh;
}

function getFolder_() {
  var it = DriveApp.getFoldersByName(UPLOAD_FOLDER);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(UPLOAD_FOLDER);
}

function nowStr() {
  return Utilities.formatDate(new Date(), 'Asia/Shanghai', 'yyyy/MM/dd HH:mm:ss');
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
