// ================== 1. 数据资产静态映射区 ==================
const proxyList = [
    { name: '李俊鑫组 美区前置', imgPath: 'images/proxy1.jpg' },
    { name: '宋磊马宇航组 美区前置', imgPath: 'images/proxy2.jpg' },
    { name: '慕杰组 美区前置', imgPath: 'images/proxy3.jpg' },
    { name: '台湾前置代理', imgPath: 'images/proxy4.jpg' }
];

const companyWifiList = [
    { name: 'IU', imgPath: 'images/wifi1.jpg' },
    { name: '@WorkerSaas', imgPath: 'images/wifi2.jpg' },
    { name: 'Advert  Jingda2025', imgPath: 'images/wifi3.jpg' },
    { name: 'JD-IN Jingda2025', imgPath: 'images/wifi4.jpg' },
    { name: 'JD-TEST JDTester2025!', imgPath: 'images/wifi5.jpg' }
];

const REPORT_API_URL = "https://script.google.com/macros/s/AKfycbx-1u4836W99nFQxVkhbDKdc9uBnZEBWtI88m6PwhoTiAtkM4QdPFXmu8YMr_2SdYhvDg/exec".trim();

let myTrafficChart = null; 
window.isNightMode = localStorage.getItem('theme') === 'night';
window.lastCalculatedRealOnline = 1;
window.operatorIp = "未知 IP"; 
window.operatorGeo = "未知地区";
window.currentVisitCounted = false; 

window.getChinaTime = function() { return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); };

// 🚀 超级智能解析引擎 (兼容中文冒号、空格、换行、多余符号)
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
    if (typeof window.resizeCanvas === 'function') window.resizeCanvas();
    window.addEventListener('resize', () => { if (typeof window.resizeCanvas === 'function') window.resizeCanvas(); });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            document.getElementById('mainWrapper').scrollTop = 0; 
            if(btn.dataset.tab === 'adminPanel' && myTrafficChart) { setTimeout(() => myTrafficChart.resize(), 100); }
        }
    });

    const wifiModal = document.getElementById('wifiModal');
    if(wifiModal) wifiModal.addEventListener('click', (e) => { if (e.target === wifiModal) closeWifiModal(); });
    const feedbackModal = document.getElementById('feedbackModal');
    if(feedbackModal) feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeFeedbackModal(); });
    document.onkeydown = (e) => { if(e.key === 'Escape') { closeWifiModal(); closeFeedbackModal(); } }

    applyTheme();
    renderStaticCards(); 
    
    if (typeof window.createParticles === 'function') { window.createParticles(); window.animate(); }
    
    if (localStorage.getItem('keepAdminOpen') === 'true') {
        document.getElementById('adminTabBtn').style.display = "block";
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
    proxyList.forEach(item => { if(proxyGrid) proxyGrid.innerHTML += `<div class="wifi-card" onclick="openModalWithImage('${item.name}', '${item.imgPath}')"><div class="wifi-qr-box"><img src="${item.imgPath}" class="qr-img" onerror="this.style.display='none'"></div><div class="wifi-card-title">${item.name}</div></div>`; });
    companyWifiList.forEach(item => { if(companyGrid) companyGrid.innerHTML += `<div class="wifi-card" onclick="openModalWithImage('${item.name}', '${item.imgPath}')"><div class="wifi-qr-box"><img src="${item.imgPath}" class="qr-img" onerror="this.style.display='none'"></div><div class="wifi-card-title">${item.name}</div></div>`; });
}

function copyToClipboard(elementId) { const el = document.getElementById(elementId); if (!el || el.innerText.includes('等待')) return showToast('无有效数据可复制'); navigator.clipboard.writeText(el.innerText).then(() => { showToast('✅ 复制成功'); }); }
function showToast(message) { const toast = document.getElementById('toast'); toast.innerText = message; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 1200); }
function openModalWithImage(title, imgSrc) { const modal = document.getElementById('wifiModal'); if(!modal) return; document.getElementById('modalTitle').innerText = title; document.getElementById('modalQrBox').innerHTML = `<img src="${imgSrc}" onerror="this.style.display='none'">`; modal.style.display = 'flex'; }
function closeWifiModal() { const m = document.getElementById('wifiModal'); if(m) m.style.display = 'none'; }
function openFeedbackModal() { const m = document.getElementById('feedbackModal'); if(m) m.style.display = 'flex'; }
function closeFeedbackModal() { const m = document.getElementById('feedbackModal'); if(m) m.style.display = 'none'; }
function waitForQRCode(callback) { if (window.QRCode) return callback(); setTimeout(() => waitForQRCode(callback), 50); }

function startOnlineHeartbeat() {
    const onlineEl = document.getElementById('onlineCount'); if(!onlineEl) return;
    const runHeartbeat = () => {
        const mode = localStorage.getItem('cfgDataMode') || 'real';
        if (mode === 'custom') { let fixed = parseInt(localStorage.getItem('cfgOnlineFixed') || '25', 10); onlineEl.innerText = fixed + Math.floor(Math.random() * 3); } 
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
const musicFiles = [ "小瀬村晶 - Summer Ghost.mp3" ];
window.musicFiles = musicFiles;
let currentTrackIndex = 0; let audioEl = null; let isPlaying = false; let playMode = 'sequence';   

// 🚀 全局快捷键监听 (规避输入框)
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
    audioEl.addEventListener('loadedmetadata', () => { const totalEl = document.getElementById('totalTime'); if(totalEl) totalEl.innerText = formatTime(audioEl.duration); });
    loadTrack(currentTrackIndex); 
}

function loadTrack(index) {
    if(!audioEl || musicFiles.length === 0) return; 
    const fileName = musicFiles[index];
    audioEl.src = "music/" + fileName;
    const fullName = fileName.replace(/\.[^/.]+$/, ""); 
    const titleEl = document.getElementById('musicTitle'); if(titleEl) titleEl.innerText = fullName;
    let coverName = fullName;
    if (fullName.includes(" - ")) { coverName = fullName.split(" - ")[1].trim(); } else if (fullName.includes("-")) { coverName = fullName.split("-")[1].trim(); }
    const coverEl = document.getElementById('musicDisc');
    if (coverEl && coverEl.tagName === 'IMG') {
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(coverName)}&background=random&color=fff&size=128&rounded=true&bold=true`;
        coverEl.src = avatarUrl;
    }
    const progEl = document.getElementById('musicProgress'); if(progEl) progEl.style.width = '0%';
    const curEl = document.getElementById('currentTime'); if(curEl) curEl.innerText = '0:00';
}
function toggleMusic() { if(!audioEl) return; if(isPlaying) pauseAudio(); else playAudio(); }
function playAudio() { if(!audioEl) return; audioEl.play().then(() => { isPlaying = true; updateUIState(); }).catch(e => { isPlaying = false; updateUIState(); }); }
function pauseAudio() { if(!audioEl) return; audioEl.pause(); isPlaying = false; updateUIState(); }
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
    if (playMode === 'shuffle') { let nextIdx = currentTrackIndex; if(musicFiles.length > 1) { while(nextIdx === currentTrackIndex) nextIdx = Math.floor(Math.random() * musicFiles.length); } currentTrackIndex = nextIdx; } 
    else { currentTrackIndex = (currentTrackIndex + 1) % musicFiles.length; }
    loadTrack(currentTrackIndex); if (isPlaying) playAudio();
}
function prevTrack() {
    if (playMode === 'shuffle') { let nextIdx = currentTrackIndex; if(musicFiles.length > 1) { while(nextIdx === currentTrackIndex) nextIdx = Math.floor(Math.random() * musicFiles.length); } currentTrackIndex = nextIdx; } 
    else { currentTrackIndex = (currentTrackIndex - 1 + musicFiles.length) % musicFiles.length; }
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

// ================== 6. IP生成 / 报表清洗 / 定位引擎 ==================

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

// 🔥 终极防墙防拦截网络引擎 (带中文纯净转换字典)
async function fetchGeoDetail(ip) {
    const processGeo = (country, region, city, lat, lon, timezone, zip) => {
        let c = country || ''; let r = region || '';
        
        // 🚀 新增：全中文强制翻译字典
        const dict = {
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

        if (dict[c]) c = dict[c];
        if (dict[r]) r = dict[r];

        // 智能去重：如果国家是台湾，省也是台湾，则省份留空
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
    
    // 🚨 为了严谨不误导，明确提示这是在测绘位置，而不是测试 SOCKS5 连通性
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


// ================== 8. 审计大屏 ==================
let clickCount = 0; let logoTimer = null;
function triggerAdminCount() {
    clickCount++; clearTimeout(logoTimer); logoTimer = setTimeout(() => { clickCount = 0; }, 2000);
    if (clickCount >= 5) { 
        clickCount = 0; 
        if (prompt("🔒 [Admin Access] 请输入指令密钥:") === "Qq112233") { 
            document.getElementById('adminTabBtn').style.display = "block"; showToast("🔓 系统已挂载，开启上帝视角"); injectAdminControls(); refreshAdminLogs(); 
        } else { showToast("❌ 密码错误"); } 
    }
}

window.toggleAdminPersist = function(checkbox) { localStorage.setItem('keepAdminOpen', checkbox.checked ? 'true' : 'false'); showToast(checkbox.checked ? "📌 大屏已锁定，刷新不再消失" : "🔓 已解除锁定，刷新将隐藏"); };

function injectAdminControls() {
    const container = document.getElementById('adminControlContainer'); if (!container || document.getElementById('adminControlBox')) return;
    const mode = localStorage.getItem('cfgDataMode') || 'real'; const totalMode = localStorage.getItem('cfgTotalMode') || 'offset'; const offset = localStorage.getItem('cfgTotalOffset') || '1240'; const totalFixed = localStorage.getItem('cfgTotalFixed') || '8888'; const onlineFixed = localStorage.getItem('cfgOnlineFixed') || '25'; const isLocked = localStorage.getItem('keepAdminOpen') === 'true' ? 'checked' : '';
    
    container.innerHTML = `
        <div id="adminControlBox" style="margin-bottom:20px; padding:20px; border:1px solid #e6a23c; border-radius:12px; background:rgba(230,162,60,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                <h4 style="color:#e6a23c; font-size:15px; font-weight:700; margin:0; display:flex; align-items:center; gap:15px;">🎛️ 数据看板全局展示策略控制台 <label style="font-size:13px; font-weight:normal; color:var(--text-color); cursor:pointer; display:flex; align-items:center; gap:5px; background:var(--glass-bg); padding:4px 10px; border-radius:6px; border:1px solid var(--glass-border);"><input type="checkbox" ${isLocked} onchange="toggleAdminPersist(this)"> 📌 锁定大屏</label></h4>
                <div class="admin-switch-group" style="margin:0;"><label class="admin-radio-label"><input type="radio" name="cfgDataMode" value="real" ${mode === 'real' ? 'checked' : ''} onchange="toggleAdminInputs()"> 🟢 实时真实数据</label><label class="admin-radio-label"><input type="radio" name="cfgDataMode" value="custom" ${mode === 'custom' ? 'checked' : ''} onchange="toggleAdminInputs()"> 🛠️ 自定义修正数据</label></div>
            </div>
            <div id="customDataInputs" style="display:${mode === 'custom' ? 'flex' : 'none'}; gap:20px; flex-wrap:wrap; margin-bottom:15px; padding:15px; background:var(--glass-card); border-radius:10px; border: 1px dashed var(--glass-border);">
                <div style="flex:1; min-width:200px; padding-right:15px; border-right:1px dashed var(--glass-border);"><h5 style="margin-bottom:10px; color:var(--text-color);">👥 当前在线人数控制</h5><div class="form-group" style="margin-bottom:0;"><label>固定基准数值 (会自动波动)：</label><input type="number" id="cfgOnlineFixed" value="${onlineFixed}"></div></div>
                <div style="flex:1; min-width:200px;"><h5 style="margin-bottom:10px; color:var(--text-color);">🚀 累计服务人数控制</h5><div style="display:flex; gap:10px;"><div class="form-group" style="flex:1; margin-bottom:0;"><label>模式：</label><select id="cfgTotalMode" onchange="document.getElementById('cfgTotalFixedWrap').style.display = this.value === 'fixed' ? 'block' : 'none'; document.getElementById('cfgTotalOffsetWrap').style.display = this.value === 'offset' ? 'block' : 'none';" style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid var(--glass-border); background:transparent; color:var(--text-color);"><option value="offset" ${totalMode === 'offset' ? 'selected' : ''}>真实台账数 + 加成</option><option value="fixed" ${totalMode === 'fixed' ? 'selected' : ''}>锁定为固定</option></select></div><div class="form-group" id="cfgTotalOffsetWrap" style="flex:1; margin-bottom:0; display:${totalMode === 'offset' ? 'block' : 'none'};"><label>加成数值：</label><input type="number" id="cfgTotalOffset" value="${offset}"></div><div class="form-group" id="cfgTotalFixedWrap" style="flex:1; margin-bottom:0; display:${totalMode === 'fixed' ? 'block' : 'none'};"><label>固定数值：</label><input type="number" id="cfgTotalFixed" value="${totalFixed}"></div></div></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:15px; padding-top:15px; border-top:1px dashed var(--glass-border);"><button class="btn-primary" onclick="saveAdminConfig()">🚀 保存并全局下发</button><div style="font-size:12px; color:var(--text-muted); font-weight:600;">📊 物理真实数据 —— 总条数: <span id="realTotalRow" style="color:#007AFF;">--</span> | 活跃终端: <span id="realOnlineIp" style="color:#34C759;">--</span> 个</div></div>
        </div>`;
}

window.toggleAdminInputs = function() { const mode = document.querySelector('input[name="cfgDataMode"]:checked').value; document.getElementById('customDataInputs').style.display = mode === 'custom' ? 'flex' : 'none'; };

window.saveAdminConfig = function() {
    const mode = document.querySelector('input[name="cfgDataMode"]:checked').value; const tMode = document.getElementById('cfgTotalMode').value; const tOffset = document.getElementById('cfgTotalOffset').value.trim() || '0'; const tFixed = document.getElementById('cfgTotalFixed').value.trim() || '0'; const oFixed = document.getElementById('cfgOnlineFixed').value.trim() || '1'; 
    localStorage.setItem('cfgDataMode', mode); localStorage.setItem('cfgTotalMode', tMode); localStorage.setItem('cfgTotalOffset', tOffset); localStorage.setItem('cfgTotalFixed', tFixed); localStorage.setItem('cfgOnlineFixed', oFixed); 
    showToast("🔄 正在向云端下发全局指令..."); 
    if (REPORT_API_URL) {
        const configData = { dataType: 'UPDATE_CONFIG', cfgDataMode: mode, cfgTotalMode: tMode, cfgTotalOffset: tOffset, cfgTotalFixed: tFixed, cfgOnlineFixed: oFixed };
        fetch(REPORT_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(configData) }).then(() => { setTimeout(() => showToast("✅ 全局指令下发成功！"), 1000); refreshAdminLogs(); }).catch(()=>{ showToast("❌ 网络异常"); });
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
    let cachedTotal = parseInt(localStorage.getItem('lastTotalCount') || '0', 10);
    if (!window.currentVisitCounted) { cachedTotal += 1; }
    
    let mode = localStorage.getItem('cfgDataMode') || 'real'; let tempDisplay = cachedTotal;
    if (mode === 'custom') { const tMode = localStorage.getItem('cfgTotalMode') || 'offset'; if (tMode === 'fixed') { tempDisplay = parseInt(localStorage.getItem('cfgTotalFixed') || '8888', 10); } else { tempDisplay = cachedTotal + parseInt(localStorage.getItem('cfgTotalOffset') || '1240', 10); } }
    const totalEl = document.getElementById('totalServedCount'); if(totalEl && (totalEl.innerText === '--' || totalEl.innerText === '0')) { totalEl.innerText = tempDisplay; }

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">正在建立安全信道，拉取云端数据总线...</td></tr>';
    
    if (REPORT_API_URL) {
        const noCacheUrl = REPORT_API_URL + "?t=" + new Date().getTime();
        fetch(noCacheUrl).then(res => res.json()).then(data => { 
            let logs = Array.isArray(data) ? data : (data.logs || []); let baseTotal = Array.isArray(data) ? data.length : (data.total || 0); window.lastCalculatedRealOnline = 1;
            if (!window.currentVisitCounted) { baseTotal += 1; window.currentVisitCounted = true; } localStorage.setItem('lastTotalCount', baseTotal);
            if (data.config && data.config.cfgDataMode) { localStorage.setItem('cfgDataMode', data.config.cfgDataMode); localStorage.setItem('cfgTotalMode', data.config.cfgTotalMode); localStorage.setItem('cfgTotalOffset', data.config.cfgTotalOffset); localStorage.setItem('cfgTotalFixed', data.config.cfgTotalFixed); localStorage.setItem('cfgOnlineFixed', data.config.cfgOnlineFixed); }
            mode = localStorage.getItem('cfgDataMode') || 'real'; let finalDisplay = baseTotal;
            if (mode === 'custom') { const tMode = localStorage.getItem('cfgTotalMode') || 'offset'; if (tMode === 'fixed') { finalDisplay = parseInt(localStorage.getItem('cfgTotalFixed') || '8888', 10); } else { finalDisplay = baseTotal + parseInt(localStorage.getItem('cfgTotalOffset') || '1240', 10); } }
            if(totalEl) { let startVal = parseInt(totalEl.innerText); if (isNaN(startVal)) startVal = 0; animateValue(totalEl, startVal, finalDisplay, 1500); }
            const realTotalRowEl = document.getElementById('realTotalRow'); if(realTotalRowEl) realTotalRowEl.innerText = baseTotal;
            if(logs.length > 0) { renderLogTable(logs); renderTrafficChart(logs); } else { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">大盘空置</td></tr>'; }
            startOnlineHeartbeat();
        }).catch((err) => { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#FF2D55; font-weight:bold; padding:40px">❌ 链路断开：仅展示本地缓存数据</td></tr>'; });
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
    if ((localStorage.getItem('cfgDataMode') || 'real') === 'real') { const oEl = document.getElementById('onlineCount'); if(oEl) oEl.innerText = window.lastCalculatedRealOnline; }
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
