#!/usr/bin/env node
/**
 * probe-proxies.mjs —— 前置代理自动探测器（支持 hysteria2 / socks5 / http）
 * GitHub Actions 每 5 分钟在海外 runner 运行：
 *  - hysteria2：用已下载的 hysteria 客户端把节点转为本地 socks5 端口，再用 curl 穿过去访问 ip-api
 *  - socks5/http：直接用 curl -x 走代理访问 ip-api
 *  up(拿到出口IP) / down(超时失败) -> POST 写回 Apps Script (PROBE_RESULT)
 * 依赖：node20 内置 fetch、runner 自带 curl、workflow 已下载的 ./hysteria 二进制
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const execFileP = promisify(execFile);

const API_URL = (process.env.PROBE_API_URL || '').trim();
const TOKEN = process.env.PROBE_TOKEN || '';
const RAW_LIST = process.env.PROXY_LIST || '';
const HY_BIN = process.env.HYSTERIA_BIN || './hysteria';
const BASE_PORT = 11000;

if (!API_URL) { console.error('缺少环境变量 PROBE_API_URL'); process.exit(1); }
if (!TOKEN) { console.error('缺少环境变量 PROBE_TOKEN'); process.exit(1); }
if (!RAW_LIST) { console.error('缺少环境变量 PROXY_LIST'); process.exit(1); }

let targets = [];
try { targets = JSON.parse(RAW_LIST); }
catch (e) { console.error('PROXY_LIST 不是合法 JSON：', e.message); process.exit(1); }
if (!Array.isArray(targets) || targets.length === 0) { console.error('PROXY_LIST 为空'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function nowCST() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
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
  base.error = (j && j.message) || '回显服务返回失败';
  return false;
}

function errFromCatch(e, fallback) {
  const s = (e.stderr || e.message || '').toString();
  const line = s.split('\n').map(x => x.trim()).filter(Boolean).pop();
  return String(line || fallback).slice(0, 160);
}

// 直连 socks5/http（传统）
async function probeClassic(t, checkedAt) {
  const type = t.type === 'http' ? 'http' : 'socks5';
  const base = {
    id: t.id || t.name, name: t.name || t.id, type,
    host: t.host || '', port: t.port || '',
    exitIp: '', country: '', region: '', city: '', isp: '',
    latencyMs: 0, status: 'down', error: '', checkedAt
  };
  if (!t.host || !t.port) { base.error = '配置缺少 host/port'; return base; }
  const proxyUrl = type === 'http' ? `http://${t.host}:${t.port}` : `socks5h://${t.host}:${t.port}`;
  const args = ['-s', '-S', '--max-time', '8', '-x', proxyUrl, IP_API];
  if (t.username || t.password) {
    args.splice(2, 0, '--proxy-user', `${t.username || ''}:${t.password || ''}`);
  }
  const started = Date.now();
  try {
    const { stdout } = await execFileP('curl', args, { timeout: 10000, maxBuffer: 1 << 20 });
    base.latencyMs = Date.now() - started;
    fillResultFromIp(base, stdout);
  } catch (e) {
    base.latencyMs = Date.now() - started;
    base.error = errFromCatch(e, '连接超时或不可达');
  }
  return base;
}

// 通过 hysteria 客户端把节点转成本地 socks5，再 curl
async function probeHysteria2(t, idx, checkedAt) {
  const port = BASE_PORT + idx;
  const base = {
    id: t.id || t.name, name: t.name || t.id, type: 'hysteria2',
    host: t.server || '', port: t.port || 443,
    exitIp: '', country: '', region: '', city: '', isp: '',
    latencyMs: 0, status: 'down', error: '', checkedAt
  };
  if (!t.server || !t.port) { base.error = '配置缺少 server/port'; return base; }

  const cfgPath = path.join(os.tmpdir(), `hy-${idx}-${Date.now()}.yaml`);
  // 用 YAML（官方格式），所有字符串值双引号包裹并转义，避免密码中的 + / 等字符破坏配置
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
  fs.writeFileSync(cfgPath, cfgYaml);

  let child = null;
  let exitedCode = null;
  const started = Date.now();
  try {
    child = spawn(HY_BIN, ['client', '-c', cfgPath, '--log-level', 'error'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.on('exit', (code) => { exitedCode = code; });
    child.on('error', () => { exitedCode = 'spawn-fail'; });

    await sleep(4000); // 等待拨号与本地 socks5 起来

    try {
      const { stdout } = await execFileP('curl', [
        '-s', '-S', '--max-time', '10',
        '--socks5-hostname', `127.0.0.1:${port}`,
        IP_API
      ], { timeout: 12000, maxBuffer: 1 << 20 });
      base.latencyMs = Date.now() - started;
      fillResultFromIp(base, stdout);
    } catch (e) {
      base.latencyMs = Date.now() - started;
      if (exitedCode === 'spawn-fail') {
        base.error = 'hysteria 二进制无法启动，请确认 workflow 已下载';
      } else if (exitedCode !== null && exitedCode !== 0) {
        base.error = `hysteria 客户端退出(code=${exitedCode})，疑似节点失效或密码错误`;
      } else {
        base.error = errFromCatch(e, '走代理访问超时或不可达');
      }
    }
  } catch (e) {
    base.error = String('启动失败：' + (e.message || e)).slice(0, 160);
  } finally {
    try { if (child && child.exitCode === null && !child.killed) child.kill('SIGKILL'); } catch {}
    await sleep(300);
    try { fs.rmSync(cfgPath, { force: true }); } catch {}
  }
  return base;
}

async function main() {
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
    console.log(`[${r.status.toUpperCase()}] ${r.name}${r.status === 'up' ? ' (' + r.country + ' ' + r.city + ' ' + r.latencyMs + 'ms)' : ' - ' + r.error}`);
  }
  console.log(`探测完成：${results.filter(r => r.status === 'up').length}/${results.length} 可用`);

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'PROBE_RESULT', token: TOKEN, checkedAt, results })
  });
  const body = await resp.json();
  if (!body || body.ok !== true) throw new Error('写回后台失败：' + JSON.stringify(body));
  console.log('结果已写回 Google 后台');
}
main().catch((e) => { console.error('探测器运行失败：', e); process.exit(1); });
