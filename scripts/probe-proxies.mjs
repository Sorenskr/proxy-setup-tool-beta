#!/usr/bin/env node
/**
 * probe-proxies.mjs —— 前置代理自动探测器
 * GitHub Actions 每 5 分钟在海外 runner 运行：
 *  1. 先请求 Apps Script (GET_PROBE_TASK)：读取后台配置的 probeIntervalMin（默认 15 分钟）、上次探测时间及 PROXY_Nodes 中所有「已上线」节点
 *  2. 若距离上次探测未满 probeIntervalMin 分钟，直接跳过退出，不重复探测
 *  3. 若已满间隔，逐个探测已上线节点并写回 Apps Script (PROBE_RESULT)
 * 安全约束：日志仅打印节点名称与状态，严禁打印任何密码（auth/password）
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const execFileP = promisify(execFile);

const API_URL = (process.env.PROBE_API_URL || '').trim();
const TOKEN = (process.env.PROBE_TOKEN || '').trim();
const FORCE_PROBE = String(process.env.FORCE_PROBE || '').toLowerCase() === 'true';
const HY_BIN = process.env.HYSTERIA_BIN || './hysteria';
const BASE_PORT = 11000;

if (!API_URL) { console.error('缺少环境变量 PROBE_API_URL'); process.exit(1); }
if (!TOKEN) { console.error('缺少环境变量 PROBE_TOKEN'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function nowCST() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function parseChinaTimeMs(str) {
  if (!str) return 0;
  const s = String(str).trim();
  const m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(s);
  if (m) {
    const pad = (n) => String(parseInt(n, 10)).padStart(2, '0');
    const iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5])}:${pad(m[6] || 0)}+08:00`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 0 : ms;
  }
  const d = Date.parse(s);
  return Number.isNaN(d) ? 0 : d;
}

const IP_API = 'http://ip-api.com/json/?lang=zh-CN&fields=status,message,country,regionName,city,isp,query';

function fillResultFromIp(base, stdout) {
  const j = JSON.parse(String(stdout).trim());
  if (j && j.status === 'success') {
    base.status = 'up';
    base.exitIp = j.query || '';
    base.country = j.country || '';
    base.region = j.regionName || '';
    base.city = j.city || '';
    base.isp = j.isp || '';
    return true;
  }
  base.error = '出口回显校验未通过';
  return false;
}

// 直连 socks5/http（传统）
async function probeClassic(t, checkedAt) {
  const type = t.type === 'http' ? 'http' : 'socks5';
  const base = {
    id: t.id || t.name, name: t.name || t.id, type,
    exitIp: '', country: '', region: '', city: '', isp: '',
    latencyMs: 0, status: 'down', error: '', checkedAt
  };
  const host = t.host || t.server || '';
  const port = t.port || '';
  if (!host || !port) { base.error = '配置缺少地址或端口'; return base; }
  const proxyUrl = type === 'http' ? `http://${host}:${port}` : `socks5h://${host}:${port}`;
  const args = ['-s', '-S', '--max-time', '8', '-x', proxyUrl, IP_API];
  if (t.username || t.password) {
    args.splice(2, 0, '--proxy-user', `${t.username || ''}:${t.password || ''}`);
  }
  const started = Date.now();
  try {
    const { stdout } = await execFileP('curl', args, { timeout: 10000, maxBuffer: 1 << 20 });
    base.latencyMs = Date.now() - started;
    fillResultFromIp(base, stdout);
  } catch {
    base.latencyMs = Date.now() - started;
    base.error = '连接超时或不可达';
  }
  return base;
}

// 通过 hysteria 客户端把节点转成本地 socks5，再 curl
async function probeHysteria2(t, idx, checkedAt) {
  const port = BASE_PORT + idx;
  const base = {
    id: t.id || t.name, name: t.name || t.id, type: 'hysteria2',
    exitIp: '', country: '', region: '', city: '', isp: '',
    latencyMs: 0, status: 'down', error: '', checkedAt
  };
  if (!t.server || !t.port) { base.error = '配置缺少 server/port'; return base; }

  const cfgPath = path.join(os.tmpdir(), `hy-${idx}-${Date.now()}.yaml`);
  const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const cfgYaml =
`server: ${q(`${t.server}:${t.port}`)}
auth: ${q(t.auth || '')}
tls:
  sni: ${q(t.sni || '')}
  insecure: ${t.insecure !== false}
socks5:
  listen: ${q(`127.0.0.1:${port}`)}
`;
  fs.writeFileSync(cfgPath, cfgYaml, { mode: 0o600 });

  let child = null;
  let exitedCode = null;
  try {
    child = spawn(HY_BIN, ['client', '-c', cfgPath, '--log-level', 'error'], {
      stdio: ['ignore', 'ignore', 'ignore']
    });
    child.on('exit', (code) => { exitedCode = code; });
    child.on('error', () => { exitedCode = 'spawn-fail'; });

    await sleep(4000); // 等待本地 hysteria 客户端进程就绪，不计入代理网络延迟

    const reqStarted = Date.now();
    try {
      const { stdout } = await execFileP('curl', [
        '-s', '-S', '--max-time', '10',
        '--socks5-hostname', `127.0.0.1:${port}`,
        IP_API
      ], { timeout: 12000, maxBuffer: 1 << 20 });
      base.latencyMs = Date.now() - reqStarted;
      fillResultFromIp(base, stdout);
    } catch {
      base.latencyMs = Date.now() - reqStarted;
      if (exitedCode === 'spawn-fail') {
        base.error = 'hysteria 客户端未就绪';
      } else if (exitedCode !== null && exitedCode !== 0) {
        base.error = '节点握手失败或已离线';
      } else {
        base.error = '代理链路超时或不可达';
      }
    }
  } catch {
    base.error = '本地客户端启动异常';
  } finally {
    try { if (child && child.exitCode === null && !child.killed) child.kill('SIGKILL'); } catch {}
    await sleep(300);
    try { fs.rmSync(cfgPath, { force: true }); } catch {}
  }
  return base;
}

async function fetchProbeTask() {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'GET_PROBE_TASK', token: TOKEN, force: FORCE_PROBE })
  });
  const j = await resp.json();
  if (!j || j.ok !== true) {
    throw new Error('拉取探测任务失败：' + ((j && j.error) || '未知错误'));
  }
  return j;
}

async function main() {
  const task = await fetchProbeTask();
  const intervalMin = Math.max(1, parseInt(task.probeIntervalMin || 15, 10) || 15);
  const lastCheckedAt = String(task.lastCheckedAt || '').trim();
  const lastMs = parseChinaTimeMs(lastCheckedAt);
  const elapsedMin = lastMs > 0 ? Math.max(0, Math.floor((Date.now() - lastMs) / 60000)) : null;

  if (!FORCE_PROBE && (task.shouldRun === false || (elapsedMin !== null && elapsedMin < intervalMin))) {
    console.log(`[SKIP] 设定探测间隔 ${intervalMin} 分钟，距上次探测（${lastCheckedAt || '无'}）已过 ${elapsedMin ?? 0} 分钟，未满间隔，本次跳过。`);
    return;
  }

  const targets = Array.isArray(task.nodes) ? task.nodes : [];
  if (targets.length === 0) {
    console.log('[SKIP] PROXY_Nodes 中暂无已上线节点，本次跳过。');
    return;
  }

  console.log(`开始探测：共 ${targets.length} 个已上线节点（间隔设定：${intervalMin} 分钟）`);
  const checkedAt = nowCST();
  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const type = String(t.type || '').toLowerCase();
    let r;
    if (type === 'hysteria2' || type === 'hy2' || t.server) {
      r = await probeHysteria2(t, i, checkedAt);
    } else {
      r = await probeClassic(t, checkedAt);
    }
    results.push(r);
    // 安全日志：仅打印节点名称与状态，绝不打印密码或敏感连接串
    console.log(`[${r.status.toUpperCase()}] ${r.name}`);
  }

  console.log(`探测完成：${results.filter(r => r.status === 'up').length}/${results.length} 可用`);

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'PROBE_RESULT', token: TOKEN, checkedAt, results })
  });
  const body = await resp.json();
  if (!body || body.ok !== true) {
    throw new Error('写回后台失败：' + ((body && body.error) || '未知响应'));
  }
  console.log('结果已写回 Google 后台');
}

main().catch((e) => {
  console.error('探测器运行失败：', e && e.message ? e.message : String(e));
  process.exit(1);
});
