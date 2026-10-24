/* ============================================================
 * admin-cms.js —— 隐藏式后台：站点内容管理台
 * 入口：连点 Logo 5 次输入密钥 → 「🔒 审计大屏」底部
 * 能力：WiFi 卡片 / 前置代理 / 公司 WiFi / 音乐 / 背景 / 教程
 * ============================================================ */

const CMS_TOKEN_KEY = 'mnAdminToken';
let cmsState = null;
let cmsDirty = false; // 有未保存的本地修改时，不允许被远程内容覆盖
// 审计大屏所有区块默认均为折叠状态（打开页面即收起，点击才展开）
const cmsCollapsed = {
    topbar: true,
    help: true,
    proxy: true,
    company: true,
    wifi: true,
    music: true,
    bg: true,
    guide: true,
    nettest: true,
    appstore: true,
    pcsoft: true,
    secret: true
};

const CMS_SECTIONS = [
    { id: 'cms-sec-proxy',    key: 'proxy',    num: 1,  short: '前置代理', title: '🌐 前置代理二维码' },
    { id: 'cms-sec-company',  key: 'company',  num: 2,  short: '公司WiFi', title: '🏢 公司 WiFi 二维码' },
    { id: 'cms-sec-wifi',     key: 'wifi',     num: 3,  short: '基础网络', title: '📶 基础网络卡片（首屏动态卡片）' },
    { id: 'cms-sec-music',    key: 'music',    num: 4,  short: '音乐',     title: '🎵 背景音乐歌单' },
    { id: 'cms-sec-bg',       key: 'bg',       num: 5,  short: '背景',     title: '🎨 背景与视效' },
    { id: 'cms-sec-guide',    key: 'guide',    num: 6,  short: '教程',     title: '📖 使用教程正文（支持 Markdown / HTML）' },
    { id: 'cms-sec-nettest',  key: 'nettest',  num: 7,  short: '网络测试', title: '🧪 IP 生成页 · 网络测试卡片' },
    { id: 'cms-sec-help',     key: 'help',     num: 8,  short: '❓问号开关', title: '❓ 各区块右上角问号 (?) 显示开关与点击弹窗内容总控' },
    { id: 'cms-sec-appstore', key: 'appstore', num: 9,  short: '📱手机App', title: '📱 填写 IP 报表页 · 手机 App 下载（App Store）' },
    { id: 'cms-sec-pcsoft',   key: 'pcsoft',   num: 10, short: '💻电脑软件', title: '💻 填写 IP 报表页 · 电脑软件' },
    { id: 'cms-sec-secret',   key: 'secret',   num: 11, short: '🔒隐藏专区', title: '🔒 填写 IP 报表页 · 隐藏专区（默认隐藏，总开关控制）' }
];

// 初始化全局卡片数据的 visible 默认值（默认 true），并挂载日夜切换时的视频背景联动
(function initDefaultVisibleAndVideoHook() {
    [typeof baseWifiCards !== 'undefined' ? baseWifiCards : null,
     typeof proxyList !== 'undefined' ? proxyList : null,
     typeof companyWifiList !== 'undefined' ? companyWifiList : null].forEach(arr => {
        if (Array.isArray(arr)) {
            arr.forEach(item => {
                if (item && item.visible === undefined) item.visible = true;
            });
        }
    });

    const origApplyTheme = window.applyTheme;
    window.applyTheme = function () {
        if (typeof origApplyTheme === 'function') origApplyTheme.apply(this, arguments);
        if (typeof window.applyBgVideo === 'function') window.applyBgVideo();
    };

    const origToggleTheme = window.toggleTheme;
    window.toggleTheme = function () {
        if (typeof origToggleTheme === 'function') origToggleTheme.apply(this, arguments);
        if (typeof window.applyBgVideo === 'function') window.applyBgVideo();
    };
})();

/**
 * 状态文案辅助
 */
function proxyStatusLabel(stOrStatus) {
    const dot = typeof stOrStatus === 'object' && stOrStatus ? (stOrStatus.dotState || stOrStatus.status) : stOrStatus;
    const status = typeof stOrStatus === 'object' && stOrStatus ? stOrStatus.status : stOrStatus;
    if (status === 'expired') return '数据过期（超过30分钟未更新）';
    if (dot === 'slow') return '较慢（1.5~3s）';
    if (status === 'up' || dot === 'up') return '节点可用（优质 <1.5s）';
    if (status === 'down' || dot === 'down') return '节点断网 / 不可用';
    return '待检测';
}

/**
 * 构建前置代理卡片底部副文案 HTML
 *  - < 1.5s：绿点（优质）
 *  - 1.5 ~ 3s：黄点（显示"较慢"）
 *  - > 3s 或超时：红点 down
 *  - 超过 30 分钟未更新：灰色"数据过期"
 *  - 显示"最近探测于 xx:xx"及手动备注
 */
function buildProxyMetaHtml(item, st) {
    const firstOnline = st.firstOnlineAt || (item && item.firstOnlineAt) || '—';
    let statusLine = '';
    if (st.status === 'up') {
        const loc = st.locationText || '海外出口';
        const latSec = st.latencySecText
            || (st.latencyMs > 0 ? `${(Number(st.latencyMs) / 1000).toFixed(2)}s` : '正常');
        if (st.dotState === 'slow' || st.quality === 'slow') {
            statusLine = `<div class="proxy-meta-line proxy-meta-slow">📍 出口：${esc(loc)} · 🐢 ${esc(latSec)} · 较慢</div>`;
        } else {
            statusLine = `<div class="proxy-meta-line proxy-meta-up">📍 出口：${esc(loc)} · ⚡ ${esc(latSec)}${st.isManual ? '（强制标绿）' : ''}</div>`;
        }
    } else if (st.status === 'down') {
        const downTime = (item && item.statusOverride === 'down' && item.manualDownAt)
            ? item.manualDownAt
            : (st.downAt || '—');
        statusLine = `<div class="proxy-meta-line proxy-meta-down">⚠️ 断网：${esc(downTime)}${st.isManual ? '（强制标红）' : ''}</div>`;
    } else if (st.status === 'expired' || st.isExpired) {
        statusLine = `<div class="proxy-meta-line proxy-meta-expired">⚪ 状态：数据过期</div>`;
    } else {
        statusLine = `<div class="proxy-meta-line proxy-meta-unknown">⚪ 状态：待检测</div>`;
    }

    const noteVal = String((item && item.manualNote) || st.manualNote || '').trim();
    const noteLine = noteVal
        ? `<div class="proxy-meta-line proxy-meta-note" title="${esc(noteVal)}">📌 备注：${esc(noteVal)}</div>`
        : '';

    const checkCls = (st.status === 'expired' || st.isExpired) ? 'proxy-meta-expired' : 'proxy-meta-check';
    const checkLine = `<div class="proxy-meta-line ${checkCls}">🕒 ${esc(st.checkedAgoText || '待检测')}</div>`;
    return `
        <div class="proxy-meta-line proxy-meta-online">📅 首次上线：${esc(firstOnline)}</div>
        ${statusLine}
        ${noteLine}
        ${checkLine}
    `;
}

const dismissedProxyMasks = new Set();

/**
 * 点击「点击临时查看」按钮：临时去掉当前卡片的毛玻璃遮罩，显示二维码和一键复制按钮（刷新页面恢复）
 */
window.dismissProxyMask = function (idx, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    dismissedProxyMasks.add(Number(idx));
    const cardEl = document.querySelector(`#proxyGrid .proxy-card[data-proxy-idx="${idx}"]`);
    if (cardEl) {
        cardEl.classList.remove('is-unavailable');
        cardEl.classList.add('is-available');
        const maskEl = cardEl.querySelector('.proxy-unavail-mask');
        if (maskEl) maskEl.style.display = 'none';
        const copyBtn = cardEl.querySelector('.proxy-copy-btn');
        if (copyBtn) copyBtn.style.display = '';
    }
    if (typeof showToast === 'function') showToast('🔓 已临时解除遮罩（刷新页面后恢复）');
};

/**
 * 点击前置代理卡片：仅在处于未解除的 down 遮罩态时阻止放大；up / unknown（待检测）或已点「点击临时查看」时正常放大二维码
 */
window.handleProxyCardClick = function (idx) {
    const list = typeof proxyList !== 'undefined' && Array.isArray(proxyList) ? proxyList : [];
    const item = list[idx];
    if (!item) return;
    const st = typeof window.getProxyStatus === 'function'
        ? window.getProxyStatus(item)
        : { status: 'unknown' };
    if (st.status === 'down' && !dismissedProxyMasks.has(Number(idx))) {
        return;
    }

    if (item.qrMode === 'link' && item.proxyUrl) {
        const qrImg = document.querySelector(`#proxyGrid .proxy-card[data-proxy-idx="${idx}"] .qr-img`);
        if (qrImg && qrImg.src && qrImg.src.startsWith('data:image/')) {
            openModalWithImage(item.name, qrImg.src);
            return;
        }
        if (typeof waitForQRCode === 'function') {
            waitForQRCode(() => {
                QRCode.toDataURL(String(item.proxyUrl).trim(), { width: 300, margin: 2 }, (err, url) => {
                    if (!err && url) openModalWithImage(item.name, url);
                });
            });
        }
    } else {
        openModalWithImage(item.name, item.imgPath);
    }
};

/**
 * 复制前置代理链接（带 textarea fallback），并弹出轻提示「已复制前置链接」
 */
window.copyProxyUrl = function (idx, event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    const list = typeof proxyList !== 'undefined' && Array.isArray(proxyList) ? proxyList : [];
    const item = list[idx];
    if (!item) return;
    const text = String(item.proxyUrl || '').trim();

    const fallbackCopy = (str) => {
        try {
            const ta = document.createElement('textarea');
            ta.value = str;
            ta.setAttribute('readonly', 'readonly');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (e) {}
        if (typeof showToast === 'function') showToast('已复制前置链接');
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast('已复制前置链接');
        }).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
};

/**
 * 静默刷新 #proxyGrid 中各前置代理卡片的状态点、复制按钮、遮罩与副文案（不重建 DOM，避免闪烁）
 * 规则：unknown（待检测）只显示灰色圆点、不加遮罩；仅 status === 'down'（且未点击临时查看）时才盖遮罩
 */
window.updateProxyCardsInPlace = function () {
    const proxyGrid = document.getElementById('proxyGrid');
    if (!proxyGrid) return;
    const list = typeof proxyList !== 'undefined' && Array.isArray(proxyList) ? proxyList : [];
    const cards = proxyGrid.querySelectorAll('.proxy-card[data-proxy-idx]');
    cards.forEach(cardEl => {
        const idx = parseInt(cardEl.getAttribute('data-proxy-idx'), 10);
        const item = list[idx];
        if (!item) return;
        const st = typeof window.getProxyStatus === 'function'
            ? window.getProxyStatus(item)
            : { status: 'unknown', firstOnlineAt: item.firstOnlineAt || '', checkedAgoText: '待检测' };
        const isMasked = st.status === 'down' && !dismissedProxyMasks.has(idx);

        cardEl.classList.toggle('is-available', !isMasked);
        cardEl.classList.toggle('is-unavailable', isMasked);

        const dotEl = cardEl.querySelector('.proxy-status-dot');
        if (dotEl) {
            const dotCls = st.dotClass || `is-${st.dotState || st.status}`;
            dotEl.className = `proxy-status-dot ${dotCls}`;
            dotEl.title = proxyStatusLabel(st);
        }

        const copyBtn = cardEl.querySelector('.proxy-copy-btn');
        if (copyBtn) {
            copyBtn.style.display = isMasked ? 'none' : '';
        }

        const metaEl = cardEl.querySelector('.proxy-meta');
        if (metaEl) {
            metaEl.innerHTML = buildProxyMetaHtml(item, st);
        }

        const maskEl = cardEl.querySelector('.proxy-unavail-mask');
        if (maskEl) {
            maskEl.style.display = isMasked ? '' : 'none';
            const maskTxtEl = maskEl.querySelector('.proxy-unavail-text');
            if (maskTxtEl) {
                const note = String(item.manualNote || st.manualNote || '').trim();
                maskTxtEl.innerHTML = `暂时无法使用，请联系负责人${note ? `<div style="font-size:11.5px;font-weight:500;opacity:0.9;margin-top:4px;">📌 ${esc(note)}</div>` : ''}`;
            }
        }
    });
};

/**
 * 覆盖前端静态卡片渲染：过滤掉 visible === false 的前置代理与公司 WiFi 卡片
 * 1. 待探测/空 (unknown) / 数据过期 (expired) -> 灰色小圆点，【无遮罩】，二维码正常可扫可复制
 * 2. 明确 down（或 >3s 超时） -> 呼吸红点 + 毛玻璃遮罩「暂时无法使用，请联系负责人」+「点击临时查看」按钮
 * 3. up (<1.5s) -> 呼吸绿点；slow (1.5~3s) -> 呼吸黄点（显示"较慢"），均无遮罩
 */
function getCompanyCardLinkText(item) {
    if (!item || typeof item !== 'object') return '';
    const custom = String(item.qrText || item.wifiString || '').trim();
    if (custom) return custom;
    const ssid = String(item.ssid || item.name || '').trim();
    if (!ssid) return '';
    return `WIFI:T:WPA;S:${ssid};P:${String(item.pwd || '').trim()};;`;
}

window.handleCompanyCardClick = function (index) {
    const list = typeof companyWifiList !== 'undefined' && Array.isArray(companyWifiList) ? companyWifiList : [];
    const item = list[index];
    if (!item) return;
    if (item.qrMode === 'link') {
        const linkText = getCompanyCardLinkText(item);
        if (!linkText) return;
        if (/^WIFI:/i.test(linkText) || String(item.pwd || '').trim() || String(item.ssid || '').trim()) {
            if (typeof openModalWithWifiQr === 'function') {
                openModalWithWifiQr(item.name || item.ssid || '公司 WiFi', linkText, item.pwd || '');
                return;
            }
        }
        if (typeof waitForQRCode === 'function' && typeof openModalWithImage === 'function') {
            waitForQRCode(() => {
                QRCode.toDataURL(linkText, { width: 320, margin: 2 }, (err, dataUrl) => {
                    if (!err && dataUrl) openModalWithImage(item.name || '二维码', dataUrl);
                });
            });
        }
        return;
    }
    if (typeof openModalWithImage === 'function') {
        openModalWithImage(item.name || '公司 WiFi', item.imgPath || '');
    }
};

function hasCardHelpEnabled(item) {
    if (!item || typeof item !== 'object') return false;
    return (item.helpType === 'image' && Boolean(String(item.helpImg || '').trim()))
        || (item.helpType === 'text' && Boolean(String(item.helpText || '').trim()));
}

window.renderStaticCards = function () {
    const proxyGrid = document.getElementById('proxyGrid');
    const companyGrid = document.getElementById('companyGrid');
    if (proxyGrid) proxyGrid.innerHTML = '';
    if (companyGrid) companyGrid.innerHTML = '';

    const pList = typeof proxyList !== 'undefined' && Array.isArray(proxyList) ? proxyList : [];
    pList.forEach((item, idx) => {
        if (!item || item.visible === false) return;
        if (!proxyGrid) return;

        const st = typeof window.getProxyStatus === 'function'
            ? window.getProxyStatus(item)
            : { status: 'unknown', dotState: 'unknown', firstOnlineAt: item.firstOnlineAt || '', checkedAgoText: '待检测' };
        const isMasked = st.status === 'down' && !dismissedProxyMasks.has(idx);
        const isLinkMode = item.qrMode === 'link';
        const initImgSrc = isLinkMode ? '' : esc(item.imgPath || '');
        const dotCls = st.dotClass || `is-${st.dotState || st.status}`;
        const noteText = String(item.manualNote || st.manualNote || '').trim();
        const showHelp = hasCardHelpEnabled(item);

        const cardEl = document.createElement('div');
        cardEl.className = `wifi-card proxy-card ${isMasked ? 'is-unavailable' : 'is-available'}${showHelp ? ' has-help' : ''}`;
        cardEl.setAttribute('data-proxy-idx', String(idx));
        cardEl.setAttribute('data-proxy-id', String(item.id || ''));
        cardEl.onclick = () => window.handleProxyCardClick(idx);

        cardEl.innerHTML = `
            <button type="button" class="proxy-copy-btn" style="${isMasked ? 'display:none;' : ''}" onclick="copyProxyUrl(${idx}, event)" title="复制前置代理链接">复制</button>
            ${showHelp ? `<button type="button" class="card-help-btn" title="查看说明" aria-label="查看说明" onclick="event.stopPropagation(); openAnyCardHelp('proxyList', ${idx})">?</button>` : ''}
            <div class="wifi-qr-box">
                <img src="${initImgSrc}" class="qr-img" data-qr-idx="${idx}" alt="${esc(item.name)}" ${isLinkMode ? '' : 'onerror="imgFallback(this)"'}>
            </div>
            <div class="wifi-card-title proxy-card-title">
                <span class="proxy-status-dot ${dotCls}" title="${esc(proxyStatusLabel(st))}"></span>
                <span class="proxy-title-text">${esc(item.name)}</span>
            </div>
            <div class="proxy-meta">
                ${buildProxyMetaHtml(item, st)}
            </div>
            <div class="proxy-unavail-mask" style="${isMasked ? '' : 'display:none;'}" onclick="event.stopPropagation()">
                <div class="proxy-unavail-text">暂时无法使用，请联系负责人${noteText ? `<div style="font-size:11.5px;font-weight:500;opacity:0.9;margin-top:4px;">📌 ${esc(noteText)}</div>` : ''}</div>
                <button type="button" class="proxy-temp-view-btn" onclick="dismissProxyMask(${idx}, event)">点击临时查看</button>
            </div>
        `;
        proxyGrid.appendChild(cardEl);

        if (isLinkMode) {
            const imgEl = cardEl.querySelector('img.qr-img');
            const rawLink = String(item.proxyUrl || '').trim();
            if (rawLink && typeof waitForQRCode === 'function') {
                waitForQRCode(() => {
                    QRCode.toDataURL(rawLink, { width: 280, margin: 2 }, (err, dataUrl) => {
                        if (!imgEl) return;
                        if (!err && dataUrl) {
                            imgEl.src = dataUrl;
                        } else if (typeof imgFallback === 'function') {
                            imgFallback(imgEl);
                        }
                    });
                });
            } else if (imgEl && typeof imgFallback === 'function') {
                imgFallback(imgEl);
            }
        }
    });

    const cList = typeof companyWifiList !== 'undefined' && Array.isArray(companyWifiList) ? companyWifiList : [];
    cList.forEach((item, idx) => {
        if (!item || item.visible === false) return;
        if (!companyGrid) return;

        const isLinkMode = item.qrMode === 'link';
        const initImgSrc = isLinkMode ? '' : esc(item.imgPath || '');
        const showHelp = hasCardHelpEnabled(item);

        const cardEl = document.createElement('div');
        cardEl.className = 'wifi-card';
        cardEl.onclick = () => window.handleCompanyCardClick(idx);
        cardEl.innerHTML = `
            ${showHelp ? `<button type="button" class="card-help-btn" title="查看说明" aria-label="查看说明" onclick="event.stopPropagation(); openAnyCardHelp('companyWifiList', ${idx})">?</button>` : ''}
            <div class="wifi-qr-box">
                <img src="${initImgSrc}" class="qr-img" data-company-qr-idx="${idx}" alt="${esc(item.name)}" ${isLinkMode ? '' : 'onerror="imgFallback(this)"'}>
            </div>
            <div class="wifi-card-title">${esc(item.name)}</div>
        `;
        companyGrid.appendChild(cardEl);

        if (isLinkMode) {
            const imgEl = cardEl.querySelector('img.qr-img');
            const linkText = getCompanyCardLinkText(item);
            if (linkText && typeof waitForQRCode === 'function') {
                waitForQRCode(() => {
                    QRCode.toDataURL(linkText, { width: 280, margin: 2 }, (err, dataUrl) => {
                        if (!imgEl) return;
                        if (!err && dataUrl) {
                            imgEl.src = dataUrl;
                        } else if (typeof imgFallback === 'function') {
                            imgFallback(imgEl);
                        }
                    });
                });
            } else if (imgEl && typeof imgFallback === 'function') {
                imgFallback(imgEl);
            }
        }
    });
};

/* ---------------- ⚡ IP 生成页底部「网络测试」卡片渲染与原地缩放交互 ---------------- */

function normalizeNetTestUrlPair(rawUrl) {
    const raw = String(rawUrl || '').trim();
    if (!raw) return { shortUrl: '', fullUrl: '' };
    const shortUrl = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const fullUrl = /^https?:\/\//i.test(raw) ? raw : ('https://' + shortUrl);
    return { shortUrl, fullUrl };
}

window.renderNetTestCards = function () {
    const grid = document.getElementById('netTestGrid');
    if (!grid) return;

    const content = typeof window.getSiteContent === 'function' ? window.getSiteContent() : {};
    const list = (content && Array.isArray(content.netTestList))
        ? content.netTestList
        : (Array.isArray(window.netTestList) ? window.netTestList : []);

    grid.innerHTML = '';
    list.forEach((item, idx) => {
        if (!item || item.visible === false) return;
        const { shortUrl, fullUrl } = normalizeNetTestUrlPair(item.url);
        const isImgMode = item.qrMode === 'image' && Boolean(String(item.imgPath || '').trim());
        if (!shortUrl && !isImgMode) return;
        const showHelp = hasCardHelpEnabled(item);

        const cardEl = document.createElement('div');
        cardEl.className = 'net-test-card';
        cardEl.setAttribute('data-net-idx', String(idx));

        cardEl.innerHTML = `
            ${showHelp ? `<button type="button" class="card-help-btn" title="查看说明" aria-label="查看说明" onclick="event.stopPropagation(); openAnyCardHelp('netTestList', ${idx})">?</button>` : ''}
            <div class="net-test-name">${esc(item.name || shortUrl || '检测站点')}</div>
            ${shortUrl ? `<a class="net-test-url" href="${esc(fullUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="点击直达 ${esc(fullUrl)}">
                <span class="net-url-short">${esc(shortUrl)}</span>
                <span class="net-url-full">${esc(fullUrl)}</span>
            </a>` : ''}
            <div class="net-test-qr-wrap" title="悬停或点击原地放大二维码">
                <img class="net-test-qr-img" data-net-qr="${idx}" src="${isImgMode ? esc(item.imgPath) : ''}" alt="${esc(item.name)} 二维码">
            </div>
            <div class="net-test-desc">${esc(item.desc || '')}</div>
        `;

        // 鼠标悬停：原地放大展开；鼠标移开：恢复成小卡片
        cardEl.addEventListener('mouseenter', () => {
            if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
                cardEl._hoverEnterAt = Date.now();
                cardEl.classList.add('is-expanded');
            }
        });
        cardEl.addEventListener('mouseleave', () => {
            cardEl.classList.remove('is-expanded');
        });

        // 点击小二维码或卡片空白处：原地切换展开 / 收起（不新开窗口）
        cardEl.addEventListener('click', (e) => {
            if (e.target && e.target.closest && (e.target.closest('a.net-test-url') || e.target.closest('.card-help-btn'))) return;
            const now = Date.now();
            if (cardEl.classList.contains('is-expanded') && cardEl._hoverEnterAt && (now - cardEl._hoverEnterAt < 240)) {
                cardEl._hoverEnterAt = 0;
                return;
            }
            cardEl._hoverEnterAt = 0;
            cardEl.classList.toggle('is-expanded');
        });

        grid.appendChild(cardEl);

        if (!isImgMode && fullUrl && typeof waitForQRCode === 'function') {
            waitForQRCode(() => {
                const imgEl = cardEl.querySelector('img.net-test-qr-img');
                QRCode.toDataURL(fullUrl, { width: 220, margin: 1 }, (err, dataUrl) => {
                    if (!err && dataUrl && imgEl) {
                        imgEl.src = dataUrl;
                    }
                });
            });
        }
    });
};

/* ---------------- 📋 填写 IP 报表页底部三大新区块渲染：手机 App 下载 / 电脑软件 / 隐藏专区 ---------------- */

function adjustBatchPopcardPosition(slotEl) {
    if (!slotEl) return;
    const popEl = slotEl.querySelector('.app-dl-popcard, .pc-soft-popcard');
    if (!popEl) return;
    popEl.classList.remove('align-left', 'align-right');
    try {
        const slotRect = slotEl.getBoundingClientRect();
        const parentEl = slotEl.parentElement || document.body;
        const parentRect = parentEl.getBoundingClientRect();
        const centerOffset = (slotRect.left + slotRect.width / 2) - parentRect.left;
        const parentWidth = parentRect.width || window.innerWidth;
        if (centerOffset < 130) {
            popEl.classList.add('align-left');
        } else if (parentWidth - centerOffset < 130) {
            popEl.classList.add('align-right');
        }
    } catch (e) {}
}

function renderQrChipSectionGrid(gridId, listKey, rawList, showIconInChip) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    const list = Array.isArray(rawList) ? rawList : [];
    list.forEach((item, idx) => {
        if (!item || item.visible === false) return;
        const isImgMode = item.qrMode === 'image' && Boolean(String(item.imgPath || '').trim());
        const { fullUrl } = normalizeNetTestUrlPair(item.url);
        if (!isImgMode && !fullUrl && !item.name) return;

        const iconUrl = typeof window.getDefaultAppIcon === 'function'
            ? window.getDefaultAppIcon(item.name, item.icon)
            : String(item.icon || '').trim();
        const showHelp = hasCardHelpEnabled(item);

        const slotEl = document.createElement('div');
        slotEl.className = 'app-dl-slot';
        slotEl.setAttribute('data-slot-idx', String(idx));

        slotEl.innerHTML = `
            <div class="app-dl-chip" role="button" tabindex="0" aria-expanded="false">
                ${showIconInChip && iconUrl ? `<img class="app-dl-chip-icon" src="${esc(iconUrl)}" alt="${esc(item.name)}" onerror="this.style.display='none'">` : ''}
                <span class="app-dl-chip-name">${esc(item.name || '未命名')}</span>
                ${showHelp ? `<button type="button" class="card-help-btn app-chip-help-btn" title="查看说明" aria-label="查看说明" onclick="event.stopPropagation(); openAnyCardHelp('${listKey}', ${idx})">?</button>` : ''}
            </div>
            <div class="app-dl-popcard">
                ${showHelp ? `<button type="button" class="card-help-btn" title="查看说明" aria-label="查看说明" onclick="event.stopPropagation(); openAnyCardHelp('${listKey}', ${idx})">?</button>` : ''}
                <div class="app-dl-pop-title">
                    ${iconUrl ? `<img class="app-dl-pop-mini-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">` : ''}
                    <span>${esc(item.name || '未命名')}</span>
                </div>
                <div class="app-dl-qr-wrap">
                    <img class="app-dl-qr-img" src="${isImgMode ? esc(item.imgPath) : ''}" alt="${esc(item.name)} 二维码">
                    ${iconUrl ? `<div class="app-dl-qr-logo-box"><img class="app-dl-qr-logo" src="${esc(iconUrl)}" alt="${esc(item.name)}" onerror="this.parentElement.style.display='none'"></div>` : ''}
                </div>
                <div class="app-dl-desc">${esc(item.desc || '使用手机相机扫码直达')}</div>
            </div>
        `;

        // 鼠标悬停：原地放大展开；鼠标移开：恢复小图标
        slotEl.addEventListener('mouseenter', () => {
            if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
                grid.querySelectorAll('.app-dl-slot.is-expanded').forEach(other => {
                    if (other !== slotEl) other.classList.remove('is-expanded');
                });
                adjustBatchPopcardPosition(slotEl);
                slotEl._hoverEnterAt = Date.now();
                slotEl.classList.add('is-expanded');
            }
        });
        slotEl.addEventListener('mouseleave', () => {
            slotEl.classList.remove('is-expanded');
        });

        // 点击图标或展开卡片：原地切换展开 / 收起（不新开窗口/新标签）
        slotEl.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('.card-help-btn')) return;
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (slotEl.classList.contains('is-expanded') && slotEl._hoverEnterAt && (now - slotEl._hoverEnterAt < 250)) {
                slotEl._hoverEnterAt = 0;
                return;
            }
            slotEl._hoverEnterAt = 0;
            const willExpand = !slotEl.classList.contains('is-expanded');
            grid.querySelectorAll('.app-dl-slot.is-expanded').forEach(other => {
                if (other !== slotEl) other.classList.remove('is-expanded');
            });
            if (willExpand) {
                adjustBatchPopcardPosition(slotEl);
                slotEl.classList.add('is-expanded');
            } else {
                slotEl.classList.remove('is-expanded');
            }
        });

        grid.appendChild(slotEl);

        if (!isImgMode && fullUrl && typeof waitForQRCode === 'function') {
            waitForQRCode(() => {
                const imgEl = slotEl.querySelector('img.app-dl-qr-img');
                QRCode.toDataURL(fullUrl, { width: 260, margin: 1, errorCorrectionLevel: 'H' }, (err, dataUrl) => {
                    if (!err && dataUrl && imgEl) {
                        imgEl.src = dataUrl;
                    }
                });
            });
        }
    });
}

function renderPcSoftSectionGrid(rawList) {
    const grid = document.getElementById('pcSoftGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const list = Array.isArray(rawList) ? rawList : [];
    list.forEach((item, idx) => {
        if (!item || item.visible === false) return;
        const { fullUrl } = normalizeNetTestUrlPair(item.url);
        if (!item.name && !fullUrl) return;
        const showHelp = hasCardHelpEnabled(item);

        const slotEl = document.createElement('div');
        slotEl.className = 'pc-soft-slot';
        slotEl.setAttribute('data-pc-idx', String(idx));

        slotEl.innerHTML = `
            <a class="pc-soft-chip" href="${esc(fullUrl || '#')}" target="_blank" rel="noopener noreferrer" title="点击新标签页打开 ${esc(item.name)}">
                <span class="pc-soft-chip-name">${esc(item.name || '未命名软件')}</span>
                ${showHelp ? `<button type="button" class="card-help-btn pc-chip-help-btn" title="查看说明" aria-label="查看说明" onclick="event.preventDefault(); event.stopPropagation(); openAnyCardHelp('pcSoftList', ${idx})">?</button>` : ''}
            </a>
            <a class="pc-soft-popcard" href="${esc(fullUrl || '#')}" target="_blank" rel="noopener noreferrer" title="点击新标签页直达下载：${esc(fullUrl)}">
                ${showHelp ? `<button type="button" class="card-help-btn" title="查看说明" aria-label="查看说明" onclick="event.preventDefault(); event.stopPropagation(); openAnyCardHelp('pcSoftList', ${idx})">?</button>` : ''}
                <div class="pc-soft-pop-title">
                    <span>${esc(item.name || '未命名软件')}</span>
                    <span class="pc-soft-ext-icon" aria-hidden="true">↗</span>
                </div>
                <div class="pc-soft-desc">${esc(item.desc || '点击直接在新标签页打开官方下载页面')}</div>
            </a>
        `;

        slotEl.addEventListener('mouseenter', () => {
            if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
                grid.querySelectorAll('.pc-soft-slot.is-expanded').forEach(other => {
                    if (other !== slotEl) other.classList.remove('is-expanded');
                });
                adjustBatchPopcardPosition(slotEl);
                slotEl.classList.add('is-expanded');
            }
        });
        slotEl.addEventListener('mouseleave', () => {
            slotEl.classList.remove('is-expanded');
        });

        grid.appendChild(slotEl);
    });
}

window.renderBatchExtraSections = function () {
    const content = typeof window.getSiteContent === 'function' ? window.getSiteContent() : {};
    const appList = (content && Array.isArray(content.appStoreList))
        ? content.appStoreList
        : (Array.isArray(window.appStoreList) ? window.appStoreList : []);
    const pcList = (content && Array.isArray(content.pcSoftList))
        ? content.pcSoftList
        : (Array.isArray(window.pcSoftList) ? window.pcSoftList : []);
    const secretList = (content && Array.isArray(content.secretZoneList))
        ? content.secretZoneList
        : (Array.isArray(window.secretZoneList) ? window.secretZoneList : []);
    const secretEnabled = Boolean(content && content.secretZoneEnabled);

    // 1. 手机 App 下载（App Store）
    renderQrChipSectionGrid('appStoreGrid', 'appStoreList', appList, true);

    // 2. 电脑软件
    renderPcSoftSectionGrid(pcList);

    // 3. 隐藏专区（默认完全不显示，开启总开关后才出现）
    const secretSec = document.getElementById('secretZoneSection');
    if (secretSec) {
        secretSec.style.display = secretEnabled ? 'block' : 'none';
    }
    if (secretEnabled) {
        renderQrChipSectionGrid('secretZoneGrid', 'secretZoneList', secretList, true);
    }
};

// 点击页面空白处时自动收起所有已展开的 App 卡片
document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.app-dl-slot')) return;
    document.querySelectorAll('.app-dl-slot.is-expanded').forEach(el => el.classList.remove('is-expanded'));
});

/**
 * 覆盖前端基础网络卡片渲染：过滤掉 visible === false 的卡片
 */
window.applyWifiLayoutConfig = function () {
    const softRouterEl = document.getElementById('softRouterSection');
    const showSoftRouter = (localStorage.getItem('cfgShowSoftRouter') || 'false') === 'true';
    if (softRouterEl) softRouterEl.style.display = showSoftRouter ? 'block' : 'none';
    const softRouterKeyEl = document.getElementById('softRouterKey');
    if (softRouterKeyEl && typeof SOFT_ROUTER_KEY !== 'undefined') {
        softRouterKeyEl.textContent = showSoftRouter ? SOFT_ROUTER_KEY : '';
    }

    const container = document.getElementById('baseWifiContainer');
    if (!container) return;
    container.innerHTML = '';

    (typeof baseWifiCards !== 'undefined' ? baseWifiCards : []).forEach((card, idx) => {
        if (!card || card.visible === false) return;
        const cardEl = document.createElement('div');
        cardEl.className = `compact-card ${card.danger ? 'danger-card' : ''} ${card.fx && card.fx !== 'default' ? 'fx-' + card.fx : ''}`;

        cardEl.onclick = () => {
            const useLink = card.qrMode === 'link' || (card.qrMode !== 'image' && Boolean(String(card.wifiString || '').trim()));
            if (useLink) {
                const targetWifiStr = String(card.wifiString || '').trim() || `WIFI:T:WPA;S:${card.name || ''};P:${card.pwd || ''};;`;
                openModalWithWifiQr(card.name, targetWifiStr, card.pwd);
            } else {
                openModalWithImage(card.name, card.img);
            }
        };

        const tagHtml = card.tag ? `<div class="card-tag">${card.tag}</div>` : '';
        const nameClass = card.large ? 'card-name card-name-large' : 'card-name';
        const pwdClass = card.danger ? 'card-pwd pulse-blue' : 'card-pwd';
        const showHelp = hasCardHelpEnabled(card);

        cardEl.innerHTML = `
            <div class="${nameClass}">${card.name}</div>
            <div class="${pwdClass}">${card.pwd}</div>${tagHtml}
            ${showHelp
                ? `<button type="button" class="card-help-btn" title="查看使用说明" aria-label="查看使用说明" onclick="event.stopPropagation(); openAnyCardHelp('baseWifiCards', ${idx})">?</button>`
                : ''}
        `;
        container.appendChild(cardEl);
    });
};

function esc(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getAdminToken() {
    let t = localStorage.getItem(CMS_TOKEN_KEY) || '';
    if (!t) {
        t = (prompt('🔑 请输入后台管理密钥（与解锁大屏的密钥一致）:') || '').trim();
        if (t) localStorage.setItem(CMS_TOKEN_KEY, t);
    }
    return t;
}

function clone(obj) { return JSON.parse(JSON.stringify(obj || {})); }

function cmsNowChinaStr() {
    if (typeof getChinaTime === 'function') return getChinaTime();
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const nd = new Date(utc + (3600000 * 8));
    const p = (n) => String(n).padStart(2, '0');
    return `${nd.getFullYear()}/${p(nd.getMonth() + 1)}/${p(nd.getDate())} ${p(nd.getHours())}:${p(nd.getMinutes())}:${p(nd.getSeconds())}`;
}

function normalizeCmsState(state) {
    if (!state || typeof state !== 'object') return state;
    if (Array.isArray(state.baseWifiCards) && typeof window.normalizeBaseWifiCards === 'function') {
        state.baseWifiCards = window.normalizeBaseWifiCards(state.baseWifiCards);
    }
    if (Array.isArray(state.companyWifiList) && typeof window.normalizeCompanyWifiCards === 'function') {
        state.companyWifiList = window.normalizeCompanyWifiCards(state.companyWifiList);
    }
    if (Array.isArray(state.proxyList) && typeof window.normalizeProxyCards === 'function') {
        state.proxyList = window.normalizeProxyCards(state.proxyList);
    }
    if (!Array.isArray(state.netTestList)) {
        state.netTestList = (typeof window.normalizeNetTestCards === 'function' && Array.isArray(window.netTestList))
            ? window.normalizeNetTestCards(window.netTestList)
            : [];
    } else if (typeof window.normalizeNetTestCards === 'function') {
        state.netTestList = window.normalizeNetTestCards(state.netTestList);
    }
    if (!Array.isArray(state.appStoreList)) {
        state.appStoreList = (typeof window.normalizeAppStoreCards === 'function' && Array.isArray(window.appStoreList))
            ? window.normalizeAppStoreCards(window.appStoreList)
            : [];
    } else if (typeof window.normalizeAppStoreCards === 'function') {
        state.appStoreList = window.normalizeAppStoreCards(state.appStoreList);
    }
    if (!Array.isArray(state.pcSoftList)) {
        state.pcSoftList = (typeof window.normalizePcSoftCards === 'function' && Array.isArray(window.pcSoftList))
            ? window.normalizePcSoftCards(window.pcSoftList)
            : [];
    } else if (typeof window.normalizePcSoftCards === 'function') {
        state.pcSoftList = window.normalizePcSoftCards(state.pcSoftList);
    }
    if (!Array.isArray(state.secretZoneList)) {
        state.secretZoneList = (typeof window.normalizeSecretZoneCards === 'function' && Array.isArray(window.secretZoneList))
            ? window.normalizeSecretZoneCards(window.secretZoneList)
            : [];
    } else if (typeof window.normalizeSecretZoneCards === 'function') {
        state.secretZoneList = window.normalizeSecretZoneCards(state.secretZoneList);
    }
    state.secretZoneEnabled = !!state.secretZoneEnabled;
    if (typeof window.normalizeSectionBlocks === 'function') {
        state.sectionBlocks = window.normalizeSectionBlocks(state.sectionBlocks, state);
        state.wifiTitle = state.sectionBlocks.wifi.title;
        state.wifiTip = state.sectionBlocks.wifi.tip;
        state.netTestTip = state.sectionBlocks.netTest.tip;
    }
    return state;
}

/** 前台「基础网络卡片」展示开关同步（存在 localStorage，保存时同步到云端） */
function getShownIds() {
    const raw = localStorage.getItem('cfgShowWifiCards') || '';
    return raw.split(',').filter(Boolean);
}
function setShownIds(ids) {
    localStorage.setItem('cfgShowWifiCards', ids.filter(Boolean).join(','));
}

/** 切换任意分组卡片的 visible 状态（仅标记待保存，随 SAVE_CONTENT 提交） */
window.cmsToggleVisible = function (group, index, checked) {
    const list = cmsState && cmsState[group];
    const item = list && list[index];
    if (!item) return;
    cmsDirty = true;
    item.visible = !!checked;
    if (group === 'baseWifiCards') {
        setShownIds((cmsState.baseWifiCards || []).filter(c => c && c.visible !== false).map(c => c.id));
    }
    renderCmsPanel();
};

// 兼容旧调用
window.cmsToggleShow = function (index, checked) {
    window.cmsToggleVisible('baseWifiCards', index, checked);
};

/** 通用：切换任意分组卡片的「?」帮助弹窗类型（'' / 'image' / 'text'） */
window.cmsSetAnyCardHelpType = function (group, index, value) {
    const list = cmsState && cmsState[group];
    const card = list && list[index];
    if (!card) return;
    cmsDirty = true;
    card.helpType = (value === 'image' || value === 'text') ? value : '';
    if (card.helpType === 'text' && !card.helpText) {
        card.helpText = `# ${card.name || '卡片'} 使用说明\n\n在这里填写该卡片的文字说明…\n\n:::success 小贴士\n支持 Markdown 语法\n:::`;
    }
    renderCmsPanel();
};

window.cmsSetCardHelpType = function (index, value) {
    window.cmsSetAnyCardHelpType('baseWifiCards', index, value);
};

/** 通用：切换任意分组卡片的二维码添加方式（'image' 上传图片 / 'link' 输入链接自动生成） */
window.cmsSetCardQrMode = function (group, index, mode) {
    const list = cmsState && cmsState[group];
    const item = list && list[index];
    if (!item) return;
    cmsDirty = true;
    item.qrMode = mode === 'link' ? 'link' : 'image';
    if (group === 'baseWifiCards') {
        if (item.qrMode === 'link') {
            if (!item.wifiString) {
                item.wifiString = `WIFI:T:WPA;S:${item.name || ''};P:${item.pwd || ''};;`;
            }
        } else {
            item.wifiString = '';
        }
    } else if (group === 'companyWifiList') {
        if (item.qrMode === 'link') {
            if (!item.ssid && item.name) item.ssid = item.name;
            if (!item.qrText && item.ssid) {
                item.qrText = `WIFI:T:WPA;S:${item.ssid};P:${item.pwd || ''};;`;
            }
        }
    }
    renderCmsPanel();
};

/** 独立开关：一键开启 / 关闭任意区块右上角「?」问号按钮显示 */
window.cmsToggleSectionHelp = function (secKey, enabled) {
    if (!cmsState) cmsState = normalizeCmsState(clone(window.getSiteContent()));
    cmsDirty = true;
    if (!cmsState.sectionBlocks && typeof window.normalizeSectionBlocks === 'function') {
        cmsState.sectionBlocks = window.normalizeSectionBlocks(null, cmsState);
    }
    cmsState.sectionBlocks = cmsState.sectionBlocks || {};
    const def = (window.DEFAULT_SECTION_BLOCKS && window.DEFAULT_SECTION_BLOCKS[secKey]) || {};
    const b = cmsState.sectionBlocks[secKey] || {
        title: def.title || '',
        tip: def.tip || '',
        helpEnabled: false,
        helpType: def.helpType || 'text',
        helpImg: def.helpImg || '',
        helpText: def.helpText || ''
    };
    b.helpEnabled = !!enabled;
    if (b.helpEnabled) {
        if (b.helpType !== 'image' && b.helpType !== 'text') {
            b.helpType = String(b.helpImg || def.helpImg || '').trim() ? 'image' : 'text';
        }
        if (b.helpType === 'text' && !String(b.helpText || '').trim()) {
            b.helpText = def.helpText || `# ${b.title || '区块使用说明'}\n\n在此输入本区块的说明内容（支持 Markdown）…`;
        }
    } else {
        b.helpType = '';
    }
    cmsState.sectionBlocks[secKey] = b;

    // 实时同步到当前前端页面，让用户切换开关立刻看到右上角问号显示/消失
    if (window.SiteContent) {
        window.SiteContent.data = cmsState;
        window.applySiteContent();
    }
    renderCmsPanel();
    const ctrlChk = document.getElementById('cfgShowWifiHelpBtnInput');
    if (ctrlChk && secKey === 'wifi') {
        ctrlChk.checked = !!b.helpEnabled;
    }
};

/** 通用：修改区块级标题、提示语与右上角「?」问号配置 */
window.cmsSetSectionBlock = function (secKey, field, value) {
    if (!cmsState) return;
    cmsDirty = true;
    if (!cmsState.sectionBlocks && typeof window.normalizeSectionBlocks === 'function') {
        cmsState.sectionBlocks = window.normalizeSectionBlocks(null, cmsState);
    }
    cmsState.sectionBlocks = cmsState.sectionBlocks || {};
    cmsState.sectionBlocks[secKey] = cmsState.sectionBlocks[secKey] || { title: '', tip: '', helpEnabled: false, helpType: '', helpImg: '', helpText: '' };
    cmsState.sectionBlocks[secKey][field] = value;

    // 同步旧字段
    if (secKey === 'wifi') {
        if (field === 'title') cmsState.wifiTitle = value;
        if (field === 'tip') cmsState.wifiTip = value;
    } else if (secKey === 'netTest' && field === 'tip') {
        cmsState.netTestTip = value;
    }

    if (field === 'helpType') {
        cmsState.sectionBlocks[secKey].helpEnabled = (value === 'image' || value === 'text');
        if (value === 'text' && !cmsState.sectionBlocks[secKey].helpText) {
            const defTitle = cmsState.sectionBlocks[secKey].title || '区块使用说明';
            cmsState.sectionBlocks[secKey].helpText = `# ${defTitle}\n\n在此输入本区块的说明内容（支持 Markdown）…`;
        }
        if (window.SiteContent) {
            window.SiteContent.data = cmsState;
            window.applySiteContent();
        }
        renderCmsPanel();
    }
};

/* ---------------- 分区折叠与锚点跳转 ---------------- */

window.cmsToggleSection = function (key) {
    cmsCollapsed[key] = !cmsCollapsed[key];
    const sec = CMS_SECTIONS.find(s => s.key === key);
    const elId = sec ? sec.id : (key === 'topbar' ? 'cmsTopBarSection' : '');
    if (!elId) return;
    const el = document.getElementById(elId);
    if (el) {
        el.classList.toggle('is-collapsed', !!cmsCollapsed[key]);
        const btn = el.querySelector(':scope > .cms-sec-head .cms-collapse-btn') || el.querySelector('.cms-collapse-btn');
        if (btn) {
            btn.setAttribute('aria-expanded', cmsCollapsed[key] ? 'false' : 'true');
            btn.innerHTML = cmsCollapsed[key] ? '展开 ▾' : '折叠 ▴';
        }
    }
};

window.cmsToggleAllSections = function () {
    const allCollapsed = CMS_SECTIONS.every(s => !!cmsCollapsed[s.key]);
    const nextState = !allCollapsed;
    CMS_SECTIONS.forEach(s => { cmsCollapsed[s.key] = nextState; });
    renderCmsPanel();
};

window.cmsJumpToSection = function (num) {
    const sec = CMS_SECTIONS.find(s => s.num === Number(num));
    if (!sec) return;

    // 若当前不在审计大屏标签页且大屏入口已开启，先切换到大屏
    const adminPanel = document.getElementById('adminPanel');
    const adminTabBtn = document.getElementById('adminTabBtn');
    if (adminPanel && !adminPanel.classList.contains('active') && adminTabBtn) {
        adminTabBtn.click();
    }

    if (!document.getElementById(sec.id)) {
        renderCmsPanel();
    }

    // 跳转到目标分区时若处于折叠状态则自动展开
    if (cmsCollapsed[sec.key]) {
        cmsCollapsed[sec.key] = false;
        const secEl = document.getElementById(sec.id);
        if (secEl) {
            secEl.classList.remove('is-collapsed');
            const btn = secEl.querySelector('.cms-collapse-btn');
            if (btn) {
                btn.setAttribute('aria-expanded', 'true');
                btn.innerHTML = '折叠 ▴';
            }
        }
    }

    const target = document.getElementById(sec.id);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.remove('cms-sec-flash');
        void target.offsetWidth;
        target.classList.add('cms-sec-flash');
        setTimeout(() => target.classList.remove('cms-sec-flash'), 1200);
        showToast(`📍 已定位到：${sec.num}. ${sec.short}`);
    }
};

function cmsWrapSection(sec, bodyHtml, extraBadgeHtml) {
    const collapsed = !!cmsCollapsed[sec.key];
    return `
        <div class="cms-card cms-section ${collapsed ? 'is-collapsed' : ''}" id="${sec.id}" data-sec-key="${sec.key}">
            <div class="cms-sec-head" onclick="cmsToggleSection('${sec.key}')">
                <div class="cms-sec-title-wrap">
                    <span class="cms-sec-num">${sec.num}</span>
                    <h4>${sec.title}</h4>
                    ${extraBadgeHtml || ''}
                </div>
                <button type="button" class="cms-collapse-btn" aria-expanded="${collapsed ? 'false' : 'true'}" onclick="event.stopPropagation(); cmsToggleSection('${sec.key}')">
                    ${collapsed ? '展开 ▾' : '折叠 ▴'}
                </button>
            </div>
            <div class="cms-sec-body">
                ${bodyHtml}
            </div>
        </div>`;
}

function cmsVisibleStatBadge(group) {
    const list = (cmsState && cmsState[group]) || [];
    const total = list.length;
    const visCount = list.filter(item => item && item.visible !== false).length;
    const hidCount = total - visCount;
    return `<span class="cms-sec-stat">显示 ${visCount} / 共 ${total}${hidCount > 0 ? `（已隐藏 ${hidCount}）` : ''}</span>`;
}

/* ---------------- 渲染主入口 ---------------- */

function renderCmsPanel() {
    const box = document.getElementById('cmsContainer');
    if (!box) return;
    if (!cmsState) cmsState = normalizeCmsState(clone(window.getSiteContent()));
    else normalizeCmsState(cmsState);

    const allCollapsed = CMS_SECTIONS.every(s => !!cmsCollapsed[s.key]);
    const topCollapsed = !!cmsCollapsed.topbar;
    const anchorBtns = CMS_SECTIONS.map(s => `
        <button type="button" class="cms-anchor-tag" onclick="cmsJumpToSection(${s.num})" title="快捷键: Ctrl/Cmd + Alt + ${s.num}">
            <span class="cms-anchor-idx">${s.num}</span>${s.short}
        </button>
    `).join('');

    box.innerHTML = `
        <div class="cms-card cms-section cms-top-bar ${topCollapsed ? 'is-collapsed' : ''}" id="cmsTopBarSection">
            <div class="cms-sec-head" onclick="cmsToggleSection('topbar')">
                <div class="cms-sec-title-wrap">
                    <h4>🛠️ 站点内容管理台（改动保存后全员实时生效）${cmsDirty ? '<span class="cms-dirty-dot" title="有未保存的改动">● 未保存</span>' : ''}</h4>
                </div>
                <div class="cms-actions" onclick="event.stopPropagation()">
                    <button type="button" class="cms-shortcut-hint-btn" onclick="openShortcutModal()" title="点击查看键盘快捷键">⌨️ 快捷键：按 <kbd>?</kbd> 查看</button>
                    <button type="button" class="btn-ghost" onclick="cmsReload()">↺ 还原未保存的修改</button>
                    <button type="button" class="btn-primary" onclick="cmsSaveContent()" title="快捷键: Ctrl/Cmd + Alt + S">🚀 保存并全网下发</button>
                    <button type="button" class="cms-collapse-btn" aria-expanded="${topCollapsed ? 'false' : 'true'}" onclick="cmsToggleSection('topbar')">
                        ${topCollapsed ? '展开 ▾' : '折叠 ▴'}
                    </button>
                </div>
            </div>
            <div class="cms-sec-body">
                <div class="cms-anchor-bar" role="navigation" aria-label="后台分区快速定位">
                    <span class="cms-anchor-label">📍 快速直达：</span>
                    ${anchorBtns}
                    <button type="button" class="cms-anchor-toggle-all" onclick="cmsToggleAllSections()">
                        ${allCollapsed ? '📂 全部展开' : '📁 全部折叠'}
                    </button>
                </div>
                <div class="cms-tip">图片与音乐可上传到 Google Drive（单个 ≤ 8MB），也可直接粘贴外链 URL。列表内切换「显示/隐藏」后请点击「保存并全网下发」（或按 <code>Ctrl/Cmd + Alt + S</code>）生效。</div>
                ${window.hasCloudApi && window.hasCloudApi() ? '' : '<div class="cms-tip cms-warn">⚠️ 尚未部署云端后台（REPORT_API_URL 为空）：下面的改动可以点「保存」先存到这台设备的浏览器里立即生效，但其他设备看不到；部署好 Google 后端后再保存一次即可全网同步。</div>'}
                <div class="cms-tip" id="cmsCloudStatus">${cmsStatusText()}</div>
            </div>
        </div>

        ${cmsSectionHelpCenter(CMS_SECTIONS[7])}
        ${cmsSectionProxy('proxyList', CMS_SECTIONS[0])}
        ${cmsSectionProxy('companyWifiList', CMS_SECTIONS[1])}
        ${cmsSectionWifi(CMS_SECTIONS[2])}
        ${cmsSectionMusic(CMS_SECTIONS[3])}
        ${cmsSectionBackground(CMS_SECTIONS[4])}
        ${cmsSectionGuide(CMS_SECTIONS[5])}
        ${cmsSectionNetTest(CMS_SECTIONS[6])}
        ${cmsSectionAppStore(CMS_SECTIONS[8])}
        ${cmsSectionPcSoft(CMS_SECTIONS[9])}
        ${cmsSectionSecretZone(CMS_SECTIONS[10])}
    `;
}

function cmsReload() {
    cmsState = normalizeCmsState(clone(window.getSiteContent()));
    cmsDirty = false;
    renderCmsPanel();
    showToast('↺ 已还原为已保存内容');
}

/** 云端连接状态文案 */
function cmsStatusText() {
    if (!window.hasCloudApi || !window.hasCloudApi()) return '📴 云端接口未配置：保存为「仅本机生效」。';
    if (window.SiteContent && window.SiteContent.remote) return '☁️ 已连接云端：保存后所有设备刷新即可看到。';
    return '☁️ 云端接口已配置，但云端暂无内容（或旧版后端不支持内容接口）。请先用 `apps-script/Code.gs` 重新部署后端，再保存一次。';
}

/* ---------------- 自动归类 & 排序 ---------------- */

/** 自动归类：按「有没有二维码 / 什么类型的码」判断，后台据此分组展示 */
function cmsCat(item, group) {
    if (group === 'baseWifiCards') {
        if (item.qrMode === 'link' || (item.qrMode !== 'image' && item.wifiString)) {
            return { key: 'link', cls: 'wifi', label: '🔗 输入链接/WiFi自动生码' };
        }
        if (item.img) return { key: 'image', cls: 'image', label: '🖼 上传的二维码图片' };
        return { key: 'none', cls: 'none', label: '📝 未设图片二维码' };
    }
    if (group === 'proxyList') {
        if (item.qrMode === 'link') {
            return { key: 'link', cls: 'wifi', label: '🔗 输入链接自动生码' };
        }
        return item.imgPath
            ? { key: 'image', cls: 'image', label: '🖼 上传的二维码图片' }
            : { key: 'none', cls: 'miss', label: '⚠️ 未设置二维码图片' };
    }
    if (group === 'companyWifiList') {
        if (item.qrMode === 'link') {
            return { key: 'link', cls: 'wifi', label: '🔗 输入链接/WiFi自动生码' };
        }
        return item.imgPath
            ? { key: 'image', cls: 'image', label: '🖼 上传的二维码图片' }
            : { key: 'none', cls: 'miss', label: '⚠️ 未设置二维码图片' };
    }
    if (group === 'music') {
        return item.url
            ? { key: 'ok', cls: 'image', label: '🎵 已配置音频' }
            : { key: 'miss', cls: 'miss', label: '⚠️ 缺少音频文件' };
    }
    return item.imgPath
        ? { key: 'image', cls: 'image', label: '🖼 上传的二维码图片' }
        : { key: 'none', cls: 'miss', label: '⚠️ 未设置二维码图片' };
}

const CMS_CAT_ORDER = {
    baseWifiCards: ['link', 'image', 'none'],
    proxyList: ['link', 'image', 'none'],
    companyWifiList: ['link', 'image', 'none'],
    music: ['ok', 'miss']
};

/** 按分类分组渲染（保持同组内数组的先后顺序） */
function cmsGroupedRows(group, renderRow) {
    const list = cmsState[group] || [];
    const order = CMS_CAT_ORDER[group] || ['link', 'image', 'none'];
    const withIdx = list.map((item, i) => ({ item, i }));
    return order.map(key => {
        const items = withIdx.filter(o => cmsCat(o.item, group).key === key);
        if (!items.length) return '';
        const label = cmsCat(items[0].item, group).label;
        return `<div class="cms-group">
            <div class="cms-group-head">${label}<span class="cms-count">${items.length}</span></div>
            ${items.map(o => renderRow(o.item, o.i)).join('')}
        </div>`;
    }).join('');
}

/** 上移 / 下移：只在同分类内移动，不会打乱自动归类 */
window.cmsMove = function (group, index, dir) {
    const list = cmsState[group];
    if (!list || !list[index]) return;
    cmsDirty = true;
    const key = cmsCat(list[index], group).key;
    let j = index + dir;
    while (j >= 0 && j < list.length && cmsCat(list[j], group).key !== key) j += dir;
    if (j < 0 || j >= list.length) return;
    const tmp = list[index]; list[index] = list[j]; list[j] = tmp;
    renderCmsPanel();
};

/** 卡片列表项显隐开关控件 */
function cmsRenderVisSwitch(group, index, item) {
    const isVisible = item.visible !== false;
    return `
        <label class="cms-vis-switch ${isVisible ? 'is-on' : 'is-off'}" title="直接切换该卡片在前台是否显示（保存后生效）">
            <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="cmsToggleVisible('${group}',${index},this.checked)">
            <span class="cms-vis-track"><span class="cms-vis-thumb"></span></span>
            <span class="cms-vis-label">${isVisible ? '显示' : '已隐藏'}</span>
        </label>`;
}

/** 前置代理卡片：切换二维码来源模式（image / link） */
window.cmsSetProxyQrMode = function (index, mode) {
    window.cmsSetCardQrMode('proxyList', index, mode);
};

/** 前置代理卡片：切换状态覆盖（auto / up / down） */
window.cmsSetProxyStatusOverride = function (index, mode) {
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    cmsDirty = true;
    dismissedProxyMasks.delete(Number(index));
    item.statusOverride = (mode === 'up' || mode === 'down') ? mode : 'auto';
    item.manualOverride = item.statusOverride !== 'auto';
    if (item.statusOverride === 'down' && !item.manualDownAt) {
        item.manualDownAt = cmsNowChinaStr();
    }
    renderCmsPanel();
};

/** 前置代理卡片：一键强制标红 / 强制标绿 / 恢复自动（manualOverride），立即生效并同步云端 */
window.cmsQuickProxyStatus = function (index, targetStatus) {
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    dismissedProxyMasks.delete(Number(index));
    if (targetStatus === 'down') {
        item.statusOverride = 'down';
        item.manualOverride = true;
        item.manualDownAt = cmsNowChinaStr();
        if (!item.manualNote) {
            const noteInput = prompt('📝 可填写手动标红备注（如：国内直连异常/维护中，直接点确定可留空）：', item.manualNote || '');
            if (noteInput !== null) item.manualNote = String(noteInput).trim();
        }
    } else if (targetStatus === 'up') {
        item.statusOverride = 'up';
        item.manualOverride = true;
        item.manualDownAt = '';
    } else {
        item.statusOverride = 'auto';
        item.manualOverride = false;
        item.manualDownAt = '';
    }

    // 同步更新本地 window.probeState 中的 manualOverride 状态
    if (window.probeState && window.probeState.items) {
        const key = item.id || item.name;
        if (key && window.probeState.items[key]) {
            window.probeState.items[key].manualOverride = item.manualOverride;
            window.probeState.items[key].manualStatus = item.statusOverride;
            window.probeState.items[key].manualNote = item.manualNote || '';
        }
    }

    // 立即应用到本地并同步下发云端
    applyAndPersistLocal(cmsState);
    renderCmsPanel();

    if (window.hasCloudApi && window.hasCloudApi()) {
        const token = localStorage.getItem(CMS_TOKEN_KEY) || '';
        if (token) {
            window.postToApi({
                action: 'MANUAL_OVERRIDE',
                token,
                id: item.id,
                name: item.name,
                mode: item.statusOverride,
                manualDownAt: item.manualDownAt || '',
                manualNote: item.manualNote || ''
            }, true).catch(() => {});
            window.postToApi({ action: 'SAVE_CONTENT', token, content: cmsState }, true)
                .then(j => {
                    if (j && j.ok) {
                        cmsDirty = false;
                        renderCmsPanel();
                        if (typeof showToast === 'function') {
                            const label = targetStatus === 'down' ? '🔴 已一键强制标红并全网生效'
                                : (targetStatus === 'up' ? '🟢 已一键强制标绿并全网生效' : '🤖 已恢复自动探测并全网生效');
                            showToast(label);
                        }
                    }
                })
                .catch(() => {});
            return;
        }
    }
    cmsDirty = true;
    renderCmsPanel();
    if (typeof showToast === 'function') {
        const label = targetStatus === 'down' ? '🔴 已设为强制标红（点右上角保存可同步云端）'
            : (targetStatus === 'up' ? '🟢 已设为强制标绿（点右上角保存可同步云端）' : '🤖 已恢复自动探测（点右上角保存可同步云端）');
        showToast(label);
    }
};

/** 前置代理卡片：一键将当前时间填入首次上线时间 */
window.cmsFillFirstOnlineNow = function (index) {
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    cmsDirty = true;
    item.firstOnlineAt = cmsNowChinaStr();
    renderCmsPanel();
};

/* ---------------- 前置代理探测节点管理 (PROXY_Nodes) & 探测间隔配置 ---------------- */

let proxyNodesList = [];
let proxyNodesLoaded = false;
let proxyNodesLoading = false;
let probeIntervalMinState = parseInt(localStorage.getItem('cfgProbeIntervalMin') || '15', 10) || 15;

window.cmsLoadProxyNodes = function (showNotice) {
    if (!window.hasCloudApi || !window.hasCloudApi() || typeof REPORT_API_URL === 'undefined' || !REPORT_API_URL) {
        return;
    }
    if (proxyNodesLoading) return;
    proxyNodesLoading = true;
    fetch(REPORT_API_URL + '?action=proxynodes&t=' + Date.now(), { cache: 'no-store' })
        .then(r => r.json())
        .then(j => {
            proxyNodesLoading = false;
            if (j && j.ok) {
                proxyNodesLoaded = true;
                if (j.probeIntervalMin) {
                    probeIntervalMinState = parseInt(j.probeIntervalMin, 10) || 15;
                    localStorage.setItem('cfgProbeIntervalMin', String(probeIntervalMinState));
                }
                proxyNodesList = Array.isArray(j.nodes) ? j.nodes.map(n => ({
                    id: n.id || '',
                    name: n.name || '',
                    server: n.server || '',
                    port: n.port || 443,
                    authInput: '', // 密码永不明文回显，仅在管理员新输入时提交
                    hasAuth: !!n.hasAuth,
                    sni: n.sni || '',
                    insecure: n.insecure !== false,
                    online: n.online !== false,
                    updatedAt: n.updatedAt || '',
                    isNew: false
                })) : [];
                renderCmsPanel();
                if (showNotice && typeof showToast === 'function') showToast('✅ 已同步 PROXY_Nodes 节点列表');
            }
        })
        .catch(() => {
            proxyNodesLoading = false;
        });
};

window.cmsSetProbeIntervalQuick = function (minVal) {
    probeIntervalMinState = parseInt(minVal, 10) || 15;
    const inp = document.getElementById('cmsProbeIntervalInput');
    if (inp) inp.value = String(probeIntervalMinState);
    window.cmsSaveProbeInterval();
};

window.cmsSaveProbeInterval = function () {
    const inp = document.getElementById('cmsProbeIntervalInput');
    let val = parseInt(inp ? inp.value : probeIntervalMinState, 10);
    if (isNaN(val) || val < 1) val = 15;
    if (val > 1440) val = 1440;
    probeIntervalMinState = val;
    localStorage.setItem('cfgProbeIntervalMin', String(val));

    if (!window.hasCloudApi || !window.hasCloudApi()) {
        return showToast('💾 已保存在本机（部署云端后可同步）');
    }
    const token = getAdminToken();
    if (!token) return;
    showToast('⏳ 正在保存探测间隔...');
    window.postToApi({ action: 'SET_PROBE_INTERVAL', token, probeIntervalMin: val }, true)
        .then(j => {
            if (j && j.ok) {
                showToast(`✅ 探测间隔已设为每 ${j.probeIntervalMin || val} 分钟一次`);
                renderCmsPanel();
            } else {
                showToast('❌ 保存失败：' + ((j && j.error) || '密钥错误'));
            }
        })
        .catch(e => showToast('❌ 保存失败：' + e.message));
};

window.cmsUpdateProxyNodeField = function (idx, field, val) {
    const n = proxyNodesList[idx];
    if (!n) return;
    n[field] = val;
};

window.cmsAddProxyNodeDraft = function () {
    proxyNodesLoaded = true;
    proxyNodesList.push({
        id: 'pnode_' + Date.now(),
        name: '',
        server: '',
        port: 443,
        authInput: '',
        hasAuth: false,
        sni: '',
        insecure: true,
        online: true,
        updatedAt: '',
        isNew: true
    });
    renderCmsPanel();
};

window.cmsSaveProxyNode = function (idx) {
    const n = proxyNodesList[idx];
    if (!n) return;
    const name = String(n.name || '').trim();
    const server = String(n.server || '').trim();
    const port = parseInt(n.port, 10) || 443;
    if (!name) return showToast('⚠️ 请填写节点显示名 (name)');
    if (!server) return showToast('⚠️ 请填写节点地址 (server)');

    const token = getAdminToken();
    if (!token) return;
    showToast('⏳ 正在保存前置节点到 PROXY_Nodes...');

    const payloadNode = {
        id: n.id,
        name,
        server,
        port,
        auth: n.authInput || '', // 留空时后端保留原密码，输入新值则覆盖
        sni: String(n.sni || '').trim(),
        insecure: n.insecure !== false,
        online: n.online !== false
    };

    window.postToApi({ action: 'SAVE_PROXY_NODE', token, node: payloadNode }, true)
        .then(j => {
            if (j && j.ok) {
                if (Array.isArray(j.nodes)) {
                    proxyNodesList = j.nodes.map(item => ({
                        id: item.id || '',
                        name: item.name || '',
                        server: item.server || '',
                        port: item.port || 443,
                        authInput: '',
                        hasAuth: !!item.hasAuth,
                        sni: item.sni || '',
                        insecure: item.insecure !== false,
                        online: item.online !== false,
                        updatedAt: item.updatedAt || '',
                        isNew: false
                    }));
                } else {
                    n.authInput = '';
                    n.hasAuth = n.hasAuth || Boolean(payloadNode.auth);
                    n.isNew = false;
                }
                showToast('✅ 节点已存入 PROXY_Nodes（下次自动探测生效）');
                renderCmsPanel();
            } else {
                showToast('❌ 保存失败：' + ((j && j.error) || '未知错误'));
            }
        })
        .catch(e => showToast('❌ 保存失败：' + e.message));
};

window.cmsToggleProxyNodeOnline = function (idx, onlineChecked) {
    const n = proxyNodesList[idx];
    if (!n) return;
    n.online = !!onlineChecked;
    if (n.isNew) {
        renderCmsPanel();
        return;
    }
    const token = getAdminToken();
    if (!token) { renderCmsPanel(); return; }
    window.postToApi({ action: 'TOGGLE_PROXY_NODE', token, id: n.id, online: n.online }, true)
        .then(j => {
            if (j && j.ok) {
                showToast(n.online ? `🟢 已上线「${n.name}」` : `⚪ 已下线「${n.name}」`);
                renderCmsPanel();
            } else {
                showToast('❌ 状态切换失败：' + ((j && j.error) || ''));
            }
        })
        .catch(e => showToast('❌ 状态切换失败：' + e.message));
};

window.cmsDeleteProxyNode = function (idx) {
    const n = proxyNodesList[idx];
    if (!n) return;
    if (!confirm(`确认从 PROXY_Nodes 删除节点「${n.name || n.id}」？`)) return;
    if (n.isNew) {
        proxyNodesList.splice(idx, 1);
        renderCmsPanel();
        return;
    }
    const token = getAdminToken();
    if (!token) return;
    showToast('⏳ 正在删除节点...');
    window.postToApi({ action: 'DELETE_PROXY_NODE', token, id: n.id }, true)
        .then(j => {
            if (j && j.ok) {
                proxyNodesList.splice(idx, 1);
                showToast('🗑 节点已删除');
                renderCmsPanel();
            } else {
                showToast('❌ 删除失败：' + ((j && j.error) || ''));
            }
        })
        .catch(e => showToast('❌ 删除失败：' + e.message));
};

function renderProxyNodesSubbox() {
    if (!proxyNodesLoaded && !proxyNodesLoading) {
        setTimeout(() => window.cmsLoadProxyNodes(false), 20);
    }
    const itemsMap = (window.probeState && window.probeState.items) || {};
    const nodeRowsHtml = proxyNodesList.length
        ? proxyNodesList.map((n, idx) => {
            const rec = (n.id && itemsMap[n.id]) || (n.name && itemsMap[n.name]) || null;
            const probeSt = rec ? (rec.status === 'up' ? 'up' : 'down') : 'unknown';
            const rawNodeLat = (rec && Number(rec.latencyMs) > 0) ? Number(rec.latencyMs) : 0;
            const nodeLat = rawNodeLat > 4000 ? (rawNodeLat - 4000) : rawNodeLat;
            const probeBadge = probeSt === 'up'
                ? `<span class="cms-proxy-status-pill is-up">🟢 探测可用${nodeLat ? ` (${nodeLat}ms)` : ''}</span>`
                : (probeSt === 'down'
                    ? `<span class="cms-proxy-status-pill is-down">🔴 探测断网</span>`
                    : `<span class="cms-proxy-status-pill is-unknown">⚪ 待检测</span>`);
            return `
            <div class="cms-item ${n.online ? '' : 'is-hidden'}" style="margin-top:10px;">
                <div class="cms-item-head">
                    <span class="cms-badge ${n.online ? 'wifi' : 'none'}">${esc(n.name || '未命名新节点')}</span>
                    ${probeBadge}
                    <span style="font-size:11.5px;color:var(--text-muted);">密码状态：${n.hasAuth ? '🔒 已加密保存' : '⚠️ 未设密码'}</span>
                    <span class="cms-spacer"></span>
                    <label class="cms-vis-switch ${n.online ? 'is-on' : 'is-off'}" title="切换该节点是否参与自动探测">
                        <input type="checkbox" ${n.online ? 'checked' : ''} onchange="cmsToggleProxyNodeOnline(${idx}, this.checked)">
                        <span class="cms-vis-track"><span class="cms-vis-thumb"></span></span>
                        <span class="cms-vis-label">${n.online ? '已上线' : '已下线'}</span>
                    </label>
                </div>
                <div class="cms-grid">
                    <div class="cms-field"><label>显示名 (name，与卡片同名自动关联)</label>
                        <input type="text" placeholder="例如：李俊鑫组 美区前置" value="${esc(n.name)}" oninput="cmsUpdateProxyNodeField(${idx},'name',this.value)"></div>
                    <div class="cms-field"><label>服务器地址 (server)</label>
                        <input type="text" placeholder="域名或 IP，如 us.example.com" value="${esc(n.server)}" oninput="cmsUpdateProxyNodeField(${idx},'server',this.value)"></div>
                    <div class="cms-field"><label>端口 (port)</label>
                        <input type="number" placeholder="443" value="${esc(n.port || 443)}" oninput="cmsUpdateProxyNodeField(${idx},'port',this.value)"></div>
                    <div class="cms-field"><label>认证密码 (auth，网页不明文回显)</label>
                        <input type="password" autocomplete="new-password" value="${esc(n.authInput || '')}" placeholder="${n.hasAuth ? '🔒 已加密保存（留空保持不变，输入新密码则覆盖）' : '请输入节点 auth 密码'}" oninput="cmsUpdateProxyNodeField(${idx},'authInput',this.value)"></div>
                    <div class="cms-field"><label>SNI (sni，可留空)</label>
                        <input type="text" placeholder="例如：bing.com" value="${esc(n.sni || '')}" oninput="cmsUpdateProxyNodeField(${idx},'sni',this.value)"></div>
                    <div class="cms-field" style="display:flex;align-items:flex-end;padding-bottom:6px;">
                        <label class="cms-check">
                            <input type="checkbox" ${n.insecure !== false ? 'checked' : ''} onchange="cmsUpdateProxyNodeField(${idx},'insecure',this.checked)"> 跳过证书校验 (insecure)
                        </label>
                    </div>
                </div>
                <div class="cms-item-bar">
                    <button type="button" class="btn-primary" style="padding:6px 14px;font-size:12.5px;" onclick="cmsSaveProxyNode(${idx})">💾 保存节点到表格</button>
                    <button type="button" class="cms-del" onclick="cmsDeleteProxyNode(${idx})">🗑 删除节点</button>
                    ${n.updatedAt ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto;">更新于 ${esc(n.updatedAt)}</span>` : ''}
                </div>
            </div>`;
        }).join('')
        : `<div class="cms-tip">${proxyNodesLoading ? '⏳ 正在从 Google 表格 PROXY_Nodes 加载节点...' : '暂无探测节点，点击下方「➕ 新增前置探测节点」添加后即可由 GitHub Actions 自动探测（无需修改代码或 GitHub Secret）。'}</div>`;

    return `
        <div class="cms-subbox" style="margin-bottom:16px;">
            <div class="cms-subbox-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span>🛰️ 前置代理管理（Google 表格 <code>PROXY_Nodes</code> · 自动探测源）</span>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:12px;color:var(--text-muted);">⏱️ 自动探测间隔：</span>
                    ${[5, 10, 15, 30, 60].map(m => `<button type="button" class="cms-quick-status-btn is-auto ${probeIntervalMinState === m ? 'active' : ''}" style="padding:3px 8px;font-size:11.5px;" onclick="cmsSetProbeIntervalQuick(${m})">${m}分钟</button>`).join('')}
                    <input type="number" id="cmsProbeIntervalInput" min="1" max="1440" value="${esc(probeIntervalMinState)}" style="width:68px;padding:4px 8px;border-radius:8px;border:1px solid var(--glass-border);background:var(--glass-bg);color:var(--text-color);font-size:12px;">
                    <span style="font-size:12px;color:var(--text-muted);">分钟</span>
                    <button type="button" class="btn-primary" style="padding:4px 10px;font-size:12px;" onclick="cmsSaveProbeInterval()">💾 保存间隔</button>
                    <button type="button" class="btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="cmsLoadProxyNodes(true)">🔄 刷新节点表</button>
                </div>
            </div>
            <div class="cms-tip" style="margin-top:6px;">
                在这里新增或上线前置节点会直接存入 Google 表格 <code>PROXY_Nodes</code>（密码单向加密入表，不在网页明文回显）。GitHub Actions 每 5 分钟唤醒一次，读取上方设定的探测间隔（默认 15 分钟），满间隔后自动拉取所有「已上线」节点执行探测并关联到同名卡片。
            </div>
            ${nodeRowsHtml}
            <button type="button" class="cms-add" style="margin-top:10px;" onclick="cmsAddProxyNodeDraft()">➕ 新增前置探测节点（写入 PROXY_Nodes）</button>
        </div>
    `;
}

/* ---------------- 通用组件：区块右上角「?」问号与提示语配置 & 卡片级「?」问号配置 ---------------- */

function renderSectionBlockConfig(secKey, sectionLabel) {
    const blocks = (cmsState && cmsState.sectionBlocks) || (window.DEFAULT_SECTION_BLOCKS || {});
    const b = (blocks && blocks[secKey]) || { title: '', tip: '', helpEnabled: false, helpType: '', helpImg: '', helpText: '' };
    const isHelpOn = b.helpEnabled !== false && (b.helpType === 'image' || b.helpType === 'text');
    const hType = (b.helpType === 'image' || b.helpType === 'text')
        ? b.helpType
        : (String(b.helpImg || '').trim() ? 'image' : 'text');
    return `
        <div class="cms-subbox" style="margin-bottom:14px;">
            <div class="cms-subbox-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <span>📌 ${sectionLabel} · 区块标题、顶部提示语 &amp; 右上角「?」问号开关</span>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <label class="cms-vis-switch ${isHelpOn ? 'is-on' : 'is-off'}" title="开启或关闭本区块标题右上角的圆形问号 (?) 按钮">
                        <input type="checkbox" ${isHelpOn ? 'checked' : ''} onchange="cmsToggleSectionHelp('${secKey}', this.checked)">
                        <span class="cms-vis-track"><span class="cms-vis-thumb"></span></span>
                        <span class="cms-vis-label">${isHelpOn ? '❓ 显示右上角问号' : '🚫 已隐藏问号'}</span>
                    </label>
                    ${isHelpOn ? `<button type="button" class="btn-ghost" style="padding:3px 10px;font-size:12px;" onclick="openSectionHelp('${secKey}')">👀 预览问号弹窗</button>` : ''}
                </div>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>区块标题</label>
                    <input type="text" value="${esc(b.title || '')}" oninput="cmsSetSectionBlock('${secKey}','title',this.value)"></div>
                <div class="cms-field"><label>顶部提示语（留空则整行隐藏）</label>
                    <input type="text" placeholder="留空则不显示提示文字" value="${esc(b.tip || '')}" oninput="cmsSetSectionBlock('${secKey}','tip',this.value)"></div>
                <div class="cms-field"><label>❓ 右上角「?」显示状态与点击出现内容类型</label>
                    <select onchange="cmsSetSectionBlock('${secKey}','helpType',this.value)">
                        <option value="" ${!isHelpOn ? 'selected' : ''}>🚫 不显示问号（关闭）</option>
                        <option value="image" ${isHelpOn && hType === 'image' ? 'selected' : ''}>🖼 显示问号 · 点击弹出图片说明</option>
                        <option value="text" ${isHelpOn && hType === 'text' ? 'selected' : ''}>📝 显示问号 · 点击弹出文字/Markdown说明</option>
                    </select></div>
                ${isHelpOn && hType === 'image' ? `<div class="cms-field"><label>问号弹窗图片 URL</label>
                    <input type="text" placeholder="images/xxx.jpg 或 Drive 链接" value="${esc(b.helpImg || '')}" oninput="cmsSetSectionBlock('${secKey}','helpImg',this.value)"></div>` : ''}
            </div>
            ${isHelpOn && hType === 'image' ? `<div class="cms-item-bar" style="margin-top:10px;">
                ${b.helpImg ? `<img class="cms-thumb" src="${esc(b.helpImg)}" alt="问号说明图预览" onerror="imgFallback(this)">` : ''}
                <label class="cms-file-btn">📤 上传问号说明图片
                    <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','__section__','${secKey}','helpImg')">
                </label>
            </div>` : ''}
            ${isHelpOn && hType === 'text' ? `<div class="cms-field mt-15"><label>❓ 点击右上角问号弹出的文字内容（支持 Markdown：# 标题、**加粗**、- 列表、:::success 提示框…）</label>
                <textarea class="cms-guide-editor" rows="5" oninput="cmsSetSectionBlock('${secKey}','helpText',this.value)">${esc(b.helpText || '')}</textarea></div>` : ''}
        </div>
    `;
}

/** 独立总控分区：8. 各区块右上角问号 (?) 显示开关与点击弹窗内容总控 */
function cmsSectionHelpCenter(sec) {
    const blocks = (cmsState && cmsState.sectionBlocks) || (window.DEFAULT_SECTION_BLOCKS || {});
    const allSecKeys = [
        { key: 'wifi',       label: '1️⃣ 「📶 代理 & WiFi」主标题右上角问号（首屏最上方右侧问号）' },
        { key: 'proxy',      label: '2️⃣ 「前置代理二维码」标题右上角问号' },
        { key: 'company',    label: '3️⃣ 「🏢 公司 WiFi 二维码」标题右上角问号' },
        { key: 'softRouter', label: '4️⃣ 「软路由分流通道」标题右上角问号' },
        { key: 'quick',      label: '5️⃣ 「⚡ IP 二维码生成」标题右上角问号' },
        { key: 'netTest',    label: '6️⃣ 「🌐 网络测试」标题右上角问号' },
        { key: 'batch',      label: '7️⃣ 「📋 填写 IP 报表」标题右上角问号' },
        { key: 'appStore',   label: '8️⃣ 「📱 手机 App 下载（App Store）」标题右上角问号' },
        { key: 'pcSoft',     label: '9️⃣ 「💻 电脑软件」标题右上角问号' },
        { key: 'secretZone', label: '🔟 「🔒 隐藏专区」标题右上角问号' },
        { key: 'single',     label: '1️⃣1️⃣ 「🔍 IP 提取与代理检测」标题右上角问号' }
    ];
    const onCount = allSecKeys.filter(item => {
        const b = blocks[item.key] || {};
        return b.helpEnabled !== false && (b.helpType === 'image' || b.helpType === 'text');
    }).length;
    const badge = `<span class="cms-sec-stat">已开启 ${onCount} / 共 ${allSecKeys.length} 个区块问号</span>`;
    const body = `
        <div class="cms-tip">
            💡 <strong>集中管理全站所有区块右上角的圆形问号（?）按钮</strong>：每个区块都可以用右侧的<strong>「显示右上角问号 / 已隐藏问号」</strong>开关单独控制显隐，并自由选择点击问号后弹出<strong>图片</strong>还是<strong>文字说明</strong>。切换后记得点右上角「🚀 保存并全网下发」。
        </div>
        ${allSecKeys.map(item => renderSectionBlockConfig(item.key, item.label)).join('')}
    `;
    return cmsWrapSection(sec, body, badge);
}

function renderCardHelpFieldSelect(group, index, card) {
    const hType = (card.helpType === 'image' || card.helpType === 'text') ? card.helpType : '';
    return `
        <div class="cms-field"><label>❓ 卡片右上角「?」帮助按钮</label>
            <select onchange="cmsSetAnyCardHelpType('${group}',${index},this.value)">
                <option value="" ${!hType ? 'selected' : ''}>🚫 不显示问号</option>
                <option value="text" ${hType === 'text' ? 'selected' : ''}>📝 文字说明（弹窗显示，支持 Markdown）</option>
                <option value="image" ${hType === 'image' ? 'selected' : ''}>🖼 图片说明（弹窗显示大图）</option>
            </select></div>
        ${hType === 'image' ? `<div class="cms-field"><label>问号弹窗图片 URL</label>
            <input type="text" placeholder="images/xxx.jpg 或 Drive 链接" value="${esc(card.helpImg || '')}" oninput="cmsSet('${group}',${index},'helpImg',this.value)"></div>` : ''}
    `;
}

function renderCardHelpUploadBtn(group, index, card) {
    if (card.helpType !== 'image') return '';
    return `
        ${card.helpImg ? `<img class="cms-thumb" src="${esc(card.helpImg)}" alt="问号图预览" onerror="imgFallback(this)">` : ''}
        <label class="cms-file-btn">🖼 上传问号说明图
            <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${index},'helpImg')">
        </label>
    `;
}

function renderCardHelpTextEditor(group, index, card) {
    if (card.helpType !== 'text') return '';
    return `
        <div class="cms-field mt-15"><label>❓ 卡片右上角问号弹窗文字内容（支持 Markdown：# 标题、**加粗**、- 列表、:::success 提示框…）</label>
            <textarea class="cms-guide-editor" rows="5" oninput="cmsSet('${group}',${index},'helpText',this.value)">${esc(card.helpText || '')}</textarea></div>
    `;
}

/** 统一刷新后台所有「输入链接自动生成」卡片的二维码小预览图 */
function cmsRefreshAllLinkQrPreviews() {
    if (typeof waitForQRCode !== 'function') return;
    waitForQRCode(() => {
        if (!cmsState) return;
        // 1. 前置代理
        (cmsState.proxyList || []).forEach((item, idx) => {
            if (!item || item.qrMode !== 'link') return;
            const imgEl = document.getElementById('cmsQrPreview_proxyList_' + idx);
            const raw = String(item.proxyUrl || '').trim();
            if (!imgEl || !raw) return;
            QRCode.toDataURL(raw, { width: 120, margin: 1 }, (err, dataUrl) => {
                if (!err && dataUrl && imgEl) imgEl.src = dataUrl;
            });
        });
        // 2. 公司 WiFi
        (cmsState.companyWifiList || []).forEach((item, idx) => {
            if (!item || item.qrMode !== 'link') return;
            const imgEl = document.getElementById('cmsQrPreview_companyWifiList_' + idx);
            const linkText = getCompanyCardLinkText(item);
            if (!imgEl || !linkText) return;
            QRCode.toDataURL(linkText, { width: 120, margin: 1 }, (err, dataUrl) => {
                if (!err && dataUrl && imgEl) imgEl.src = dataUrl;
            });
        });
        // 3. 基础网络
        (cmsState.baseWifiCards || []).forEach((item, idx) => {
            const isLink = item && (item.qrMode === 'link' || (item.qrMode !== 'image' && item.wifiString));
            if (!isLink) return;
            const imgEl = document.getElementById('cmsQrPreview_baseWifiCards_' + idx);
            const linkText = String(item.wifiString || '').trim() || `WIFI:T:WPA;S:${item.name || ''};P:${item.pwd || ''};;`;
            if (!imgEl || !linkText) return;
            QRCode.toDataURL(linkText, { width: 120, margin: 1 }, (err, dataUrl) => {
                if (!err && dataUrl && imgEl) imgEl.src = dataUrl;
            });
        });
        // 4. 网络测试
        (cmsState.netTestList || []).forEach((item, idx) => {
            if (!item || item.qrMode === 'image') return;
            const imgEl = document.getElementById('cmsNetQrPreview_' + idx);
            if (!imgEl) return;
            const { fullUrl } = normalizeNetTestUrlPair(item.url);
            if (!fullUrl) {
                imgEl.removeAttribute('src');
                return;
            }
            QRCode.toDataURL(fullUrl, { width: 120, margin: 1 }, (err, dataUrl) => {
                if (!err && dataUrl && imgEl) imgEl.src = dataUrl;
            });
        });
        // 5. 手机 App 下载 & 隐藏专区
        ['appStoreList', 'secretZoneList'].forEach(group => {
            (cmsState[group] || []).forEach((item, idx) => {
                if (!item || item.qrMode === 'image') return;
                const imgEl = document.getElementById(`cmsQrPreview_${group}_${idx}`);
                if (!imgEl) return;
                const { fullUrl } = normalizeNetTestUrlPair(item.url);
                if (!fullUrl) {
                    imgEl.removeAttribute('src');
                    return;
                }
                QRCode.toDataURL(fullUrl, { width: 120, margin: 1, errorCorrectionLevel: 'H' }, (err, dataUrl) => {
                    if (!err && dataUrl && imgEl) imgEl.src = dataUrl;
                });
            });
        });
    });
}

/* ---------------- 1/2. 前置代理 & 公司 WiFi ---------------- */

function cmsSectionProxy(group, sec) {
    const isProxy = group === 'proxyList';
    const rows = cmsGroupedRows(group, (c, i) => {
        const isVisible = c.visible !== false;
        const qrMode = c.qrMode === 'link' ? 'link' : 'image';

        if (!isProxy) {
            const linkText = getCompanyCardLinkText(c);
            return `
            <div class="cms-item ${isVisible ? '' : 'is-hidden'}">
                <div class="cms-item-head">
                    <span class="cms-badge ${cmsCat(c, group).cls}">${esc(c.name || '未命名')}</span>
                    <span style="font-size:11.5px;color:var(--text-muted);">${qrMode === 'link' ? '🔗 自动生成二维码' : '🖼 上传图片二维码'}</span>
                    ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                    <span class="cms-spacer"></span>
                    ${cmsRenderVisSwitch(group, i, c)}
                    <button type="button" class="cms-move" title="上移" onclick="cmsMove('${group}',${i},-1)">↑</button>
                    <button type="button" class="cms-move" title="下移" onclick="cmsMove('${group}',${i},1)">↓</button>
                </div>
                <div class="cms-grid">
                    <div class="cms-field"><label>卡片显示名称</label>
                        <input type="text" placeholder="例如：Advert 办公网" value="${esc(c.name || '')}" oninput="cmsSet('${group}',${i},'name',this.value)"></div>
                    <div class="cms-field"><label>二维码添加方式 (二选一)</label>
                        <select onchange="cmsSetCardQrMode('${group}',${i},this.value)">
                            <option value="image" ${qrMode === 'image' ? 'selected' : ''}>① 上传我自己的二维码图片</option>
                            <option value="link" ${qrMode === 'link' ? 'selected' : ''}>② 输入链接/WiFi自动生成</option>
                        </select></div>
                    ${qrMode === 'image' ? `
                    <div class="cms-field"><label>二维码图片 URL (imgPath)</label>
                        <input type="text" placeholder="images/wifi1.jpg 或上传后的 Drive 链接" value="${esc(c.imgPath || '')}" oninput="cmsSet('${group}',${i},'imgPath',this.value)"></div>
                    ` : `
                    <div class="cms-field"><label>📶 WiFi 名称 (SSID，填了自动合成连接码)</label>
                        <input type="text" placeholder="输入 WiFi 名称，如：Advert" value="${esc(c.ssid || '')}" oninput="cmsSet('${group}',${i},'ssid',this.value)"></div>
                    <div class="cms-field"><label>🔑 WiFi 密码</label>
                        <input type="text" placeholder="输入 WiFi 密码，如：Jingda2025" value="${esc(c.pwd || '')}" oninput="cmsSet('${group}',${i},'pwd',this.value)"></div>
                    <div class="cms-field" style="grid-column: 1 / -1;"><label>🔗 自动生成内容 / 自定义链接（填写上方 SSID+密码会自动生成 WIFI:T:WPA;S:名称;P:密码;;，也可直接填任意链接）</label>
                        <input type="text" id="cmsCompanyQrText_${i}" placeholder="WIFI:T:WPA;S:名称;P:密码;; 或任意网址" value="${esc(c.qrText || linkText)}" oninput="cmsSet('${group}',${i},'qrText',this.value)"></div>
                    `}
                    ${renderCardHelpFieldSelect(group, i, c)}
                </div>
                <div class="cms-item-bar">
                    ${qrMode === 'image' ? `
                        ${c.imgPath ? `<img class="cms-thumb" src="${esc(c.imgPath)}" alt="预览" onerror="imgFallback(this)">` : ''}
                        <label class="cms-file-btn">📤 上传二维码图片
                            <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${i},'imgPath')">
                        </label>
                    ` : `
                        <img id="cmsQrPreview_companyWifiList_${i}" class="cms-thumb" style="width:44px;height:44px;background:#fff;padding:3px;border-radius:6px;" alt="自动生成二维码预览">
                        <span style="font-size:12px;color:var(--text-muted);">实时生成预览：<code id="cmsCompanyQrCode_${i}">${esc(linkText || '请填写 WiFi 名称或链接')}</code></span>
                    `}
                    ${renderCardHelpUploadBtn(group, i, c)}
                    <span class="cms-spacer"></span>
                    <button type="button" class="cms-del" onclick="cmsDel('${group}',${i})">🗑 删除</button>
                </div>
                ${renderCardHelpTextEditor(group, i, c)}
            </div>`;
        }

        const override = (c.statusOverride === 'up' || c.statusOverride === 'down') ? c.statusOverride : 'auto';
        const st = typeof window.getProxyStatus === 'function' ? window.getProxyStatus(c) : { status: 'unknown', dotState: 'unknown' };
        const pillCls = st.dotState === 'slow' ? 'slow' : st.status;
        const stPillText = st.status === 'up'
            ? (st.dotState === 'slow' ? `🟡 当前前台：较慢 (${st.latencySecText || ''})` : `🟢 当前前台：可用 (${st.latencySecText || '优质'})`)
            : (st.status === 'down'
                ? '🔴 当前前台：不可用（已加遮罩）'
                : (st.status === 'expired' ? '⚪ 当前前台：数据过期（超过30分钟）' : '⚪ 当前前台：待检测（无遮罩）'));

        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(c, group).cls}">${esc(c.name || '未命名')}</span>
                <span class="cms-proxy-status-pill is-${pillCls}">${stPillText}${override !== 'auto' ? `（手动强制 ${override === 'down' ? '标红' : '标绿'}）` : '（自动探测）'}</span>
                ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                <span class="cms-spacer"></span>
                ${cmsRenderVisSwitch(group, i, c)}
                <button type="button" class="cms-move" title="上移" onclick="cmsMove('${group}',${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMove('${group}',${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>名称</label>
                    <input type="text" value="${esc(c.name)}" oninput="cmsSet('${group}',${i},'name',this.value)"></div>
                <div class="cms-field"><label>二维码添加方式 (二选一)</label>
                    <select onchange="cmsSetCardQrMode('proxyList',${i},this.value)">
                        <option value="image" ${qrMode === 'image' ? 'selected' : ''}>① 上传我自己的二维码图片</option>
                        <option value="link" ${qrMode === 'link' ? 'selected' : ''}>② 输入链接自动生成</option>
                    </select></div>
                <div class="cms-field"><label>前置链接 (proxyUrl，复制内容 &amp; ${qrMode === 'link' ? '自动生成二维码源' : '自动探测源'})</label>
                    <input type="text" placeholder="IP:端口:账号:密码 或 Egern/socks5/hysteria2 链接" value="${esc(c.proxyUrl || '')}" oninput="cmsSet('${group}',${i},'proxyUrl',this.value)"></div>
                ${qrMode === 'image' ? `
                <div class="cms-field"><label>二维码图片 URL (imgPath)</label>
                    <input type="text" placeholder="images/proxy1.jpg 或 Drive 链接" value="${esc(c.imgPath || '')}" oninput="cmsSet('${group}',${i},'imgPath',this.value)"></div>
                ` : ''}
                <div class="cms-field"><label>首次上线时间 (firstOnlineAt)</label>
                    <div style="display:flex; gap:6px;">
                        <input type="text" placeholder="YYYY/MM/DD HH:mm:ss" value="${esc(c.firstOnlineAt || '')}" oninput="cmsSet('${group}',${i},'firstOnlineAt',this.value)">
                        <button type="button" class="cms-move" style="width:auto; padding:0 10px; white-space:nowrap;" onclick="cmsFillFirstOnlineNow(${i})" title="填入当前时间">当前时间</button>
                    </div>
                </div>
                <div class="cms-field"><label>强制标红/标绿开关 (manualOverride)</label>
                    <select onchange="cmsSetProxyStatusOverride(${i},this.value)">
                        <option value="auto" ${override === 'auto' ? 'selected' : ''}>🤖 自动（Google 204 + IG 双目标探测）</option>
                        <option value="up" ${override === 'up' ? 'selected' : ''}>🟢 强制标绿（忽略探测结果）</option>
                        <option value="down" ${override === 'down' ? 'selected' : ''}>🔴 强制标红（国内连不上时一键熔断）</option>
                    </select></div>
                <div class="cms-field"><label>断网时间 (manualDownAt，强制标红时显示)</label>
                    <input type="text" placeholder="YYYY/MM/DD HH:mm:ss" value="${esc(c.manualDownAt || '')}" oninput="cmsSet('${group}',${i},'manualDownAt',this.value)"></div>
                <div class="cms-field"><label>手动标记备注 (manualNote，展示在前台卡片与遮罩)</label>
                    <input type="text" placeholder="例如：国内移动/电信连不上前置，正在切换线路" value="${esc(c.manualNote || '')}" oninput="cmsSet('${group}',${i},'manualNote',this.value)"></div>
                ${renderCardHelpFieldSelect(group, i, c)}
            </div>
            <div class="cms-item-bar">
                ${qrMode === 'image' ? `
                    ${c.imgPath ? `<img class="cms-thumb" src="${esc(c.imgPath)}" alt="预览" onerror="imgFallback(this)">` : ''}
                    <label class="cms-file-btn">📤 上传二维码图片
                        <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${i},'imgPath')">
                    </label>
                ` : `
                    <img id="cmsQrPreview_proxyList_${i}" class="cms-thumb" style="width:44px;height:44px;background:#fff;padding:3px;border-radius:6px;" alt="链接自动生码预览">
                    <span style="font-size:12px;color:var(--text-muted);">已启用「输入链接自动生成」</span>
                `}
                ${renderCardHelpUploadBtn(group, i, c)}
                <button type="button" class="cms-quick-status-btn is-down ${override === 'down' ? 'active' : ''}" onclick="cmsQuickProxyStatus(${i},'down')">🔴 一键强制标红</button>
                <button type="button" class="cms-quick-status-btn is-up ${override === 'up' ? 'active' : ''}" onclick="cmsQuickProxyStatus(${i},'up')">🟢 一键强制标绿</button>
                <button type="button" class="cms-quick-status-btn is-auto ${override === 'auto' ? 'active' : ''}" onclick="cmsQuickProxyStatus(${i},'auto')">🤖 恢复自动探测</button>
                <button type="button" class="cms-del" onclick="cmsDel('${group}',${i})">🗑 删除</button>
            </div>
            ${renderCardHelpTextEditor(group, i, c)}
        </div>`;
    });

    setTimeout(cmsRefreshAllLinkQrPreviews, 15);

    const tipText = isProxy
        ? '下方管理前台展示的前置代理二维码卡片（每个卡片均可选「① 上传我自己的二维码图片」或「② 输入链接自动生成」）。'
        : '下方管理「🏢 公司 WiFi 二维码」卡片：每张卡片可选「① 上传我自己的二维码图片」或「② 输入链接/WiFi自动生成」（填入 SSID 与密码即可按 WIFI:T:WPA;S:名称;P:密码;; 自动转成二维码）。';

    const secBlockHtml = isProxy
        ? renderSectionBlockConfig('proxy', '「前置代理二维码」区块')
        : renderSectionBlockConfig('company', '「🏢 公司 WiFi 二维码」区块');

    const body = `
        ${secBlockHtml}
        ${isProxy ? renderProxyNodesSubbox() : ''}
        <div class="cms-tip">${tipText}</div>
        ${rows || '<div class="cms-tip">暂无条目</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('${group}')">➕ 新增${isProxy ? '前置代理卡片' : '公司 WiFi 二维码卡片'}</button>`;

    return cmsWrapSection(sec, body, cmsVisibleStatBadge(group));
}

/* ---------------- 3. 基础网络卡片（含版面文案） ---------------- */

function cmsSectionWifi(sec) {
    const fxSelected = (v) => (!v || v === 'default') ? 'default' : v;
    const rows = cmsGroupedRows('baseWifiCards', (c, i) => {
        const isVisible = c.visible !== false;
        const qrMode = (c.qrMode === 'link' || (c.qrMode !== 'image' && c.wifiString)) ? 'link' : 'image';
        const autoWifiStr = String(c.wifiString || '').trim() || `WIFI:T:WPA;S:${c.name || ''};P:${c.pwd || ''};;`;
        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(c, 'baseWifiCards').cls}">${esc(c.name || '未命名')}</span>
                <span style="font-size:11.5px;color:var(--text-muted);">${qrMode === 'link' ? '🔗 自动生成二维码' : '🖼 上传图片二维码'}</span>
                ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                <span class="cms-spacer"></span>
                ${cmsRenderVisSwitch('baseWifiCards', i, c)}
                <button type="button" class="cms-move" title="上移" onclick="cmsMove('baseWifiCards',${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMove('baseWifiCards',${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>名称 / SSID</label>
                    <input type="text" value="${esc(c.name)}" oninput="cmsSet('baseWifiCards',${i},'name',this.value)"></div>
                <div class="cms-field"><label>密码</label>
                    <input type="text" value="${esc(c.pwd || '')}" oninput="cmsSet('baseWifiCards',${i},'pwd',this.value)"></div>
                <div class="cms-field"><label>二维码添加方式 (二选一)</label>
                    <select onchange="cmsSetCardQrMode('baseWifiCards',${i},this.value)">
                        <option value="image" ${qrMode === 'image' ? 'selected' : ''}>① 上传我自己的二维码图片</option>
                        <option value="link" ${qrMode === 'link' ? 'selected' : ''}>② 输入链接/WiFi自动生成</option>
                    </select></div>
                ${qrMode === 'image' ? `
                <div class="cms-field"><label>二维码图片 URL</label>
                    <input type="text" value="${esc(c.img || '')}" oninput="cmsSet('baseWifiCards',${i},'img',this.value)"></div>
                ` : `
                <div class="cms-field"><label>自动生成协议 / 链接 (随名称密码自动同步，也可自定义)</label>
                    <input type="text" id="cmsBaseWifiStr_${i}" value="${esc(autoWifiStr)}" oninput="cmsSet('baseWifiCards',${i},'wifiString',this.value)"></div>
                `}
                <div class="cms-field"><label>角标文案（可留空）</label>
                    <input type="text" value="${esc(c.tag || '')}" oninput="cmsSet('baseWifiCards',${i},'tag',this.value)"></div>
                <div class="cms-field"><label>✨ 卡片动效风格</label>
                    <select onchange="cmsSet('baseWifiCards',${i},'fx',this.value)">
                        <option value="default" ${fxSelected(c.fx) === 'default' ? 'selected' : ''}>默认（悬浮上浮）</option>
                        <option value="none" ${fxSelected(c.fx) === 'none' ? 'selected' : ''}>无动画（静止）</option>
                        <option value="pulse" ${fxSelected(c.fx) === 'pulse' ? 'selected' : ''}>密码脉冲呼吸</option>
                        <option value="neon" ${fxSelected(c.fx) === 'neon' ? 'selected' : ''}>霓虹呼吸光</option>
                        <option value="shine" ${fxSelected(c.fx) === 'shine' ? 'selected' : ''}>流光扫过</option>
                        <option value="glow" ${fxSelected(c.fx) === 'glow' ? 'selected' : ''}>光晕呼吸</option>
                        <option value="gradient" ${fxSelected(c.fx) === 'gradient' ? 'selected' : ''}>渐变流彩</option>
                        <option value="float" ${fxSelected(c.fx) === 'float' ? 'selected' : ''}>轻微漂浮</option>
                    </select></div>
                ${renderCardHelpFieldSelect('baseWifiCards', i, c)}
            </div>
            <div class="cms-item-bar">
                ${qrMode === 'image' ? `
                    ${c.img ? `<img class="cms-thumb" src="${esc(c.img)}" alt="预览" onerror="imgFallback(this)">` : ''}
                    <label class="cms-file-btn">📤 上传二维码图片
                        <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','baseWifiCards',${i},'img')">
                    </label>
                ` : `
                    <img id="cmsQrPreview_baseWifiCards_${i}" class="cms-thumb" style="width:44px;height:44px;background:#fff;padding:3px;border-radius:6px;" alt="WiFi自动生码预览">
                    <span style="font-size:12px;color:var(--text-muted);">已启用「自动生成二维码」：<code id="cmsBaseWifiCode_${i}">${esc(autoWifiStr)}</code></span>
                `}
                ${renderCardHelpUploadBtn('baseWifiCards', i, c)}
                <label class="cms-check"><input type="checkbox" ${c.large ? 'checked' : ''} onchange="cmsSet('baseWifiCards',${i},'large',this.checked)"> 名称放大</label>
                <label class="cms-check"><input type="checkbox" ${c.danger ? 'checked' : ''} onchange="cmsSet('baseWifiCards',${i},'danger',this.checked)"> 高危标红</label>
                <button type="button" class="cms-del" onclick="cmsDel('baseWifiCards',${i})">🗑 删除</button>
            </div>
            ${renderCardHelpTextEditor('baseWifiCards', i, c)}
        </div>`;
    });

    setTimeout(cmsRefreshAllLinkQrPreviews, 15);

    const body = `
        ${renderSectionBlockConfig('wifi', '「📶 代理 & WiFi」主区块')}
        ${renderSectionBlockConfig('softRouter', '「软路由分流通道」区块')}
        <div class="cms-tip">每张基础网络卡片均支持「① 上传我自己的二维码图片」或「② 输入链接/WiFi自动生成」，并可单独控制卡片右上角「?」帮助说明。</div>
        ${rows || '<div class="cms-tip">暂无卡片</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('baseWifiCards')">➕ 新增基础网络卡片</button>`;

    return cmsWrapSection(sec, body, cmsVisibleStatBadge('baseWifiCards'));
}

/* ---------------- 4. 音乐 ---------------- */

function cmsSectionMusic(sec) {
    const rows = cmsGroupedRows('music', (t, i) => `
        <div class="cms-item">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(t, 'music').cls}">${esc(t.name || '未命名')}</span>
                <span class="cms-spacer"></span>
                <button type="button" class="cms-move" title="上移" onclick="cmsMove('music',${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMove('music',${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>曲目名称</label>
                    <input type="text" value="${esc(t.name)}" oninput="cmsSet('music',${i},'name',this.value)"></div>
                <div class="cms-field"><label>音频 URL（Drive / 外链 / music/xxx.mp3）</label>
                    <input type="text" value="${esc(t.url)}" oninput="cmsSet('music',${i},'url',this.value)"></div>
            </div>
            <div class="cms-item-bar">
                <label class="cms-file-btn">🎵 上传音频
                    <input type="file" accept="audio/*" onchange="cmsUploadFile(this,'audio','music',${i},'url')">
                </label>
                <button type="button" class="cms-del" onclick="cmsDel('music',${i})">🗑 删除</button>
            </div>
        </div>`);

    const countBadge = `<span class="cms-sec-stat">共 ${(cmsState.music || []).length} 首</span>`;
    const body = `
        <label class="cms-check">
            <input type="checkbox" ${cmsState.musicEnabled === false ? '' : 'checked'} onchange="cmsSetFlag('musicEnabled',this.checked)"> 启用背景音乐播放器
        </label>
        ${rows || '<div class="cms-tip">歌单为空</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('music')">➕ 新增曲目</button>`;

    return cmsWrapSection(sec, body, countBadge);
}

/* ---------------- 5. 背景与视效 ---------------- */

function cmsSectionBackground(sec) {
    const b = cmsState.background || {};
    const mode = b.mode || 'auto';
    const body = `
        <div class="cms-grid">
            <div class="cms-field"><label>背景模式</label>
                <select onchange="cmsSetBg('mode',this.value)">
                    <option value="auto" ${mode === 'auto' ? 'selected' : ''}>自动（随机摄影图 / 随日夜切换）</option>
                    <option value="day" ${mode === 'day' ? 'selected' : ''}>白天模式（浅色背景）</option>
                    <option value="night" ${mode === 'night' ? 'selected' : ''}>夜间模式（深色背景）</option>
                    <option value="custom" ${mode === 'custom' ? 'selected' : ''}>自定义图片</option>
                </select>
            </div>
            <div class="cms-field"><label>日间模式背景图 URL</label>
                <input type="text" value="${esc(b.dayUrl || '')}" oninput="cmsSetBg('dayUrl',this.value)"></div>
            <div class="cms-field"><label>夜间模式背景图 URL</label>
                <input type="text" value="${esc(b.nightUrl || '')}" oninput="cmsSetBg('nightUrl',this.value)"></div>
        </div>
        <div class="cms-item-bar">
            <label class="cms-file-btn">🌅 上传日间图
                <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','',-1,'','dayUrl')">
            </label>
            <label class="cms-file-btn">🌌 上传夜间图
                <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','',-1,'','nightUrl')">
            </label>
            <label class="cms-check">
                <input type="checkbox" ${b.particles === false ? '' : 'checked'} onchange="cmsSetBg('particles',this.checked)"> 开启粒子特效（关闭可省电，手机更流畅）
            </label>
        </div>

        <div class="cms-subbox mt-15">
            <div class="cms-subbox-title">🎬 动态视频背景（白天 / 夜间自适应 + 失效自动回退）</div>
            <div class="cms-item-bar" style="margin-top:0; margin-bottom:12px;">
                <label class="cms-check">
                    <input type="checkbox" id="cmsVideoEnabled" ${b.videoEnabled ? 'checked' : ''} onchange="cmsSetBg('videoEnabled',this.checked)"> 启用动态视频背景（开启后白天播浅色视频、夜间播深色视频；URL 为空或加载失败时自动回退原背景）
                </label>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>☀️ 白天视频 URL（mp4 直链或 Drive 链接）</label>
                    <input type="text" id="cmsDayVideoUrl" placeholder="https://example.com/day.mp4" value="${esc(b.dayVideoUrl || '')}" oninput="cmsSetBg('dayVideoUrl',this.value)"></div>
                <div class="cms-field"><label>🌙 夜间视频 URL（mp4 直链或 Drive 链接）</label>
                    <input type="text" id="cmsNightVideoUrl" placeholder="https://example.com/night.mp4" value="${esc(b.nightVideoUrl || '')}" oninput="cmsSetBg('nightVideoUrl',this.value)"></div>
            </div>
            <div class="cms-item-bar">
                <label class="cms-file-btn">📤 上传白天视频 (≤8MB)
                    <input type="file" accept="video/mp4,video/webm,video/*" onchange="cmsUploadFile(this,'video','',-1,'','dayVideoUrl')">
                </label>
                <label class="cms-file-btn">📤 上传夜间视频 (≤8MB)
                    <input type="file" accept="video/mp4,video/webm,video/*" onchange="cmsUploadFile(this,'video','',-1,'','nightVideoUrl')">
                </label>
            </div>
        </div>

        <div class="cms-grid mt-15">
            <div class="cms-field"><label>卡片密码动态效果</label>
                <select onchange="cmsSetEffect('pwdFx',this.value)">
                    <option value="default" ${(cmsState.effects || {}).pwdFx !== 'all' && (cmsState.effects || {}).pwdFx !== 'none' ? 'selected' : ''}>默认（仅高危卡脉冲）</option>
                    <option value="all" ${(cmsState.effects || {}).pwdFx === 'all' ? 'selected' : ''}>全部脉冲呼吸</option>
                    <option value="none" ${(cmsState.effects || {}).pwdFx === 'none' ? 'selected' : ''}>无动画（静止）</option>
                </select>
            </div>
            <div class="cms-field"><label>卡片悬浮动效</label>
                <select onchange="cmsSetEffect('cardHover',this.value)">
                    <option value="on" ${(cmsState.effects || {}).cardHover !== false ? 'selected' : ''}>开启（悬浮上浮）</option>
                    <option value="off" ${(cmsState.effects || {}).cardHover === false ? 'selected' : ''}>关闭（静止）</option>
                </select>
            </div>
        </div>`;

    return cmsWrapSection(sec, body, b.videoEnabled ? '<span class="cms-sec-stat">🎬 视频背景已开启</span>' : '');
}

/* ---------------- 6. 使用教程 ---------------- */

function cmsSectionGuide(sec) {
    const body = `
        <div class="cms-tip">
            直接写 Markdown 即可：<code># 大标题</code>、<code>## 小标题</code>、<code>**加粗**</code>、<code>- 列表</code>、<code>[链接](网址)</code>、<code>&gt; 引用</code>、<code>--- 分割线</code>；
            绿色提示框用 <code>:::success 提示标题</code> 换行写内容再单独一行 <code>:::</code> 结束，红色警告框用 <code>:::warning</code>。
            也可以继续写 HTML（含 &lt;img&gt; 图片、&lt;div class="success-box"&gt; 等），系统会自动识别。
        </div>
        <div class="md-toolbar">
            <button type="button" onclick="cmsMdInsert('# ','')">大标题</button>
            <button type="button" onclick="cmsMdInsert('### ','')">小标题</button>
            <button type="button" onclick="cmsMdInsert('**','**')">加粗</button>
            <button type="button" onclick="cmsMdInsert('- ','')">列表项</button>
            <button type="button" onclick="cmsMdInsert('[','](https://)')">链接</button>
            <button type="button" onclick="cmsMdInsert('\\n:::success 提示标题\\n内容...\\n:::\\n','')">绿色提示框</button>
            <button type="button" onclick="cmsMdInsert('\\n:::warning 警告标题\\n内容...\\n:::\\n','')">红色警告框</button>
            <button type="button" onclick="cmsMdInsert('\\n---\\n','')">分割线</button>
        </div>
        <textarea class="cms-guide-editor" id="cmsGuideTextarea" rows="14" oninput="cmsSetGuide(this.value)" onchange="cmsSetGuide(this.value)">${esc(cmsState.guideHtml || '')}</textarea>
        <button type="button" class="btn-ghost" onclick="cmsPreviewGuide()">👀 预览教程</button>`;

    return cmsWrapSection(sec, body, '');
}

/* ---------------- 7. IP 生成页 · 网络测试卡片 & 拖拽排序通用能力 ---------------- */

let cmsDraggingInfo = null;

window.cmsMoveLinear = function (group, index, dir) {
    const list = cmsState && cmsState[group];
    if (!Array.isArray(list) || !list[index]) return;
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    cmsDirty = true;
    const tmp = list[index];
    list[index] = list[target];
    list[target] = tmp;
    renderCmsPanel();
};

window.cmsMoveNetTest = function (index, dir) {
    window.cmsMoveLinear('netTestList', index, dir);
};

window.cmsDragStart = function (ev, group, index) {
    const activeTag = document.activeElement && document.activeElement.tagName
        ? document.activeElement.tagName.toUpperCase()
        : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        ev.preventDefault();
        return;
    }
    cmsDraggingInfo = { group: group, index: Number(index) };
    if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', `${group}:${index}`); } catch (e) {}
    }
    if (ev.currentTarget && ev.currentTarget.classList) {
        ev.currentTarget.classList.add('is-dragging');
    }
};

window.cmsDragOver = function (ev) {
    if (!cmsDraggingInfo) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    if (ev.currentTarget && ev.currentTarget.classList) {
        ev.currentTarget.classList.add('is-drag-over');
    }
};

window.cmsDragLeave = function (ev) {
    if (ev.currentTarget && ev.currentTarget.classList) {
        ev.currentTarget.classList.remove('is-drag-over');
    }
};

window.cmsDrop = function (ev, group, targetIndex) {
    ev.preventDefault();
    if (ev.currentTarget && ev.currentTarget.classList) {
        ev.currentTarget.classList.remove('is-drag-over');
    }
    if (!cmsDraggingInfo || cmsDraggingInfo.group !== group) {
        cmsDraggingInfo = null;
        return;
    }
    const fromIdx = cmsDraggingInfo.index;
    const toIdx = Number(targetIndex);
    cmsDraggingInfo = null;
    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
    const list = cmsState && cmsState[group];
    if (!Array.isArray(list) || !list[fromIdx]) return;
    cmsDirty = true;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    renderCmsPanel();
};

window.cmsDragEnd = function (ev) {
    cmsDraggingInfo = null;
    if (ev && ev.currentTarget && ev.currentTarget.classList) {
        ev.currentTarget.classList.remove('is-dragging', 'is-drag-over');
    }
    document.querySelectorAll('.cms-item.is-dragging, .cms-item.is-drag-over').forEach(el => {
        el.classList.remove('is-dragging', 'is-drag-over');
    });
};

function cmsSectionNetTest(sec) {
    const list = (cmsState && cmsState.netTestList) || [];
    const rows = list.map((c, i) => {
        const isVisible = c.visible !== false;
        const qrMode = c.qrMode === 'image' ? 'image' : 'link';
        const { shortUrl, fullUrl } = normalizeNetTestUrlPair(c.url);
        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}" draggable="true" ondragstart="cmsDragStart(event,'netTestList',${i})" ondragover="cmsDragOver(event)" ondragleave="cmsDragLeave(event)" ondrop="cmsDrop(event,'netTestList',${i})" ondragend="cmsDragEnd(event)">
            <div class="cms-item-head">
                <span class="cms-drag-handle" title="按住上下拖拽排序">☰</span>
                <span class="cms-badge ${qrMode === 'image' ? 'image' : 'wifi'}">${esc(c.name || '未命名检测站')}</span>
                <span style="font-size:12px;color:var(--text-muted);font-family:Consolas,monospace;">${esc(shortUrl || '未填网址')} · ${qrMode === 'image' ? '🖼 上传图片' : '🔗 自动生码'}</span>
                ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                <span class="cms-spacer"></span>
                ${cmsRenderVisSwitch('netTestList', i, c)}
                <button type="button" class="cms-move" title="上移" onclick="cmsMoveNetTest(${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMoveNetTest(${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>检测网站名称</label>
                    <input type="text" placeholder="例如：DNSLeakTest" value="${esc(c.name || '')}" oninput="cmsSet('netTestList',${i},'name',this.value)"></div>
                <div class="cms-field"><label>二维码添加方式 (二选一)</label>
                    <select onchange="cmsSetCardQrMode('netTestList',${i},this.value)">
                        <option value="link" ${qrMode === 'link' ? 'selected' : ''}>② 输入链接自动生成</option>
                        <option value="image" ${qrMode === 'image' ? 'selected' : ''}>① 上传我自己的二维码图片</option>
                    </select></div>
                <div class="cms-field"><label>网址（点击跳转地址 &amp; ${qrMode === 'link' ? '自动生成二维码源' : '展示用网址'}）</label>
                    <input type="text" placeholder="例如：dnsleaktest.com" value="${esc(c.url || '')}" oninput="cmsSet('netTestList',${i},'url',this.value)"></div>
                ${qrMode === 'image' ? `
                <div class="cms-field"><label>二维码图片 URL (imgPath)</label>
                    <input type="text" placeholder="images/xxx.jpg 或上传后的 Drive 链接" value="${esc(c.imgPath || '')}" oninput="cmsSet('netTestList',${i},'imgPath',this.value)"></div>
                ` : ''}
                <div class="cms-field" style="grid-column: 1 / -1;"><label>介绍说明文字（展开大卡片时显示在二维码下方）</label>
                    <input type="text" placeholder="例如：测 IP DNS 泄漏" value="${esc(c.desc || '')}" oninput="cmsSet('netTestList',${i},'desc',this.value)"></div>
                ${renderCardHelpFieldSelect('netTestList', i, c)}
            </div>
            <div class="cms-item-bar">
                ${qrMode === 'image' ? `
                    ${c.imgPath ? `<img class="cms-thumb" src="${esc(c.imgPath)}" alt="二维码预览" onerror="imgFallback(this)">` : ''}
                    <label class="cms-file-btn">📤 上传二维码图片
                        <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','netTestList',${i},'imgPath')">
                    </label>
                ` : `
                    <img id="cmsNetQrPreview_${i}" class="cms-thumb" style="width:44px;height:44px;background:#fff;padding:3px;border-radius:6px;" alt="二维码预览">
                    <span style="font-size:12px;color:var(--text-muted);">二维码目标：<code id="cmsNetUrlCode_${i}">${esc(fullUrl || '—')}</code></span>
                `}
                ${renderCardHelpUploadBtn('netTestList', i, c)}
                <span class="cms-spacer"></span>
                <button type="button" class="cms-del" onclick="cmsDel('netTestList',${i})">🗑 删除</button>
            </div>
            ${renderCardHelpTextEditor('netTestList', i, c)}
        </div>`;
    }).join('');

    setTimeout(cmsRefreshAllLinkQrPreviews, 15);

    const body = `
        ${renderSectionBlockConfig('netTest', '「🌐 网络测试」区块')}
        ${renderSectionBlockConfig('quick', '「⚡ IP 二维码生成」区块')}
        ${renderSectionBlockConfig('batch', '「📋 填写 IP 报表」区块')}
        ${renderSectionBlockConfig('single', '「🔍 IP 提取与代理检测」区块')}
        <div class="cms-tip">管理「⚡ IP 生成」页面最下方的「🌐 网络测试」卡片。支持按住 <code>☰</code> 拖拽排序，支持选择「上传图片」或「输入链接自动生成」，并可单独控制每张卡片右上角「?」问号。</div>
        ${rows || '<div class="cms-tip">暂无检测网站卡片</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('netTestList')">➕ 新增检测网站卡片</button>`;

    return cmsWrapSection(sec, body, cmsVisibleStatBadge('netTestList'));
}

/* ---------------- 9. 📱 手机 App 下载（App Store） & 11. 🔒 隐藏专区 通用卡片行构建 ---------------- */

function renderAppQrCmsRows(group, itemLabel) {
    const list = (cmsState && cmsState[group]) || [];
    return list.map((c, i) => {
        const isVisible = c.visible !== false;
        const qrMode = c.qrMode === 'image' ? 'image' : 'link';
        const { shortUrl, fullUrl } = normalizeNetTestUrlPair(c.url);
        const iconUrl = typeof window.getDefaultAppIcon === 'function'
            ? window.getDefaultAppIcon(c.name, c.icon)
            : String(c.icon || '').trim();
        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}" draggable="true" ondragstart="cmsDragStart(event,'${group}',${i})" ondragover="cmsDragOver(event)" ondragleave="cmsDragLeave(event)" ondrop="cmsDrop(event,'${group}',${i})" ondragend="cmsDragEnd(event)">
            <div class="cms-item-head">
                <span class="cms-drag-handle" title="按住上下拖拽排序">☰</span>
                ${iconUrl ? `<img src="${esc(iconUrl)}" alt="" style="width:22px;height:22px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">` : ''}
                <span class="cms-badge ${qrMode === 'image' ? 'image' : 'wifi'}">${esc(c.name || ('未命名' + itemLabel))}</span>
                <span style="font-size:12px;color:var(--text-muted);font-family:Consolas,monospace;">${esc(shortUrl ? (shortUrl.length > 38 ? shortUrl.slice(0, 38) + '…' : shortUrl) : '未填链接')} · ${qrMode === 'image' ? '🖼 上传图片' : '🔗 自动生码'}</span>
                ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                <span class="cms-spacer"></span>
                ${cmsRenderVisSwitch(group, i, c)}
                <button type="button" class="cms-move" title="上移" onclick="cmsMoveLinear('${group}',${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMoveLinear('${group}',${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>${itemLabel}名称</label>
                    <input type="text" placeholder="例如：Gmail / Shadowrocket" value="${esc(c.name || '')}" oninput="cmsSet('${group}',${i},'name',this.value)"></div>
                <div class="cms-field"><label>二维码添加方式 (二选一)</label>
                    <select onchange="cmsSetCardQrMode('${group}',${i},this.value)">
                        <option value="link" ${qrMode === 'link' ? 'selected' : ''}>② 输入链接自动生成（二维码中心嵌图标）</option>
                        <option value="image" ${qrMode === 'image' ? 'selected' : ''}>① 上传我自己的二维码图片</option>
                    </select></div>
                <div class="cms-field"><label>🔗 目标链接（App Store 链接或任意网址，扫码直接跳转）</label>
                    <input type="text" placeholder="https://apps.apple.com/..." value="${esc(c.url || '')}" oninput="cmsSet('${group}',${i},'url',this.value)"></div>
                ${qrMode === 'image' ? `
                <div class="cms-field"><label>上传的二维码图片 URL (imgPath)</label>
                    <input type="text" placeholder="images/xxx.jpg 或上传后的 Drive 链接" value="${esc(c.imgPath || '')}" oninput="cmsSet('${group}',${i},'imgPath',this.value)"></div>
                ` : ''}
                <div class="cms-field"><label>🎨 小图标 URL（留空则按名称自动匹配官方内置图标）</label>
                    <input type="text" placeholder="留空自动使用内置高清图标，也可粘贴图片 URL 或上传" value="${esc(c.icon && !String(c.icon).startsWith('data:image/svg+xml') ? c.icon : '')}" oninput="cmsSet('${group}',${i},'icon',this.value)"></div>
                <div class="cms-field" style="grid-column: 1 / -1;"><label>📝 介绍说明文字（展开大卡片时显示在二维码下方）</label>
                    <input type="text" placeholder="输入该 App / 资源的简要说明" value="${esc(c.desc || '')}" oninput="cmsSet('${group}',${i},'desc',this.value)"></div>
                ${renderCardHelpFieldSelect(group, i, c)}
            </div>
            <div class="cms-item-bar">
                ${qrMode === 'image' ? `
                    ${c.imgPath ? `<img class="cms-thumb" src="${esc(c.imgPath)}" alt="二维码预览" onerror="imgFallback(this)">` : ''}
                    <label class="cms-file-btn">📤 上传二维码图片
                        <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${i},'imgPath')">
                    </label>
                ` : `
                    <div style="position:relative;width:44px;height:44px;background:#fff;padding:3px;border-radius:6px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;">
                        <img id="cmsQrPreview_${group}_${i}" style="width:100%;height:100%;object-fit:contain;" alt="二维码预览">
                        ${iconUrl ? `<img src="${esc(iconUrl)}" alt="" style="position:absolute;width:13px;height:13px;border-radius:3px;background:#fff;padding:1px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">` : ''}
                    </div>
                    <span style="font-size:12px;color:var(--text-muted);">扫码跳转：<code id="cmsAppUrlCode_${group}_${i}">${esc(fullUrl || '—')}</code></span>
                `}
                <label class="cms-file-btn">🖼 上传自定义小图标
                    <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${i},'icon')">
                </label>
                ${renderCardHelpUploadBtn(group, i, c)}
                <span class="cms-spacer"></span>
                <button type="button" class="cms-del" onclick="cmsDel('${group}',${i})">🗑 删除</button>
            </div>
            ${renderCardHelpTextEditor(group, i, c)}
        </div>`;
    }).join('');
}

function cmsSectionAppStore(sec) {
    const rows = renderAppQrCmsRows('appStoreList', 'App');
    setTimeout(cmsRefreshAllLinkQrPreviews, 15);
    const body = `
        ${renderSectionBlockConfig('appStore', '「📱 手机 App 下载（App Store）」区块')}
        <div class="cms-tip">
            管理「📋 填写 IP 报表」下方的<strong>「📱 手机 App 下载（App Store）」</strong>区块：前台默认显示一排带小图标的按钮（不显示小二维码），鼠标悬停或点击时原地放大展开显示「① App 名字 ② 中心嵌有 App 图标的大二维码 ③ 介绍文字」。支持按住左侧 <code>☰</code> 拖拽排序或点 ↑↓ 调序。
        </div>
        ${rows || '<div class="cms-tip">暂无手机 App 条目</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('appStoreList')">➕ 新增手机 App 下载项</button>
    `;
    return cmsWrapSection(sec, body, cmsVisibleStatBadge('appStoreList'));
}

/* ---------------- 10. 💻 电脑软件 ---------------- */

function cmsSectionPcSoft(sec) {
    const list = (cmsState && cmsState.pcSoftList) || [];
    const rows = list.map((c, i) => {
        const isVisible = c.visible !== false;
        const { shortUrl, fullUrl } = normalizeNetTestUrlPair(c.url);
        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}" draggable="true" ondragstart="cmsDragStart(event,'pcSoftList',${i})" ondragover="cmsDragOver(event)" ondragleave="cmsDragLeave(event)" ondrop="cmsDrop(event,'pcSoftList',${i})" ondragend="cmsDragEnd(event)">
            <div class="cms-item-head">
                <span class="cms-drag-handle" title="按住上下拖拽排序">☰</span>
                <span class="cms-badge wifi">${esc(c.name || '未命名软件')}</span>
                <span style="font-size:12px;color:var(--text-muted);font-family:Consolas,monospace;">${esc(shortUrl ? (shortUrl.length > 44 ? shortUrl.slice(0, 44) + '…' : shortUrl) : '未填链接')}</span>
                ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                <span class="cms-spacer"></span>
                ${cmsRenderVisSwitch('pcSoftList', i, c)}
                <button type="button" class="cms-move" title="上移" onclick="cmsMoveLinear('pcSoftList',${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMoveLinear('pcSoftList',${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>💻 软件名称</label>
                    <input type="text" placeholder="例如：Clash Verge Rev" value="${esc(c.name || '')}" oninput="cmsSet('pcSoftList',${i},'name',this.value)"></div>
                <div class="cms-field"><label>🔗 点击跳转下载链接（点击名字直接在新标签页打开）</label>
                    <input type="text" placeholder="https://..." value="${esc(c.url || '')}" oninput="cmsSet('pcSoftList',${i},'url',this.value)"></div>
                <div class="cms-field" style="grid-column: 1 / -1;"><label>📝 介绍说明文字（鼠标悬停放大展开时显示在名字下方）</label>
                    <input type="text" placeholder="输入该电脑软件的用途或版本说明" value="${esc(c.desc || '')}" oninput="cmsSet('pcSoftList',${i},'desc',this.value)"></div>
                ${renderCardHelpFieldSelect('pcSoftList', i, c)}
            </div>
            <div class="cms-item-bar">
                <span style="font-size:12px;color:var(--text-muted);">点击直达：<code>${esc(fullUrl || '—')}</code></span>
                ${renderCardHelpUploadBtn('pcSoftList', i, c)}
                <span class="cms-spacer"></span>
                <button type="button" class="cms-del" onclick="cmsDel('pcSoftList',${i})">🗑 删除</button>
            </div>
            ${renderCardHelpTextEditor('pcSoftList', i, c)}
        </div>`;
    }).join('');

    const body = `
        ${renderSectionBlockConfig('pcSoft', '「💻 电脑软件」区块')}
        <div class="cms-tip">
            管理「📋 填写 IP 报表」下方的<strong>「💻 电脑软件」</strong>区块：前台显示一排文字小方块（无二维码），点击名字直接在新标签页打开对应链接，鼠标悬停原地放大显示「① 软件名字 ② 介绍说明文字」。支持按住左侧 <code>☰</code> 拖拽排序或点 ↑↓ 调序。
        </div>
        ${rows || '<div class="cms-tip">暂无电脑软件条目</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('pcSoftList')">➕ 新增电脑软件项</button>
    `;
    return cmsWrapSection(sec, body, cmsVisibleStatBadge('pcSoftList'));
}

/* ---------------- 11. 🔒 隐藏专区（默认完全不显示，后台开启总开关才出现） ---------------- */

window.cmsToggleSecretZoneMaster = function (checked) {
    if (!cmsState) cmsState = normalizeCmsState(clone(window.getSiteContent()));
    cmsDirty = true;
    cmsState.secretZoneEnabled = !!checked;
    if (window.SiteContent) {
        window.SiteContent.data = cmsState;
        window.applySiteContent();
    }
    renderCmsPanel();
};

function cmsSectionSecretZone(sec) {
    const enabled = Boolean(cmsState && cmsState.secretZoneEnabled);
    const rows = renderAppQrCmsRows('secretZoneList', '隐藏项');
    setTimeout(cmsRefreshAllLinkQrPreviews, 15);
    const masterBadge = `<span class="cms-sec-stat" style="${enabled ? 'color:#34C759;font-weight:700;' : ''}">${enabled ? '🟢 前台已开启显示' : '🔒 前台默认隐藏中'} · 共 ${(cmsState.secretZoneList || []).length} 项</span>`;
    const body = `
        <div class="cms-subbox" style="margin-bottom:14px;border-color:${enabled ? 'rgba(52,199,89,0.55)' : 'rgba(230,162,60,0.45)'};background:${enabled ? 'rgba(52,199,89,0.06)' : 'rgba(230,162,60,0.05)'};">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                <div>
                    <div style="font-size:14px;font-weight:700;color:var(--text-color);">🔒 【隐藏专区】前端总开关（控制整个区块是否在页面上出现）</div>
                    <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">默认关闭（前端完全不显示该区块）；只有在此处打开总开关后，前端「📋 填写 IP 报表」最下方才会出现本专区。</div>
                </div>
                <label class="cms-vis-switch ${enabled ? 'is-on' : 'is-off'}" style="transform:scale(1.08);transform-origin:right center;">
                    <input type="checkbox" ${enabled ? 'checked' : ''} onchange="cmsToggleSecretZoneMaster(this.checked)">
                    <span class="cms-vis-track"><span class="cms-vis-thumb"></span></span>
                    <span class="cms-vis-label">${enabled ? '🔓 已在前端开启显示' : '🔒 前端完全隐藏（默认）'}</span>
                </label>
            </div>
        </div>
        ${renderSectionBlockConfig('secretZone', '「🔒 隐藏专区」区块')}
        <div class="cms-tip">
            结构与交互同「📱 手机 App 下载」：鼠标悬停或点击展开二维码与说明；支持「① 上传我自己的二维码图片」或「② 输入链接自动生成」，支持按住 <code>☰</code> 拖拽排序。
        </div>
        ${rows || '<div class="cms-tip">当前隐藏专区列表为空，点击下方「➕ 新增隐藏专区条目」即可添加。</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('secretZoneList')">➕ 新增隐藏专区条目</button>
    `;
    return cmsWrapSection(sec, body, masterBadge);
}

/* ---------------- 交互函数 ---------------- */

window.cmsSet = function (group, index, key, value) {
    const item = (cmsState[group] || [])[index];
    if (!item) return;
    cmsDirty = true;
    if ((group === 'appStoreList' || group === 'secretZoneList') && key === 'icon' && !String(value || '').trim()) {
        item.icon = typeof window.getDefaultAppIcon === 'function' ? window.getDefaultAppIcon(item.name, '') : '';
    } else {
        item[key] = value;
    }

    // 1. 基础网络卡片在自动生码模式下，名称/密码变更时同步刷新 wifiString 与预览
    if (group === 'baseWifiCards') {
        const isLink = item.qrMode === 'link' || (item.qrMode !== 'image' && item.wifiString);
        if (isLink && (key === 'name' || key === 'pwd')) {
            item.wifiString = `WIFI:T:WPA;S:${item.name || ''};P:${item.pwd || ''};;`;
            const strInp = document.getElementById('cmsBaseWifiStr_' + index);
            if (strInp) strInp.value = item.wifiString;
        }
        if (isLink && (key === 'name' || key === 'pwd' || key === 'wifiString')) {
            const targetStr = String(item.wifiString || '').trim() || `WIFI:T:WPA;S:${item.name || ''};P:${item.pwd || ''};;`;
            const codeEl = document.getElementById('cmsBaseWifiCode_' + index);
            if (codeEl) codeEl.textContent = targetStr;
            const imgEl = document.getElementById('cmsQrPreview_baseWifiCards_' + index);
            if (imgEl && targetStr && typeof waitForQRCode === 'function') {
                waitForQRCode(() => {
                    QRCode.toDataURL(targetStr, { width: 120, margin: 1 }, (err, dataUrl) => {
                        if (!err && dataUrl) imgEl.src = dataUrl;
                    });
                });
            }
        }
    }

    // 2. 公司 WiFi 卡片在自动生码模式下，SSID/密码变更时自动合成 WIFI:T:WPA;S:名称;P:密码;; 并实时刷新二维码预览
    if (group === 'companyWifiList' && item.qrMode === 'link') {
        if (key === 'ssid' || key === 'pwd') {
            const ssid = String(item.ssid || item.name || '').trim();
            item.qrText = ssid ? `WIFI:T:WPA;S:${ssid};P:${item.pwd || ''};;` : '';
            const txtInp = document.getElementById('cmsCompanyQrText_' + index);
            if (txtInp) txtInp.value = item.qrText;
        }
        if (key === 'ssid' || key === 'pwd' || key === 'qrText' || key === 'name') {
            const linkText = getCompanyCardLinkText(item);
            const codeEl = document.getElementById('cmsCompanyQrCode_' + index);
            if (codeEl) codeEl.textContent = linkText || '请填写 WiFi 名称或链接';
            const imgEl = document.getElementById('cmsQrPreview_companyWifiList_' + index);
            if (imgEl && linkText && typeof waitForQRCode === 'function') {
                waitForQRCode(() => {
                    QRCode.toDataURL(linkText, { width: 120, margin: 1 }, (err, dataUrl) => {
                        if (!err && dataUrl) imgEl.src = dataUrl;
                    });
                });
            }
        }
    }

    // 3. 前置代理卡片在自动生码模式下，修改 proxyUrl 实时刷新预览
    if (group === 'proxyList' && item.qrMode === 'link' && key === 'proxyUrl') {
        const raw = String(value || '').trim();
        const imgEl = document.getElementById('cmsQrPreview_proxyList_' + index);
        if (imgEl && raw && typeof waitForQRCode === 'function') {
            waitForQRCode(() => {
                QRCode.toDataURL(raw, { width: 120, margin: 1 }, (err, dataUrl) => {
                    if (!err && dataUrl) imgEl.src = dataUrl;
                });
            });
        }
    }

    // 4. 网络测试 / 手机 App / 隐藏专区卡片修改网址时，实时重新生成后台预览二维码
    if ((group === 'netTestList' || group === 'appStoreList' || group === 'secretZoneList') && key === 'url') {
        const { fullUrl } = normalizeNetTestUrlPair(value);
        const codeEl = document.getElementById(group === 'netTestList' ? ('cmsNetUrlCode_' + index) : `cmsAppUrlCode_${group}_${index}`);
        if (codeEl) codeEl.textContent = fullUrl || '—';
        const imgEl = document.getElementById(group === 'netTestList' ? ('cmsNetQrPreview_' + index) : `cmsQrPreview_${group}_${index}`);
        if (imgEl && fullUrl && typeof waitForQRCode === 'function') {
            waitForQRCode(() => {
                QRCode.toDataURL(fullUrl, { width: 120, margin: 1, errorCorrectionLevel: 'H' }, (err, dataUrl) => {
                    if (!err && dataUrl) imgEl.src = dataUrl;
                });
            });
        }
    }
};

window.cmsSetFlag = function (key, value) { cmsDirty = true; cmsState[key] = value; };
window.cmsSetText = function (key, value) {
    cmsDirty = true;
    cmsState[key] = value;
    if (cmsState.sectionBlocks) {
        if (key === 'wifiTitle' && cmsState.sectionBlocks.wifi) cmsState.sectionBlocks.wifi.title = value;
        if (key === 'wifiTip' && cmsState.sectionBlocks.wifi) cmsState.sectionBlocks.wifi.tip = value;
        if (key === 'netTestTip' && cmsState.sectionBlocks.netTest) cmsState.sectionBlocks.netTest.tip = value;
    }
};
window.cmsSetEffect = function (key, value) {
    cmsDirty = true;
    cmsState.effects = cmsState.effects || { pwdFx: 'default', cardHover: true };
    cmsState.effects[key] = (key === 'cardHover') ? (value === 'on') : value;
    if (window.SiteContent) { window.SiteContent.data = cmsState; window.applySiteContent(); }
};
window.cmsSetBg = function (key, value) {
    cmsDirty = true;
    cmsState.background = cmsState.background || {};
    cmsState.background[key] = value;
    if (key === 'mode' || key === 'videoEnabled') renderCmsPanel();
    if (window.SiteContent) {
        window.SiteContent.data = cmsState;
        window.BG_CONFIG = cmsState.background;
        if (typeof window.applyBgVideo === 'function') window.applyBgVideo();
        if (key === 'mode' || key === 'dayUrl' || key === 'nightUrl' || key === 'particles') {
            if (typeof window.createParticles === 'function') window.createParticles();
        }
    }
};
window.cmsSetGuide = function (html) { cmsDirty = true; cmsState.guideHtml = html; };

/** 在教程编辑器光标处插入 Markdown 片段 */
window.cmsMdInsert = function (before, after) {
    const ta = document.getElementById('cmsGuideTextarea') || document.querySelector('.cms-guide-editor');
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || '文本';
    ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
    cmsSetGuide(ta.value);
    ta.focus();
    const pos = s + before.length + sel.length + after.length;
    ta.selectionStart = ta.selectionEnd = pos;
};

window.cmsToggleWifiMode = function (index, checkbox) {
    window.cmsSetCardQrMode('baseWifiCards', index, checkbox && checkbox.checked ? 'link' : 'image');
};

window.cmsAdd = function (group) {
    cmsDirty = true;
    cmsState[group] = cmsState[group] || [];
    if (group === 'baseWifiCards') {
        const nid = 'card' + Date.now();
        cmsState[group].push({
            id: nid, name: '新网络', pwd: '', qrMode: 'link', img: '', wifiString: 'WIFI:T:WPA;S:新网络;P:;;',
            tag: '', large: false, danger: false, visible: true, helpType: '', helpImg: '', helpText: ''
        });
        const ids = getShownIds();
        if (ids.indexOf(nid) < 0) { ids.push(nid); setShownIds(ids); }
    } else if (group === 'proxyList') {
        cmsState[group].push({
            id: 'proxy_' + Date.now(),
            name: '新前置代理',
            qrMode: 'image',
            imgPath: '',
            proxyUrl: '',
            visible: true,
            firstOnlineAt: cmsNowChinaStr(),
            statusOverride: 'auto',
            manualOverride: false,
            manualDownAt: '',
            manualNote: '',
            helpType: '',
            helpImg: '',
            helpText: ''
        });
    } else if (group === 'companyWifiList') {
        cmsState[group].push({
            id: 'company_' + Date.now(),
            name: '新公司WiFi',
            qrMode: 'link',
            imgPath: '',
            ssid: '新公司WiFi',
            pwd: '',
            qrText: 'WIFI:T:WPA;S:新公司WiFi;P:;;',
            visible: true,
            helpType: '',
            helpImg: '',
            helpText: ''
        });
    } else if (group === 'music') {
        cmsState[group].push({ name: '新曲目', url: '' });
    } else if (group === 'netTestList') {
        cmsState[group].push({
            id: 'net_' + Date.now(),
            name: '新检测网站',
            qrMode: 'link',
            url: 'ipinfo.io',
            imgPath: '',
            desc: '检测代理 IP 纯净度与匿名性',
            visible: true,
            helpType: '',
            helpImg: '',
            helpText: ''
        });
    } else if (group === 'appStoreList') {
        cmsState[group].push({
            id: 'app_' + Date.now(),
            name: '新 App',
            icon: typeof window.getDefaultAppIcon === 'function' ? window.getDefaultAppIcon('新 App', '') : '',
            qrMode: 'link',
            url: 'https://apps.apple.com/',
            imgPath: '',
            desc: '使用 iPhone 相机扫码直达 App Store 下载页',
            visible: true,
            helpType: '',
            helpImg: '',
            helpText: ''
        });
    } else if (group === 'pcSoftList') {
        cmsState[group].push({
            id: 'pc_' + Date.now(),
            name: '新电脑软件',
            url: 'https://',
            desc: '点击直接在新标签页打开下载页',
            visible: true,
            helpType: '',
            helpImg: '',
            helpText: ''
        });
    } else if (group === 'secretZoneList') {
        cmsState[group].push({
            id: 'secret_' + Date.now(),
            name: '新隐藏项',
            icon: typeof window.getDefaultAppIcon === 'function' ? window.getDefaultAppIcon('新隐藏项', '') : '',
            qrMode: 'link',
            url: 'https://',
            imgPath: '',
            desc: '鼠标悬停或点击展开查看二维码与说明',
            visible: true,
            helpType: '',
            helpImg: '',
            helpText: ''
        });
    } else {
        cmsState[group].push({ name: '新条目', qrMode: 'image', imgPath: '', visible: true });
    }
    renderCmsPanel();
};

window.cmsDel = function (group, index) {
    if (!confirm('确认删除该条目？')) return;
    cmsDirty = true;
    (cmsState[group] || []).splice(index, 1);
    renderCmsPanel();
};

window.cmsUploadFile = function (input, kind, group, index, key, bgKey) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { showToast('⚠️ 文件需小于 8MB'); return; }
    if (!window.hasCloudApi || !window.hasCloudApi()) {
        return showToast('⚠️ 上传需要先部署 Google 后端；目前可先把图片传到图床后，把外链粘到「图片 URL」输入框');
    }

    const token = getAdminToken();
    if (!token) return;
    showToast('⏳ 正在上传到 Google Drive...');

    const reader = new FileReader();
    reader.onerror = () => showToast('❌ 文件读取失败');
    reader.onload = () => {
        const base64 = String(reader.result).split(',')[1] || '';
        window.postToApi({
            action: 'UPLOAD_FILE', token, kind,
            fileName: file.name,
            mimeType: file.type || (kind === 'audio' ? 'audio/mpeg' : (kind === 'video' ? 'video/mp4' : 'image/png')),
            base64
        }, true).then(j => {
            if (j && j.ok && j.file) {
                if (bgKey) cmsSetBg(bgKey, j.file.url);
                else if (group === '__section__') window.cmsSetSectionBlock(index, key, j.file.url);
                else window.cmsSet(group, index, key, j.file.url);
                showToast('✅ 上传成功，记得保存下发');
                renderCmsPanel();
            } else {
                showToast('❌ ' + ((j && j.error) || '上传失败'));
            }
        }).catch(e => showToast('❌ 上传失败: ' + e.message));
    };
    reader.readAsDataURL(file);
};

window.cmsPreviewGuide = function () {
    const modal = document.getElementById('wifiGuideModal');
    const textBox = document.getElementById('guideContentContainer');
    if (!cmsState.guideHtml) return showToast('⚠️ 教程内容为空');
    // 直接切到教程标签页预览（不写入线上内容）
    const guideTab = document.getElementById('tabBtn-guide');
    if (guideTab) guideTab.click();
    if (textBox) {
        textBox.innerHTML = window.renderGuideContent
            ? window.renderGuideContent(cmsState.guideHtml)
            : cmsState.guideHtml;
    }
    setTimeout(() => { if (modal) modal.style.display = 'none'; }, 0);
};

/** 立即将当前 cmsState 写入本地缓存并刷新前台展示 */
function applyAndPersistLocal(state) {
    normalizeCmsState(state);
    if (Array.isArray(state.baseWifiCards)) {
        setShownIds(state.baseWifiCards.filter(c => c && c.visible !== false).map(c => c.id));
    }
    try {
        localStorage.setItem('mnContentLocal', JSON.stringify(state));
        localStorage.setItem('mnContentCache', JSON.stringify(state));
    } catch (e) {}
    if (window.SiteContent) {
        window.SiteContent.data = clone(state);
        window.applySiteContent();
    }
}

window.cmsSaveContent = function () {
    if (!cmsState) cmsState = normalizeCmsState(clone(window.getSiteContent()));
    else normalizeCmsState(cmsState);

    // 先在本地立即生效并写入持久化存储（刷新仍保持）
    cmsDirty = false;
    applyAndPersistLocal(cmsState);
    renderCmsPanel();
    if (typeof injectAdminControls === 'function') injectAdminControls();

    // 未配置云端时：仅保存到本机浏览器
    if (!window.hasCloudApi || !window.hasCloudApi()) {
        return showToast('💾 已保存到本机并生效（部署云端后可同步给所有人）');
    }

    const token = getAdminToken();
    if (!token) {
        return showToast('💾 已保存到本机并立即生效（输入管理密钥后可同步至云端）');
    }
    showToast('🚀 正在下发到云端...');
    window.postToApi({ action: 'SAVE_CONTENT', token, content: cmsState }, true)
        .then(j => {
            if (j && j.ok) {
                // 同步「前台展示」等展示配置，保证新卡片在所有人设备上可见
                const cfg = {};
                ['cfgDataMode', 'cfgTotalMode', 'cfgTotalOffset', 'cfgTotalFixed', 'cfgOnlineFixed', 'cfgShowSoftRouter', 'cfgShowWifiCards'].forEach(k => {
                    const v = localStorage.getItem(k);
                    if (v !== null && v !== undefined) cfg[k] = v;
                });
                window.postToApi(Object.assign({ action: 'UPDATE_CONFIG', token }, cfg), true).catch(() => {});

                // 若云端已返回最新持久化内容，可清除本地待同步标记
                if (j.content && typeof j.content === 'object' && Object.keys(j.content).length > 0) {
                    try { localStorage.removeItem('mnContentLocal'); } catch (e) {}
                    window.SiteContent.remote = true;
                }
                showToast('✅ 已保存并全网下发');
                renderCmsPanel();
            } else {
                showToast('⚠️ 云端下发失败（' + ((j && j.error) || '密钥错误') + '），已保存在本机生效');
                localStorage.removeItem(CMS_TOKEN_KEY);
            }
        })
        .catch(e => {
            showToast('⚠️ 网络异常（' + e.message + '），已保存在本机生效');
        });
};

/* ---------------- 快捷键说明弹窗 & 全局键盘快捷键 ---------------- */

window.openShortcutModal = function () {
    const m = document.getElementById('cmsShortcutModal');
    if (m) m.style.display = 'flex';
};

window.closeShortcutModal = function () {
    const m = document.getElementById('cmsShortcutModal');
    if (m) m.style.display = 'none';
};

window.toggleShortcutModal = function () {
    const m = document.getElementById('cmsShortcutModal');
    if (!m) return;
    if (m.style.display === 'flex') closeShortcutModal();
    else openShortcutModal();
};

document.addEventListener('DOMContentLoaded', () => {
    const shortcutModal = document.getElementById('cmsShortcutModal');
    if (shortcutModal) {
        shortcutModal.addEventListener('click', (e) => {
            if (e.target === shortcutModal) closeShortcutModal();
        });
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeShortcutModal();
        return;
    }

    // Ctrl/Cmd + Alt + 1~7（跳转分区）与 Ctrl/Cmd + Alt + S（保存内容）
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
        const digitMatch = /^(?:Digit|Numpad)([1-7])$/.exec(e.code || '');
        const keyNum = digitMatch ? Number(digitMatch[1]) : (/^[1-7]$/.test(e.key || '') ? Number(e.key) : 0);
        if (keyNum >= 1 && keyNum <= 7) {
            e.preventDefault();
            window.cmsJumpToSection(keyNum);
            return;
        }
        if (e.code === 'KeyS' || String(e.key || '').toLowerCase() === 's' || e.key === 'ß') {
            e.preventDefault();
            window.cmsSaveContent();
            return;
        }
    }

    // ? 键弹出/关闭快捷键说明面板（输入框聚焦时不触发）
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    if (!isEditable && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === '?' || e.key === '？' || (e.shiftKey && e.code === 'Slash')) {
            e.preventDefault();
            window.toggleShortcutModal();
        }
    }
});

/* ============================================================
 * 模块 3：审计大屏日期范围查询 + 真实访问统计 + 交互频次趋势
 * ============================================================ */

let chartCaliber = 'pv'; // 'pv' = 按访问次数（默认），'uv' = 按 IP+日期 去重
window.__cachedAllLogs = [];
window.__cachedRangeLogs = [];

/** 将 Date 对象格式化为 Asia/Shanghai 口径下的 YYYY-MM-DD */
function formatShanghaiYmd(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(d);
        const y = (parts.find(p => p.type === 'year') || {}).value;
        const m = (parts.find(p => p.type === 'month') || {}).value;
        const day = (parts.find(p => p.type === 'day') || {}).value;
        if (y && m && day) return `${y}-${m}-${day}`;
    } catch (e) {}
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 从单条日志提取 Asia/Shanghai 口径的 YYYY-MM-DD */
function extractLogYmd(log) {
    if (!log) return '';
    if (typeof log.dateYmd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.dateYmd)) {
        return log.dateYmd;
    }
    let rawTime = log.time;
    if (log.dataType && (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(String(log.dataType)))) {
        rawTime = log.dataType;
    }
    if (!rawTime) return '';
    const str = String(rawTime).trim();
    const m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(str);
    if (m) {
        return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        return formatShanghaiYmd(parsed);
    }
    return '';
}

/** 识别日志的标准类型：real 模式下严格区分 ACCESS_LOG 与其他交互事件 */
function getNormalizedLogType(log) {
    if (!log) return '';
    const dt = String(log.dataType || '').trim();
    if (dt === 'ACCESS_LOG' || dt === 'SINGLE_GEN' || dt === 'PROXY_TEST' || dt === 'FEEDBACK' || dt === 'PROXY_USAGE' || dt === 'BATCH_CLEAN') {
        return dt;
    }
    // 兼容极早期行：dataType 存成了日期字符串但实为页面访问
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(dt)) {
        return 'ACCESS_LOG';
    }
    return dt;
}

/** 按 [fromYmd, toYmd] 闭区间过滤日志（Asia/Shanghai 口径） */
function filterLogsByDateRange(logs, fromYmd, toYmd) {
    if (!Array.isArray(logs)) return [];
    let f = (fromYmd || '').trim();
    let t = (toYmd || '').trim();
    if (f && t && f > t) { const tmp = f; f = t; t = tmp; }
    if (!f && !t) return logs.slice();
    return logs.filter(log => {
        const ymd = extractLogYmd(log);
        if (!ymd) return false;
        if (f && ymd < f) return false;
        if (t && ymd > t) return false;
        return true;
    });
}

/** 切换统计口径：'pv'（按访问次数）或 'uv'（按 IP+日期 去重） */
window.setChartCaliber = function (caliber) {
    chartCaliber = caliber === 'uv' ? 'uv' : 'pv';
    const pvBtn = document.getElementById('caliberBtn-pv');
    const uvBtn = document.getElementById('caliberBtn-uv');
    if (pvBtn) pvBtn.classList.toggle('active', chartCaliber === 'pv');
    if (uvBtn) uvBtn.classList.toggle('active', chartCaliber === 'uv');

    const noteEl = document.getElementById('chartCaliberNote');
    if (noteEl) {
        noteEl.textContent = chartCaliber === 'uv'
            ? '统计口径：按 IP+日期 去重（同一 IP 同一自然日算 1 次，仅统计 ACCESS_LOG 真实记录，趋势图始终显示真实值）'
            : '统计口径：按访问次数（仅统计 ACCESS_LOG 真实记录，趋势图始终显示真实值）';
    }

    drawTrafficChartFromLogs(window.__cachedRangeLogs.length ? window.__cachedRangeLogs : window.__cachedAllLogs);
};

/** 快捷日期区间按钮：'7d'（近7天）/ '30d'（近30天）/ 'all'（全部） */
window.setChartDatePreset = function (preset) {
    document.querySelectorAll('.chart-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === preset);
    });
    const fromInput = document.getElementById('chartDateFrom');
    const toInput = document.getElementById('chartDateTo');
    const now = new Date();

    if (preset === '7d') {
        const start = new Date(now.getTime() - 6 * 86400000);
        if (fromInput) fromInput.value = formatShanghaiYmd(start);
        if (toInput) toInput.value = formatShanghaiYmd(now);
    } else if (preset === '30d') {
        const start = new Date(now.getTime() - 29 * 86400000);
        if (fromInput) fromInput.value = formatShanghaiYmd(start);
        if (toInput) toInput.value = formatShanghaiYmd(now);
    } else {
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
    }

    window.queryTrafficRange();
};

/** 点击「查询」按钮：按当前所选起止日期请求并重绘趋势图与流水表 */
window.queryTrafficRange = function () {
    const fromInput = document.getElementById('chartDateFrom');
    const toInput = document.getElementById('chartDateTo');
    let from = fromInput ? fromInput.value.trim() : '';
    let to = toInput ? toInput.value.trim() : '';
    if (from && to && from > to) {
        const tmp = from; from = to; to = tmp;
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = to;
    }

    // 若手动选择了日期，更新快捷按钮高亮态
    if (from || to) {
        const today = formatShanghaiYmd(new Date());
        const d7 = formatShanghaiYmd(new Date(Date.now() - 6 * 86400000));
        const d30 = formatShanghaiYmd(new Date(Date.now() - 29 * 86400000));
        const matchedPreset = (to === today && from === d7) ? '7d' : ((to === today && from === d30) ? '30d' : '');
        document.querySelectorAll('.chart-preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === matchedPreset);
        });
    } else {
        document.querySelectorAll('.chart-preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === 'all');
        });
    }

    window.renderTrafficChart();
};

/** 内部：根据已过滤的区间日志计算并渲染 KPI 与 ECharts 趋势图（始终展示真实值） */
function drawTrafficChartFromLogs(logs) {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const fromInput = document.getElementById('chartDateFrom');
    const toInput = document.getElementById('chartDateTo');
    const fromYmd = fromInput ? fromInput.value.trim() : '';
    const toYmd = toInput ? toInput.value.trim() : '';

    const filtered = filterLogsByDateRange(safeLogs, fromYmd, toYmd);
    window.__cachedRangeLogs = filtered;

    // 按日期聚合 4 类核心事件（ACCESS_LOG / SINGLE_GEN / PROXY_TEST / FEEDBACK）
    const dateStats = {};
    const ensureDate = (ymd) => {
        if (!dateStats[ymd]) {
            dateStats[ymd] = {
                accessPv: 0,
                accessIpSet: new Set(),
                singleGen: 0,
                proxyTest: 0,
                feedback: 0
            };
        }
        return dateStats[ymd];
    };

    // 若指定了明确的起止日期且跨度合理（≤ 366 天），补齐连续日期轴以便清晰观察趋势
    if (fromYmd && toYmd && fromYmd <= toYmd) {
        const startMs = Date.parse(fromYmd + 'T00:00:00+08:00');
        const endMs = Date.parse(toYmd + 'T00:00:00+08:00');
        const days = Math.round((endMs - startMs) / 86400000);
        if (!isNaN(days) && days >= 0 && days <= 366) {
            for (let i = 0; i <= days; i++) {
                ensureDate(formatShanghaiYmd(new Date(startMs + i * 86400000)));
            }
        }
    }

    let totalAccessPv = 0;
    let totalAccessUv = 0;
    let totalSingleGen = 0;
    let totalProxyTest = 0;
    let totalFeedback = 0;

    filtered.forEach(log => {
        const ymd = extractLogYmd(log);
        const type = getNormalizedLogType(log);
        const bucket = ymd ? ensureDate(ymd) : null;

        if (type === 'ACCESS_LOG') {
            totalAccessPv++;
            if (bucket) {
                bucket.accessPv++;
                const ip = String(log.ip || log.operatorIp || '未知').trim();
                bucket.accessIpSet.add(ip);
            }
        } else if (type === 'SINGLE_GEN') {
            totalSingleGen++;
            if (bucket) bucket.singleGen++;
        } else if (type === 'PROXY_TEST') {
            totalProxyTest++;
            if (bucket) bucket.proxyTest++;
        } else if (type === 'FEEDBACK') {
            totalFeedback++;
            if (bucket) bucket.feedback++;
        }
    });

    const sortedDates = Object.keys(dateStats).sort();
    sortedDates.forEach(d => {
        totalAccessUv += dateStats[d].accessIpSet.size;
    });

    // 更新区间 KPI 统计卡片（严格等于 MN_Logs 对应区间内真实条数）
    const kpiAccessEl = document.getElementById('kpiAccessCount');
    const kpiSingleEl = document.getElementById('kpiSingleGenCount');
    const kpiTestEl = document.getElementById('kpiProxyTestCount');
    const kpiFeedbackEl = document.getElementById('kpiFeedbackCount');
    if (kpiAccessEl) {
        kpiAccessEl.textContent = chartCaliber === 'uv'
            ? `${totalAccessUv} (总PV: ${totalAccessPv})`
            : String(totalAccessPv);
    }
    if (kpiSingleEl) kpiSingleEl.textContent = String(totalSingleGen);
    if (kpiTestEl) kpiTestEl.textContent = String(totalProxyTest);
    if (kpiFeedbackEl) kpiFeedbackEl.textContent = String(totalFeedback);

    if (typeof echarts === 'undefined') return;
    const chartDom = document.getElementById('trafficChart');
    if (!chartDom) return;
    if (myTrafficChart) myTrafficChart.dispose();
    myTrafficChart = echarts.init(chartDom, window.isNightMode ? 'dark' : null);

    const accessSeriesData = sortedDates.map(d =>
        chartCaliber === 'uv' ? dateStats[d].accessIpSet.size : dateStats[d].accessPv
    );
    const singleGenData = sortedDates.map(d => dateStats[d].singleGen);
    const proxyTestData = sortedDates.map(d => dateStats[d].proxyTest);
    const feedbackData = sortedDates.map(d => dateStats[d].feedback);
    const accessSeriesName = chartCaliber === 'uv' ? '页面访问 (按IP+日期去重)' : '页面访问 (ACCESS_LOG)';

    const textColor = window.isNightMode ? '#c9d1d9' : '#57606a';
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
        },
        legend: {
            top: 0,
            textStyle: { color: textColor, fontSize: 12 },
            data: [accessSeriesName, '快捷生成 (SINGLE_GEN)', '代理测试 (PROXY_TEST)', '建议反馈 (FEEDBACK)']
        },
        grid: { left: '3%', right: '4%', bottom: '16%', top: '16%', containLabel: true },
        dataZoom: [
            {
                type: 'slider',
                show: true,
                xAxisIndex: [0],
                start: 0,
                end: 100,
                bottom: 0,
                borderColor: 'transparent',
                textStyle: { color: textColor }
            },
            { type: 'inside', xAxisIndex: [0], start: 0, end: 100 }
        ],
        xAxis: [{
            type: 'category',
            boundaryGap: false,
            data: sortedDates,
            axisLine: { lineStyle: { color: window.isNightMode ? '#57606a' : '#cdd1d9' } },
            axisLabel: { color: textColor }
        }],
        yAxis: [{
            type: 'value',
            minInterval: 1,
            splitLine: { lineStyle: { color: window.isNightMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } },
            axisLabel: { color: textColor }
        }],
        series: [
            {
                name: accessSeriesName,
                type: 'line',
                smooth: true,
                lineStyle: { width: 3, color: '#007AFF' },
                showSymbol: true,
                symbolSize: 7,
                itemStyle: { color: '#007AFF' },
                areaStyle: {
                    opacity: 0.75,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(0, 122, 255, 0.38)' },
                        { offset: 1, color: 'rgba(0, 122, 255, 0.01)' }
                    ])
                },
                data: accessSeriesData
            },
            {
                name: '快捷生成 (SINGLE_GEN)',
                type: 'line',
                smooth: true,
                lineStyle: { width: 2, color: '#e6a23c' },
                showSymbol: true,
                symbolSize: 6,
                itemStyle: { color: '#e6a23c' },
                data: singleGenData
            },
            {
                name: '代理测试 (PROXY_TEST)',
                type: 'line',
                smooth: true,
                lineStyle: { width: 2, color: '#34C759' },
                showSymbol: true,
                symbolSize: 6,
                itemStyle: { color: '#34C759' },
                data: proxyTestData
            },
            {
                name: '建议反馈 (FEEDBACK)',
                type: 'line',
                smooth: true,
                lineStyle: { width: 2, color: '#FF2D55' },
                showSymbol: true,
                symbolSize: 6,
                itemStyle: { color: '#FF2D55' },
                data: feedbackData
            }
        ]
    };
    myTrafficChart.setOption(option);
}

/**
 * 覆盖 renderTrafficChart：按所选日期请求后端 action=range 数据后再统计并渲染
 * 保留现有 ECharts dataZoom 滑块，趋势图始终展示真实数据
 */
window.renderTrafficChart = function (initialLogs) {
    if (Array.isArray(initialLogs) && initialLogs.length) {
        window.__cachedAllLogs = initialLogs;
        drawTrafficChartFromLogs(initialLogs);
    }

    const fromInput = document.getElementById('chartDateFrom');
    const toInput = document.getElementById('chartDateTo');
    const from = fromInput ? fromInput.value.trim() : '';
    const to = toInput ? toInput.value.trim() : '';

    if (typeof REPORT_API_URL === 'undefined' || !REPORT_API_URL) {
        drawTrafficChartFromLogs(window.__cachedAllLogs);
        return;
    }

    const rangeUrl = `${REPORT_API_URL}?action=range&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&t=${Date.now()}`;
    fetch(rangeUrl, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            const rawLogs = Array.isArray(data) ? data : (data.logs || []);
            const filtered = filterLogsByDateRange(rawLogs, from, to);
            drawTrafficChartFromLogs(filtered);
            if (from || to) {
                window.renderLogTable(filtered);
            }
        })
        .catch(() => {
            drawTrafficChartFromLogs(window.__cachedAllLogs);
        });
};

/**
 * 覆盖 renderLogTable：准确渲染流水表，并按 ACCESS_LOG 计算 5 分钟内真实在线 IP 数（无保底虚增）
 */
window.renderLogTable = function (logs) {
    const tbody = document.querySelector('#adminLogTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const safeLogs = Array.isArray(logs) ? logs : [];
    if (safeLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">所选日期区间内暂无流水记录</td></tr>';
    }

    const nowMs = Date.now();
    const activeIps = new Set();

    safeLogs.forEach(rawLog => {
        const log = Object.assign({}, rawLog);
        const tr = document.createElement('tr');
        let typeColor = '#57606a';
        let actionName = '未知流水';
        let detailInfo = '';
        let userOrIp = '';
        let locationOrProxy = '';

        const normType = getNormalizedLogType(log);
        if (normType === 'FEEDBACK') {
            typeColor = '#FF2D55';
            actionName = '💡 提交建议';
            userOrIp = `[署名] ${log.user || '-'}`;
            locationOrProxy = `[联系] ${log.contact || '-'}`;
            detailInfo = log.content || '';
        } else if (normType === 'PROXY_USAGE' || normType === 'BATCH_CLEAN') {
            typeColor = '#34C759';
            actionName = log.action || '⚡ 批量清洗';
            userOrIp = `[操作] ${log.user || log.operatorIp || '系统'}`;
            locationOrProxy = `[信标] ${log.operatorGeo || '未知'}`;
            detailInfo = log.rawContent || '';
        } else if (normType === 'SINGLE_GEN') {
            typeColor = '#e6a23c';
            actionName = log.action || '⚡ 快捷生成';
            userOrIp = `[IP] ${log.operatorIp || log.ip || '-'}`;
            locationOrProxy = `[定位] ${log.operatorGeo || log.geo || '-'}`;
            detailInfo = log.rawContent || '';
        } else if (normType === 'PROXY_TEST') {
            typeColor = (log.action && (log.action.includes('Success') || log.action.includes('成功'))) ? '#34C759' : '#FF2D55';
            actionName = log.action || '🔍 代理测试';
            userOrIp = `[IP] ${log.operatorIp || log.ip || '-'}`;
            locationOrProxy = `[定位] ${log.operatorGeo || log.geo || '-'}`;
            detailInfo = log.rawContent || '';
        } else {
            typeColor = '#007AFF';
            actionName = '🌐 系统页面访问';
            if (log.dataType && (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(String(log.dataType)))) {
                log.ua = log.geo;
                log.geo = log.ip;
                log.ip = log.time;
                log.time = log.dataType;
            }
            userOrIp = log.ip || log.operatorIp || '-';
            locationOrProxy = log.geo || log.operatorGeo || '-';
            detailInfo = log.ua || '';
            try {
                const logTimeMs = Date.parse(String(log.time || '').replace(/\//g, '-'));
                if (!isNaN(logTimeMs) && (nowMs - logTimeMs) >= 0 && (nowMs - logTimeMs) / 60000 <= 5) {
                    if (userOrIp && userOrIp !== '-') activeIps.add(userOrIp);
                }
            } catch (err) {}
        }

        tr.innerHTML = `<td><strong style="color:${typeColor};">${esc(log.time || '-')}</strong></td><td style="font-weight:600;">${esc(userOrIp || '-')}</td><td style="font-family:Consolas; color:var(--text-muted);">${esc(locationOrProxy || '-')}</td><td style="font-weight:bold; color:${typeColor};">${esc(actionName)}</td><td style="font-size:12px; color:var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(detailInfo || '-')}">${esc(detailInfo || '-')}</td>`;
        tbody.appendChild(tr);
    });

    window.lastCalculatedRealOnline = activeIps.size;
    const realOnlineIpEl = document.getElementById('realOnlineIp');
    if (realOnlineIpEl) realOnlineIpEl.innerText = String(window.lastCalculatedRealOnline);
    if ((localStorage.getItem('cfgDataMode') || 'real') === 'real') {
        const oEl = document.getElementById('onlineCount');
        if (oEl) oEl.innerText = String(window.lastCalculatedRealOnline);
    }
};

/**
 * 覆盖 refreshAdminLogs：
 * - real 模式下严格统计 dataType === 'ACCESS_LOG' 的真实条数，无任何 +1 虚增、随机数或偏移量
 * - custom 模式仅在后台显式开启 (cfgDataMode === 'custom') 时才对顶栏数字生效
 */
window.refreshAdminLogs = function () {
    const tbody = document.querySelector('#adminLogTable tbody');
    if (!tbody) return;

    const totalEl = document.getElementById('totalServedCount');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px">正在建立安全信道，拉取云端数据总线...</td></tr>';

    if (typeof REPORT_API_URL !== 'undefined' && REPORT_API_URL) {
        const noCacheUrl = REPORT_API_URL + '?t=' + Date.now();
        fetch(noCacheUrl, { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                const logs = Array.isArray(data) ? data : (data.logs || []);
                window.__cachedAllLogs = logs;

                // 同步云端展示配置
                if (data && data.config && typeof data.config === 'object') {
                    ['cfgDataMode', 'cfgTotalMode', 'cfgTotalOffset', 'cfgTotalFixed', 'cfgOnlineFixed', 'cfgShowSoftRouter', 'cfgShowWifiCards'].forEach(k => {
                        const v = data.config[k];
                        if (v !== undefined && v !== null && v !== '') localStorage.setItem(k, v);
                    });
                    if (typeof window.applyWifiLayoutConfig === 'function') window.applyWifiLayoutConfig();
                }

                // 严格计算 dataType === 'ACCESS_LOG' 的真实访问记录数（绝不加 +1 或偏移）
                const realAccessCount = (data && typeof data.accessTotal === 'number')
                    ? data.accessTotal
                    : logs.filter(l => getNormalizedLogType(l) === 'ACCESS_LOG').length;

                localStorage.setItem('lastTotalCount', String(realAccessCount));

                const mode = localStorage.getItem('cfgDataMode') || 'real';
                let finalDisplay = realAccessCount;
                if (mode === 'custom') {
                    const tMode = localStorage.getItem('cfgTotalMode') || 'offset';
                    if (tMode === 'fixed') {
                        finalDisplay = parseInt(localStorage.getItem('cfgTotalFixed') || '8888', 10);
                    } else {
                        finalDisplay = realAccessCount + parseInt(localStorage.getItem('cfgTotalOffset') || '1240', 10);
                    }
                }

                if (totalEl) totalEl.innerText = String(finalDisplay);
                const realTotalRowEl = document.getElementById('realTotalRow');
                if (realTotalRowEl) realTotalRowEl.innerText = String(realAccessCount);

                window.renderLogTable(logs);
                window.renderTrafficChart(logs);
            })
            .catch(() => {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#FF2D55; font-weight:bold; padding:40px">❌ 链路断开：仅展示本地缓存数据</td></tr>';
            });
    }
};

