/**
 * MatrixNode 云端后台 (Google Apps Script)
 * ------------------------------------------------------------
 * 职能：
 *   1. 记录全站访问 / 操作流水（写入 Google 表格）
 *   2. 保存并下发站点配置（在线人数、软路由开关等）
 *   3. 保存并下发站点内容（WiFi 卡片、音乐、背景、教程）
 *   4. 接收文件上传（二维码图片 / 音乐 / 视频），存入 Google Drive 并返回外链
 *   5. 支持按起止日期（Asia/Shanghai 时区）无条数上限查询区间流水与真实访问统计
 *
 * 部署方式见 README.md「部署云端后台」章节。
 */

/* ====================== 配置区（按需修改） ====================== */

var ADMIN_TOKEN     = 'Qq112233';   // 后台管理密钥（强烈建议改成自己的）
var SPREADSHEET_ID  = '1tZQtbjg4xgw0UAZiLgcnoNRXDXxcRV1pR7BYEqr0yeQ'; // MatrixNode beta 表
var LOG_SHEET_NAME  = 'MN_Logs';    // 流水工作表名（不存在会自动创建）
var UPLOAD_FOLDER   = 'MatrixNode_Uploads'; // Drive 上传目录（不存在会自动创建）
var LOG_LIMIT       = 500;          // 默认单次 doGet 最多回传的流水条数（range 查询不受此限制）
var MAX_UPLOAD_MB   = 8;            // 单文件上传体积上限（Apps Script 请求体限制）
var TIMEZONE        = 'Asia/Shanghai';

var LOG_HEADERS = ['时间', '类型', '操作IP', '地区', '操作人', '行为', '详情', 'UA', '原始JSON'];

var INBOX_SHEET_NAME = 'MN_Inbox';
var INBOX_HEADERS = ['消息ID','时间','房间号','类型','文字内容','图片URL','图片名称','OCR文字','UA'];
var INBOX_ROOM = 'MatrixNode';   // 扫码上传口令，前端必须一致，可改成你自己的口令
var INBOX_LIMIT = 100;

var PROXY_NODES_SHEET_NAME = 'PROXY_Nodes';
var PROXY_NODES_HEADERS = ['节点ID', '显示名', 'server', 'port', 'auth', 'sni', 'insecure', '是否上线', '更新时间'];
var DEFAULT_PROBE_INTERVAL_MIN = 15;

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
    if (action === 'probe' || action === 'probes') {
      return jsonOut({ ok: true, probe: getProbeResult(), probeIntervalMin: getProbeIntervalMin() });
    }
    if (action === 'proxynodes') {
      return jsonOut({ ok: true, probeIntervalMin: getProbeIntervalMin(), nodes: readProxyNodes_(false) });
    }
    if (action === 'inboxpage') {
      return HtmlService.createHtmlOutput(getInboxPageHtml(p.room || ''))
        .setTitle('内容上传')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
    }
    if (action === 'inbox') {
      if (p.room !== INBOX_ROOM) return jsonOut({ ok: false, error: '房间号错误' });
      return jsonOut({ ok: true, room: p.room, messages: readInbox(p.room) });
    }
    if (action === 'range' || p.from || p.to) {
      var rangeRes = readLogsByRange(p.from || '', p.to || '', p.page, p.pageSize);
      return jsonOut({
        ok: true,
        action: 'range',
        from: normalizeYmd_(p.from || ''),
        to: normalizeYmd_(p.to || ''),
        logs: rangeRes.logs,
        total: rangeRes.total,
        accessTotal: rangeRes.accessTotal,
        matchedCount: rangeRes.matchedCount,
        countsByType: rangeRes.countsByType
      });
    }

    var limit = parseInt(p.limit || LOG_LIMIT, 10);
    if (isNaN(limit)) limit = LOG_LIMIT;
    var res = readLogs(limit);
    return jsonOut({
      ok: true,
      logs: res.logs,
      total: res.total,
      accessTotal: res.accessTotal,
      countsByType: res.countsByType,
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

      case 'PROBE_RESULT':
        requireToken_(data);
        saveProbeResult(data);
        return jsonOut({ ok: true, probe: getProbeResult() });

      case 'LIST_PROXY_NODES':
        requireToken_(data);
        return jsonOut({ ok: true, probeIntervalMin: getProbeIntervalMin(), nodes: readProxyNodes_(false) });

      case 'SAVE_PROXY_NODE':
        requireToken_(data);
        var savedNode = saveProxyNode_(data.node || data);
        if (data.probeIntervalMin !== undefined) saveProbeIntervalMin(data.probeIntervalMin);
        return jsonOut({ ok: true, node: savedNode, probeIntervalMin: getProbeIntervalMin(), nodes: readProxyNodes_(false) });

      case 'DELETE_PROXY_NODE':
        requireToken_(data);
        deleteProxyNode_(data.id);
        return jsonOut({ ok: true, probeIntervalMin: getProbeIntervalMin(), nodes: readProxyNodes_(false) });

      case 'TOGGLE_PROXY_NODE':
        requireToken_(data);
        toggleProxyNodeOnline_(data.id, data.online);
        return jsonOut({ ok: true, probeIntervalMin: getProbeIntervalMin(), nodes: readProxyNodes_(false) });

      case 'SET_PROBE_INTERVAL':
        requireToken_(data);
        var newInterval = saveProbeIntervalMin(data.probeIntervalMin);
        return jsonOut({ ok: true, probeIntervalMin: newInterval, config: getConfig() });

      case 'GET_PROBE_TASK':
        requireToken_(data);
        return jsonOut(getProbeTask_(Boolean(data.force)));

      // ---------- 扫码收件箱（手机公开接口，校验房间号） ----------
      case 'INBOX_SUBMIT':
        if (!data.room || data.room !== INBOX_ROOM) throw new Error('房间号错误');
        return jsonOut({ ok: true, message: handleInboxSubmit(data) });

      case 'INBOX_OCR':
        if (!data.room || data.room !== INBOX_ROOM) throw new Error('房间号错误');
        updateInboxOcr(data.id, data.ocrText);
        return jsonOut({ ok: true });

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

/* ====================== 流水记录与日期范围查询 ====================== */

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

/** 将任意日期入参标准化为 Asia/Shanghai 口径下的 YYYY-MM-DD 字符串 */
function normalizeYmd_(raw) {
  if (!raw && raw !== 0) return '';
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, TIMEZONE, 'yyyy-MM-dd');
  }
  var s = String(raw).trim();
  if (!s) return '';
  var m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(s);
  if (m) {
    var mm = ('0' + parseInt(m[2], 10)).slice(-2);
    var dd = ('0' + parseInt(m[3], 10)).slice(-2);
    return m[1] + '-' + mm + '-' + dd;
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd');
  }
  return '';
}

/** 将单元格时间格式化为 Asia/Shanghai 的可读时间字符串 */
function formatCellTime_(raw) {
  if (!raw && raw !== 0) return '';
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, TIMEZONE, 'yyyy/MM/dd HH:mm:ss');
  }
  return String(raw).trim();
}

/** 解析单行数据并标准化时间与类型字段 */
function parseLogRow_(r) {
  var obj = {};
  try { obj = JSON.parse(r[8]) || {}; } catch (e) { obj = {}; }
  var cellTimeStr = formatCellTime_(r[0]);
  if (!obj.time) obj.time = cellTimeStr;
  else if (Object.prototype.toString.call(obj.time) === '[object Date]') {
    obj.time = formatCellTime_(obj.time);
  }
  if (!obj.dataType) obj.dataType = String(r[1] || '').trim();
  // 兼容旧版行：若 dataType 是日期字符串，则实际属于早期 ACCESS_LOG
  if (obj.dataType && (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(obj.dataType))) {
    obj.ua = obj.geo;
    obj.geo = obj.ip;
    obj.ip = obj.time;
    obj.time = obj.dataType;
    obj.dataType = 'ACCESS_LOG';
  }
  if (!obj.dataType) obj.dataType = 'ACCESS_LOG';
  if (!obj.operatorIp && r[2]) obj.operatorIp = String(r[2]);
  if (!obj.operatorGeo && r[3]) obj.operatorGeo = String(r[3]);
  if (!obj.ip) obj.ip = obj.operatorIp || String(r[2] || '');
  if (!obj.geo) obj.geo = obj.operatorGeo || String(r[3] || '');
  obj.dateYmd = normalizeYmd_(r[0]) || normalizeYmd_(obj.time);
  return obj;
}

function readLogs(limit) {
  var sh = getSheet_(LOG_SHEET_NAME, LOG_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) {
    return {
      logs: [],
      total: 0,
      accessTotal: 0,
      countsByType: { ACCESS_LOG: 0, SINGLE_GEN: 0, PROXY_TEST: 0, FEEDBACK: 0, PROXY_USAGE: 0 }
    };
  }

  var allRows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
  var countsByType = { ACCESS_LOG: 0, SINGLE_GEN: 0, PROXY_TEST: 0, FEEDBACK: 0, PROXY_USAGE: 0 };
  var allParsed = [];

  for (var i = 0; i < allRows.length; i++) {
    var item = parseLogRow_(allRows[i]);
    var dt = item.dataType || 'ACCESS_LOG';
    if (dt === 'BATCH_CLEAN') dt = 'PROXY_USAGE';
    countsByType[dt] = (countsByType[dt] || 0) + 1;
    allParsed.push(item);
  }

  var sliceStart = limit > 0 ? Math.max(0, allParsed.length - limit) : 0;
  return {
    logs: allParsed.slice(sliceStart),
    total: allParsed.length,
    accessTotal: countsByType.ACCESS_LOG || 0,
    countsByType: countsByType
  };
}

/**
 * 按起止日期（from=YYYY-MM-DD, to=YYYY-MM-DD，Asia/Shanghai 时区）返回区间内全部日志
 * 不受 LOG_LIMIT=500 限制；若传入 page 与 pageSize 则按需分页
 */
function readLogsByRange(fromStr, toStr, pageParam, pageSizeParam) {
  var sh = getSheet_(LOG_SHEET_NAME, LOG_HEADERS);
  var last = sh.getLastRow();
  var countsByType = { ACCESS_LOG: 0, SINGLE_GEN: 0, PROXY_TEST: 0, FEEDBACK: 0, PROXY_USAGE: 0 };
  if (last < 2) {
    return { logs: [], total: 0, accessTotal: 0, matchedCount: 0, countsByType: countsByType };
  }

  var fromYmd = normalizeYmd_(fromStr);
  var toYmd = normalizeYmd_(toStr);
  if (fromYmd && toYmd && fromYmd > toYmd) {
    var tmp = fromYmd; fromYmd = toYmd; toYmd = tmp;
  }

  var rows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
  var matched = [];
  var globalAccessTotal = 0;

  for (var i = 0; i < rows.length; i++) {
    var obj = parseLogRow_(rows[i]);
    if (obj.dataType === 'ACCESS_LOG') globalAccessTotal++;

    var ymd = obj.dateYmd;
    if (fromYmd && (!ymd || ymd < fromYmd)) continue;
    if (toYmd && (!ymd || ymd > toYmd)) continue;

    var tKey = obj.dataType === 'BATCH_CLEAN' ? 'PROXY_USAGE' : (obj.dataType || 'ACCESS_LOG');
    countsByType[tKey] = (countsByType[tKey] || 0) + 1;
    matched.push(obj);
  }

  var page = parseInt(pageParam, 10);
  var pageSize = parseInt(pageSizeParam, 10);
  var outLogs = matched;
  if (!isNaN(page) && page > 0 && !isNaN(pageSize) && pageSize > 0) {
    var startIdx = (page - 1) * pageSize;
    outLogs = matched.slice(startIdx, startIdx + pageSize);
  }

  return {
    logs: outLogs,
    total: rows.length,
    accessTotal: globalAccessTotal,
    matchedCount: matched.length,
    countsByType: countsByType
  };
}

/* ====================== 配置 / 内容存储 ====================== */

function getProbeIntervalMin() {
  var props = PropertiesService.getScriptProperties();
  var direct = parseInt(props.getProperty('probeIntervalMin') || '', 10);
  if (!isNaN(direct) && direct >= 1) return direct;
  var raw = props.getProperty('SITE_CONFIG');
  if (raw) {
    try {
      var cfg = JSON.parse(raw) || {};
      var fromCfg = parseInt(cfg.probeIntervalMin || '', 10);
      if (!isNaN(fromCfg) && fromCfg >= 1) return fromCfg;
    } catch (e) {}
  }
  return DEFAULT_PROBE_INTERVAL_MIN;
}

function saveProbeIntervalMin(val) {
  var n = parseInt(val, 10);
  if (isNaN(n) || n < 1) n = DEFAULT_PROBE_INTERVAL_MIN;
  if (n > 1440) n = 1440;
  var props = PropertiesService.getScriptProperties();
  props.setProperty('probeIntervalMin', String(n));
  var raw = props.getProperty('SITE_CONFIG');
  var cfg = {};
  if (raw) { try { cfg = JSON.parse(raw) || {}; } catch (e) { cfg = {}; } }
  cfg.probeIntervalMin = n;
  props.setProperty('SITE_CONFIG', JSON.stringify(cfg));
  return n;
}

function getConfig() {
  var raw = PropertiesService.getScriptProperties().getProperty('SITE_CONFIG');
  var cfg = {};
  if (raw) { try { cfg = JSON.parse(raw) || {}; } catch (e) { cfg = {}; } }
  cfg.probeIntervalMin = getProbeIntervalMin();
  return cfg;
}

function saveConfig(data) {
  var cfg = getConfig();
  ['cfgDataMode', 'cfgTotalMode', 'cfgTotalOffset', 'cfgTotalFixed', 'cfgOnlineFixed',
   'cfgShowSoftRouter', 'cfgShowWifiCards'].forEach(function (k) {
    if (data[k] !== undefined) cfg[k] = data[k];
  });
  if (data.probeIntervalMin !== undefined) {
    cfg.probeIntervalMin = saveProbeIntervalMin(data.probeIntervalMin);
  }
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

function getProbeResult() {
  var raw = PropertiesService.getScriptProperties().getProperty('PROBE_RESULT');
  if (raw) {
    try {
      var s = JSON.parse(raw);
      if (s && s.items) {
        s.probeIntervalMin = getProbeIntervalMin();
        return s;
      }
    } catch (e) {}
  }
  return { updatedAt: '', checkedAt: '', probeIntervalMin: getProbeIntervalMin(), items: {}, results: [] };
}

function saveProbeResult(data) {
  var state = getProbeResult();
  var items = state.items || {};
  var results = Array.isArray(data.results) ? data.results : [];

  results.forEach(function (r) {
    var id = r.id || r.name;
    if (!id) return;
    var prev = items[id] || {};
    var isUp = r.status === 'up';

    // 管理员手动覆盖优先：被锁定的节点不被自动探测改写状态，只更新探测时间和自动结果
    if (prev.manualOverride) {
      items[id] = Object.assign({}, prev, {
        lastCheckedAt: r.checkedAt || '',
        autoStatus: isUp ? 'up' : 'down'
      });
      return;
    }

    // 刚由 up 变 down 记录断网时间；持续 down 沿用旧值；首次见到就是 down 也记录
    var downSince = '';
    if (!isUp) {
      downSince = (prev.status === 'up') ? r.checkedAt
        : (prev.downSince || r.checkedAt);
    }

    items[id] = {
      id: id,
      name: r.name || prev.name || id,
      type: r.type || prev.type || 'hysteria2',
      status: isUp ? 'up' : 'down',
      exitIp: r.exitIp || '',
      country: r.country || '',
      region: r.regionName || r.region || '',
      city: r.city || '',
      isp: r.isp || '',
      latencyMs: r.latencyMs || 0,
      error: r.error || '',
      lastCheckedAt: r.checkedAt || '',
      firstOnlineAt: prev.firstOnlineAt || (isUp ? r.checkedAt : ''), // 首次上线时间
      lastUpAt: isUp ? r.checkedAt : (prev.lastUpAt || ''),
      downSince: downSince,                                           // 断网开始时间
      manualOverride: false
    };
  });

  state.items = items;
  state.checkedAt = data.checkedAt || nowStr();
  state.updatedAt = data.checkedAt || nowStr();
  state.results = results;
  PropertiesService.getScriptProperties().setProperty('PROBE_RESULT', JSON.stringify(state));
  return state;
}

/* ====================== 前置代理节点表 (PROXY_Nodes) 与探测调度 ====================== */

function parseChinaTimeMs_(str) {
  if (!str) return 0;
  var s = String(str).trim();
  var m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(s);
  if (m) {
    var pad = function (n) { return ('0' + parseInt(n, 10)).slice(-2); };
    var iso = m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) + 'T' + pad(m[4]) + ':' + pad(m[5]) + ':' + pad(m[6] || 0) + '+08:00';
    var t = Date.parse(iso);
    return isNaN(t) ? 0 : t;
  }
  var d = Date.parse(s);
  return isNaN(d) ? 0 : d;
}

function toBool_(v, defaultVal) {
  if (v === undefined || v === null || v === '') return defaultVal;
  if (typeof v === 'boolean') return v;
  var s = String(v).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no' || s === 'off' || s === '下线') return false;
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on' || s === '上线') return true;
  return defaultVal;
}

/**
 * 读取 PROXY_Nodes 工作表
 * @param {boolean} includeSecret 为 true 时返回 auth 密码（仅限后端探测脚本 GET_PROBE_TASK 调用）；为 false 时绝不返回明文密码
 */
function readProxyNodes_(includeSecret) {
  var sh = getSheet_(PROXY_NODES_SHEET_NAME, PROXY_NODES_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, PROXY_NODES_HEADERS.length).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var id = String(r[0] || '').trim();
    var name = String(r[1] || '').trim();
    var server = String(r[2] || '').trim();
    if (!id && !name && !server) continue;
    if (!id) id = 'pnode_' + (i + 1);
    var port = parseInt(r[3], 10);
    if (isNaN(port) || port <= 0) port = 443;
    var rawAuth = String(r[4] || '');
    var sni = String(r[5] || '').trim();
    var insecure = toBool_(r[6], true);
    var online = toBool_(r[7], true);
    var updatedAt = formatCellTime_(r[8]);

    var item = {
      id: id,
      name: name || id,
      server: server,
      port: port,
      hasAuth: Boolean(rawAuth),
      sni: sni,
      insecure: insecure,
      online: online,
      updatedAt: updatedAt
    };
    if (includeSecret === true) {
      item.auth = rawAuth;
    }
    list.push(item);
  }
  return list;
}

/**
 * 新增或更新单个前置代理节点（写入 PROXY_Nodes）
 * 若编辑已有节点时 auth 留空，自动保留原表中的密码，避免前端因不回显密码而覆盖为空
 */
function saveProxyNode_(node) {
  if (!node || typeof node !== 'object') throw new Error('节点参数无效');
  var sh = getSheet_(PROXY_NODES_SHEET_NAME, PROXY_NODES_HEADERS);
  var id = String(node.id || '').trim() || ('pnode_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000));
  var name = String(node.name || '').trim();
  var server = String(node.server || '').trim();
  if (!name) throw new Error('请填写节点显示名');
  if (!server) throw new Error('请填写节点 server 地址');
  var port = parseInt(node.port, 10);
  if (isNaN(port) || port <= 0) port = 443;
  var sni = String(node.sni || '').trim();
  var insecure = toBool_(node.insecure, true);
  var online = toBool_(node.online !== undefined ? node.online : node.enabled, true);
  var incomingAuth = node.auth !== undefined && node.auth !== null ? String(node.auth) : '';
  var now = nowStr();

  var last = sh.getLastRow();
  var foundRow = -1;
  var existingAuth = '';
  if (last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, 5).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === id) {
        foundRow = i + 2;
        existingAuth = String(rows[i][4] || '');
        break;
      }
    }
  }

  var finalAuth = incomingAuth !== '' ? incomingAuth : existingAuth;
  var rowValues = [id, name, server, port, finalAuth, sni, insecure, online, now];

  if (foundRow > 0) {
    sh.getRange(foundRow, 1, 1, PROXY_NODES_HEADERS.length).setValues([rowValues]);
  } else {
    sh.appendRow(rowValues);
  }

  return {
    id: id,
    name: name,
    server: server,
    port: port,
    hasAuth: Boolean(finalAuth),
    sni: sni,
    insecure: insecure,
    online: online,
    updatedAt: now
  };
}

function deleteProxyNode_(id) {
  var targetId = String(id || '').trim();
  if (!targetId) throw new Error('缺少节点 ID');
  var sh = getSheet_(PROXY_NODES_SHEET_NAME, PROXY_NODES_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0] || '').trim() === targetId) {
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function toggleProxyNodeOnline_(id, online) {
  var targetId = String(id || '').trim();
  if (!targetId) throw new Error('缺少节点 ID');
  var sh = getSheet_(PROXY_NODES_SHEET_NAME, PROXY_NODES_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('未找到该节点');
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var flag = toBool_(online, true);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === targetId) {
      sh.getRange(i + 2, 8).setValue(flag);
      sh.getRange(i + 2, 9).setValue(nowStr());
      return true;
    }
  }
  throw new Error('未找到该节点');
}

/**
 * 供 GitHub Actions 探测脚本调用：
 * 返回当前配置的间隔分钟数、上次探测时间、是否已满间隔需执行探测，以及所有已上线节点配置
 */
function getProbeTask_(forceRun) {
  var intervalMin = getProbeIntervalMin();
  var state = getProbeResult();
  var lastCheckedAt = String(state.checkedAt || state.updatedAt || '').trim();
  var lastMs = parseChinaTimeMs_(lastCheckedAt);
  var nowMs = new Date().getTime();
  var elapsedMin = lastMs > 0 ? Math.max(0, Math.floor((nowMs - lastMs) / 60000)) : 999999;
  var shouldRun = Boolean(forceRun) || (lastMs <= 0) || (elapsedMin >= intervalMin);
  var allNodes = readProxyNodes_(true);
  var onlineNodes = [];
  for (var i = 0; i < allNodes.length; i++) {
    var n = allNodes[i];
    if (n.online !== false && n.server && n.port) {
      onlineNodes.push({
        id: n.id,
        name: n.name,
        type: 'hysteria2',
        server: n.server,
        port: n.port,
        auth: n.auth || '',
        sni: n.sni || '',
        insecure: n.insecure !== false
      });
    }
  }
  return {
    ok: true,
    probeIntervalMin: intervalMin,
    lastCheckedAt: lastCheckedAt,
    elapsedMin: lastMs > 0 ? elapsedMin : null,
    shouldRun: shouldRun,
    nodes: onlineNodes
  };
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
  // 图片直接使用 googleusercontent 直链（支持 <img> 直接渲染与 CORS 跨域 OCR，无 303 CORP 拦截）
  // 音频/视频用 export=download（小文件可直接 <audio>/<video> 播放）
  return (kind === 'audio' || kind === 'video')
    ? 'https://drive.google.com/uc?export=download&id=' + id
    : 'https://lh3.googleusercontent.com/d/' + id;
}

function normalizeDriveImgUrl_(url) {
  if (!url) return '';
  var s = String(url).trim();
  var m = /[?&]id=([a-zA-Z0-9_-]{10,})/.exec(s) || /\/file\/d\/([a-zA-Z0-9_-]{10,})/.exec(s);
  if (m && m[1]) return 'https://lh3.googleusercontent.com/d/' + m[1];
  return s;
}

/* ====================== 扫码收件箱（手机上传） ====================== */

function handleInboxSubmit(data) {
  var sh = getSheet_(INBOX_SHEET_NAME, INBOX_HEADERS);
  var id = 'm' + new Date().getTime() + Math.floor(Math.random() * 1000);
  var hasImg = Boolean(data.base64);
  var type = hasImg ? 'image' : 'text';
  var imgUrl = '', imgName = '';
  if (hasImg) {
    var f = handleUpload_({
      base64: data.base64,
      mimeType: data.mimeType || 'image/jpeg',
      fileName: data.fileName || ('inbox_' + id + '.jpg'),
      kind: 'image'
    });
    imgUrl = f.url;
    imgName = f.name;
  }
  var now = nowStr();
  var textVal = data.text ? String(data.text) : '';
  sh.appendRow([id, now, data.room, type, textVal, imgUrl, imgName, '', data.ua || '']);
  return { id: id, type: type, time: now, text: textVal, imgUrl: imgUrl, imgName: imgName };
}

function readInbox(room) {
  var sh = getSheet_(INBOX_SHEET_NAME, INBOX_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - INBOX_LIMIT + 1);
  var rows = sh.getRange(start, 1, last - start + 1, INBOX_HEADERS.length).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (room && r[2] !== room) continue;
    list.push({
      id: r[0],
      time: formatCellTime_(r[1]),
      room: r[2],
      type: r[3],
      text: r[4] !== undefined && r[4] !== null ? String(r[4]) : '',
      imgUrl: normalizeDriveImgUrl_(r[5]),
      imgName: r[6],
      ocrText: r[7] !== undefined && r[7] !== null ? String(r[7]) : ''
    });
  }
  return list.reverse(); // 最新在前
}

function updateInboxOcr(id, ocrText) {
  if (!id) return;
  var sh = getSheet_(INBOX_SHEET_NAME, INBOX_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) { sh.getRange(i + 2, 8).setValue(String(ocrText || '').slice(0, 5000)); break; }
  }
}

function getInboxPageHtml(room) {
  var ROOM = JSON.stringify(room || INBOX_ROOM);
  var serviceUrl = '';
  try { serviceUrl = ScriptApp.getService().getUrl(); } catch (e) { serviceUrl = ''; }
  var BASE_JSON = JSON.stringify(serviceUrl || 'https://script.google.com/macros/s/AKfycbx-1u4836W99nFQxVkhbDKdc9uBnZEBWtI88m6PwhoTiAtkM4QdPFXmu8YMr_2SdYhvDg/exec');
  var h = [];
  h.push('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">');
  h.push('<title>内容上传</title>');
  h.push('<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;min-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px 16px 12px}.wrap{width:100%;max-width:520px;margin:0 auto}h2{margin:8px 0 4px;font-size:20px}.sub{color:#8b949e;font-size:13.5px;margin:0 0 16px}.card{background:#161b22;border:1px solid #30363d;border-radius:14px;padding:12px}textarea{width:100%;min-height:130px;background:transparent;border:0;color:#e6edf3;padding:4px 2px;font-size:16px;resize:vertical;outline:none;font-family:inherit}.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #21262d}.file{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px dashed #388bfd;border-radius:10px;color:#58a6ff;background:#0d1a2e;font-size:14px;font-weight:600;cursor:pointer}#img{display:none}#preview{font-size:12.5px;color:#8b949e;margin-top:8px}button{flex:1;max-width:180px;padding:11px 18px;border:0;border-radius:10px;background:#238636;color:#fff;font-size:15.5px;font-weight:700;cursor:pointer}button:disabled{opacity:.6}.msg{margin-top:14px;font-size:14px;min-height:20px;font-weight:600}.msg.ok{color:#3fb950}.msg.err{color:#f85149}.foot{width:100%;max-width:520px;margin:24px auto 0;text-align:right}.foot a{font-size:11px;color:#6e7681;opacity:.45;text-decoration:none}</style>');
  h.push('</head><body><div class="wrap">');
  h.push('<h2>📡 扫码传内容</h2><p class="sub">文字与图片可在下方同一窗口直接发送（支持纯文字、纯图片或图文一起发）</p>');
  h.push('<div class="card"><textarea id="txt" placeholder="在此输入文字内容（也可添加下方图片一起发送）…"></textarea>');
  h.push('<div id="preview"></div>');
  h.push('<div class="bar"><label class="file">📎 添加图片<input type="file" id="img" accept="image/*"></label>');
  h.push('<button id="btn" type="button">🚀 发送</button></div></div>');
  h.push('<div id="msg" class="msg"></div>');
  h.push('</div>');
  h.push('<div class="foot"><a href="https://drop.lol" target="_blank" rel="noopener noreferrer">drop.lol</a></div>');
  h.push('<scr' + 'ipt>');
  h.push('var ROOM=' + ROOM + ';');
  h.push('var BASE=' + BASE_JSON + ';');
  h.push('function $(id){return document.getElementById(id);}');
  h.push('function setMsg(t,ok){var m=$("msg");m.textContent=t;m.className="msg "+(ok?"ok":"err");}');
  h.push('function compress(file){return new Promise(function(res){var img=new Image();img.onload=function(){var max=1800,w=img.width,h=img.height;if(w>max||h>max){if(w>=h){h=Math.round(h*max/w);w=max;}else{w=Math.round(w*max/h);h=max;}}var c=document.createElement("canvas");c.width=w;c.height=h;var ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(img,0,0,w,h);res(c.toDataURL("image/jpeg",0.90));};img.src=URL.createObjectURL(file);});}');
  h.push('$("img").onchange=function(){var f=this.files[0];$("preview").textContent=f?("已选图片："+f.name+"（约"+Math.round(f.size/1024)+"KB）"):"";};');
  h.push('$("btn").onclick=async function(){var text=$("txt").value.trim();var file=$("img").files[0];if(!text&&!file){setMsg("请输入文字或添加图片",false);return;}$("btn").disabled=true;var body={action:"INBOX_SUBMIT",room:ROOM,ua:navigator.userAgent,text:text};if(file){setMsg("正在高清处理图片…",true);var d=await compress(file);body.type="image";body.base64=d.split(",")[1];body.mimeType="image/jpeg";body.fileName="inbox.jpg";}else{body.type="text";}setMsg("发送中…",true);if(typeof google!=="undefined"&&google.script&&google.script.run){google.script.run.withSuccessHandler(function(){$("btn").disabled=false;setMsg("✅ 已发送",true);$("txt").value="";$("img").value="";$("preview").textContent="";}).withFailureHandler(function(){$("btn").disabled=false;setMsg("网络不可达，请确认已挂代理后重试",false);}).handleInboxSubmit(body);return;}try{var r=await fetch(BASE,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)});var j=await r.json();if(j.ok){setMsg("✅ 已发送",true);$("txt").value="";$("img").value="";$("preview").textContent="";}else{setMsg("失败："+(j.error||""),false);}}catch(e){setMsg("网络不可达，请确认已挂代理后重试",false);}finally{$("btn").disabled=false;}};');
  h.push('</scr' + 'ipt>');
  h.push('</body></html>');
  return h.join('');
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
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy/MM/dd HH:mm:ss');
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
