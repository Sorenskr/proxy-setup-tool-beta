/* ============================================================
 * admin-cms.js —— 隐藏式后台：站点内容管理台
 * 入口：连点 Logo 5 次输入密钥 → 「🔒 审计大屏」底部
 * 能力：WiFi 卡片 / 前置代理 / 公司 WiFi / 音乐 / 背景 / 教程
 * ============================================================ */

const CMS_TOKEN_KEY = 'mnAdminToken';
let cmsState = null;
let cmsDirty = false; // 有未保存的本地修改时，不允许被远程内容覆盖
const cmsCollapsed = {}; // 各分区折叠状态：{ proxy: false, company: false, ... }

const CMS_SECTIONS = [
    { id: 'cms-sec-proxy',   key: 'proxy',   num: 1, short: '前置代理', title: '🌐 前置代理二维码' },
    { id: 'cms-sec-company', key: 'company', num: 2, short: '公司WiFi', title: '🏢 公司 WiFi 二维码' },
    { id: 'cms-sec-wifi',    key: 'wifi',    num: 3, short: '基础网络', title: '📶 基础网络卡片（首屏动态卡片）' },
    { id: 'cms-sec-music',   key: 'music',   num: 4, short: '音乐',     title: '🎵 背景音乐歌单' },
    { id: 'cms-sec-bg',      key: 'bg',      num: 5, short: '背景',     title: '🎨 背景与视效' },
    { id: 'cms-sec-guide',   key: 'guide',   num: 6, short: '教程',     title: '📖 使用教程正文（支持 Markdown / HTML）' }
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
function proxyStatusLabel(status) {
    if (status === 'up') return '节点可用';
    if (status === 'down') return '节点断网 / 不可用';
    return '暂未检测';
}

/**
 * 构建前置代理卡片底部副文案 HTML
 */
function buildProxyMetaHtml(item, st) {
    const firstOnline = st.firstOnlineAt || (item && item.firstOnlineAt) || '—';
    let statusLine = '';
    if (st.status === 'up') {
        const loc = st.locationText || '海外出口';
        const lat = st.latencyMs !== null && st.latencyMs !== undefined && st.latencyMs !== ''
            ? `${st.latencyMs} ms`
            : '正常';
        statusLine = `<div class="proxy-meta-line proxy-meta-up">📍 出口：${esc(loc)} · ⚡ ${esc(lat)}</div>`;
    } else if (st.status === 'down') {
        const downTime = (item && item.statusOverride === 'down' && item.manualDownAt)
            ? item.manualDownAt
            : (st.downAt || '—');
        statusLine = `<div class="proxy-meta-line proxy-meta-down">⚠️ 断网：${esc(downTime)}</div>`;
    } else {
        statusLine = `<div class="proxy-meta-line proxy-meta-unknown">⏳ 状态：待探测</div>`;
    }
    const checkLine = `<div class="proxy-meta-line proxy-meta-check">🕒 ${esc(st.checkedAgoText || '暂未检测')}</div>`;
    return `
        <div class="proxy-meta-line proxy-meta-online">📅 首次上线：${esc(firstOnline)}</div>
        ${statusLine}
        ${checkLine}
    `;
}

const dismissedProxyMasks = new Set();

/**
 * 点击遮罩层：一键移除当前卡片的不可用毛玻璃遮罩，恢复查看/放大与复制
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
    if (typeof showToast === 'function') showToast('🔓 已移除遮罩，可正常扫码或点击放大');
};

/**
 * 点击前置代理卡片：若当前被遮罩盖住，点击一下直接移除遮罩；已移除遮罩或可用状态时点击放大二维码
 */
window.handleProxyCardClick = function (idx) {
    const list = typeof proxyList !== 'undefined' && Array.isArray(proxyList) ? proxyList : [];
    const item = list[idx];
    if (!item) return;
    const st = typeof window.getProxyStatus === 'function'
        ? window.getProxyStatus(item)
        : { status: 'up' };
    if (st.status === 'down' && !dismissedProxyMasks.has(Number(idx))) {
        window.dismissProxyMask(idx);
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
            : { status: 'up', firstOnlineAt: item.firstOnlineAt || '', checkedAgoText: '暂未检测' };
        const isUp = st.status !== 'down' || dismissedProxyMasks.has(idx);

        cardEl.classList.toggle('is-available', isUp);
        cardEl.classList.toggle('is-unavailable', !isUp);

        const dotEl = cardEl.querySelector('.proxy-status-dot');
        if (dotEl) {
            dotEl.className = `proxy-status-dot is-${st.status}`;
            dotEl.title = proxyStatusLabel(st.status);
        }

        const copyBtn = cardEl.querySelector('.proxy-copy-btn');
        if (copyBtn) {
            copyBtn.style.display = isUp ? '' : 'none';
        }

        const metaEl = cardEl.querySelector('.proxy-meta');
        if (metaEl) {
            metaEl.innerHTML = buildProxyMetaHtml(item, st);
        }

        const maskEl = cardEl.querySelector('.proxy-unavail-mask');
        if (maskEl) {
            maskEl.style.display = isUp ? 'none' : '';
        }
    });
};

/**
 * 覆盖前端静态卡片渲染：过滤掉 visible === false 的前置代理与公司 WiFi 卡片
 * 前置代理卡片支持 qrMode=image|link、呼吸状态灯、可用时右上角复制按钮、副文案及不可用毛玻璃遮罩（点击遮罩可移除）
 */
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
            : { status: 'up', firstOnlineAt: item.firstOnlineAt || '', checkedAgoText: '暂未检测' };
        const isUp = st.status !== 'down' || dismissedProxyMasks.has(idx);
        const isLinkMode = item.qrMode === 'link';
        const initImgSrc = isLinkMode ? '' : esc(item.imgPath || '');

        const cardEl = document.createElement('div');
        cardEl.className = `wifi-card proxy-card ${isUp ? 'is-available' : 'is-unavailable'}`;
        cardEl.setAttribute('data-proxy-idx', String(idx));
        cardEl.setAttribute('data-proxy-id', String(item.id || ''));
        cardEl.onclick = () => window.handleProxyCardClick(idx);

        cardEl.innerHTML = `
            <button type="button" class="proxy-copy-btn" style="${isUp ? '' : 'display:none;'}" onclick="copyProxyUrl(${idx}, event)" title="复制前置代理链接">复制</button>
            <div class="wifi-qr-box">
                <img src="${initImgSrc}" class="qr-img" data-qr-idx="${idx}" alt="${esc(item.name)}" ${isLinkMode ? '' : 'onerror="imgFallback(this)"'}>
            </div>
            <div class="wifi-card-title proxy-card-title">
                <span class="proxy-status-dot is-${st.status}" title="${esc(proxyStatusLabel(st.status))}"></span>
                <span class="proxy-title-text">${esc(item.name)}</span>
            </div>
            <div class="proxy-meta">
                ${buildProxyMetaHtml(item, st)}
            </div>
            <div class="proxy-unavail-mask" style="${isUp ? 'display:none;' : ''}" onclick="dismissProxyMask(${idx}, event)" title="点击此处移除遮罩查看二维码">
                <div class="proxy-unavail-text">暂时无法使用，请联系负责人<div style="font-size:11px;font-weight:400;opacity:0.82;margin-top:4px;">（点击可移除遮罩查看二维码）</div></div>
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

    (typeof companyWifiList !== 'undefined' ? companyWifiList : []).forEach(item => {
        if (!item || item.visible === false) return;
        if (companyGrid) {
            companyGrid.innerHTML += `<div class="wifi-card" onclick="openModalWithImage('${esc(item.name)}', '${esc(item.imgPath)}')"><div class="wifi-qr-box"><img src="${esc(item.imgPath)}" class="qr-img" onerror="imgFallback(this)"></div><div class="wifi-card-title">${esc(item.name)}</div></div>`;
        }
    });
};

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

    (typeof baseWifiCards !== 'undefined' ? baseWifiCards : []).forEach(card => {
        if (!card || card.visible === false) return;
        const cardEl = document.createElement('div');
        cardEl.className = `compact-card ${card.danger ? 'danger-card' : ''} ${card.fx && card.fx !== 'default' ? 'fx-' + card.fx : ''}`;

        cardEl.onclick = () => {
            if (card.wifiString) {
                openModalWithWifiQr(card.name, card.wifiString, card.pwd);
            } else {
                openModalWithImage(card.name, card.img);
            }
        };

        const tagHtml = card.tag ? `<div class="card-tag">${card.tag}</div>` : '';
        const nameClass = card.large ? 'card-name card-name-large' : 'card-name';
        const pwdClass = card.danger ? 'card-pwd pulse-blue' : 'card-pwd';

        cardEl.innerHTML = `
            <div class="${nameClass}">${card.name}</div>
            <div class="${pwdClass}">${card.pwd}</div>${tagHtml}
            ${(card.helpType === 'image' && card.helpImg) || (card.helpType === 'text' && card.helpText)
                ? `<button type="button" class="card-help-btn" title="查看使用说明" aria-label="查看使用说明" onclick="event.stopPropagation(); openCardHelp('${card.id}')">?</button>`
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
    if (Array.isArray(state.proxyList) && typeof window.normalizeProxyCards === 'function') {
        state.proxyList = window.normalizeProxyCards(state.proxyList);
    }
    ['baseWifiCards', 'proxyList', 'companyWifiList'].forEach(group => {
        if (Array.isArray(state[group])) {
            state[group].forEach((item, idx) => {
                if (!item) return;
                if (item.visible === undefined) item.visible = true;
                if (group === 'proxyList') {
                    if (!item.id) item.id = 'proxy_' + (idx + 1);
                    if (item.qrMode !== 'link' && item.qrMode !== 'image') {
                        item.qrMode = (!item.imgPath && item.proxyUrl) ? 'link' : 'image';
                    }
                    if (item.imgPath === undefined) item.imgPath = '';
                    if (item.proxyUrl === undefined) item.proxyUrl = '';
                    if (item.firstOnlineAt === undefined) item.firstOnlineAt = '2026/10/22 10:00:00';
                    if (item.statusOverride !== 'up' && item.statusOverride !== 'down' && item.statusOverride !== 'auto') {
                        item.statusOverride = 'auto';
                    }
                    if (item.manualDownAt === undefined) item.manualDownAt = '';
                }
            });
        }
    });
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

/** 切换卡片「?」帮助弹窗类型（图片/文字/无），切换后重渲染出对应输入框 */
window.cmsSetCardHelpType = function (index, value) {
    const card = (cmsState.baseWifiCards || [])[index];
    if (!card) return;
    cmsDirty = true;
    card.helpType = value;
    if (value === 'text' && !card.helpText) {
        card.helpText = '# 使用说明\n\n在这里写这张网络的使用说明…\n\n:::success 小贴士\n支持 Markdown 语法\n:::';
    }
    renderCmsPanel();
};

/* ---------------- 分区折叠与锚点跳转 ---------------- */

window.cmsToggleSection = function (key) {
    cmsCollapsed[key] = !cmsCollapsed[key];
    const sec = CMS_SECTIONS.find(s => s.key === key);
    if (!sec) return;
    const el = document.getElementById(sec.id);
    if (el) {
        el.classList.toggle('is-collapsed', !!cmsCollapsed[key]);
        const btn = el.querySelector('.cms-collapse-btn');
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
    const anchorBtns = CMS_SECTIONS.map(s => `
        <button type="button" class="cms-anchor-tag" onclick="cmsJumpToSection(${s.num})" title="快捷键: Ctrl/Cmd + Alt + ${s.num}">
            <span class="cms-anchor-idx">${s.num}</span>${s.short}
        </button>
    `).join('');

    box.innerHTML = `
        <div class="cms-card cms-top-bar">
            <div class="cms-card-head">
                <h4>🛠️ 站点内容管理台（改动保存后全员实时生效）${cmsDirty ? '<span class="cms-dirty-dot" title="有未保存的改动">● 未保存</span>' : ''}</h4>
                <div class="cms-actions">
                    <button type="button" class="cms-shortcut-hint-btn" onclick="openShortcutModal()" title="点击查看键盘快捷键">⌨️ 快捷键：按 <kbd>?</kbd> 查看</button>
                    <button type="button" class="btn-ghost" onclick="cmsReload()">↺ 还原未保存的修改</button>
                    <button type="button" class="btn-primary" onclick="cmsSaveContent()" title="快捷键: Ctrl/Cmd + Alt + S">🚀 保存并全网下发</button>
                </div>
            </div>
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

        ${cmsSectionProxy('proxyList', CMS_SECTIONS[0])}
        ${cmsSectionProxy('companyWifiList', CMS_SECTIONS[1])}
        ${cmsSectionWifi(CMS_SECTIONS[2])}
        ${cmsSectionMusic(CMS_SECTIONS[3])}
        ${cmsSectionBackground(CMS_SECTIONS[4])}
        ${cmsSectionGuide(CMS_SECTIONS[5])}
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
        if (item.wifiString) return { key: 'wifi', cls: 'wifi', label: '📡 WiFi 协议自动生码（无图片）' };
        if (item.img) return { key: 'image', cls: 'image', label: '🖼 图片二维码' };
        return { key: 'none', cls: 'none', label: '📝 纯文字卡（无二维码）' };
    }
    if (group === 'proxyList') {
        if (item.qrMode === 'link') {
            return { key: 'link', cls: 'wifi', label: '🔗 前置链接自动生码' };
        }
        return item.imgPath
            ? { key: 'image', cls: 'image', label: '🖼 图片二维码' }
            : { key: 'none', cls: 'miss', label: '⚠️ 未设置二维码图片' };
    }
    if (group === 'music') {
        return item.url
            ? { key: 'ok', cls: 'image', label: '🎵 已配置音频' }
            : { key: 'miss', cls: 'miss', label: '⚠️ 缺少音频文件' };
    }
    return item.imgPath
        ? { key: 'image', cls: 'image', label: '🖼 图片二维码' }
        : { key: 'none', cls: 'miss', label: '⚠️ 未设置二维码图片' };
}

const CMS_CAT_ORDER = {
    baseWifiCards: ['wifi', 'image', 'none'],
    proxyList: ['link', 'image', 'none'],
    companyWifiList: ['image', 'none'],
    music: ['ok', 'miss']
};

/** 按分类分组渲染（保持同组内数组的先后顺序） */
function cmsGroupedRows(group, renderRow) {
    const list = cmsState[group] || [];
    const order = CMS_CAT_ORDER[group] || ['image', 'none'];
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
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    cmsDirty = true;
    item.qrMode = mode === 'link' ? 'link' : 'image';
    renderCmsPanel();
};

/** 前置代理卡片：切换状态覆盖（auto / up / down） */
window.cmsSetProxyStatusOverride = function (index, mode) {
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    cmsDirty = true;
    dismissedProxyMasks.delete(Number(index));
    item.statusOverride = (mode === 'up' || mode === 'down') ? mode : 'auto';
    if (item.statusOverride === 'down' && !item.manualDownAt) {
        item.manualDownAt = cmsNowChinaStr();
    }
    renderCmsPanel();
};

/** 前置代理卡片：一键快捷设置状态（置为不可用自动填当前时间 / 恢复可用 / 恢复自动） */
window.cmsQuickProxyStatus = function (index, targetStatus) {
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    cmsDirty = true;
    dismissedProxyMasks.delete(Number(index));
    if (targetStatus === 'down') {
        item.statusOverride = 'down';
        item.manualDownAt = cmsNowChinaStr();
        if (typeof showToast === 'function') showToast('🔴 已设为强制不可用并填入当前时间，请记得点击保存下发');
    } else if (targetStatus === 'up') {
        item.statusOverride = 'up';
        item.manualDownAt = '';
        if (typeof showToast === 'function') showToast('🟢 已设为强制可用，请记得点击保存下发');
    } else {
        item.statusOverride = 'auto';
        item.manualDownAt = '';
        if (typeof showToast === 'function') showToast('🤖 已恢复自动探测模式，请记得点击保存下发');
    }
    renderCmsPanel();
};

/** 前置代理卡片：一键将当前时间填入首次上线时间 */
window.cmsFillFirstOnlineNow = function (index) {
    const item = (cmsState && cmsState.proxyList || [])[index];
    if (!item) return;
    cmsDirty = true;
    item.firstOnlineAt = cmsNowChinaStr();
    renderCmsPanel();
};

/* ---------------- 1/2. 前置代理 & 公司 WiFi ---------------- */

function cmsSectionProxy(group, sec) {
    const isProxy = group === 'proxyList';
    const rows = cmsGroupedRows(group, (c, i) => {
        const isVisible = c.visible !== false;
        if (!isProxy) {
            return `
            <div class="cms-item ${isVisible ? '' : 'is-hidden'}">
                <div class="cms-item-head">
                    <span class="cms-badge ${cmsCat(c, group).cls}">${esc(c.name || '未命名')}</span>
                    ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                    <span class="cms-spacer"></span>
                    ${cmsRenderVisSwitch(group, i, c)}
                    <button type="button" class="cms-move" title="上移" onclick="cmsMove('${group}',${i},-1)">↑</button>
                    <button type="button" class="cms-move" title="下移" onclick="cmsMove('${group}',${i},1)">↓</button>
                </div>
                <div class="cms-grid">
                    <div class="cms-field"><label>名称</label>
                        <input type="text" value="${esc(c.name)}" oninput="cmsSet('${group}',${i},'name',this.value)"></div>
                    <div class="cms-field"><label>二维码图片 URL</label>
                        <input type="text" value="${esc(c.imgPath || '')}" oninput="cmsSet('${group}',${i},'imgPath',this.value)"></div>
                </div>
                <div class="cms-item-bar">
                    ${c.imgPath ? `<img class="cms-thumb" src="${esc(c.imgPath)}" alt="预览" onerror="imgFallback(this)">` : ''}
                    <label class="cms-file-btn">📤 上传二维码
                        <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${i},'imgPath')">
                    </label>
                    <button type="button" class="cms-del" onclick="cmsDel('${group}',${i})">🗑 删除</button>
                </div>
            </div>`;
        }

        const qrMode = c.qrMode === 'link' ? 'link' : 'image';
        const override = (c.statusOverride === 'up' || c.statusOverride === 'down') ? c.statusOverride : 'auto';
        const st = typeof window.getProxyStatus === 'function' ? window.getProxyStatus(c) : { status: 'unknown' };
        const stPillText = st.status === 'up'
            ? '🟢 当前前台：可用'
            : (st.status === 'down' ? '🔴 当前前台：不可用' : '⚪ 当前前台：未检测');

        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(c, group).cls}">${esc(c.name || '未命名')}</span>
                <span class="cms-proxy-status-pill is-${st.status}">${stPillText}${override !== 'auto' ? `（强制 ${override.toUpperCase()}）` : '（自动）'}</span>
                ${isVisible ? '' : '<span class="cms-hidden-pill">前台已隐藏</span>'}
                <span class="cms-spacer"></span>
                ${cmsRenderVisSwitch(group, i, c)}
                <button type="button" class="cms-move" title="上移" onclick="cmsMove('${group}',${i},-1)">↑</button>
                <button type="button" class="cms-move" title="下移" onclick="cmsMove('${group}',${i},1)">↓</button>
            </div>
            <div class="cms-grid">
                <div class="cms-field"><label>名称</label>
                    <input type="text" value="${esc(c.name)}" oninput="cmsSet('${group}',${i},'name',this.value)"></div>
                <div class="cms-field"><label>二维码来源 (qrMode)</label>
                    <select onchange="cmsSetProxyQrMode(${i},this.value)">
                        <option value="image" ${qrMode === 'image' ? 'selected' : ''}>🖼 本地/上传图片 (image)</option>
                        <option value="link" ${qrMode === 'link' ? 'selected' : ''}>🔗 由前置链接自动生成二维码 (link)</option>
                    </select></div>
                <div class="cms-field"><label>前置链接 (proxyUrl，复制内容 &amp; 链接生码/自动探测源)</label>
                    <input type="text" placeholder="IP:端口:账号:密码 或 socks5://user:pass@host:port" value="${esc(c.proxyUrl || '')}" oninput="cmsSet('${group}',${i},'proxyUrl',this.value)"></div>
                <div class="cms-field"><label>二维码图片 URL (imgPath，图片模式使用)</label>
                    <input type="text" placeholder="images/proxy1.jpg 或 Drive 链接" value="${esc(c.imgPath || '')}" oninput="cmsSet('${group}',${i},'imgPath',this.value)"></div>
                <div class="cms-field"><label>首次上线时间 (firstOnlineAt)</label>
                    <div style="display:flex; gap:6px;">
                        <input type="text" placeholder="YYYY/MM/DD HH:mm:ss" value="${esc(c.firstOnlineAt || '')}" oninput="cmsSet('${group}',${i},'firstOnlineAt',this.value)">
                        <button type="button" class="cms-move" style="width:auto; padding:0 10px; white-space:nowrap;" onclick="cmsFillFirstOnlineNow(${i})" title="填入当前时间">当前时间</button>
                    </div>
                </div>
                <div class="cms-field"><label>状态覆盖 (statusOverride)</label>
                    <select onchange="cmsSetProxyStatusOverride(${i},this.value)">
                        <option value="auto" ${override === 'auto' ? 'selected' : ''}>🤖 自动（按云端探测结果）</option>
                        <option value="up" ${override === 'up' ? 'selected' : ''}>🟢 强制可用 (up)</option>
                        <option value="down" ${override === 'down' ? 'selected' : ''}>🔴 强制不可用 (down)</option>
                    </select></div>
                <div class="cms-field"><label>断网时间 (manualDownAt，强制不可用时优先显示)</label>
                    <input type="text" placeholder="YYYY/MM/DD HH:mm:ss" value="${esc(c.manualDownAt || '')}" oninput="cmsSet('${group}',${i},'manualDownAt',this.value)"></div>
            </div>
            <div class="cms-item-bar">
                ${c.imgPath ? `<img class="cms-thumb" src="${esc(c.imgPath)}" alt="预览" onerror="imgFallback(this)">` : ''}
                <label class="cms-file-btn">📤 上传二维码
                    <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','${group}',${i},'imgPath')">
                </label>
                <button type="button" class="cms-quick-status-btn is-down ${override === 'down' ? 'active' : ''}" onclick="cmsQuickProxyStatus(${i},'down')">🔴 置为不可用（填入当前时间）</button>
                <button type="button" class="cms-quick-status-btn is-up ${override === 'up' ? 'active' : ''}" onclick="cmsQuickProxyStatus(${i},'up')">🟢 恢复可用</button>
                <button type="button" class="cms-quick-status-btn is-auto ${override === 'auto' ? 'active' : ''}" onclick="cmsQuickProxyStatus(${i},'auto')">🤖 恢复自动</button>
                <button type="button" class="cms-del" onclick="cmsDel('${group}',${i})">🗑 删除</button>
            </div>
        </div>`;
    });

    const tipText = isProxy
        ? '支持「上传图片」或「由前置链接生成二维码」两种方式；可设置状态覆盖或使用快捷按钮一键置为不可用（自动填入当前断网时间）/ 恢复可用。'
        : '已按「是否已上传二维码」自动归类；可直接切换「显示/隐藏」开关控制前台展示，用 ↑ ↓ 调整顺序。';

    const body = `
        <div class="cms-tip">${tipText}</div>
        ${rows || '<div class="cms-tip">暂无条目</div>'}
        <button type="button" class="cms-add" onclick="cmsAdd('${group}')">➕ 新增条目</button>`;

    return cmsWrapSection(sec, body, cmsVisibleStatBadge(group));
}

/* ---------------- 3. 基础网络卡片（含版面文案） ---------------- */

function cmsSectionWifi(sec) {
    const fxSelected = (v) => (!v || v === 'default') ? 'default' : v;
    const rows = cmsGroupedRows('baseWifiCards', (c, i) => {
        const isVisible = c.visible !== false;
        return `
        <div class="cms-item ${isVisible ? '' : 'is-hidden'}">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(c, 'baseWifiCards').cls}">${esc(c.name || '未命名')}</span>
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
                <div class="cms-field"><label>二维码图片 URL</label>
                    <input type="text" value="${esc(c.img || '')}" oninput="cmsSet('baseWifiCards',${i},'img',this.value)"></div>
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
                <div class="cms-field"><label>❓「?」帮助弹窗</label>
                    <select onchange="cmsSetCardHelpType(${i},this.value)">
                        <option value="" ${!c.helpType ? 'selected' : ''}>不显示问号</option>
                        <option value="image" ${c.helpType === 'image' ? 'selected' : ''}>图片教程（弹大图）</option>
                        <option value="text" ${c.helpType === 'text' ? 'selected' : ''}>文字教程（弹窗显示，支持 Markdown）</option>
                    </select></div>
                ${c.helpType === 'image' ? `<div class="cms-field"><label>教程图片 URL</label>
                    <input type="text" value="${esc(c.helpImg || '')}" oninput="cmsSet('baseWifiCards',${i},'helpImg',this.value)"></div>` : ''}
            </div>
            <div class="cms-item-bar">
                ${c.img ? `<img class="cms-thumb" src="${esc(c.img)}" alt="预览" onerror="imgFallback(this)">` : ''}
                <label class="cms-file-btn">📤 上传二维码
                    <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','baseWifiCards',${i},'img')">
                </label>
                ${c.helpType === 'image' ? `<label class="cms-file-btn">🖼 上传教程图
                    <input type="file" accept="image/*" onchange="cmsUploadFile(this,'image','baseWifiCards',${i},'helpImg')">
                </label>` : ''}
                <label class="cms-check">
                    <input type="checkbox" ${c.wifiString ? 'checked' : ''} onchange="cmsToggleWifiMode(${i},this)"> 用 WiFi 协议自动生码（无需图片）
                </label>
                <label class="cms-check"><input type="checkbox" ${c.large ? 'checked' : ''} onchange="cmsSet('baseWifiCards',${i},'large',this.checked)"> 名称放大</label>
                <label class="cms-check"><input type="checkbox" ${c.danger ? 'checked' : ''} onchange="cmsSet('baseWifiCards',${i},'danger',this.checked)"> 高危标红</label>
                <button type="button" class="cms-del" onclick="cmsDel('baseWifiCards',${i})">🗑 删除</button>
            </div>
            ${c.helpType === 'text' ? `<div class="cms-field mt-15"><label>❓ 问号弹窗文字内容（支持 Markdown：# 标题、**加粗**、- 列表、:::success 提示框…）</label>
                <textarea class="cms-guide-editor" rows="6" oninput="cmsSet('baseWifiCards',${i},'helpText',this.value)">${esc(c.helpText || '')}</textarea></div>` : ''}
        </div>`;
    });

    const body = `
        <div class="cms-subbox">
            <div class="cms-subbox-title">📝 「代理 &amp; WiFi」版面文案</div>
            <div class="cms-grid">
                <div class="cms-field"><label>区块标题</label>
                    <input type="text" value="${esc(cmsState.wifiTitle || '')}" oninput="cmsSetText('wifiTitle',this.value)"></div>
                <div class="cms-field"><label>提示文字（留空则整行隐藏）</label>
                    <input type="text" value="${esc(cmsState.wifiTip || '')}" oninput="cmsSetText('wifiTip',this.value)"></div>
            </div>
        </div>
        <div class="cms-tip">已按「有无二维码」自动归类分组；右上角开关可直接切换卡片显隐，用 ↑ ↓ 在同一分组内调整顺序。</div>
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

/* ---------------- 交互函数 ---------------- */

window.cmsSet = function (group, index, key, value) {
    const item = (cmsState[group] || [])[index];
    if (!item) return;
    cmsDirty = true;
    item[key] = value;
    // WiFi 协议生码模式下，名称/密码变更时同步刷新二维码内容
    if (group === 'baseWifiCards' && item.wifiString && (key === 'name' || key === 'pwd')) {
        item.wifiString = `WIFI:T:WPA;S:${item.name};P:${item.pwd || ''};;`;
    }
};

window.cmsSetFlag = function (key, value) { cmsDirty = true; cmsState[key] = value; };
window.cmsSetText = function (key, value) { cmsDirty = true; cmsState[key] = value; };
window.cmsSetEffect = function (key, value) {
    cmsDirty = true;
    cmsState.effects = cmsState.effects || { pwdFx: 'default', cardHover: true };
    cmsState.effects[key] = (key === 'cardHover') ? (value === 'on') : value;
    // 实时预览（仅本机生效，保存后才全网下发）
    if (window.SiteContent) { window.SiteContent.data = cmsState; window.applySiteContent(); }
};
window.cmsSetBg = function (key, value) {
    cmsDirty = true;
    cmsState.background = cmsState.background || {};
    cmsState.background[key] = value;
    if (key === 'mode' || key === 'videoEnabled') renderCmsPanel();
    // 背景与视频实时预览（仅本机生效，保存后才全网下发）
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
    const card = (cmsState.baseWifiCards || [])[index];
    if (!card) return;
    cmsDirty = true;
    card.wifiString = checkbox.checked ? `WIFI:T:WPA;S:${card.name};P:${card.pwd || ''};;` : '';
    renderCmsPanel();
};

window.cmsAdd = function (group) {
    cmsDirty = true;
    cmsState[group] = cmsState[group] || [];
    if (group === 'baseWifiCards') {
        const nid = 'card' + Date.now();
        cmsState[group].push({
            id: nid, name: '新网络', pwd: '', img: '', wifiString: '',
            tag: '', large: false, danger: false, visible: true
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
            manualDownAt: ''
        });
    } else if (group === 'music') {
        cmsState[group].push({ name: '新曲目', url: '' });
    } else {
        cmsState[group].push({ name: '新条目', imgPath: '', visible: true });
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

    // Ctrl/Cmd + Alt + 1~6（跳转分区）与 Ctrl/Cmd + Alt + S（保存内容）
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
        const digitMatch = /^(?:Digit|Numpad)([1-6])$/.exec(e.code || '');
        const keyNum = digitMatch ? Number(digitMatch[1]) : (/^[1-6]$/.test(e.key || '') ? Number(e.key) : 0);
        if (keyNum >= 1 && keyNum <= 6) {
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

