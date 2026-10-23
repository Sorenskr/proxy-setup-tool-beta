/* ============================================================
 * content.js —— 站点内容远程配置中心
 * 从 Google Apps Script 拉取后台配置（WiFi 卡片 / 音乐 / 背景 / 教程）
 * 拉取失败时自动回退到本地硬编码默认值 + localStorage 缓存
 * ============================================================ */
(function () {
    const CACHE_KEY = 'mnContentCache';
    const LOCAL_KEY = 'mnContentLocal'; // 未部署云端时的本机保存兜底

    window.hasCloudApi = function () {
        try { return typeof REPORT_API_URL !== 'undefined' && !!String(REPORT_API_URL).trim(); }
        catch (e) { return false; }
    };

    function localOverride() {
        try {
            const s = localStorage.getItem(LOCAL_KEY);
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    window.SiteContent = { loaded: false, data: null, remote: false };

    function apiUrl(extra) {
        const base = (typeof REPORT_API_URL !== 'undefined' ? REPORT_API_URL : '').trim();
        if (!base) return '';
        return base + (extra || '');
    }

    function normalizeCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map(c => Object.assign({}, c, { visible: c ? c.visible !== false : true }));
    }

    function normalizeProxyCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const statusOverride = (o.statusOverride === 'up' || o.statusOverride === 'down') ? o.statusOverride : 'auto';
            return {
                id: String(o.id || ('proxy_' + (idx + 1))).trim(),
                name: String(o.name || '').trim(),
                qrMode: o.qrMode === 'link' ? 'link' : 'image',
                imgPath: String(o.imgPath || '').trim(),
                proxyUrl: String(o.proxyUrl || '').trim(),
                visible: o.visible !== false,
                firstOnlineAt: String(o.firstOnlineAt || '2026/10/22 10:00:00').trim(),
                statusOverride: statusOverride,
                manualOverride: statusOverride !== 'auto' || Boolean(o.manualOverride),
                manualDownAt: String(o.manualDownAt || '').trim(),
                manualNote: String(o.manualNote || '').trim()
            };
        });
    }
    window.normalizeProxyCards = normalizeProxyCards;

    const DEFAULT_NET_TEST_LIST = [
        { id: 'net_dnsleak', name: 'DNSLeakTest', url: 'dnsleaktest.com', desc: '测 IP DNS 泄漏', visible: true },
        { id: 'net_whoer',   name: 'Whoer',       url: 'whoer.com',       desc: '综合匿名度评分，看 IP 干不干净、WebRTC/DNS 泄不泄漏', visible: true },
        { id: 'net_ping0',   name: 'Ping0',       url: 'ping0.cc',        desc: '测 IP 纯净度/风险分', visible: true },
        { id: 'net_ipinfo',  name: 'IPinfo',      url: 'ipinfo.io',       desc: '查 IP 地理位置、ASN、时区、运营商', visible: true }
    ];

    function normalizeNetTestCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            return {
                id: String(o.id || ('net_' + (idx + 1))).trim(),
                name: String(o.name || '').trim(),
                url: String(o.url || '').trim(),
                desc: String(o.desc || '').trim(),
                visible: o.visible !== false
            };
        });
    }
    window.normalizeNetTestCards = normalizeNetTestCards;
    window.netTestList = normalizeNetTestCards(DEFAULT_NET_TEST_LIST);

    /** 以 main.js 中的硬编码数据作为默认值，保证未配置后台时功能不变 */
    function defaultContent() {
        return {
            version: 1,
            wifiTitle: '📶 代理 & WiFi',
            wifiTip: '💡 点击基础网络卡片可一键下发一键配置',
            baseWifiCards: normalizeCards((typeof baseWifiCards !== 'undefined' ? baseWifiCards : []).map(c => {
                const o = Object.assign({}, c);
                // @Ads 默认带图片教程（后台可改/可删）
                if (o.id === 'ads') {
                    o.helpType = o.helpType || 'image';
                    o.helpImg = o.helpImg || 'images/@Ads tutorial.jpg';
                }
                return o;
            })),
            proxyList: normalizeProxyCards(typeof proxyList !== 'undefined' ? proxyList : []),
            companyWifiList: normalizeCards(typeof companyWifiList !== 'undefined' ? companyWifiList : []),
            companyWifiDefault: {
                ssid: '',
                pwd: ''
            },
            netTestTip: '依次点击查看 IP 是否为获取的代理 IP 地址，建议纯净度≥90% 再打开社媒 App',
            netTestList: normalizeNetTestCards(DEFAULT_NET_TEST_LIST),
            music: (typeof musicFiles !== 'undefined' ? musicFiles : []).map(n => ({
                name: String(n).replace(/\.[^/.]+$/, ''),
                url: 'music/' + n
            })),
            musicEnabled: true,
            background: {
                mode: 'auto',
                dayUrl: '',
                nightUrl: '',
                particles: true,
                videoEnabled: false,
                dayVideoUrl: '',
                nightVideoUrl: ''
            },
            effects: { pwdFx: 'default', cardHover: true },
            guideHtml: (typeof guideTemplateHTML !== 'undefined' ? guideTemplateHTML : '')
        };
    }

    function merge(defaults, remote) {
        const out = Object.assign({}, defaults);
        if (!remote || typeof remote !== 'object') return out;
        ['baseWifiCards', 'companyWifiList'].forEach(k => {
            if (Array.isArray(remote[k])) out[k] = normalizeCards(remote[k]);
        });
        if (Array.isArray(remote.proxyList)) out.proxyList = normalizeProxyCards(remote.proxyList);
        if (Array.isArray(remote.netTestList)) out.netTestList = normalizeNetTestCards(remote.netTestList);
        if (remote.companyWifiDefault && typeof remote.companyWifiDefault === 'object') {
            out.companyWifiDefault = {
                ssid: String(remote.companyWifiDefault.ssid || ''),
                pwd: String(remote.companyWifiDefault.pwd || '')
            };
        }
        if (Array.isArray(remote.music)) out.music = remote.music;
        ['wifiTitle', 'wifiTip', 'netTestTip'].forEach(k => {
            if (typeof remote[k] === 'string') out[k] = remote[k];
        });
        if (typeof remote.musicEnabled === 'boolean') out.musicEnabled = remote.musicEnabled;
        if (remote.background && typeof remote.background === 'object') {
            out.background = Object.assign({}, defaults.background, remote.background);
            out.background.videoEnabled = !!out.background.videoEnabled;
            out.background.dayVideoUrl = String(out.background.dayVideoUrl || '');
            out.background.nightVideoUrl = String(out.background.nightVideoUrl || '');
        }
        if (remote.effects && typeof remote.effects === 'object') {
            out.effects = Object.assign({}, defaults.effects, remote.effects);
        }
        if (typeof remote.guideHtml === 'string' && remote.guideHtml.trim()) out.guideHtml = remote.guideHtml;
        return out;
    }

    window.getSiteContent = function () {
        return window.SiteContent.data || defaultContent();
    };

    /* ---------------- 动态视频背景与声音控制 ---------------- */
    const BG_VIDEO_MUTE_KEY = 'bgVideoMuted';

    window.isBgVideoMuted = function () {
        try {
            const v = localStorage.getItem(BG_VIDEO_MUTE_KEY);
            // 默认静音：未设置或不为 'false' 时均静音
            return v !== 'false';
        } catch (e) {
            return true;
        }
    };

    window.updateBgVideoMuteBtn = function () {
        const btn = document.getElementById('bgVideoMuteBtn');
        const video = document.getElementById('bgVideo');
        const muted = window.isBgVideoMuted();
        if (video) {
            video.muted = muted;
            if (muted) video.setAttribute('muted', '');
            else video.removeAttribute('muted');
        }
        if (btn) {
            btn.textContent = muted ? '🔇' : '🔊';
            btn.title = muted ? '当前静音（点击开启背景视频声音）' : '当前有声（点击静音背景视频）';
            btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
            btn.classList.toggle('is-unmuted', !muted);
        }
    };

    window.toggleBgVideoSound = function () {
        const nextMuted = !window.isBgVideoMuted();
        try {
            localStorage.setItem(BG_VIDEO_MUTE_KEY, nextMuted ? 'true' : 'false');
        } catch (e) {}
        window.updateBgVideoMuteBtn();
        const video = document.getElementById('bgVideo');
        if (video && video.getAttribute('src') && video.style.display !== 'none') {
            video.muted = nextMuted;
            try {
                const p = video.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (e) {}
        }
        if (typeof showToast === 'function') {
            showToast(nextMuted ? '🔇 背景视频已静音' : '🔊 背景视频声音已开启');
        }
    };

    window.fallbackBgVideo = function () {
        const video = document.getElementById('bgVideo');
        if (!video) return;
        try { video.pause(); } catch (e) {}
        video.classList.remove('is-active');
        video.style.display = 'none';
        video.removeAttribute('src');
        video.dataset.currentUrl = '';
    };

    window.applyBgVideo = function () {
        const video = document.getElementById('bgVideo');
        window.updateBgVideoMuteBtn();
        if (!video) return;

        // 绑定一次性错误兜底监听
        if (!video.dataset.boundEvents) {
            video.dataset.boundEvents = '1';
            video.addEventListener('error', () => window.fallbackBgVideo());
            video.addEventListener('loadeddata', () => {
                if (video.getAttribute('src')) video.classList.add('is-active');
            });
        }

        const bg = window.BG_CONFIG || (window.SiteContent.data && window.SiteContent.data.background) || {};
        if (!bg.videoEnabled) {
            window.fallbackBgVideo();
            return;
        }

        const isNight = document.body.classList.contains('dark-mode') || !!window.isNightMode;
        const targetUrl = String(isNight ? (bg.nightVideoUrl || '') : (bg.dayVideoUrl || '')).trim();
        if (!targetUrl) {
            window.fallbackBgVideo();
            return;
        }

        const muted = window.isBgVideoMuted();
        video.muted = muted;
        if (muted) video.setAttribute('muted', '');
        else video.removeAttribute('muted');

        if (video.dataset.currentUrl !== targetUrl || video.getAttribute('src') !== targetUrl) {
            video.dataset.currentUrl = targetUrl;
            video.src = targetUrl;
        }
        video.style.display = 'block';
        video.classList.add('is-active');

        try {
            const p = video.play();
            if (p && typeof p.then === 'function') {
                p.catch(() => {
                    // 若因有声自动播放被浏览器策略拦截，降级为静音自动播放；仍失败则隐藏回退原背景
                    if (!video.muted) {
                        video.muted = true;
                        video.setAttribute('muted', '');
                        try {
                            const retry = video.play();
                            if (retry && typeof retry.catch === 'function') {
                                retry.catch(() => window.fallbackBgVideo());
                            }
                        } catch (e2) {
                            window.fallbackBgVideo();
                        }
                    } else {
                        window.fallbackBgVideo();
                    }
                });
            }
        } catch (e) {
            window.fallbackBgVideo();
        }
    };

    /** 把远程内容写回运行时的全局变量并触发重绘 */
    window.applySiteContent = function () {
        const d = window.SiteContent.data;
        if (!d) return;

        if (Array.isArray(d.baseWifiCards)) {
            d.baseWifiCards = normalizeCards(d.baseWifiCards);
            baseWifiCards = d.baseWifiCards;
            try {
                const visibleIds = d.baseWifiCards.filter(c => c && c.visible !== false).map(c => c.id);
                localStorage.setItem('cfgShowWifiCards', visibleIds.join(','));
            } catch (e) {}
        }
        if (Array.isArray(d.proxyList)) {
            d.proxyList = normalizeProxyCards(d.proxyList);
            proxyList = d.proxyList;
        }
        if (Array.isArray(d.companyWifiList)) {
            d.companyWifiList = normalizeCards(d.companyWifiList);
            companyWifiList = d.companyWifiList;
        }
        if (Array.isArray(d.netTestList)) {
            d.netTestList = normalizeNetTestCards(d.netTestList);
            window.netTestList = d.netTestList;
        }
        if (!d.companyWifiDefault || typeof d.companyWifiDefault !== 'object') {
            d.companyWifiDefault = { ssid: '', pwd: '' };
        }

        window.BG_CONFIG = Object.assign(
            { mode: 'auto', dayUrl: '', nightUrl: '', particles: true, videoEnabled: false, dayVideoUrl: '', nightVideoUrl: '' },
            d.background || {}
        );
        window.applyBgVideo();

        // 版面文案（后台可改）
        const titleEl = document.getElementById('wifiSectionTitle');
        if (titleEl && typeof d.wifiTitle === 'string' && d.wifiTitle.trim()) titleEl.textContent = d.wifiTitle;
        const tipEl = document.getElementById('wifiSectionTip');
        if (tipEl && typeof d.wifiTip === 'string') {
            tipEl.textContent = d.wifiTip;
            tipEl.style.display = d.wifiTip.trim() ? '' : 'none';
        }
        const netTestTipEl = document.getElementById('netTestTipText');
        if (netTestTipEl && typeof d.netTestTip === 'string') {
            netTestTipEl.textContent = d.netTestTip;
            netTestTipEl.style.display = d.netTestTip.trim() ? '' : 'none';
        }

        // 卡片动效开关
        const fx = d.effects || {};
        document.body.classList.toggle('pwd-fx-all', fx.pwdFx === 'all');
        document.body.classList.toggle('pwd-fx-none', fx.pwdFx === 'none');
        document.body.classList.toggle('no-card-hover', fx.cardHover === false);

        const guideBox = document.getElementById('guideContentContainer');
        if (guideBox && d.guideHtml) {
            guideBox.innerHTML = window.renderGuideContent
                ? window.renderGuideContent(d.guideHtml)
                : d.guideHtml;
        }

        const player = document.querySelector('.music-player-widget');
        if (player) player.style.display = d.musicEnabled === false ? 'none' : '';

        if (typeof renderStaticCards === 'function') renderStaticCards();
        if (typeof window.syncCompanyWifiDefaults === 'function') window.syncCompanyWifiDefaults();
        if (typeof window.renderNetTestCards === 'function') window.renderNetTestCards();
        if (typeof applyWifiLayoutConfig === 'function') applyWifiLayoutConfig();
        if (typeof window.createParticles === 'function') window.createParticles();
        if (typeof loadTrack === 'function') loadTrack(0);

        // 后台管理台已打开且本地没有未保存修改时，同步刷新为最新远程内容
        const cmsBox = document.getElementById('cmsContainer');
        if (cmsBox && cmsBox.innerHTML.trim() && typeof renderCmsPanel === 'function' && cmsDirty === false) {
            cmsState = JSON.parse(JSON.stringify(d));
            renderCmsPanel();
        }
    };

    function load() {
        const url = apiUrl('?action=content&t=' + Date.now());
        const done = () => { window.SiteContent.loaded = true; window.applySiteContent(); };

        // 先应用本地已保存或缓存的内容，避免首屏闪烁
        const initialLoc = localOverride();
        if (initialLoc) {
            window.SiteContent.data = merge(defaultContent(), initialLoc);
            window.applySiteContent();
        } else {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    window.SiteContent.data = merge(defaultContent(), JSON.parse(cached));
                    window.applySiteContent();
                }
            } catch (e) {}
        }

        if (!url) {
            if (!window.SiteContent.data) window.SiteContent.data = defaultContent();
            done();
            return Promise.resolve();
        }

        return fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(j => {
                const remote = j && j.ok && j.content ? j.content : null;
                const loc = localOverride();
                if (loc) {
                    // 本机有尚未同步到云端或本机保存的内容时，优先保持本机保存结果
                    window.SiteContent.data = merge(defaultContent(), loc);
                    window.SiteContent.remote = !!(remote && Object.keys(remote).length > 0);
                } else if (remote && Object.keys(remote).length > 0) {
                    // 云端有内容：以云端为准
                    window.SiteContent.data = merge(defaultContent(), remote);
                    window.SiteContent.remote = true;
                } else {
                    window.SiteContent.data = merge(defaultContent(), remote);
                    window.SiteContent.remote = false;
                }
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(window.SiteContent.data)); } catch (e) {}
                done();
            })
            .catch(() => {
                const loc = localOverride();
                if (loc) {
                    window.SiteContent.data = merge(defaultContent(), loc);
                } else {
                    try {
                        const cached = localStorage.getItem(CACHE_KEY);
                        if (cached) window.SiteContent.data = merge(defaultContent(), JSON.parse(cached));
                    } catch (e) {}
                    if (!window.SiteContent.data) window.SiteContent.data = defaultContent();
                }
                done();
            });
    }

    /** 统一的上报通道：readResponse=true 时读取 JSON 返回（后台管理用） */
    window.postToApi = function (payload, readResponse) {
        const url = apiUrl('');
        if (!url) return Promise.reject(new Error('未配置 REPORT_API_URL'));
        return fetch(url, {
            method: 'POST',
            mode: readResponse ? 'cors' : 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }).then(r => (readResponse ? r.json() : { ok: true }));
    };

    /* ---------------- 前置代理自动探测状态加载器与判定 ---------------- */
    const PROBE_CACHE_KEY = 'mnProbeStateCache';

    function loadCachedProbeState() {
        try {
            const raw = localStorage.getItem(PROBE_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.items) {
                    return { updatedAt: parsed.updatedAt || '', items: parsed.items || {} };
                }
            }
        } catch (e) {}
        return { updatedAt: '', items: {} };
    }

    window.probeState = loadCachedProbeState();

    function normalizeProbePayload(probeObj) {
        const out = { updatedAt: '', items: {} };
        if (!probeObj || typeof probeObj !== 'object') return out;
        out.updatedAt = String(probeObj.updatedAt || probeObj.checkedAt || '');
        if (probeObj.items && typeof probeObj.items === 'object') {
            Object.keys(probeObj.items).forEach(k => {
                const rec = probeObj.items[k];
                if (!rec || typeof rec !== 'object') return;
                out.items[k] = rec;
                if (rec.id) out.items[rec.id] = rec;
                if (rec.name) out.items[rec.name] = rec;
            });
        }
        if (Array.isArray(probeObj.results)) {
            probeObj.results.forEach(r => {
                if (!r || typeof r !== 'object') return;
                const id = r.id || r.name;
                if (!id) return;
                const prevItem = out.items[id] || {};
                const merged = Object.assign({
                    id: id,
                    name: r.name || id,
                    type: r.type || 'hysteria2',
                    status: r.status === 'up' ? 'up' : 'down',
                    exitIp: r.exitIp || '',
                    country: r.country || '',
                    region: r.regionName || r.region || '',
                    city: r.city || '',
                    isp: r.isp || '',
                    latencyMs: r.latencyMs || 0,
                    timeTotal: r.timeTotal || 0,
                    quality: r.quality || '',
                    googleOk: r.googleOk,
                    igOk: r.igOk,
                    failCount: r.failCount || 0,
                    lastCheckedAt: r.checkedAt || r.lastCheckedAt || out.updatedAt,
                    firstOnlineAt: r.firstOnlineAt || '',
                    lastUpAt: r.status === 'up' ? (r.checkedAt || out.updatedAt) : '',
                    downSince: r.status !== 'up' ? (r.downSince || r.checkedAt || out.updatedAt) : ''
                }, prevItem, {
                    timeTotal: r.timeTotal !== undefined ? r.timeTotal : prevItem.timeTotal,
                    quality: r.quality || prevItem.quality || '',
                    googleOk: r.googleOk !== undefined ? r.googleOk : prevItem.googleOk,
                    igOk: r.igOk !== undefined ? r.igOk : prevItem.igOk,
                    failCount: r.failCount !== undefined ? r.failCount : (prevItem.failCount || 0)
                });
                out.items[id] = merged;
                if (r.name) out.items[r.name] = merged;
            });
        }
        return out;
    }

    /** 解析探测时间字符串，返回 { ms, hhmm, elapsedMin, isExpired } */
    function parseProbeTimeInfo(timeStr) {
        if (!timeStr) return { ms: NaN, hhmm: '', elapsedMin: Infinity, isExpired: false };
        const s = String(timeStr).trim();
        if (!s) return { ms: NaN, hhmm: '', elapsedMin: Infinity, isExpired: false };
        let ms = NaN;
        let hhmm = '';
        const m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(s);
        if (m) {
            const hh = String(m[4]).padStart(2, '0');
            const mm = String(m[5]).padStart(2, '0');
            hhmm = `${hh}:${mm}`;
            const iso = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}T${hh}:${mm}:${String(m[6] || '00').padStart(2, '0')}+08:00`;
            ms = Date.parse(iso);
        } else {
            ms = Date.parse(s);
            if (!isNaN(ms)) {
                const bj = new Date(ms + 8 * 3600 * 1000);
                hhmm = `${String(bj.getUTCHours()).padStart(2, '0')}:${String(bj.getUTCMinutes()).padStart(2, '0')}`;
            }
        }
        if (isNaN(ms)) return { ms: NaN, hhmm: '', elapsedMin: Infinity, isExpired: false };
        const elapsedMin = Math.max(0, (Date.now() - ms) / 60000);
        return {
            ms,
            hhmm,
            elapsedMin,
            isExpired: elapsedMin > 30
        };
    }

    /** 将检测时间转为“最近探测于 xx:xx”，超过 30 分钟没更新显示“数据过期” */
    window.formatProbeCheckedAgo = function (timeStr) {
        if (!timeStr) return '';
        const info = parseProbeTimeInfo(timeStr);
        if (isNaN(info.ms)) return String(timeStr).trim();
        if (info.isExpired) {
            return `最近探测于 ${info.hhmm} · 数据过期`;
        }
        return `最近探测于 ${info.hhmm}`;
    };

    /**
     * 独立状态判定函数 getProxyStatus(item)
     * 优先级：
     *  1. 后台手动强制标记优先 (statusOverride / manualOverride: 'up' -> 绿，'down' -> 红+遮罩)
     *  2. 自动模式 ('auto')：
     *     - 无探测记录 -> 'unknown'（灰色"待检测"，无遮罩）
     *     - 超过 30 分钟未更新 -> 'expired'（灰色"数据过期"，无遮罩）
     *     - 30 分钟内有效数据：
     *       * status === 'down' 或 timeTotal > 3s -> 'down'（红点 + 遮罩）
     *       * status === 'up' 且 1.5s <= timeTotal <= 3s -> 'up'，dotState = 'slow'（黄点，卡片显示"较慢"）
     *       * status === 'up' 且 timeTotal < 1.5s -> 'up'，dotState = 'up'（绿点，优质）
     */
    window.getProxyStatus = function (item) {
        const card = item || {};
        const itemsMap = (window.probeState && window.probeState.items) || {};
        const rec = (card.id && itemsMap[card.id]) || (card.name && itemsMap[card.name]) || null;

        const lastCheckedAt = String((rec && rec.lastCheckedAt) || (window.probeState && window.probeState.updatedAt) || '').trim();
        const timeInfo = parseProbeTimeInfo(lastCheckedAt);

        const rawLat = (rec && Number(rec.latencyMs) > 0) ? Number(rec.latencyMs) : 0;
        const latencyMs = rawLat > 4000 ? (rawLat - 4000) : rawLat;
        const timeTotalSec = (rec && Number(rec.timeTotal) > 0)
            ? Number(rec.timeTotal)
            : (latencyMs > 0 ? Number((latencyMs / 1000).toFixed(2)) : 0);

        const manualMode = (card.statusOverride === 'up' || card.statusOverride === 'down')
            ? card.statusOverride
            : ((rec && rec.manualOverride && (rec.manualStatus === 'up' || rec.manualStatus === 'down')) ? rec.manualStatus : 'auto');
        const manualNote = String(card.manualNote || (rec && rec.manualNote) || '').trim();

        let status = 'unknown';
        let dotState = 'unknown'; // 'up' (绿) | 'slow' (黄) | 'down' (红) | 'unknown' (灰)
        let quality = 'unknown';  // 'good' | 'slow' | 'down' | 'expired' | 'unknown'
        let isManual = false;
        let isExpired = false;

        if (manualMode === 'up') {
            status = 'up';
            dotState = 'up';
            quality = 'good';
            isManual = true;
        } else if (manualMode === 'down') {
            status = 'down';
            dotState = 'down';
            quality = 'down';
            isManual = true;
        } else if (!rec || !lastCheckedAt) {
            status = 'unknown';
            dotState = 'unknown';
            quality = 'unknown';
        } else if (timeInfo.isExpired) {
            status = 'expired';
            dotState = 'unknown';
            quality = 'expired';
            isExpired = true;
        } else if (rec.status === 'down' || (timeTotalSec > 3.0)) {
            status = 'down';
            dotState = 'down';
            quality = 'down';
        } else if (rec.status === 'up') {
            status = 'up';
            if (timeTotalSec >= 1.5 || rec.quality === 'slow') {
                dotState = 'slow';
                quality = 'slow';
            } else {
                dotState = 'up';
                quality = 'good';
            }
        }

        const color = dotState === 'up' ? 'green' : (dotState === 'slow' ? 'yellow' : (dotState === 'down' ? 'red' : 'grey'));
        const dotClass = `is-${dotState}`;
        const firstOnlineAt = String(card.firstOnlineAt || (rec && rec.firstOnlineAt) || '').trim();
        const downAt = manualMode === 'down'
            ? String(card.manualDownAt || (rec && rec.downSince) || '').trim()
            : String((rec && rec.downSince) || '').trim();
        const checkedAgoText = lastCheckedAt ? window.formatProbeCheckedAgo(lastCheckedAt) : '';
        const locationText = rec ? [rec.country || '', rec.city || ''].filter(Boolean).join(' ') : '';
        const latencySecText = timeTotalSec > 0 ? `${timeTotalSec.toFixed(2)}s` : '';

        return {
            status,
            dotState,
            quality,
            color,
            dotClass,
            isManual,
            isExpired,
            manualNote,
            probe: rec,
            firstOnlineAt,
            downAt,
            lastCheckedAt,
            checkedAgoText,
            locationText,
            latencyMs,
            timeTotalSec,
            latencySecText
        };
    };

    /** 拉取云端探测状态，每 60 秒轮询，失败自动回退上次缓存且不报错 */
    window.fetchProbeState = function () {
        const url = apiUrl('?action=probe&t=' + Date.now());
        if (!url) {
            if (typeof window.updateProxyCardsInPlace === 'function') window.updateProxyCardsInPlace();
            return Promise.resolve(window.probeState);
        }
        return fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(j => {
                if (j && j.probeIntervalMin) {
                    try { localStorage.setItem('cfgProbeIntervalMin', String(j.probeIntervalMin)); } catch (e) {}
                }
                if (j && j.ok && j.probe && typeof j.probe === 'object') {
                    const normalized = normalizeProbePayload(j.probe);
                    if (Object.keys(normalized.items).length > 0 || normalized.updatedAt) {
                        window.probeState = normalized;
                        try { localStorage.setItem(PROBE_CACHE_KEY, JSON.stringify(window.probeState)); } catch (e) {}
                    }
                }
                if (typeof window.updateProxyCardsInPlace === 'function') {
                    window.updateProxyCardsInPlace();
                } else if (typeof window.renderStaticCards === 'function') {
                    window.renderStaticCards();
                }
                return window.probeState;
            })
            .catch(() => {
                window.probeState = loadCachedProbeState();
                if (typeof window.updateProxyCardsInPlace === 'function') window.updateProxyCardsInPlace();
                return window.probeState;
            });
    };

    // DOMContentLoaded 时启动（保证 main.js 的全局变量已就绪），并每 60 秒同步探测状态与分钟计数
    window.siteContentReady = new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.__IS_INBOX_MOBILE_PAGE__) { resolve(); return; }
            load().then(() => {
                window.fetchProbeState();
                setInterval(() => { window.fetchProbeState(); }, 60 * 1000);
                resolve();
            });
        });
    });
    window.refreshSiteContent = load;
})();
