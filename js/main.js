// ================== 1. 数据资产运行时容器（严格以后台 SITE_CONTENT 为准，禁止硬编码兜底） ==================
let proxyList = [];
let companyWifiList = [];
let baseWifiCards = [];

window.SiteConfig = window.SiteConfig || {
    cfgDataMode: 'real',
    cfgTotalMode: 'offset',
    cfgTotalOffset: '1240',
    cfgTotalFixed: '8888',
    cfgOnlineFixed: '25',
    cfgShowSoftRouter: 'false',
    cfgShowWifiCards: '',
    probeIntervalMin: 15
};

const REPORT_API_URL = "https://script.google.com/macros/s/AKfycbx-1u4836W99nFQxVkhbDKdc9uBnZEBWtI88m6PwhoTiAtkM4QdPFXmu8YMr_2SdYhvDg/exec".trim();

// 软路由全局密钥：由脚本注入 DOM，避免明文写死在 HTML 源码中
const SOFT_ROUTER_KEY = 'jd66666666';

// 统一的图片降级处理（替代散落在各处的 onerror 内联表达式）
window.imgFallback = function(img) {
    if (!img) return;
    img.style.display = 'none';
    const fallback = img.nextElementSibling;
    if (fallback && fallback.classList.contains('emoji-fallback')) fallback.style.display = 'block';
};

let myTrafficChart = null; 
window.isNightMode = localStorage.getItem('theme') === 'night';
window.lastCalculatedRealOnline = 1;
window.operatorIp = "未知 IP"; 
window.operatorGeo = "未知地区";
window.currentVisitCounted = false; 

window.getChinaTime = function() { return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); };

// 超级智能解析引擎 (兼容中文冒号、空格、换行、多余符号)
function parseProxyString(raw) {
    if (!raw) return null;
    let s = raw.replace(/：/g, ':').replace(/[\s\r\n]+/g, ':');
    s = s.replace(/:+/g, ':').trim();
    if (s.endsWith(':')) s = s.slice(0, -1);
    if (s.startsWith(':')) s = s.substring(1);
    
    let arr = s.split(':');
    if (arr.length >= 4) {
        return {
            ip: arr[0], port: arr[1], user: arr[2], pass: arr[3],
            standardUrl: `${arr[0]}:${arr[1]}:${arr[2]}:${arr[3]}`
        };
    }
    return null;
}

// ================== 2. 系统进程初始化 ==================
document.addEventListener('DOMContentLoaded', () => {
    if (window.__IS_INBOX_MOBILE_PAGE__) return;
    if (typeof window.resizeCanvas === 'function') window.resizeCanvas();
    window.addEventListener('resize', () => { if (typeof window.resizeCanvas === 'function') window.resizeCanvas(); });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            document.getElementById(btn.dataset.tab).classList.add('active');
            document.getElementById('mainWrapper').scrollTop = 0; 
            if(btn.dataset.tab === 'adminPanel') { 
                injectAdminControls();
                if(myTrafficChart) setTimeout(() => myTrafficChart.resize(), 100); 
            }
        }
    });

    const wifiModal = document.getElementById('wifiModal');
    if(wifiModal) wifiModal.addEventListener('click', (e) => { if (e.target === wifiModal) closeWifiModal(); });
    const feedbackModal = document.getElementById('feedbackModal');
    if(feedbackModal) feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeFeedbackModal(); });
    const wifiGuideModal = document.getElementById('wifiGuideModal');
    if(wifiGuideModal) wifiGuideModal.addEventListener('click', (e) => { if (e.target === wifiGuideModal) closeWifiGuideModal(); });
    const cardHelpModal = document.getElementById('cardHelpModal');
    if(cardHelpModal) cardHelpModal.addEventListener('click', (e) => { if (e.target === cardHelpModal) closeCardHelp(); });
    // 让 role="button" 的元素（如唱片封面）支持键盘激活
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
    });
    document.onkeydown = (e) => { if(e.key === 'Escape') { closeWifiModal(); closeFeedbackModal(); closeWifiGuideModal(); closeCardHelp(); } }

    applyTheme();
    // 卡片与配置严格等待 content.js 从后台拉取最新数据后再渲染，不在本地预先渲染硬编码旧卡片
    
    if (typeof window.createParticles === 'function') { window.createParticles(); window.animate(); }
    
    if (localStorage.getItem('keepAdminOpen') === 'true') {
        document.getElementById('adminTabBtn').style.display = "block";
        injectAdminControls();
        setTimeout(() => { document.getElementById('adminTabBtn').click(); }, 50);
    }
    
    silentTrackAccess();
    startOnlineHeartbeat(); 
    refreshAdminLogs(); 
    initMusicPlayer();
});

// ================== 3. UI 渲染与功能杂项 ==================
function toggleTheme() {
    window.isNightMode = !window.isNightMode;
    localStorage.setItem('theme', window.isNightMode ? 'night' : 'day');
    applyTheme();
    if (typeof window.createParticles === 'function') window.createParticles();
    refreshAdminLogs(); 
    showToast(window.isNightMode ? '🌙 切换至深空星系视效' : '☀️ 切换至自然白昼视效');
}

function applyTheme() {
    const btn = document.getElementById('themeBtn');
    if(btn) btn.innerHTML = window.isNightMode ? '☀️ 日间模式' : '🌙 夜间模式';
    if(window.isNightMode) { document.body.classList.remove('light-mode'); document.body.classList.add('dark-mode'); } 
    else { document.body.classList.remove('dark-mode'); document.body.classList.add('light-mode'); }
}

function renderStaticCards() {
    const proxyGrid = document.getElementById('proxyGrid'); const companyGrid = document.getElementById('companyGrid');
    if(proxyGrid) proxyGrid.innerHTML = ''; if(companyGrid) companyGrid.innerHTML = '';
    proxyList.forEach(item => { if(proxyGrid) proxyGrid.innerHTML += `<div class="wifi-card" onclick="openModalWithImage('${item.name}', '${item.imgPath}')"><div class="wifi-qr-box"><img src="${item.imgPath}" class="qr-img" onerror="imgFallback(this)"></div><div class="wifi-card-title">${item.name}</div></div>`; });
    companyWifiList.forEach(item => { if(companyGrid) companyGrid.innerHTML += `<div class="wifi-card" onclick="openModalWithImage('${item.name}', '${item.imgPath}')"><div class="wifi-qr-box"><img src="${item.imgPath}" class="qr-img" onerror="imgFallback(this)"></div><div class="wifi-card-title">${item.name}</div></div>`; });
}

// 动态渲染基础网络卡片与软路由显隐（严格以后台 SITE_CONTENT 的 visible 为准，绝不回退硬编码或 localStorage）
function applyWifiLayoutConfig() {
    const cfg = window.SiteConfig || {};
    const softRouterEl = document.getElementById('softRouterSection');
    const showSoftRouter = String(cfg.cfgShowSoftRouter || 'false') === 'true';
    if (softRouterEl) { softRouterEl.style.display = showSoftRouter ? 'block' : 'none'; }
    const softRouterKeyEl = document.getElementById('softRouterKey');
    if (softRouterKeyEl) softRouterKeyEl.textContent = showSoftRouter ? SOFT_ROUTER_KEY : '';

    const container = document.getElementById('baseWifiContainer');
    if (!container) return;
    container.innerHTML = '';

    const contentData = (window.SiteContent && window.SiteContent.remote && window.SiteContent.data) ? window.SiteContent.data : null;
    const list = (contentData && Array.isArray(contentData.baseWifiCards)) ? contentData.baseWifiCards : [];

    list.forEach((card, idx) => {
        const isVis = typeof window.isCardVisible === 'function' ? window.isCardVisible(card) : (card && card.visible !== false);
        if (!isVis) return;
        const cardEl = document.createElement('div');
        cardEl.className = `compact-card ${card.danger ? 'danger-card' : ''} ${card.fx && card.fx !== 'default' ? 'fx-' + card.fx : ''}`;
        
        cardEl.onclick = () => {
            const useLink = card.qrMode === 'link' || (card.qrMode !== 'image' && card.wifiString);
            if (useLink) {
                const targetWifiStr = card.wifiString || `WIFI:T:WPA;S:${card.name || ''};P:${card.pwd || ''};;`;
                openModalWithWifiQr(card.name, targetWifiStr, card.pwd);
            } else {
                openModalWithImage(card.name, card.img);
            }
        };
        
        let tagHtml = card.tag ? `<div class="card-tag">${card.tag}</div>` : '';
        let nameClass = card.large ? 'card-name card-name-large' : 'card-name';
        let pwdClass = card.danger ? 'card-pwd pulse-blue' : 'card-pwd';

        cardEl.innerHTML = `
            <div class="${nameClass}">${card.name}</div>
            <div class="${pwdClass}">${card.pwd}</div>${tagHtml}
            ${(card.helpType === 'image' && card.helpImg) || (card.helpType === 'text' && card.helpText)
                ? `<button type="button" class="card-help-btn" title="查看使用说明" aria-label="查看使用说明" onclick="event.stopPropagation(); if(typeof openAnyCardHelp==='function'){openAnyCardHelp('baseWifiCards', ${idx});}else{openCardHelp('${card.id}');}">?</button>`
                : ''}
        `;
        container.appendChild(cardEl);
    });
}

// 动态生成原生 WiFi 连接二维码
function openModalWithWifiQr(title, wifiString, pwd) {
    const modal = document.getElementById('wifiModal'); 
    if(!modal) return;
    document.getElementById('modalTitle').innerHTML = `
        <div style="font-weight:700; font-size:16px;">${title}</div>
        <div style="font-size:13px; color:var(--text-muted); margin-top:5px; font-family:Consolas, monospace;">WiFi密码: ${pwd || ''}</div>
    `;
    waitForQRCode(() => {
        QRCode.toDataURL(wifiString, { width: 300, margin: 2 }, (err, url) => {
            if (err) {
                document.getElementById('modalQrBox').innerHTML = '<div style="padding:40px; color:#999;">二维码生成失败</div>';
            } else {
                document.getElementById('modalQrBox').innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
            }
            modal.style.display = 'flex';
        });
    });
}

function openWifiGuideModal() {
    const modal = document.getElementById('wifiGuideModal');
    if(modal) modal.style.display = 'flex';
}
function closeWifiGuideModal() {
    const modal = document.getElementById('wifiGuideModal');
    if(modal) modal.style.display = 'none';
}

// 卡片「?」帮助弹窗：支持图片教程 / 文字教程（文字支持 Markdown）
window.openCardHelp = function (cardId) {
    const card = (baseWifiCards || []).find(c => c.id === cardId);
    if (!card) return;
    if (card.helpType === 'image' && card.helpImg) {
        const modal = document.getElementById('wifiGuideModal');
        const img = document.getElementById('wifiGuideImg');
        if (img) img.src = card.helpImg;
        if (modal) modal.style.display = 'flex';
    } else if (card.helpType === 'text' && card.helpText) {
        const modal = document.getElementById('cardHelpModal');
        const body = document.getElementById('modalTextBody');
        if (body) body.innerHTML = window.renderGuideContent ? window.renderGuideContent(card.helpText) : card.helpText;
        if (modal) modal.style.display = 'flex';
    }
};
window.closeCardHelp = function () {
    const modal = document.getElementById('cardHelpModal');
    if (modal) modal.style.display = 'none';
};

function copyToClipboard(elementId) { const el = document.getElementById(elementId); if (!el || el.innerText.includes('等待')) return showToast('无有效数据可复制'); navigator.clipboard.writeText(el.innerText).then(() => { showToast('✅ 复制成功'); }); }
function showToast(message) { const toast = document.getElementById('toast'); toast.innerText = message; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 1200); }
function openModalWithImage(title, imgSrc) { const modal = document.getElementById('wifiModal'); if(!modal) return; document.getElementById('modalTitle').innerText = title; document.getElementById('modalQrBox').innerHTML = `<img src="${imgSrc}" alt="${title}" onerror="this.style.display='none'">`; modal.style.display = 'flex'; }
function closeWifiModal() { const m = document.getElementById('wifiModal'); if(m) m.style.display = 'none'; }
function openFeedbackModal() { const m = document.getElementById('feedbackModal'); if(m) m.style.display = 'flex'; }
function closeFeedbackModal() { const m = document.getElementById('feedbackModal'); if(m) m.style.display = 'none'; }
function waitForQRCode(callback) { if (window.QRCode) return callback(); setTimeout(() => waitForQRCode(callback), 50); }

function startOnlineHeartbeat() {
    const onlineEl = document.getElementById('onlineCount'); if(!onlineEl) return;
    const runHeartbeat = () => {
        const cfg = window.SiteConfig || {};
        const mode = cfg.cfgDataMode || 'real';
        if (mode === 'custom') { let fixed = parseInt(cfg.cfgOnlineFixed || '25', 10); onlineEl.innerText = fixed + Math.floor(Math.random() * 3); } 
        else { onlineEl.innerText = window.lastCalculatedRealOnline; }
    };
    runHeartbeat(); setInterval(runHeartbeat, 6000); 
}

function animateValue(obj, start, end, duration) {
    if (!obj) return; let startTimestamp = null; if (isNaN(start)) start = 0;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp; const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) { window.requestAnimationFrame(step); } else { obj.innerHTML = end; }
    };
    window.requestAnimationFrame(step);
}

// ================== 5. 音乐引擎与快捷键 ==================
let musicFiles = [ "小瀬村晶 - Summer Ghost.mp3" ];
window.musicFiles = musicFiles;

/**
 * 从网易云音乐各种链接/外链代码/纯数字中提取歌曲 ID
 */
function extractNeteaseSongId(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (!s) return '';
    if (/^\d{5,15}$/.test(s)) return s;
    const m1 = /music\.163\.com\/(?:#\/|m\/)?song\?(?:[^#]*&)?id=(\d+)/i.exec(s);
    if (m1 && m1[1]) return m1[1];
    const m2 = /music\.163\.com\/song\/media\/outer\/url\?id=(\d+)/i.exec(s);
    if (m2 && m2[1]) return m2[1];
    const m3 = /music\.163\.com\/outchain\/player\?[^"']*?\bid=(\d+)/i.exec(s);
    if (m3 && m3[1]) return m3[1];
    return '';
}
window.extractNeteaseSongId = extractNeteaseSongId;

/**
 * 智能转换与校验音乐地址：
 * 1. 网易云音乐分享链接 / iframe 代码 / 纯数字 ID -> 自动转为 https://music.163.com/song/media/outer/url?id=xxx.mp3
 * 2. Google Drive 分享链接 -> 自动转为 https://drive.google.com/uc?export=download&id=FILE_ID
 * 3. 直链 mp3/m4a 或本地相对路径 / DataURL / local-audio:// -> 原样保留
 */
function normalizeMusicTrackUrl(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (!s) return '';

    const neteaseId = extractNeteaseSongId(s);
    if (neteaseId) {
        return `https://music.163.com/song/media/outer/url?id=${neteaseId}.mp3`;
    }

    const gd = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/i.exec(s);
    if (gd && gd[1]) {
        return `https://drive.google.com/uc?export=download&id=${gd[1]}`;
    }

    return s;
}
window.normalizeMusicTrackUrl = normalizeMusicTrackUrl;

/**
 * 自动从音乐链接（如网易云音乐分享链接/外链）抓取封面图与歌曲信息
 */
const MUSIC_META_CACHE_KEY = 'mnMusicMetaCache_v1';
function getMusicMetaCacheMap() {
    try {
        const raw = localStorage.getItem(MUSIC_META_CACHE_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { return {}; }
}
function saveMusicMetaCacheItem(songId, meta) {
    if (!songId || !meta) return;
    try {
        const map = getMusicMetaCacheMap();
        map[songId] = meta;
        localStorage.setItem(MUSIC_META_CACHE_KEY, JSON.stringify(map));
    } catch (e) {}
}

window.fetchMusicLinkMeta = async function (rawUrl) {
    const songId = extractNeteaseSongId(rawUrl);
    if (!songId) return null;

    const cached = getMusicMetaCacheMap()[songId];
    if (cached && cached.cover) return cached;

    const endpoints = [
        `https://api.injahow.cn/meting/?type=song&id=${songId}`,
        `https://api.i-meto.com/meting/api?server=netease&type=song&id=${songId}`
    ];

    for (let i = 0; i < endpoints.length; i++) {
        try {
            const res = await fetch(endpoints[i]);
            if (!res.ok) continue;
            const data = await res.json();
            const item = Array.isArray(data) ? data[0] : data;
            if (item && (item.pic || item.cover || item.name || item.title)) {
                const rawPic = String(item.pic || item.cover || '').trim();
                const cover = rawPic ? rawPic.replace(/^http:\/\//i, 'https://') : '';
                const name = String(item.name || item.title || '').trim();
                const artist = String(item.artist || item.author || '').trim();
                const fullTitle = (artist && name && !name.includes(artist)) ? `${artist} - ${name}` : (name || artist);
                if (cover || fullTitle) {
                    const meta = { songId, title: fullTitle, name, artist, cover };
                    if (cover) saveMusicMetaCacheItem(songId, meta);
                    return meta;
                }
            }
        } catch (e) {}
    }

    // 备用：通过 allorigins 抓取网易云官方 song/detail 接口封面
    try {
        const detailUrl = `https://music.163.com/api/song/detail/?id=${songId}&ids=%5B${songId}%5D`;
        const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(detailUrl)}`);
        if (proxyRes.ok) {
            const wrapper = await proxyRes.json();
            const parsed = JSON.parse(wrapper.contents || '{}');
            const song = parsed && Array.isArray(parsed.songs) && parsed.songs[0];
            if (song) {
                const rawPic = String((song.album && song.album.picUrl) || '').trim();
                const cover = rawPic ? rawPic.replace(/^http:\/\//i, 'https://') : '';
                const name = String(song.name || '').trim();
                const artist = Array.isArray(song.artists) ? song.artists.map(a => a.name).filter(Boolean).join(' / ') : '';
                const fullTitle = (artist && name) ? `${artist} - ${name}` : (name || artist);
                const meta = { songId, title: fullTitle, name, artist, cover };
                if (cover) saveMusicMetaCacheItem(songId, meta);
                return meta;
            }
        }
    } catch (e) {}

    return null;
};

/**
 * 本地浏览器 IndexedDB 音频缓存池：
 * 解决本机上传音频后立刻免跨域播放，以及 Google Drive 303 重定向 CORP 拦截问题
 */
const AUDIO_IDB_NAME = 'mnAudioCacheDB';
const AUDIO_IDB_STORE = 'audioBlobs';
const memoryAudioBlobUrls = {};

function openAudioIdb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
        const req = indexedDB.open(AUDIO_IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(AUDIO_IDB_STORE)) {
                db.createObjectStore(AUDIO_IDB_STORE);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

window.saveLocalAudioBlob = function (key, blob) {
    if (!key || !blob) return Promise.resolve();
    try {
        if (memoryAudioBlobUrls[key]) URL.revokeObjectURL(memoryAudioBlobUrls[key]);
        memoryAudioBlobUrls[key] = URL.createObjectURL(blob);
    } catch (e) {}
    return openAudioIdb().then(db => new Promise((resolve) => {
        const tx = db.transaction(AUDIO_IDB_STORE, 'readwrite');
        tx.objectStore(AUDIO_IDB_STORE).put(blob, String(key).trim());
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
    })).catch(() => false);
};

window.getLocalAudioBlobUrl = function (key) {
    const k = String(key || '').trim();
    if (!k) return Promise.resolve('');
    if (memoryAudioBlobUrls[k]) return Promise.resolve(memoryAudioBlobUrls[k]);
    return openAudioIdb().then(db => new Promise((resolve) => {
        const tx = db.transaction(AUDIO_IDB_STORE, 'readonly');
        const req = tx.objectStore(AUDIO_IDB_STORE).get(k);
        req.onsuccess = () => {
            if (req.result instanceof Blob) {
                const u = URL.createObjectURL(req.result);
                memoryAudioBlobUrls[k] = u;
                resolve(u);
            } else {
                resolve('');
            }
        };
        req.onerror = () => resolve('');
    })).catch(() => '');
};

// 播放列表：云端已返回配置时严格以云端歌单为准，未连接云端时才回退本地默认曲目
function getMusicTracks() {
    if (window.SiteContent && window.SiteContent.remote && window.SiteContent.data && Array.isArray(window.SiteContent.data.music)) {
        return typeof window.normalizeMusicTracks === 'function'
            ? window.normalizeMusicTracks(window.SiteContent.data.music)
            : window.SiteContent.data.music;
    }
    const remote = window.SiteContent && window.SiteContent.data && window.SiteContent.data.music;
    if (Array.isArray(remote) && remote.length) {
        return typeof window.normalizeMusicTracks === 'function' ? window.normalizeMusicTracks(remote) : remote;
    }
    return (musicFiles || []).map(n => ({
        name: String(n).replace(/\.[^/.]+$/, ''),
        sourceMode: 'link',
        url: 'music/' + n,
        linkUrl: 'music/' + n,
        uploadUrl: '',
        cover: ''
    }));
}
window.getMusicTracks = getMusicTracks;

function getEffectiveTrackRawUrl(track) {
    if (!track || typeof track !== 'object') return '';
    if (track.sourceMode === 'upload') {
        return String(track.uploadUrl || track.url || '').trim();
    }
    return String(track.linkUrl || track.url || '').trim();
}

let currentTrackIndex = 0; let audioEl = null; let isPlaying = false; let playMode = 'sequence';
let fallbackTryingUrl = '';
const pendingDriveAudioPromises = {};
let lastLoadedTrackSignature = '';

/**
 * 提取 Google Drive 文件 ID（支持 drive.google.com/uc?id=...、/file/d/...、lh3.googleusercontent.com/d/...）
 */
function extractDriveAudioId(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (!/drive\.google\.com|googleusercontent\.com/i.test(s)) return '';
    const m = /[?&]id=([a-zA-Z0-9_-]{10,})/i.exec(s)
        || /\/file\/d\/([a-zA-Z0-9_-]{10,})/i.exec(s)
        || /googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/i.exec(s);
    return (m && m[1]) ? m[1] : '';
}

/**
 * 跨电脑云端音频加载器（带并发去重与 IndexedDB 持久化缓存）：
 * 当曲目是上传到 Google Drive 的音频时，自动通过后端 ?action=media&id=FILE_ID 拉取音频字节流并缓存为本地 Blob URL，
 * 彻底绕过 Chrome 303 CORP 跨域拦截，确保任何电脑打开都能直接播放后台上传的音乐。
 */
async function ensureCloudAudioBlobUrl(rawUrl, showLoadingToast) {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';
    const cleanUrl = normalizeMusicTrackUrl(raw);

    // 1. 优先命中本机内存或 IndexedDB 缓存
    const cached = await window.getLocalAudioBlobUrl(raw) || (cleanUrl !== raw ? await window.getLocalAudioBlobUrl(cleanUrl) : '');
    if (cached) return cached;

    // 2. 若是 Google Drive 云端音频文件，通过 Apps Script ?action=media&id=FILE_ID 拉取（并发复用同一个 Promise）
    const driveId = extractDriveAudioId(cleanUrl) || extractDriveAudioId(raw);
    const mediaBaseUrl = (typeof window.getCmsApiUrl === 'function' && window.getCmsApiUrl(''))
        ? window.getCmsApiUrl('')
        : (typeof REPORT_API_URL !== 'undefined' ? String(REPORT_API_URL).trim() : '');
    if (driveId && mediaBaseUrl) {
        if (!pendingDriveAudioPromises[driveId]) {
            if (showLoadingToast && typeof showToast === 'function') {
                showToast('⏳ 正在从云端同步音乐音频流...');
            }
            const mediaApi = `${mediaBaseUrl}?action=media&id=${encodeURIComponent(driveId)}`;
            pendingDriveAudioPromises[driveId] = fetch(mediaApi, { cache: 'no-store' })
                .then(r => (r.ok ? r.json() : null))
                .then(async (j) => {
                    if (j && j.ok && j.base64) {
                        const blob = base64ToBlob(j.base64, j.mimeType || 'audio/mpeg');
                        await window.saveLocalAudioBlob(raw, blob);
                        if (cleanUrl && cleanUrl !== raw) {
                            await window.saveLocalAudioBlob(cleanUrl, blob);
                        }
                        return await window.getLocalAudioBlobUrl(raw) || URL.createObjectURL(blob);
                    }
                    return '';
                })
                .catch(() => '')
                .finally(() => {
                    delete pendingDriveAudioPromises[driveId];
                });
        }
        return pendingDriveAudioPromises[driveId];
    }

    return '';
}
window.ensureCloudAudioBlobUrl = ensureCloudAudioBlobUrl;

/**
 * 在悬浮音乐控件上显示/清除非静默错误提示（如“⚠️ 该链接无法直接播放”）
 */
function setMusicWidgetError(msg) {
    const widget = document.getElementById('musicPlayerWidget') || document.querySelector('.music-player-widget');
    const tipEl = document.getElementById('musicErrorTip');
    if (tipEl) {
        tipEl.textContent = msg || '⚠️ 该链接无法直接播放';
        tipEl.style.display = 'block';
    }
    if (widget) {
        widget.classList.add('has-error');
    }
}
window.setMusicWidgetError = setMusicWidgetError;

function clearMusicWidgetError() {
    const widget = document.getElementById('musicPlayerWidget') || document.querySelector('.music-player-widget');
    const tipEl = document.getElementById('musicErrorTip');
    if (tipEl) {
        tipEl.style.display = 'none';
    }
    if (widget) {
        widget.classList.remove('has-error');
    }
}
window.clearMusicWidgetError = clearMusicWidgetError;

// 全局快捷键监听 (规避输入框)
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); toggleMusic(); } 
    else if (e.ctrlKey && e.code === 'ArrowRight') { e.preventDefault(); nextTrack(); } 
    else if (e.ctrlKey && e.code === 'ArrowLeft') { e.preventDefault(); prevTrack(); }
});

function initMusicPlayer() {
    audioEl = document.getElementById('bgAudio'); if(!audioEl) return;
    audioEl.addEventListener('timeupdate', updateProgress);
    audioEl.addEventListener('ended', nextTrack); 
    audioEl.addEventListener('loadedmetadata', () => {
        clearMusicWidgetError();
        const totalEl = document.getElementById('totalTime');
        if (totalEl) totalEl.innerText = formatTime(audioEl.duration);
    });
    audioEl.addEventListener('playing', () => {
        clearMusicWidgetError();
    });
    audioEl.addEventListener('error', () => {
        if (!audioEl || !audioEl.getAttribute('src')) return;
        const tracks = getMusicTracks();
        const track = tracks[currentTrackIndex] || tracks[0];
        const rawUrl = getEffectiveTrackRawUrl(track);
        // 若正在播放或用户主动触发播放失败，尝试代理拉流或直接提示“该链接无法直接播放”
        if (isPlaying || audioEl.dataset.userTriggered === '1') {
            tryFallbackAudioAndPlay(rawUrl);
        }
    });
    loadTrack(currentTrackIndex); 
}

function buildTrackAvatarUrl(trackName) {
    const coverName = String(trackName || 'MN').split('-').pop().trim() || 'MN';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(coverName)}&background=random&color=fff&size=128&rounded=true&bold=true`;
}

function applyTrackCover(track, index) {
    const coverEl = document.getElementById('musicDisc');
    if (!coverEl || coverEl.tagName !== 'IMG') return;
    const avatarUrl = buildTrackAvatarUrl(track && track.name);
    coverEl.onerror = () => {
        coverEl.onerror = null;
        coverEl.src = avatarUrl;
    };

    const customCover = String((track && track.cover) || '').trim();
    if (customCover) {
        coverEl.src = customCover;
        return;
    }

    // 未手动上传封面时：优先尝试从音乐链接（如网易云音乐外链）自动抓取专辑封面
    coverEl.src = avatarUrl;
    const rawLink = String((track && (track.linkUrl || track.url)) || '').trim();
    if (extractNeteaseSongId(rawLink)) {
        window.fetchMusicLinkMeta(rawLink).then(meta => {
            if (!meta || !meta.cover) return;
            track.cover = meta.cover;
            if (currentTrackIndex === index && coverEl) {
                coverEl.src = meta.cover;
            }
        }).catch(() => {});
    }
}

function loadTrack(index, preserveIfSamePlaying) {
    if (!audioEl) audioEl = document.getElementById('bgAudio');
    if (!audioEl) return;
    const tracks = getMusicTracks();
    if (tracks.length === 0) {
        const titleEl = document.getElementById('musicTitle');
        if (titleEl) titleEl.innerText = '暂无曲目';
        audioEl.removeAttribute('src');
        lastLoadedTrackSignature = '';
        return;
    }
    if (index < 0 || index >= tracks.length) index = 0;
    currentTrackIndex = index;
    const track = tracks[index] || tracks[0];
    const rawUrl = getEffectiveTrackRawUrl(track);
    const normalizedUrl = normalizeMusicTrackUrl(rawUrl);
    const sig = `${index}|${track.name || ''}|${rawUrl}|${track.cover || ''}`;

    if (preserveIfSamePlaying && isPlaying && sig === lastLoadedTrackSignature && audioEl.getAttribute('src')) {
        return;
    }
    lastLoadedTrackSignature = sig;
    fallbackTryingUrl = '';
    clearMusicWidgetError();

    const isDriveAudio = Boolean(extractDriveAudioId(normalizedUrl) || extractDriveAudioId(rawUrl));
    const isLocalAudioKey = /^local-audio:\/\//i.test(normalizedUrl);
    const backupLinkUrl = (isLocalAudioKey && track.linkUrl && !/^local-audio:\/\//i.test(String(track.linkUrl).trim()))
        ? normalizeMusicTrackUrl(track.linkUrl)
        : '';

    // 优先检查本地 IndexedDB 是否已缓存该音频 Blob，若为 Google Drive 云端上传音频则在后台预拉取字节流
    ensureCloudAudioBlobUrl(rawUrl, false).then(blobUrl => {
        if (currentTrackIndex !== index) return;
        const targetSrc = blobUrl || (!isDriveAudio && !isLocalAudioKey ? normalizedUrl : backupLinkUrl);
        if (targetSrc) {
            if (audioEl.src !== targetSrc) audioEl.src = targetSrc;
        } else if (!isDriveAudio) {
            audioEl.removeAttribute('src');
        }
    });

    // 非 Google Drive 且非 local-audio:// 的常规直链可立即赋给 audioEl.src（Drive 音频走上方 Blob 流规避 303 CORP 报错）
    if (normalizedUrl && !isDriveAudio && !/^local-audio:\/\//i.test(normalizedUrl)) {
        audioEl.src = normalizedUrl;
    }

    const titleEl = document.getElementById('musicTitle');
    if (titleEl) titleEl.innerText = track.name || '未知曲目';
    applyTrackCover(track, index);

    const progEl = document.getElementById('musicProgress'); if(progEl) progEl.style.width = '0%';
    const curEl = document.getElementById('currentTime'); if(curEl) curEl.innerText = '0:00';
    const totalEl = document.getElementById('totalTime'); if(totalEl) totalEl.innerText = '0:00';
}

function base64ToBlob(b64, mimeType) {
    const binStr = atob(b64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

/**
 * 当 Google Drive 直链或外部音频被浏览器 CORP/CORS 拦截时：
 * 1. 优先通过 ensureCloudAudioBlobUrl（含 IndexedDB 缓存 + ?action=media&id=FILE_ID 云端音频流）加载并播放
 * 2. 再尝试 CORS 代理拉取音频流转为本地 Blob URL 播放
 * 3. 若仍失败，绝不静默失败：在音乐控件上直接显示“⚠️ 该链接无法直接播放”并弹出 Toast 提示
 */
let fallbackInFlightPromise = null;
async function tryFallbackAudioAndPlay(rawUrl) {
    if (!audioEl || !rawUrl) {
        notifyMusicPlayFailed();
        return;
    }
    if (fallbackInFlightPromise) {
        return fallbackInFlightPromise;
    }
    const cleanUrl = normalizeMusicTrackUrl(rawUrl);
    if (fallbackTryingUrl === cleanUrl) {
        notifyMusicPlayFailed();
        return;
    }
    fallbackTryingUrl = cleanUrl;

    fallbackInFlightPromise = (async () => {
        try {
            const cloudOrLocalBlobUrl = await ensureCloudAudioBlobUrl(rawUrl, true);
            if (cloudOrLocalBlobUrl) {
                if (audioEl.src !== cloudOrLocalBlobUrl) {
                    audioEl.src = cloudOrLocalBlobUrl;
                }
                await audioEl.play();
                isPlaying = true;
                fallbackTryingUrl = '';
                clearMusicWidgetError();
                updateUIState();
                return;
            }
        } catch (e) {}

        // 尝试通过公共 CORS 代理拉取音频流（排除已知会跳 404 HTML 的受限地址与 Google Drive）
        if (/^https?:\/\//i.test(cleanUrl) && !extractDriveAudioId(cleanUrl)) {
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`;
                const res = await fetch(proxyUrl);
                const ctype = (res.headers && res.headers.get('content-type')) || '';
                if (res.ok && !ctype.includes('text/html')) {
                    const blob = await res.blob();
                    if (blob && blob.size > 1024 && !String(blob.type).includes('text/html')) {
                        await window.saveLocalAudioBlob(rawUrl, blob);
                        const blobUrl = URL.createObjectURL(blob);
                        audioEl.src = blobUrl;
                        await audioEl.play();
                        isPlaying = true;
                        fallbackTryingUrl = '';
                        clearMusicWidgetError();
                        updateUIState();
                        return;
                    }
                }
            } catch (e) {}
        }

        notifyMusicPlayFailed();
    })().finally(() => {
        fallbackInFlightPromise = null;
    });

    return fallbackInFlightPromise;
}

function notifyMusicPlayFailed() {
    isPlaying = false;
    if (audioEl) audioEl.dataset.userTriggered = '0';
    updateUIState();
    setMusicWidgetError('⚠️ 该链接无法直接播放');
    if (typeof showToast === 'function') {
        showToast('⚠️ 该链接无法直接播放（受防盗链/VIP限制），请改填直链 mp3 或在后台上传音频文件');
    }
}

function toggleMusic() { if(!audioEl) return; if(isPlaying) pauseAudio(); else playAudio(); }
function playAudio() {
    if (!audioEl) audioEl = document.getElementById('bgAudio');
    if (!audioEl) return;
    const tracks = getMusicTracks();
    if (!tracks.length) {
        setMusicWidgetError('⚠️ 歌单为空');
        if (typeof showToast === 'function') showToast('⚠️ 当前歌单为空，请先在后台添加音乐');
        return;
    }
    const track = tracks[currentTrackIndex] || tracks[0];
    const rawUrl = getEffectiveTrackRawUrl(track);
    if (!rawUrl) {
        setMusicWidgetError('⚠️ 该链接无法直接播放');
        if (typeof showToast === 'function') showToast('⚠️ 当前曲目未设置音频地址或未上传文件');
        return;
    }
    const normalizedUrl = normalizeMusicTrackUrl(rawUrl);
    const isDriveAudio = Boolean(extractDriveAudioId(normalizedUrl) || extractDriveAudioId(rawUrl));
    const isLocalAudioKey = /^local-audio:\/\//i.test(normalizedUrl);
    const backupLinkUrl = (isLocalAudioKey && track.linkUrl && !/^local-audio:\/\//i.test(String(track.linkUrl).trim()))
        ? normalizeMusicTrackUrl(track.linkUrl)
        : '';

    audioEl.dataset.userTriggered = '1';
    ensureCloudAudioBlobUrl(rawUrl, isDriveAudio).then(blobUrl => {
        if (blobUrl) {
            if (audioEl.src !== blobUrl) audioEl.src = blobUrl;
        } else if (!audioEl.getAttribute('src') && normalizedUrl && !isDriveAudio && !isLocalAudioKey) {
            audioEl.src = normalizedUrl;
        } else if (!audioEl.getAttribute('src') && backupLinkUrl) {
            audioEl.src = backupLinkUrl;
        }
        if (!audioEl.getAttribute('src')) {
            tryFallbackAudioAndPlay(backupLinkUrl || rawUrl);
            return;
        }
        const p = audioEl.play();
        if (p && typeof p.then === 'function') {
            p.then(() => {
                isPlaying = true;
                clearMusicWidgetError();
                updateUIState();
            }).catch((err) => {
                if (err && err.name === 'NotAllowedError') {
                    isPlaying = false;
                    updateUIState();
                    if (typeof showToast === 'function') showToast('💡 请点击音乐图标开启播放');
                    return;
                }
                tryFallbackAudioAndPlay(backupLinkUrl || rawUrl);
            });
        }
    });
}
function pauseAudio() {
    if (!audioEl) return;
    audioEl.dataset.userTriggered = '0';
    audioEl.pause();
    isPlaying = false;
    updateUIState();
}

window.previewMusicTrackAt = function (index) {
    const tracks = getMusicTracks();
    if (!tracks[index]) return;
    currentTrackIndex = index;
    loadTrack(index);
    playAudio();
};
function updateUIState() {
    const disc = document.getElementById('musicDisc'); const playBtn = document.getElementById('playPauseBtn');
    if (isPlaying) { if(disc) disc.classList.add('playing'); if(playBtn) playBtn.innerText = '⏸'; } 
    else { if(disc) disc.classList.remove('playing'); if(playBtn) playBtn.innerText = '▶'; }
}
function togglePlayMode() {
    const btn = document.getElementById('playModeBtn');
    if (playMode === 'sequence') { playMode = 'shuffle'; if(btn) { btn.innerText = '🔀'; btn.title = '随机播放'; } showToast('🔀 随机播放'); } 
    else { playMode = 'sequence'; if(btn) { btn.innerText = '🔁'; btn.title = '顺序播放'; } showToast('🔁 顺序播放'); }
}
function nextTrack() {
    const total = getMusicTracks().length; if (total === 0) return;
    if (playMode === 'shuffle') { let nextIdx = currentTrackIndex; if(total > 1) { while(nextIdx === currentTrackIndex) nextIdx = Math.floor(Math.random() * total); } currentTrackIndex = nextIdx; } 
    else { currentTrackIndex = (currentTrackIndex + 1) % total; }
    loadTrack(currentTrackIndex); if (isPlaying) playAudio();
}
function prevTrack() {
    const total = getMusicTracks().length; if (total === 0) return;
    if (playMode === 'shuffle') { let nextIdx = currentTrackIndex; if(total > 1) { while(nextIdx === currentTrackIndex) nextIdx = Math.floor(Math.random() * total); } currentTrackIndex = nextIdx; } 
    else { currentTrackIndex = (currentTrackIndex - 1 + total) % total; }
    loadTrack(currentTrackIndex); if (isPlaying) playAudio();
}
function updateProgress() {
    if(!audioEl || isNaN(audioEl.duration)) return; const percent = (audioEl.currentTime / audioEl.duration) * 100;
    const progEl = document.getElementById('musicProgress'); if(progEl) progEl.style.width = `${percent}%`;
    const curEl = document.getElementById('currentTime'); if(curEl) curEl.innerText = formatTime(audioEl.currentTime);
}
function seekMusic(e) { if(!audioEl || isNaN(audioEl.duration)) return; const rect = e.currentTarget.getBoundingClientRect(); const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); audioEl.currentTime = percent * audioEl.duration; }
function formatTime(seconds) { if(isNaN(seconds)) return "0:00"; const min = Math.floor(seconds / 60); const sec = Math.floor(seconds % 60); return `${min}:${sec < 10 ? '0' : ''}${sec}`; }

function submitFeedback() {
    const name = document.getElementById('fbName').value.trim(); const contact = document.getElementById('fbContact').value.trim(); const content = document.getElementById('fbContent').value.trim();
    if(!name || !content) return showToast('⚠️ 请填写您的花名及具体的反馈内容！');
    const feedbackData = { dataType: 'FEEDBACK', time: window.getChinaTime(), user: name, contact: contact || '未留名', content: content };
    showToast('🚀 正在递交总线...');
    if(REPORT_API_URL) {
        fetch(REPORT_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(feedbackData) }).then(() => { showToast('✅ 提交成功！'); closeFeedbackModal(); document.getElementById('fbContent').value = ''; }).catch(() => showToast('❌ 链路阻断'));
    }
}

// ================== 6. IP生成 / 报表清洗 / 联动与定位引擎 ==================

function silentTrackSingleGen(platform, rawIp) {
    try { const logData = { dataType: 'SINGLE_GEN', time: window.getChinaTime(), operatorIp: window.operatorIp, operatorGeo: window.operatorGeo, action: `⚡ 快捷生成 (${platform})`, rawContent: rawIp };
        if (REPORT_API_URL) fetch(REPORT_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(logData) }).catch(()=>{});
    } catch(e) {}
}

function quickGenerateEgern() {
    const prefix = document.getElementById('namePrefix').value.trim(); const code = document.getElementById('quickCode').value.trim(); const ipStr = document.getElementById('quickIp').value.trim();
    if(!prefix || !ipStr) return showToast('⚠️ 参数不完整'); 
    
    const parsed = parseProxyString(ipStr);
    if(!parsed) return showToast('❌ 节点源受损或格式错误');
    
    const name = code ? `${prefix}${code}` : prefix; 
    const jsonStr = JSON.stringify({ socks5: { server: parsed.ip, port: Number(parsed.port), username: parsed.user, password: parsed.pass, name } });
    const link = `https://egernapp.com/proxies/new?json=${encodeURIComponent(jsonStr)}`;
    document.getElementById('quickEgernLink').innerText = link;
    waitForQRCode(() => { QRCode.toDataURL(link, { width: 220, margin: 2 }, (err, url) => {
        const box = document.getElementById('quickEgernQr'); box.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`; box.onclick = () => openModalWithImage('Egern (iOS)', url);
    });});
    silentTrackSingleGen("Egern", parsed.standardUrl);
    
    const batchInput = document.getElementById('batchInput'); 
    if(batchInput && !batchInput.value.includes(parsed.standardUrl)) { 
        batchInput.value = batchInput.value ? batchInput.value + '\n' + parsed.standardUrl : parsed.standardUrl; 
    }
    
    const singleLink = document.getElementById('singleLink');
    if(singleLink) { singleLink.value = parsed.standardUrl; generateIPInfo(); }
}

function quickGenerateV2ray() {
    const prefix = document.getElementById('namePrefix').value.trim(); const code = document.getElementById('quickCode').value.trim(); const ipStr = document.getElementById('quickIp').value.trim();
    if(!prefix || !ipStr) return showToast('⚠️ 参数不完整'); 
    
    const parsed = parseProxyString(ipStr);
    if(!parsed) return showToast('❌ 节点源受损或格式错误');
    
    const name = code ? `${prefix}${code}` : prefix;
    const link = `socks://${encodeURIComponent(parsed.user)}:${encodeURIComponent(parsed.pass)}@${parsed.ip}:${parsed.port}#${encodeURIComponent(name)}`;
    document.getElementById('quickV2rayLink').innerText = link;
    waitForQRCode(() => { QRCode.toDataURL(link, { width: 220, margin: 2 }, (err, url) => {
        const box = document.getElementById('quickV2rayQr'); box.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`; box.onclick = () => openModalWithImage('v2rayNG (Android)', url);
    });});
    silentTrackSingleGen("v2rayNG", parsed.standardUrl);
    
    const batchInput = document.getElementById('batchInput'); 
    if(batchInput && !batchInput.value.includes(parsed.standardUrl)) { 
        batchInput.value = batchInput.value ? batchInput.value + '\n' + parsed.standardUrl : parsed.standardUrl; 
    }

    const singleLink = document.getElementById('singleLink');
    if(singleLink) { singleLink.value = parsed.standardUrl; generateIPInfo(); }
}

// 纯中文翻译与智能去重字典
const geoTranslationDict = {
    'United States': '美国', 'Taiwan': '台湾', 'China': '中国', 'Hong Kong': '香港',
    'Japan': '日本', 'Singapore': '新加坡', 'United Kingdom': '英国',
    'South Korea': '韩国', 'Germany': '德国', 'Australia': '澳大利亚',
    'Canada': '加拿大', 'France': '法国', 'Taipei': '台北', 'Taipei City': '台北市',
    'Texas': '德克萨斯州', 'California': '加利福尼亚州', 'New York': '纽约州',
    'Florida': '佛罗里达州', 'Washington': '华盛顿州', 'Illinois': '伊利诺伊州',
    'New Jersey': '新泽西州', 'Virginia': '弗吉尼亚州', 'Ohio': '俄亥俄州',
    'Pennsylvania': '宾夕法尼亚州', 'Massachusetts': '马萨诸塞州',
    'District of Columbia': '华盛顿特区', 'England': '英格兰'
};

async function fetchGeoDetail(ip) {
    const processGeo = (country, region, city, lat, lon, timezone, zip) => {
        let c = country || ''; let r = region || '';
        
        if (geoTranslationDict[c]) c = geoTranslationDict[c];
        if (geoTranslationDict[r]) r = geoTranslationDict[r];

        if (c && r && (c === r || c.includes(r) || r.includes(c))) { r = ''; }

        return { success: true, country: c, region: r, city: city||'', lat: lat||'', lon: lon||'', timezone: timezone||'未知', zip: zip || '未知' };
    };

    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`http://ip-api.com/json/${ip}?lang=zh-CN`)}`;
        const res1 = await fetch(proxyUrl);
        if (res1.ok) {
            const proxyData = await res1.json(); const data = JSON.parse(proxyData.contents);
            if (data.status === 'success') { return processGeo(data.country, data.regionName, data.city, data.lat, data.lon, data.timezone, data.zip); }
        }
    } catch(e) {}

    try {
        const res2 = await fetch(`https://ipapi.co/${ip}/json/`);
        if (res2.ok) {
            const data = await res2.json();
            if (!data.error) { return processGeo(data.country_name, data.region, data.city, data.latitude, data.longitude, data.timezone, data.postal); }
        }
    } catch(e) {}

    try {
        const res3 = await fetch(`https://freeipapi.com/api/json/${ip}`);
        if (res3.ok) {
            const data = await res3.json();
            if (data.countryName && data.countryName !== '-') { return processGeo(data.countryName, data.regionName, data.cityName, data.latitude, data.longitude, data.timeZone, data.zipCode); }
        }
    } catch(e) {}
    
    return { success: false, country:'', region:'', city:'', lat:'', lon:'', timezone:'', zip:'' };
}

let excelDataArray = []; let excelDataStr = "";

async function batchGenerate() {
    const phoneInput = document.getElementById('batchPhoneInput').value.trim(); 
    const nameInput = document.getElementById('batchNameInput').value.trim(); 
    const rawText = document.getElementById('batchInput').value.trim();
    const lines = rawText.split('\n').filter(Boolean); 
    const tbody = document.querySelector('#batchTable tbody');
    
    if(lines.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">资产缓冲池为空，请先粘贴底包数据</td></tr>'; return; }
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">中枢引擎同步并发清洗并校对物理位置中...</td></tr>';
    
    let rowsData = []; 
    lines.forEach((line) => { 
        let parsed = parseProxyString(line);
        if(parsed) rowsData.push(parsed); 
    });
    
    if (rowsData.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#FF2D55;">灌入失败：数据受损或格式无法识别</td></tr>'; return; }
    
    try { 
        const usageLog = { dataType: 'PROXY_USAGE', time: window.getChinaTime(), operatorIp: window.operatorIp, operatorGeo: window.operatorGeo, action: `📋 报表清洗 (${rowsData.length}条)`, rawContent: `使用人: ${nameInput || '未填'}, 编号: ${phoneInput || '未填'} \n${rawText}` };
        if (REPORT_API_URL) fetch(REPORT_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(usageLog) }).catch(()=>{});
    } catch(e) {}

    tbody.innerHTML = ''; excelDataArray = new Array(rowsData.length).fill("");
    
    for (let i = 0; i < rowsData.length; i++) {
        let row = rowsData[i]; const tr = document.createElement('tr');
        tr.innerHTML = `<td>${phoneInput}</td><td>${nameInput}</td><td style="font-family:Consolas; font-weight:bold; color:#007AFF;">${row.ip}</td><td id="country_${i}"><span class="detecting-text">代理位置检测中...<span class="search-icon">🔎</span></span></td><td id="region_${i}"></td>`;
        tbody.appendChild(tr); 
        excelDataArray[i] = `${phoneInput}\t${nameInput}\t${row.ip}\t\t\n`;
    }
    excelDataStr = excelDataArray.join(""); showToast('✅ 格式清洗完成，地理位置后台排队测绘中...');

    (async () => {
        for (let i = 0; i < rowsData.length; i++) {
            let row = rowsData[i]; 
            let geo = await fetchGeoDetail(row.ip); 
            const countryTd = document.getElementById(`country_${i}`);
            const regionTd = document.getElementById(`region_${i}`);
            
            if (countryTd && regionTd) { 
                if (geo.success) { 
                    countryTd.innerHTML = `<span style="color:#34C759; font-weight:bold;">${geo.country}</span>`; 
                    regionTd.innerHTML = `<span style="color:#34C759; font-weight:bold;">${geo.region}</span>`; 
                } else { 
                    countryTd.innerHTML = ``; regionTd.innerHTML = ``; 
                } 
            }
            excelDataArray[i] = `${phoneInput}\t${nameInput}\t${row.ip}\t${geo.country}\t${geo.region}\n`;
            excelDataStr = excelDataArray.join(""); 
            await new Promise(resolve => setTimeout(resolve, 300)); 
        }
    })();
}

function copyForExcel() { if (!excelDataStr) return showToast('⚠️ 缓冲池为空！'); navigator.clipboard.writeText(excelDataStr).then(() => { showToast('✅ 已提取，可直接粘贴 Excel'); }); }

// ================== 7. 独立逆向链路提取 ==================
function generateIPInfo() {
    const link = document.getElementById('singleLink').value.trim(); if(!link) return;
    let proxyInfo = null;
    
    if (link.includes('egernapp.com') && link.includes('json=')) {
        try {
            const data = JSON.parse(decodeURIComponent(link.split('json=')[1])); let s = data.socks5 || data.hysteria2;
            if(s) proxyInfo = { ip: s.server, port: s.port, user: s.username||'', pass: s.password||s.auth||'', standardUrl: `${s.server}:${s.port}:${s.username||''}:${s.password||s.auth||''}` };
        } catch(e) {}
    } else {
        proxyInfo = parseProxyString(link);
    }
    
    if (proxyInfo && proxyInfo.ip) {
        document.getElementById('singleIpResult').innerText = proxyInfo.standardUrl;
        
        waitForQRCode(() => { QRCode.toDataURL(proxyInfo.standardUrl, { width: 220, margin: 2 }, (err, url) => {
            const box = document.getElementById('singleQr'); box.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:6px;">`; box.onclick = () => openModalWithImage('反查链路明文镜像', url);
        });});
        
        runAdvancedProxyTest(proxyInfo.ip, proxyInfo.standardUrl);
    } else {
        showToast('❌ 逆向解析失败，无法识别该数据');
    }
}

function copyIPInfo() { copyToClipboard('singleIpResult'); }

function clearSingleInfo() {
    const singleLink = document.getElementById('singleLink');
    if(singleLink) singleLink.value = '';
    
    const singleIpResult = document.getElementById('singleIpResult');
    if(singleIpResult) singleIpResult.innerText = '等待逆向解析...';
    
    const singleQr = document.getElementById('singleQr');
    if(singleQr) singleQr.innerHTML = '<div class="qr-placeholder">解析成功后镜像显示</div>';
    
    const proxyTestResult = document.getElementById('proxyTestResult');
    if(proxyTestResult) {
        proxyTestResult.style.display = 'none';
        proxyTestResult.innerHTML = '';
    }
    showToast('✅ 链路信息已清空');
}

async function runAdvancedProxyTest(ip, fullUrl) {
    const resultBox = document.getElementById('proxyTestResult');
    resultBox.style.display = 'block';
    resultBox.innerHTML = `<div style="text-align:center; padding: 25px;"><span class="detecting-text">IP 物理位置测绘中...<span class="search-icon" style="font-size:18px;">🔎</span></span></div>`;
    
    const geo = await fetchGeoDetail(ip);
    let testStatus = '';
    
    if (geo.success) {
        testStatus = '定位解析成功';
        resultBox.innerHTML = `
            <div class="test-result-header">
                <button class="test-btn-outline">IP 物理测绘</button>
                <span class="copy-icon-btn" onclick="copyToClipboard('singleIpResult')" title="复制提取结果">📋</span>
            </div>
            <div class="test-success-text">
                <span class="label-grey">IP:</span> <strong style="font-size:15px; color:#34C759;">${ip}</strong><br>
                <span class="label-grey">国家/地区:</span> ${geo.country}<br>
                <span class="label-grey">州/省:</span> ${geo.region || '—'}<br>
                <span class="label-grey">城市:</span> ${geo.city}<br>
                <span class="label-grey">经度/纬度:</span> ${geo.lon}/${geo.lat}<br>
                <span class="label-grey">时区:</span> ${geo.timezone}<br>
                <span class="label-grey">邮编:</span> ${geo.zip}<br>
            </div>
        `;
    } else {
        testStatus = '解析失败';
        resultBox.innerHTML = `
            <div class="test-result-header">
                <button class="test-btn-outline">IP 物理测绘</button>
                <span class="copy-icon-btn" onclick="copyToClipboard('singleIpResult')" title="复制提取结果">📋</span>
            </div>
            <div class="test-fail-text">
                IP 位置解析失败。由于浏览器底层沙盒限制，网页无法像客户端那样测试 SOCKS5 代理的真实连通性。
            </div>
        `;
    }
    
    try { 
        const logData = { dataType: 'PROXY_TEST', time: window.getChinaTime(), operatorIp: window.operatorIp, operatorGeo: window.operatorGeo, action: `🔍 物理定位 (${testStatus})`, rawContent: `目标IP: ${ip} | 节点: ${fullUrl} | 状态: ${testStatus}` };
        if (REPORT_API_URL) fetch(REPORT_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(logData) }).catch(()=>{});
    } catch(e) {}
}

// ================== 8. 审计大屏 (修复控制台未及时挂载问题) ==================
let clickCount = 0; let logoTimer = null;
function triggerAdminCount() {
    clickCount++; clearTimeout(logoTimer); logoTimer = setTimeout(() => { clickCount = 0; }, 2000);
    if (clickCount >= 5) { 
        clickCount = 0; 
        const adminKey = prompt("🔒 [Admin Access] 请输入指令密钥:");
        if (adminKey === "Qq112233") {
            localStorage.setItem('mnAdminToken', adminKey);
            document.getElementById('adminTabBtn').style.display = "block"; 
            showToast("🔓 系统已挂载，开启上帝视角"); 
            injectAdminControls(); 
            refreshAdminLogs(); 
        } else { showToast("❌ 密码错误"); } 
    }
}

window.toggleAdminPersist = function(checkbox) { localStorage.setItem('keepAdminOpen', checkbox.checked ? 'true' : 'false'); showToast(checkbox.checked ? "📌 大屏已锁定，刷新不再消失" : "🔓 已解除锁定，刷新将隐藏"); };

window.__adminControlCollapsed = true;

window.toggleAdminBlock = function(blockId) {
    const el = document.getElementById(blockId);
    if (!el) return;
    const nextCollapsed = !el.classList.contains('is-collapsed');
    el.classList.toggle('is-collapsed', nextCollapsed);
    if (blockId === 'adminControlBox') {
        window.__adminControlCollapsed = nextCollapsed;
    }
    const btn = el.querySelector(':scope > .cms-sec-head .cms-collapse-btn') || el.querySelector('.cms-collapse-btn');
    if (btn) {
        btn.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
        btn.innerHTML = nextCollapsed ? '展开 ▾' : '折叠 ▴';
    }
    if (!nextCollapsed) {
        if (blockId === 'adminChartSection' && typeof myTrafficChart !== 'undefined' && myTrafficChart) {
            setTimeout(() => { try { myTrafficChart.resize(); } catch (e) {} }, 60);
        }
        if (blockId === 'adminInboxSection' && typeof window.refreshAdminInbox === 'function') {
            window.refreshAdminInbox(true);
        }
    }
};

function injectAdminControls() {
    const container = document.getElementById('adminControlContainer'); 
    if (!container) return; // 移除之前的 return 拦截，确保无论何时调用都能强制挂载最新 HTML

    const cfg = window.SiteConfig || {};
    const mode = cfg.cfgDataMode || 'real'; 
    const totalMode = cfg.cfgTotalMode || 'offset'; 
    const offset = cfg.cfgTotalOffset || '1240'; 
    const totalFixed = cfg.cfgTotalFixed || '8888'; 
    const onlineFixed = cfg.cfgOnlineFixed || '25'; 
    const isLocked = localStorage.getItem('keepAdminOpen') === 'true' ? 'checked' : '';
    
    const showSoftRouter = String(cfg.cfgShowSoftRouter || 'false') === 'true' ? 'checked' : '';
    
    const curSiteContent = (window.SiteContent && window.SiteContent.data) ? window.SiteContent.data : null;
    const wifiCardsList = (curSiteContent && Array.isArray(curSiteContent.baseWifiCards))
        ? curSiteContent.baseWifiCards
        : (Array.isArray(baseWifiCards) ? baseWifiCards : []);

    let wifiCheckboxesHtml = wifiCardsList.map(c => {
        const isVis = typeof window.isCardVisible === 'function' ? window.isCardVisible(c) : (c && c.visible !== false);
        return `
        <label class="admin-radio-label" style="font-size:12px;">
            <input type="checkbox" name="cfgWifiCardItem" value="${c.id}" ${isVis ? 'checked' : ''}> ${c.name}
        </label>
        `;
    }).join('');

    const isCtrlCollapsed = window.__adminControlCollapsed !== false;
    const wifiBlockCfg = (curSiteContent && curSiteContent.sectionBlocks && curSiteContent.sectionBlocks.wifi) || { helpEnabled: true, helpType: 'image' };
    const showWifiHelpBtn = (wifiBlockCfg.helpEnabled !== false && (wifiBlockCfg.helpType === 'image' || wifiBlockCfg.helpType === 'text')) ? 'checked' : '';

    container.innerHTML = `
        <div id="adminControlBox" class="cms-card cms-section ${isCtrlCollapsed ? 'is-collapsed' : ''}" style="border-color:rgba(230,162,60,0.55); background:rgba(230,162,60,0.05);">
            <div class="cms-sec-head" onclick="toggleAdminBlock('adminControlBox')">
                <div class="cms-sec-title-wrap">
                    <h4 style="color:#e6a23c;">🎛️ 数据看板与前台展示策略控制台</h4>
                    <label onclick="event.stopPropagation()" style="font-size:12.5px; font-weight:normal; color:var(--text-color); cursor:pointer; display:inline-flex; align-items:center; gap:5px; background:var(--glass-bg); padding:3px 10px; border-radius:6px; border:1px solid var(--glass-border);"><input type="checkbox" ${isLocked} onchange="toggleAdminPersist(this)"> 📌 锁定大屏</label>
                </div>
                <button type="button" class="cms-collapse-btn" aria-expanded="${isCtrlCollapsed ? 'false' : 'true'}" onclick="event.stopPropagation(); toggleAdminBlock('adminControlBox')">${isCtrlCollapsed ? '展开 ▾' : '折叠 ▴'}</button>
            </div>
            <div class="cms-sec-body">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:13px; color:var(--text-muted);">选择前台顶栏「当前在线」与「累计服务」的展示模式：</span>
                    <div class="admin-switch-group" style="margin:0;"><label class="admin-radio-label"><input type="radio" name="cfgDataMode" value="real" ${mode === 'real' ? 'checked' : ''} onchange="toggleAdminInputs()"> 🟢 实时真实数据</label><label class="admin-radio-label"><input type="radio" name="cfgDataMode" value="custom" ${mode === 'custom' ? 'checked' : ''} onchange="toggleAdminInputs()"> 🛠️ 自定义修正数据</label></div>
                </div>

                <!-- 前台网络模块显示管理区域 -->
                <div style="margin-bottom:15px; padding:15px; background:var(--glass-card); border-radius:10px; border: 1px dashed var(--glass-border);">
                    <h5 style="margin-bottom:12px; color:var(--text-color); font-size:13.5px;">📶 前台【代理 & WiFi】页面模块开关 (云端全员同步)</h5>
                    <div style="display:flex; gap:25px; flex-wrap:wrap; align-items:center;">
                        <label class="admin-radio-label" style="font-weight:bold; color:#007AFF;">
                            <input type="checkbox" id="cfgShowSoftRouterInput" ${showSoftRouter}> 开启【软路由分流通道】展示 (未勾选则完全折叠隐藏)
                        </label>
                        <div style="display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap; padding:4px 10px; border-radius:8px; background:rgba(0,122,255,0.08); border:1px solid rgba(0,122,255,0.25);">
                            <label class="admin-radio-label" style="font-weight:bold; color:#007AFF; margin:0;">
                                <input type="checkbox" id="cfgShowWifiHelpBtnInput" ${showWifiHelpBtn} onchange="if(typeof cmsToggleSectionHelp==='function') cmsToggleSectionHelp('wifi', this.checked)"> ❓ 显示【📶 代理 &amp; WiFi】右上角问号 (?) 按钮
                            </label>
                            <button type="button" class="btn-ghost" style="padding:3px 10px; font-size:12px;" onclick="if(typeof cmsJumpToSection==='function') cmsJumpToSection(8)">⚙️ 编辑问号点击弹出内容 / 管理全部问号</button>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                            <span style="font-size:13px; font-weight:bold; color:var(--text-muted);">基础网络卡片展示 (勾选即显示，自动向左对齐补位)：</span>
                            ${wifiCheckboxesHtml}
                        </div>
                    </div>
                </div>

                <div id="customDataInputs" style="display:${mode === 'custom' ? 'flex' : 'none'}; gap:20px; flex-wrap:wrap; margin-bottom:15px; padding:15px; background:var(--glass-card); border-radius:10px; border: 1px dashed var(--glass-border);">
                    <div style="flex:1; min-width:200px; padding-right:15px; border-right:1px dashed var(--glass-border);"><h5 style="margin-bottom:10px; color:var(--text-color);">👥 当前在线人数控制</h5><div class="form-group" style="margin-bottom:0;"><label>固定基准数值 (会自动波动)：</label><input type="number" id="cfgOnlineFixed" value="${onlineFixed}"></div></div>
                    <div style="flex:1; min-width:200px;"><h5 style="margin-bottom:10px; color:var(--text-color);">🚀 累计服务人数控制</h5><div style="display:flex; gap:10px;"><div class="form-group" style="flex:1; margin-bottom:0;"><label>模式：</label><select id="cfgTotalMode" onchange="document.getElementById('cfgTotalFixedWrap').style.display = this.value === 'fixed' ? 'block' : 'none'; document.getElementById('cfgTotalOffsetWrap').style.display = this.value === 'offset' ? 'block' : 'none';" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid var(--glass-border); background:transparent; color:var(--text-color);"><option value="offset" ${totalMode === 'offset' ? 'selected' : ''}>真实台账数 + 加成</option><option value="fixed" ${totalMode === 'fixed' ? 'selected' : ''}>锁定为固定</option></select></div><div class="form-group" id="cfgTotalOffsetWrap" style="flex:1; margin-bottom:0; display:${totalMode === 'offset' ? 'block' : 'none'};"><label>加成数值：</label><input type="number" id="cfgTotalOffset" value="${offset}"></div><div class="form-group" id="cfgTotalFixedWrap" style="flex:1; margin-bottom:0; display:${totalMode === 'fixed' ? 'block' : 'none'};"><label>固定数值：</label><input type="number" id="cfgTotalFixed" value="${totalFixed}"></div></div></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:15px; padding-top:15px; border-top:1px dashed var(--glass-border);"><button class="btn-primary" onclick="saveAdminConfig()">🚀 保存并全局下发配置</button><div style="font-size:12px; color:var(--text-muted); font-weight:600;">📊 物理真实数据 —— 总条数: <span id="realTotalRow" style="color:#007AFF;">--</span> | 活跃终端: <span id="realOnlineIp" style="color:#34C759;">--</span> 个</div></div>
            </div>
        </div>`;

    // 挂载「站点内容管理台」（admin-cms.js）
    if (typeof renderCmsPanel === 'function') renderCmsPanel();
}

window.toggleAdminInputs = function() { const mode = document.querySelector('input[name="cfgDataMode"]:checked').value; document.getElementById('customDataInputs').style.display = mode === 'custom' ? 'flex' : 'none'; };

window.saveAdminConfig = function() {
    const mode = document.querySelector('input[name="cfgDataMode"]:checked').value; 
    const tMode = document.getElementById('cfgTotalMode').value; 
    const tOffset = document.getElementById('cfgTotalOffset').value.trim() || '0'; 
    const tFixed = document.getElementById('cfgTotalFixed').value.trim() || '0'; 
    const oFixed = document.getElementById('cfgOnlineFixed').value.trim() || '1'; 
    
    const showSoftRouter = document.getElementById('cfgShowSoftRouterInput') ? (document.getElementById('cfgShowSoftRouterInput').checked ? 'true' : 'false') : 'false';
    const checkedIdList = Array.from(document.querySelectorAll('input[name="cfgWifiCardItem"]:checked')).map(el => el.value);
    const checkedCards = checkedIdList.join(',');

    window.SiteConfig = Object.assign({}, window.SiteConfig || {}, {
        cfgDataMode: mode,
        cfgTotalMode: tMode,
        cfgTotalOffset: tOffset,
        cfgTotalFixed: tFixed,
        cfgOnlineFixed: oFixed,
        cfgShowSoftRouter: showSoftRouter,
        cfgShowWifiCards: checkedCards
    });

    // 同步基础网络卡片显隐状态到 SiteContent 与 cmsState
    if (window.SiteContent && window.SiteContent.data && Array.isArray(window.SiteContent.data.baseWifiCards)) {
        window.SiteContent.data.baseWifiCards.forEach(c => {
            if (c) c.visible = checkedIdList.includes(c.id);
        });
        baseWifiCards = window.SiteContent.data.baseWifiCards;
    }
    if (typeof cmsState !== 'undefined' && cmsState && Array.isArray(cmsState.baseWifiCards)) {
        cmsState.baseWifiCards.forEach(c => {
            if (c) c.visible = checkedIdList.includes(c.id);
        });
        if (typeof renderCmsPanel === 'function') renderCmsPanel();
    }

    applyWifiLayoutConfig(); 
    showToast("🔄 正在向云端下发全局指令..."); 
    
    if (REPORT_API_URL) {
        let adminToken = localStorage.getItem('mnAdminToken') || '';
        if (!adminToken) {
            adminToken = (prompt('🔑 请输入后台管理密钥以下发配置:') || '').trim();
            if (adminToken) localStorage.setItem('mnAdminToken', adminToken);
        }
        const configData = { 
            action: 'UPDATE_CONFIG',
            token: adminToken,
            cfgDataMode: mode, 
            cfgTotalMode: tMode, 
            cfgTotalOffset: tOffset, 
            cfgTotalFixed: tFixed, 
            cfgOnlineFixed: oFixed,
            cfgShowSoftRouter: showSoftRouter,
            cfgShowWifiCards: checkedCards
        };
        const pCfg = window.postToApi(configData, true);
        let pContent = Promise.resolve({ ok: true });
        if (window.SiteContent && window.SiteContent.data) {
            const payload = typeof window.compactSiteContentForSave === 'function'
                ? window.compactSiteContentForSave(window.SiteContent.data)
                : window.SiteContent.data;
            pContent = window.postToApi({ action: 'SAVE_CONTENT', token: adminToken, content: payload }, true).catch(() => ({ ok: false }));
        }
        Promise.all([pCfg, pContent]).then(([j]) => {
            if (j && j.ok) { setTimeout(() => showToast("✅ 全局指令下发成功！全员前台已同步"), 600); refreshAdminLogs(); } 
            else { showToast("❌ " + ((j && j.error) || "下发失败，请检查密钥")); localStorage.removeItem('mnAdminToken'); }
        }).catch(()=>{ showToast("❌ 网络异常"); });
    }
};

async function silentTrackAccess() {
    try {
        const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`http://ip-api.com/json/?lang=zh-CN`)}`;
        const res = await fetch(url); let ip = "未知", geo = "未知";
        if(res.ok) { 
            const proxyData = await res.json(); const d = JSON.parse(proxyData.contents);
            ip = d.query || "未知"; geo = `${d.country || ''} ${d.city || ''}`.trim(); 
        }
        window.operatorIp = ip; window.operatorGeo = geo;
        const logData = { dataType: 'ACCESS_LOG', time: window.getChinaTime(), ip: ip, geo: geo, ua: navigator.userAgent.split(" (")[0] };
        if (REPORT_API_URL) fetch(REPORT_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(logData) }).catch(()=>{});
    } catch(e) {}
}

function refreshAdminLogs() {
    const tbody = document.querySelector('#adminLogTable tbody'); if(!tbody) return;
    const cfg = window.SiteConfig || {};
    const totalEl = document.getElementById('totalServedCount');

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">正在建立安全信道，拉取云端数据总线...</td></tr>';
    
    if (REPORT_API_URL) {
        const noCacheUrl = REPORT_API_URL + "?t=" + new Date().getTime();
        fetch(noCacheUrl, { cache: 'no-store' }).then(res => res.json()).then(data => { 
            let logs = Array.isArray(data) ? data : (data.logs || []); let baseTotal = Array.isArray(data) ? data.length : (data.total || 0); window.lastCalculatedRealOnline = 1;
            if (!window.currentVisitCounted) { baseTotal += 1; window.currentVisitCounted = true; }
            
            // 云端展示配置存入内存 window.SiteConfig（不使用 localStorage 旧缓存）
            if (data.config && typeof data.config === 'object') {
                ['cfgDataMode', 'cfgTotalMode', 'cfgTotalOffset', 'cfgTotalFixed', 'cfgOnlineFixed', 'cfgShowSoftRouter', 'cfgShowWifiCards'].forEach(k => {
                    const v = data.config[k];
                    if (v !== undefined && v !== null && v !== '') cfg[k] = String(v);
                });
                window.SiteConfig = cfg;
                applyWifiLayoutConfig();
            }
            
            let mode = cfg.cfgDataMode || 'real'; let finalDisplay = baseTotal;
            if (mode === 'custom') { const tMode = cfg.cfgTotalMode || 'offset'; if (tMode === 'fixed') { finalDisplay = parseInt(cfg.cfgTotalFixed || '8888', 10); } else { finalDisplay = baseTotal + parseInt(cfg.cfgTotalOffset || '1240', 10); } }
            if(totalEl) { let startVal = parseInt(totalEl.innerText); if (isNaN(startVal)) startVal = 0; animateValue(totalEl, startVal, finalDisplay, 1500); }
            const realTotalRowEl = document.getElementById('realTotalRow'); if(realTotalRowEl) realTotalRowEl.innerText = baseTotal;
            if(logs.length > 0) { renderLogTable(logs); renderTrafficChart(logs); } else { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">大盘空置</td></tr>'; }
            startOnlineHeartbeat();
        }).catch((err) => { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#FF2D55; font-weight:bold; padding:40px">❌ 链路断开：无法连接云端</td></tr>'; });
    }
}

function renderLogTable(logs) {
    const tbody = document.querySelector('#adminLogTable tbody'); tbody.innerHTML = '';
    const now = new Date(window.getChinaTime()); const activeIps = new Set();
    logs.forEach(log => {
        const tr = document.createElement('tr'); let typeColor = '#57606a'; let actionName = '未知流水'; let detailInfo = ''; let userOrIp = ''; let locationOrProxy = '';
        if (log.dataType === 'FEEDBACK') { typeColor = '#FF2D55'; actionName = '💡 提交建议'; userOrIp = `[署名] ${log.user}`; locationOrProxy = `[联系] ${log.contact}`; detailInfo = log.content;
        } else if (log.dataType === 'PROXY_USAGE' || log.dataType === 'BATCH_CLEAN') { typeColor = '#34C759'; actionName = log.action || `⚡ 批量清洗`; userOrIp = `[操作] ${log.user || log.operatorIp || '系统'}`; locationOrProxy = `[信标] ${log.operatorGeo || '未知'}`; detailInfo = log.rawContent;
        } else if (log.dataType === 'SINGLE_GEN') { typeColor = '#e6a23c'; actionName = log.action || '⚡ 快捷生成'; userOrIp = `[IP] ${log.operatorIp}`; locationOrProxy = `[定位] ${log.operatorGeo}`; detailInfo = log.rawContent;
        } else if (log.dataType === 'PROXY_TEST') { typeColor = log.action.includes('Success') || log.action.includes('成功') ? '#34C759' : '#FF2D55'; actionName = log.action; userOrIp = `[IP] ${log.operatorIp}`; locationOrProxy = `[定位] ${log.operatorGeo}`; detailInfo = log.rawContent;
        } else {
            typeColor = '#007AFF'; actionName = '🌐 系统页面访问';
            if(log.dataType && (log.dataType.includes('/') || log.dataType.includes('-'))) { log.ua = log.geo; log.geo = log.ip; log.ip = log.time; log.time = log.dataType; }
            userOrIp = log.ip; locationOrProxy = log.geo; detailInfo = log.ua;
            try { const logTime = new Date(log.time.replace(/-/g, '/')); if ((now - logTime) / 60000 <= 5) activeIps.add(log.ip); } catch(err){}
        }
        tr.innerHTML = `<td><strong style="color:${typeColor};">${log.time || '-'}</strong></td><td style="font-weight:600;">${userOrIp || '-'}</td><td style="font-family:Consolas; color:var(--text-muted);">${locationOrProxy || '-'}</td><td style="font-weight:bold; color:${typeColor};">${actionName}</td><td style="font-size:12px; color:var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${detailInfo || '-'}">${detailInfo || '-'}</td>`;
        tbody.appendChild(tr);
    });
    
    window.lastCalculatedRealOnline = activeIps.size > 0 ? activeIps.size : 1;
    const realOnlineIpEl = document.getElementById('realOnlineIp'); if(realOnlineIpEl) realOnlineIpEl.innerText = window.lastCalculatedRealOnline;
    if (((window.SiteConfig && window.SiteConfig.cfgDataMode) || 'real') === 'real') { const oEl = document.getElementById('onlineCount'); if(oEl) oEl.innerText = window.lastCalculatedRealOnline; }
}

function renderTrafficChart(logs) {
    if (typeof echarts === 'undefined') return; const chartDom = document.getElementById('trafficChart'); if(!chartDom) return;
    if (myTrafficChart) myTrafficChart.dispose(); myTrafficChart = echarts.init(chartDom, window.isNightMode ? 'dark' : null);
    
    let dateCountMap = {}; const accessLogs = logs.filter(log => log.dataType !== 'PROXY_USAGE' && log.dataType !== 'BATCH_CLEAN' && log.dataType !== 'FEEDBACK' && log.dataType !== 'SINGLE_GEN' && log.dataType !== 'PROXY_TEST' && log.time !== 'PROXY_USAGE');
    accessLogs.forEach(log => {
        let actualTime = log.time; if (log.dataType && (log.dataType.includes('/') || log.dataType.includes('-'))) actualTime = log.dataType;
        if(!actualTime) return; 
        let d = new Date(actualTime); let dateStr = "";
        if (!isNaN(d.getTime())) { dateStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`; } else { dateStr = actualTime.split('T')[0].split(' ')[0]; }
        if(!dateCountMap[dateStr]) dateCountMap[dateStr] = 0; dateCountMap[dateStr]++;
    });
    let dates = Object.keys(dateCountMap).reverse(); let counts = dates.map(date => dateCountMap[date]);
    
    const option = {
        backgroundColor: 'transparent', tooltip: { trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } } }, 
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        dataZoom: [ { type: 'slider', show: true, xAxisIndex: [0], start: 0, end: 100, bottom: 0, borderColor: 'transparent', textStyle: { color: window.isNightMode ? '#c9d1d9' : '#57606a' } }, { type: 'inside', xAxisIndex: [0], start: 0, end: 100 } ],
        xAxis: [{ type: 'category', boundaryGap: false, data: dates, axisLine: { lineStyle: { color: window.isNightMode ? '#57606a' : '#cdd1d9' } }, axisLabel: { color: window.isNightMode ? '#c9d1d9' : '#57606a' } }],
        yAxis: [{ type: 'value', minInterval: 1, splitLine: { lineStyle: { color: window.isNightMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } }, axisLabel: { color: window.isNightMode ? '#c9d1d9' : '#57606a' } }],
        series: [{ name: '真实曝光频次', type: 'line', smooth: true, lineStyle: { width: 3, color: '#007AFF' }, showSymbol: true, symbolSize: 8, itemStyle: { color: '#007AFF' }, areaStyle: { opacity: 0.8, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(0, 122, 255, 0.4)' }, { offset: 1, color: 'rgba(0, 122, 255, 0.01)' }]) }, data: counts }]
    };
    myTrafficChart.setOption(option);
}
