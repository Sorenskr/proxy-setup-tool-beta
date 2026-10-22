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

    /** 以 main.js 中的硬编码数据作为默认值，保证未配置后台时功能不变 */
    function defaultContent() {
        return {
            version: 1,
            wifiTitle: '📶 代理 & WiFi',
            wifiTip: '💡 点击基础网络卡片可一键下发一键配置',
            baseWifiCards: (typeof baseWifiCards !== 'undefined' ? baseWifiCards : []).map(c => {
                const o = Object.assign({}, c);
                // @Ads 默认带图片教程（后台可改/可删）
                if (o.id === 'ads') {
                    o.helpType = o.helpType || 'image';
                    o.helpImg = o.helpImg || 'images/@Ads tutorial.jpg';
                }
                return o;
            }),
            proxyList: (typeof proxyList !== 'undefined' ? proxyList : []).map(c => Object.assign({}, c)),
            companyWifiList: (typeof companyWifiList !== 'undefined' ? companyWifiList : []).map(c => Object.assign({}, c)),
            music: (typeof musicFiles !== 'undefined' ? musicFiles : []).map(n => ({
                name: String(n).replace(/\.[^/.]+$/, ''),
                url: 'music/' + n
            })),
            musicEnabled: true,
            background: { mode: 'auto', dayUrl: '', nightUrl: '', particles: true },
            effects: { pwdFx: 'default', cardHover: true },
            guideHtml: (typeof guideTemplateHTML !== 'undefined' ? guideTemplateHTML : '')
        };
    }

    function merge(defaults, remote) {
        const out = Object.assign({}, defaults);
        if (!remote || typeof remote !== 'object') return out;
        ['baseWifiCards', 'proxyList', 'companyWifiList', 'music'].forEach(k => {
            if (Array.isArray(remote[k])) out[k] = remote[k];
        });
        ['wifiTitle', 'wifiTip'].forEach(k => {
            if (typeof remote[k] === 'string') out[k] = remote[k];
        });
        if (typeof remote.musicEnabled === 'boolean') out.musicEnabled = remote.musicEnabled;
        if (remote.background && typeof remote.background === 'object') {
            out.background = Object.assign({}, defaults.background, remote.background);
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

    /** 把远程内容写回运行时的全局变量并触发重绘 */
    window.applySiteContent = function () {
        const d = window.SiteContent.data;
        if (!d) return;

        if (Array.isArray(d.baseWifiCards) && d.baseWifiCards.length) baseWifiCards = d.baseWifiCards;
        if (Array.isArray(d.proxyList)) proxyList = d.proxyList;
        if (Array.isArray(d.companyWifiList)) companyWifiList = d.companyWifiList;

        window.BG_CONFIG = d.background || { mode: 'auto', particles: true };

        // 版面文案（后台可改）
        const titleEl = document.getElementById('wifiSectionTitle');
        if (titleEl && typeof d.wifiTitle === 'string' && d.wifiTitle.trim()) titleEl.textContent = d.wifiTitle;
        const tipEl = document.getElementById('wifiSectionTip');
        if (tipEl && typeof d.wifiTip === 'string') {
            tipEl.textContent = d.wifiTip;
            tipEl.style.display = d.wifiTip.trim() ? '' : 'none';
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

        if (!url) {
            window.SiteContent.data = defaultContent();
            done();
            return Promise.resolve();
        }

        return fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(j => {
                const remote = j && j.ok && j.content ? j.content : null;
                if (remote && Object.keys(remote).length > 0) {
                    // 云端有内容：以云端为准，清除本机临时覆盖
                    window.SiteContent.data = merge(defaultContent(), remote);
                    window.SiteContent.remote = true;
                    try { localStorage.removeItem(LOCAL_KEY); } catch (e) {}
                } else {
                    // 云端为空：使用本机保存的内容（若有）
                    const loc = localOverride();
                    window.SiteContent.data = loc ? merge(defaultContent(), loc) : merge(defaultContent(), remote);
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
                        if (cached) window.SiteContent.data = JSON.parse(cached);
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

    // DOMContentLoaded 时启动（保证 main.js 的全局变量已就绪）
    window.siteContentReady = new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', () => { load().then(resolve); });
    });
    window.refreshSiteContent = load;
})();
