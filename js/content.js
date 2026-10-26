/* ============================================================
 * content.js —— 站点内容远程配置中心
 * 每次打开页面实时从 Google Apps Script 拉取最新后台 SITE_CONTENT 配置
 * 严格以后台返回的 content 为准（后台隐藏/删除的卡片一律不渲染；
 * fetch 失败时不回退到硬编码旧卡片数据，也不使用 localStorage 缓存）
 * ============================================================ */
(function () {
    // 清理旧版本残留在浏览器 localStorage 中的配置与内容缓存，杜绝旧缓存干扰
    try {
        [
            'mnContentCache',
            'mnContentLocal',
            'mnProbeStateCache',
            'cfgShowWifiCards',
            'cfgShowSoftRouter',
            'cfgDataMode',
            'cfgTotalMode',
            'cfgTotalOffset',
            'cfgTotalFixed',
            'cfgOnlineFixed',
            'cfgProbeIntervalMin',
            'lastTotalCount'
        ].forEach(k => localStorage.removeItem(k));
    } catch (e) {}

    window.hasCloudApi = function () {
        try { return typeof REPORT_API_URL !== 'undefined' && !!String(REPORT_API_URL).trim(); }
        catch (e) { return false; }
    };

    window.SiteContent = { loaded: false, data: null, remote: false, fetchFailed: false };

    function apiUrl(extra) {
        const base = (typeof REPORT_API_URL !== 'undefined' ? REPORT_API_URL : '').trim();
        if (!base) return '';
        return base + (extra || '');
    }

    /** 统一判定卡片是否可见（兼容布尔 false、字符串 "false"、数字 0 及 hidden 标记） */
    function isCardVisible(o) {
        if (!o || typeof o !== 'object') return false;
        if (o.visible === false || o.visible === 'false' || o.visible === 0 || o.visible === '0') return false;
        if (o.hidden === true || o.hidden === 'true' || o.hidden === 1 || o.hidden === '1') return false;
        return true;
    }
    window.isCardVisible = isCardVisible;

    function normalizeHelpFields(o) {
        const helpType = (o.helpType === 'image' || o.helpType === 'text') ? o.helpType : '';
        return {
            helpType: helpType,
            helpImg: String(o.helpImg || '').trim(),
            helpText: String(o.helpText || '')
        };
    }

    function normalizeBaseWifiCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            const hasWifiStr = Boolean(String(o.wifiString || '').trim());
            const qrMode = (o.qrMode === 'link' || o.qrMode === 'image')
                ? o.qrMode
                : (hasWifiStr ? 'link' : 'image');
            const name = String(o.name || '').trim();
            const pwd = String(o.pwd || '').trim();
            let wifiString = String(o.wifiString || '').trim();
            if (qrMode === 'link' && !wifiString && name) {
                wifiString = `WIFI:T:WPA;S:${name};P:${pwd};;`;
            }
            return Object.assign({}, o, {
                id: String(o.id || ('wifi_' + (idx + 1))).trim(),
                name: name,
                pwd: pwd,
                qrMode: qrMode,
                img: String(o.img || '').trim(),
                wifiString: qrMode === 'link' ? wifiString : '',
                visible: isCardVisible(o),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            });
        });
    }
    window.normalizeBaseWifiCards = normalizeBaseWifiCards;

    function normalizeCompanyWifiCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            const hasLink = Boolean(String(o.qrText || o.wifiString || o.ssid || '').trim());
            const qrMode = (o.qrMode === 'link' || o.qrMode === 'image')
                ? o.qrMode
                : ((!o.imgPath && hasLink) ? 'link' : 'image');
            const name = String(o.name || '').trim();
            const ssid = String(o.ssid !== undefined ? o.ssid : (qrMode === 'link' ? name : '')).trim();
            const pwd = String(o.pwd || '').trim();
            let qrText = String(o.qrText || o.wifiString || '').trim();
            if (qrMode === 'link' && !qrText && ssid) {
                qrText = `WIFI:T:WPA;S:${ssid};P:${pwd};;`;
            }
            return {
                id: String(o.id || ('company_' + (idx + 1))).trim(),
                name: name || ssid || ('公司WiFi ' + (idx + 1)),
                qrMode: qrMode,
                imgPath: String(o.imgPath || '').trim(),
                ssid: ssid,
                pwd: pwd,
                qrText: qrText,
                visible: isCardVisible(o),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            };
        });
    }
    window.normalizeCompanyWifiCards = normalizeCompanyWifiCards;

    function normalizeProxyCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            const statusOverride = (o.statusOverride === 'up' || o.statusOverride === 'down') ? o.statusOverride : 'auto';
            return {
                id: String(o.id || ('proxy_' + (idx + 1))).trim(),
                name: String(o.name || '').trim(),
                qrMode: o.qrMode === 'link' ? 'link' : 'image',
                imgPath: String(o.imgPath || '').trim(),
                proxyUrl: String(o.proxyUrl || '').trim(),
                visible: isCardVisible(o),
                firstOnlineAt: String(o.firstOnlineAt || '2026/10/22 10:00:00').trim(),
                statusOverride: statusOverride,
                manualOverride: statusOverride !== 'auto' || Boolean(o.manualOverride),
                manualDownAt: String(o.manualDownAt || '').trim(),
                manualNote: String(o.manualNote || '').trim(),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            };
        });
    }
    window.normalizeProxyCards = normalizeProxyCards;

    function normalizeNetTestCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            const qrMode = o.qrMode === 'image' ? 'image' : 'link';
            return {
                id: String(o.id || ('net_' + (idx + 1))).trim(),
                name: String(o.name || '').trim(),
                qrMode: qrMode,
                url: String(o.url || '').trim(),
                imgPath: String(o.imgPath || '').trim(),
                desc: String(o.desc || '').trim(),
                visible: isCardVisible(o),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            };
        });
    }
    window.normalizeNetTestCards = normalizeNetTestCards;
    window.netTestList = [];

    /* ---------------- 内置高清官方风格 App 图标库（SVG Data URI，零延迟且永不裂图） ---------------- */
    function svgToDataUri(svgStr) {
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr.trim());
    }

    const BUILTIN_APP_ICONS = {
        gmail: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#ffffff"/><path d="M22 38v48c0 3.3 2.7 6 6 6h10V54.5L60 71l22-16.5V92h10c3.3 0 6-2.7 6-6V38c0-7.5-8.6-11.8-14.6-7.3L60 48.2 36.6 30.7C30.6 26.2 22 30.5 22 38z" fill="#EA4335"/><path d="M22 38v48c0 3.3 2.7 6 6 6h10V54.5L22 42.5V38z" fill="#4285F4"/><path d="M98 38v48c0 3.3-2.7 6-6 6H82V54.5l16-12V38z" fill="#34A853"/><path d="M82 54.5V33l1.4-2.3C89.4 26.2 98 30.5 98 38v4.5l-16 12z" fill="#FBBC05"/><path d="M38 54.5V33l22 16.5L82 33v21.5L60 71 38 54.5z" fill="#EA4335"/></svg>`),
        wetype: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2CE080"/><stop offset="100%" stop-color="#07C160"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="url(#wg)"/><rect x="20" y="28" width="80" height="54" rx="12" fill="#ffffff"/><rect x="29" y="38" width="11" height="9" rx="2.5" fill="#07C160"/><rect x="45" y="38" width="11" height="9" rx="2.5" fill="#07C160"/><rect x="61" y="38" width="11" height="9" rx="2.5" fill="#07C160"/><rect x="77" y="38" width="14" height="9" rx="2.5" fill="#07C160"/><rect x="29" y="52" width="14" height="9" rx="2.5" fill="#07C160"/><rect x="48" y="52" width="11" height="9" rx="2.5" fill="#07C160"/><rect x="64" y="52" width="11" height="9" rx="2.5" fill="#07C160"/><rect x="80" y="52" width="11" height="9" rx="2.5" fill="#07C160"/><rect x="38" y="66" width="44" height="8" rx="4" fill="#07C160"/><path d="M48 82l12 13 12-13z" fill="#ffffff"/></svg>`),
        x: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#000000"/><path d="M74.5 28h12.6L59.6 59.4 92 92H66.6L46.7 69.2 24 92H11.4l29.4-33.6L10 28h26l18 20.8L74.5 28zm-4.4 57.5h7L32 34.4h-7.5l45.6 51.1z" fill="#ffffff"/></svg>`),
        egern: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38BDF8"/><stop offset="50%" stop-color="#2563EB"/><stop offset="100%" stop-color="#1E1B4B"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="url(#eg)"/><path d="M60 18L92 34v26c0 22.8-13.7 36.8-32 43-18.3-6.2-32-20.2-32-43V34l32-16z" fill="rgba(255,255,255,0.16)" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/><path d="M44 46h32M44 60h24M44 74h32" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/></svg>`),
        deltachat: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="dc" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4158D0"/><stop offset="100%" stop-color="#1B74E4"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="url(#dc)"/><path d="M60 22c-22.1 0-40 15.8-40 35.3 0 10.6 5.3 20.1 13.8 26.6L28 98l17.9-7.6c4.4 1.4 9.1 2.2 14.1 2.2 22.1 0 40-15.8 40-35.3S82.1 22 60 22z" fill="#ffffff"/><path d="M60 36L40 72h40L60 36zm0 13l10.5 17h-21L60 49z" fill="#1B74E4"/></svg>`),
        threads: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#0A0A0A"/><path d="M63.2 58.2c-2.6-1.3-5.6-1.9-9-1.8-7.6.2-13.3 4.8-13.1 11.4.2 6.3 5.5 10.4 12.6 10.2 8.2-.2 12.6-5.6 12.9-14.8.1-1.7.1-3.4-.4-5zm8.2-4.2c1.2 3.1 1.7 6.8 1.5 10.9-.5 13.4-8.4 21.8-20.8 22.1-11.5.3-20.4-6.9-20.7-17.8-.3-11.3 8.1-19.3 20.6-19.6 4.1-.1 7.9.6 11.2 2-.6-6.9-4.7-10.8-12.1-10.6-4.7.1-8.8 1.8-11.7 4.9l-5.7-5.5c4.3-4.6 10.4-7.2 17.5-7.4 12.4-.3 20.4 6.5 21.2 18.4l1.1-.6c6.1 3.7 9.8 9.6 9.8 16.9 0 14.8-12.6 25.3-30.6 25.3-20.8 0-34.7-14.2-34.7-35.5S41.9 22 62.9 22c16.8 0 28.8 9 32.3 23.4l-7.9 2.2C84.6 36.5 75.5 30 62.9 30c-16.3 0-26.6 11-26.6 27.5s10.3 27.5 26.6 27.5c13.3 0 22.5-7.4 22.5-17.3 0-5.1-2.8-9.5-7.6-12.3l-6.4-1.4z" fill="#ffffff"/></svg>`),
        tiktok: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#000000"/><path d="M81 44.5c-6.8 0-12.4-5.5-12.4-12.4V26H56.5v47.2c0 6.1-5 11.1-11.1 11.1s-11.1-5-11.1-11.1 5-11.1 11.1-11.1c1.2 0 2.3.2 3.3.6V50.2c-1.1-.1-2.2-.2-3.3-.2-12.8 0-23.2 10.4-23.2 23.2s10.4 23.2 23.2 23.2 23.2-10.4 23.2-23.2V50.8c4.4 3.2 9.8 5.1 15.6 5.1V44.5H81z" fill="#25F4EE" transform="translate(-3,-2)"/><path d="M81 44.5c-6.8 0-12.4-5.5-12.4-12.4V26H56.5v47.2c0 6.1-5 11.1-11.1 11.1s-11.1-5-11.1-11.1 5-11.1 11.1-11.1c1.2 0 2.3.2 3.3.6V50.2c-1.1-.1-2.2-.2-3.3-.2-12.8 0-23.2 10.4-23.2 23.2s10.4 23.2 23.2 23.2 23.2-10.4 23.2-23.2V50.8c4.4 3.2 9.8 5.1 15.6 5.1V44.5H81z" fill="#FE2C55" transform="translate(3,2)"/><path d="M81 44.5c-6.8 0-12.4-5.5-12.4-12.4V26H56.5v47.2c0 6.1-5 11.1-11.1 11.1s-11.1-5-11.1-11.1 5-11.1 11.1-11.1c1.2 0 2.3.2 3.3.6V50.2c-1.1-.1-2.2-.2-3.3-.2-12.8 0-23.2 10.4-23.2 23.2s10.4 23.2 23.2 23.2 23.2-10.4 23.2-23.2V50.8c4.4 3.2 9.8 5.1 15.6 5.1V44.5H81z" fill="#ffffff"/></svg>`),
        facebook: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#1877F2"/><path d="M77.5 76.5l3.1-20.2H61.2V43.2c0-5.5 2.7-10.9 11.4-10.9h8.8V15.1s-8-1.4-15.6-1.4c-15.9 0-26.3 9.7-26.3 27.1v15.5H21.8v20.2h17.7V120h21.7V76.5h16.3z" fill="#ffffff"/></svg>`),
        instagram: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="ig" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#FDF497"/><stop offset="5%" stop-color="#FDF497"/><stop offset="45%" stop-color="#FD5949"/><stop offset="60%" stop-color="#D6249F"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><rect width="120" height="120" rx="26" fill="url(#ig)"/><rect x="23" y="23" width="74" height="74" rx="20" fill="none" stroke="#ffffff" stroke-width="7"/><circle cx="60" cy="60" r="17" fill="none" stroke="#ffffff" stroke-width="7"/><circle cx="81" cy="39" r="4.5" fill="#ffffff"/></svg>`),
        shadowrocket: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="sr" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#1D4ED8"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="url(#sr)"/><path d="M84 36c-14 2-28 10-37 21l-13 2-8 10 15 4 9 9 4 15 10-8 2-13c11-9 19-23 21-37 0-2-1-3-3-3z" fill="#ffffff"/><circle cx="65" cy="55" r="6" fill="#1D4ED8"/><path d="M34 78c-5 5-8 14-8 14s9-3 14-8c3-3 3-6 0-6s-3-3-6 0z" fill="#FBBF24"/></svg>`),
        defaultApp: svgToDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="da" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#007AFF"/><stop offset="100%" stop-color="#5856D6"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="url(#da)"/><path d="M60 28v44m0 0l-16-16m16 16l16-16M34 86h52" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`)
    };

    const BUILTIN_ICON_SET = new Set(Object.values(BUILTIN_APP_ICONS));

    window.isBuiltinAppIcon = function (iconStr) {
        const s = String(iconStr || '').trim();
        if (!s) return true;
        return BUILTIN_ICON_SET.has(s) || s.startsWith('data:image/svg+xml;utf8,');
    };

    window.getDefaultAppIcon = function (name, customIcon) {
        const custom = String(customIcon || '').trim();
        if (custom && !BUILTIN_ICON_SET.has(custom)) return custom;
        const n = String(name || '').toLowerCase();
        if (n.includes('gmail')) return BUILTIN_APP_ICONS.gmail;
        if (n.includes('微信') || n.includes('wetype')) return BUILTIN_APP_ICONS.wetype;
        if (n === 'x' || n.includes('twitter')) return BUILTIN_APP_ICONS.x;
        if (n.includes('egern')) return BUILTIN_APP_ICONS.egern;
        if (n.includes('delta')) return BUILTIN_APP_ICONS.deltachat;
        if (n.includes('threads')) return BUILTIN_APP_ICONS.threads;
        if (n.includes('tiktok')) return BUILTIN_APP_ICONS.tiktok;
        if (n.includes('facebook') || n === 'fb') return BUILTIN_APP_ICONS.facebook;
        if (n.includes('instagram') || n === 'ins') return BUILTIN_APP_ICONS.instagram;
        if (n.includes('shadowrocket') || n.includes('小火箭')) return BUILTIN_APP_ICONS.shadowrocket;
        return BUILTIN_APP_ICONS.defaultApp;
    };

    function normalizeAppStoreCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            const name = String(o.name || '').trim();
            const qrMode = o.qrMode === 'image' ? 'image' : 'link';
            const rawIcon = String(o.icon || '').trim();
            // 不把内置大体积 SVG Data URI 写死进配置对象，避免撑爆 Apps Script 9KB 属性限制
            const customIcon = window.isBuiltinAppIcon(rawIcon) ? '' : rawIcon;
            return {
                id: String(o.id || ('app_' + (idx + 1))).trim(),
                name: name,
                icon: customIcon,
                qrMode: qrMode,
                url: String(o.url || '').trim(),
                imgPath: String(o.imgPath || '').trim(),
                desc: String(o.desc || '').trim(),
                visible: isCardVisible(o),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            };
        });
    }
    window.normalizeAppStoreCards = normalizeAppStoreCards;
    window.appStoreList = [];

    function normalizePcSoftCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            return {
                id: String(o.id || ('pc_' + (idx + 1))).trim(),
                name: String(o.name || '').trim(),
                url: String(o.url || '').trim(),
                desc: String(o.desc || '').trim(),
                visible: isCardVisible(o),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            };
        });
    }
    window.normalizePcSoftCards = normalizePcSoftCards;
    window.pcSoftList = [];

    /* ---------------- 区块三：🔒 隐藏专区 归一化（初始为空，默认总开关关闭） ---------------- */
    function normalizeSecretZoneCards(list) {
        if (!Array.isArray(list)) return [];
        return list.map((c, idx) => {
            const o = Object.assign({}, c);
            const help = normalizeHelpFields(o);
            const name = String(o.name || '').trim();
            const qrMode = o.qrMode === 'image' ? 'image' : 'link';
            const rawIcon = String(o.icon || '').trim();
            const customIcon = window.isBuiltinAppIcon(rawIcon) ? '' : rawIcon;
            return {
                id: String(o.id || ('secret_' + (idx + 1))).trim(),
                name: name,
                icon: customIcon,
                qrMode: qrMode,
                url: String(o.url || '').trim(),
                imgPath: String(o.imgPath || '').trim(),
                desc: String(o.desc || '').trim(),
                visible: isCardVisible(o),
                helpType: help.helpType,
                helpImg: help.helpImg,
                helpText: help.helpText
            };
        });
    }
    window.normalizeSecretZoneCards = normalizeSecretZoneCards;
    window.secretZoneList = [];

    /* ---------------- 🎵 背景音乐歌单归一化（支持「填外链/直链」与「上传音频文件」二选一 + 封面图） ---------------- */
    function normalizeMusicTracks(list) {
        if (!Array.isArray(list)) return [];
        return list.map((item, idx) => {
            const o = Object.assign({}, item);
            const rawUrl = String(o.url || '').trim();
            const isDriveOrLocalUpload = /^(https?:\/\/drive\.google\.com\/|https?:\/\/lh3\.googleusercontent\.com\/|local-audio:\/\/|data:audio\/)/i.test(rawUrl);
            let sourceMode = (o.sourceMode === 'upload' || o.sourceMode === 'link')
                ? o.sourceMode
                : (o.uploadUrl || isDriveOrLocalUpload ? 'upload' : 'link');
            let linkUrl = String(o.linkUrl !== undefined ? o.linkUrl : (!isDriveOrLocalUpload ? rawUrl : '')).trim();
            let uploadUrl = String(o.uploadUrl !== undefined ? o.uploadUrl : (isDriveOrLocalUpload ? rawUrl : '')).trim();
            const activeUrl = sourceMode === 'upload' ? (uploadUrl || rawUrl) : (linkUrl || rawUrl);
            return {
                id: String(o.id || ('music_' + (idx + 1))).trim(),
                name: String(o.name || ('曲目 ' + (idx + 1))).trim(),
                sourceMode: sourceMode,
                url: activeUrl,
                linkUrl: linkUrl,
                uploadUrl: uploadUrl,
                cover: String(o.cover || '').trim()
            };
        });
    }
    window.normalizeMusicTracks = normalizeMusicTracks;

    const DEFAULT_SECTION_BLOCKS = {
        wifi: {
            title: '📶 代理 & WiFi',
            tip: '💡 点击基础网络卡片可一键下发一键配置',
            helpEnabled: true,
            helpType: 'text',
            helpImg: '',
            helpText: '# 📶 代理 & WiFi 专区说明\n\n1. **基础网络卡片**：点击卡片可弹出对应 WiFi 二维码并复制密码（卡片右上角小问号为单卡独立教程）。\n2. **前置代理二维码**：使用 iPhone **Egern** 或 Android **v2rayNG** 扫码一键添加前置代理。\n3. **公司 WiFi 二维码**：使用手机系统相机扫码即可一键连接办公网。'
        },
        softRouter: {
            title: '软路由分流通道',
            tip: '',
            helpEnabled: false,
            helpType: '',
            helpImg: '',
            helpText: '# 软路由分流通道说明\n\n点击对应线路按钮可弹出软路由连接二维码。'
        },
        proxy: {
            title: '前置代理二维码（扫码一键添加）',
            tip: '',
            helpEnabled: true,
            helpType: 'text',
            helpImg: '',
            helpText: '# 前置代理二维码使用说明\n\n- 使用 iPhone **Egern** 或 Android **v2rayNG** 扫描下方前置代理二维码即可一键导入。\n- 🟢 绿点：连通优质（<1.5s）\n- 🟡 黄点：可用但较慢（1.5~3s）\n- 🔴 红点：当前线路不可用'
        },
        company: {
            title: '🏢 公司 WiFi 二维码',
            tip: '',
            helpEnabled: true,
            helpType: 'text',
            helpImg: '',
            helpText: '# 🏢 公司 WiFi 二维码说明\n\n打开手机系统相机或微信扫一扫，对准对应办公区的二维码即可一键连接公司 WiFi（点击卡片可放大）。'
        },
        quick: {
            title: '⚡ IP 二维码生成',
            tip: '',
            helpEnabled: true,
            helpType: 'text',
            helpImg: '',
            helpText: '# ⚡ IP 二维码生成说明\n\n1. 填写代理名称前缀与手机盘点编码。\n2. 粘贴 SOCKS5 节点信息（支持空格、中文冒号、换行自动清洗）。\n3. 点击生成按钮即可在右侧生成 **Egern (iOS)** 或 **v2rayNG (Android)** 专属二维码。'
        },
        netTest: {
            title: '🌐 网络测试',
            tip: '依次点击查看 IP 是否为获取的代理 IP 地址，建议纯净度≥90% 再打开社媒 App',
            helpEnabled: true,
            helpType: 'text',
            helpImg: '',
            helpText: '# 🌐 网络测试说明\n\n依次点击或手机扫码打开下方检测网站，确认当前设备的出口 IP 已变为目标代理 IP：\n\n- **DNSLeakTest**：检测 DNS 是否泄漏\n- **Whoer**：检查伪装度评分及 WebRTC/时区一致性\n- **Ping0**：检测 IP 纯净度与风险值\n- **IPinfo**：核对 IP 地理位置、ASN 与运营商\n\n:::success 建议标准\n建议纯净度/伪装度 ≥ 90% 后再打开社媒 App。\n:::'
        },
        batch: {
            title: '📋 填写 IP 报表',
            tip: '',
            helpEnabled: false,
            helpType: '',
            helpImg: '',
            helpText: '# 📋 填写 IP 报表说明\n\n批量粘贴节点后点击「⚡ 生成并并发测绘」，系统将自动清洗格式并查询国家/州省，支持一键复制直接粘贴到 Excel。'
        },
        appStore: {
            title: '📱 手机 App 下载（App Store）',
            tip: '💡 鼠标悬停或点击小图标原地展开大二维码，使用 iPhone 相机扫码直达美区/港区 App Store 下载页',
            helpEnabled: false,
            helpType: 'text',
            helpImg: '',
            helpText: '# 📱 手机 App 下载说明\n\n1. 鼠标悬停或点击对应 App 图标即可在原地展开高清二维码。\n2. 使用 iPhone 系统相机扫描二维码，可直接跳转至 App Store 下载对应应用（需登录海外 Apple ID）。'
        },
        pcSoft: {
            title: '💻 电脑软件',
            tip: '💡 鼠标悬停查看软件用途说明，点击名称直接在新标签页打开官方下载页',
            helpEnabled: false,
            helpType: 'text',
            helpImg: '',
            helpText: '# 💻 电脑软件下载说明\n\n- **悬停名称**：原地展开查看该软件的功能说明。\n- **点击名称**：直接在新标签页打开官网或 GitHub Releases 下载页。'
        },
        secretZone: {
            title: '🔒 隐藏专区',
            tip: '',
            helpEnabled: false,
            helpType: 'text',
            helpImg: '',
            helpText: '# 🔒 隐藏专区说明\n\n鼠标悬停或点击图标即可展开专属二维码与说明。'
        },
        single: {
            title: '🔍 IP 提取与代理检测',
            tip: '',
            helpEnabled: false,
            helpType: '',
            helpImg: '',
            helpText: '# 🔍 IP 提取与代理检测说明\n\n粘贴 Egern 链接或异常格式的 IP 文本，一键还原明文并检测代理连通性与地区。'
        }
    };
    window.DEFAULT_SECTION_BLOCKS = DEFAULT_SECTION_BLOCKS;

    function normalizeSectionBlocks(rawBlocks, legacyObj) {
        const out = {};
        const src = (rawBlocks && typeof rawBlocks === 'object') ? rawBlocks : {};
        Object.keys(DEFAULT_SECTION_BLOCKS).forEach(k => {
            const def = DEFAULT_SECTION_BLOCKS[k];
            const b = Object.assign({}, (src[k] && typeof src[k] === 'object') ? src[k] : {});
            if (k === 'wifi' && b.helpType === 'image' && b.helpImg === 'images/@Ads tutorial.jpg') {
                b.helpType = 'text';
                b.helpImg = '';
                if (!b.helpText || b.helpText.indexOf('点击基础网络卡片可一键下发一键配置') >= 0) {
                    b.helpText = def.helpText;
                }
            }
            let helpType = (b.helpType === 'image' || b.helpType === 'text' || b.helpType === '')
                ? b.helpType
                : def.helpType;
            let helpEnabled;
            if (typeof b.helpEnabled === 'boolean') {
                helpEnabled = b.helpEnabled;
            } else if (b.helpType === '') {
                helpEnabled = false;
            } else if (b.helpType === 'image' || b.helpType === 'text') {
                helpEnabled = true;
            } else {
                helpEnabled = !!def.helpEnabled;
            }
            if (helpEnabled && !helpType) {
                helpType = String(b.helpImg || def.helpImg || '').trim() ? 'image' : 'text';
            }
            out[k] = {
                title: typeof b.title === 'string' ? b.title : def.title,
                tip: typeof b.tip === 'string' ? b.tip : def.tip,
                helpEnabled: helpEnabled,
                helpType: helpEnabled ? helpType : '',
                helpImg: typeof b.helpImg === 'string' ? b.helpImg : def.helpImg,
                helpText: typeof b.helpText === 'string' ? b.helpText : def.helpText
            };
        });
        if (legacyObj && typeof legacyObj === 'object') {
            if (!src.wifi) {
                if (typeof legacyObj.wifiTitle === 'string') out.wifi.title = legacyObj.wifiTitle;
                if (typeof legacyObj.wifiTip === 'string') out.wifi.tip = legacyObj.wifiTip;
            }
            if (!src.netTest) {
                if (typeof legacyObj.netTestTip === 'string') out.netTest.tip = legacyObj.netTestTip;
            }
        }
        return out;
    }
    window.normalizeSectionBlocks = normalizeSectionBlocks;

    /**
     * 仅供后台 CMS「载入初始模板」按钮手动调用的预设卡片模板（前端渲染绝不自动回退到此模板）
     */
    const TEMPLATE_BASE_WIFI_CARDS = [
        { id: 'ads',     name: '@Ads',          pwd: 'a123456789', img: 'images/@Ads.png',          qrMode: 'image', wifiString: '', visible: true, helpType: 'image', helpImg: 'images/@Ads tutorial.jpg', helpText: '' },
        { id: 'meitu',   name: 'meitu',         pwd: 'a123456789', img: 'images/meitu.jpg',         qrMode: 'image', wifiString: '', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'zone',    name: 'Zone',          pwd: 'a123456789', img: 'images/Zone.jpg',          qrMode: 'image', wifiString: '', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'usa',     name: 'USA-TikTok-5G', pwd: '88888888',   img: 'images/USA-TikTok-5G.jpg', qrMode: 'image', wifiString: '', visible: true, helpType: '', helpImg: '', helpText: '' }
    ];
    const TEMPLATE_PROXY_LIST = [
        { id: 'proxy_1', name: '1.15.125.134',   qrMode: 'image', imgPath: 'images/1.15.125.134.png',   proxyUrl: '', visible: true },
        { id: 'proxy_2', name: '43.138.27.229',  qrMode: 'image', imgPath: 'images/43.138.27.229.png',  proxyUrl: '', visible: true },
        { id: 'proxy_3', name: '129.204.147.62', qrMode: 'image', imgPath: 'images/129.204.147.62.jpg', proxyUrl: '', visible: true },
        { id: 'proxy_4', name: '175.24.132.155', qrMode: 'image', imgPath: 'images/175.24.132.155.jpg', proxyUrl: '', visible: true },
        { id: 'proxy_5', name: '118.89.184.56',  qrMode: 'image', imgPath: 'images/118.89.184.56.jpg',  proxyUrl: '', visible: true },
        { id: 'proxy_6', name: '43.163.112.142', qrMode: 'image', imgPath: 'images/43.163.112.142.jpg', proxyUrl: '', visible: true },
        { id: 'proxy_7', name: '119.29.131.71',  qrMode: 'image', imgPath: 'images/119.29.131.71.png',  proxyUrl: '', visible: true },
        { id: 'proxy_8', name: '43.136.47.17',   qrMode: 'image', imgPath: 'images/43.136.47.17.jpg',   proxyUrl: '', visible: true }
    ];
    const TEMPLATE_COMPANY_WIFI_LIST = [
        { id: 'company_1', name: '1302-5G',     qrMode: 'image', imgPath: 'images/1302-5G.jpg',     ssid: '1302-5G',     pwd: '', qrText: '', visible: true },
        { id: 'company_2', name: '1603-5G',     qrMode: 'image', imgPath: 'images/1603-5G.jpg',     ssid: '1603-5G',     pwd: '', qrText: '', visible: true },
        { id: 'company_3', name: '1603-2-5G',   qrMode: 'image', imgPath: 'images/1603-2-5G.jpg',   ssid: '1603-2-5G',   pwd: '', qrText: '', visible: true },
        { id: 'company_4', name: 'MCN-1304-5G', qrMode: 'image', imgPath: 'images/MCN-1304-5G.jpg', ssid: 'MCN-1304-5G', pwd: '', qrText: '', visible: true }
    ];
    const TEMPLATE_NET_TEST_LIST = [
        { id: 'net_dnsleak', name: 'DNSLeakTest', qrMode: 'link', url: 'dnsleaktest.com', imgPath: '', desc: '测 IP DNS 泄漏', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'net_whoer',   name: 'Whoer',       qrMode: 'link', url: 'whoer.com',       imgPath: '', desc: '综合匿名度评分，看 IP 干不干净、WebRTC/DNS 泄不泄漏', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'net_ping0',   name: 'Ping0',       qrMode: 'link', url: 'ping0.cc',        imgPath: '', desc: '测 IP 纯净度/风险分', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'net_ipinfo',  name: 'IPinfo',      qrMode: 'link', url: 'ipinfo.io',       imgPath: '', desc: '查 IP 地理位置、ASN、时区、运营商', visible: true, helpType: '', helpImg: '', helpText: '' }
    ];
    const TEMPLATE_APP_STORE_LIST = [
        { id: 'app_gmail',        name: 'Gmail',        icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/gmail-email-by-google/id422689480',                           imgPath: '', desc: 'Google 官方邮箱客户端，支持多账号管理与实时邮件通知', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_wetype',       name: '微信输入法',   icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/%E5%BE%AE%E4%BF%A1%E8%BE%93%E5%85%A5%E6%B3%95/id1618175312', imgPath: '', desc: '腾讯官方出品输入法，支持跨设备剪贴板同步与智能词库', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_x',            name: 'X',            icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/x/id333903271',                                               imgPath: '', desc: '原 Twitter 官方客户端，全球实时资讯与跨境社媒运营必备', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_egern',        name: 'Egern',        icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/egern/id1616105820',                                          imgPath: '', desc: 'iOS 高性能网络代理客户端，支持 Hysteria2 / SOCKS5 扫码一键添加', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_deltachat',    name: 'Delta Chat',   icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/delta-chat/id1459523234?l=zh-Hant-TW',                        imgPath: '', desc: '基于邮箱协议的端到端加密聊天工具，安全稳定无需手机号', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_threads',      name: 'Threads',      icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/threads/id6446901002',                                        imgPath: '', desc: 'Meta 旗下文字社交平台，与 Instagram 账号一键互通', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_tiktok',       name: 'TikTok',       icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/tiktok-videos-shop-live/id835599320',                         imgPath: '', desc: '海外版抖音短视频与直播商城（建议代理纯净度≥90%后打开）', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_facebook',     name: 'Facebook',     icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/facebook/id284882215',                                        imgPath: '', desc: 'Meta 核心社交平台，支持公共主页、广告投放与社群运营', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_instagram',    name: 'Instagram',    icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/instagram/id389801252',                                       imgPath: '', desc: '图片与 Reels 短视频社交平台，品牌视觉与私域引流核心阵地', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'app_shadowrocket', name: 'Shadowrocket', icon: '', qrMode: 'link', url: 'https://apps.apple.com/us/app/shadowrocket/id932747118?l=zh-Hant-TW',                       imgPath: '', desc: 'iOS 经典小火箭代理工具，支持多协议节点扫码导入与分流', visible: true, helpType: '', helpImg: '', helpText: '' }
    ];
    const TEMPLATE_PC_SOFT_LIST = [
        { id: 'pc_clash',      name: 'Clash Verge Rev', url: 'https://github.com/clash-verge-rev/clash-verge-rev/releases', desc: '桌面端主流代理分流客户端，内置 Clash.Meta 内核，支持订阅与TUN模式', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_bitbrowser', name: 'BitBrowser',      url: 'https://www.bitbrowser.cn/download',                          desc: '比特指纹浏览器，支持多账号独立防关联环境隔离与团队协同', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_chrome',     name: 'Google Chrome',   url: 'https://www.google.com/chrome/',                              desc: 'Google 官方网页浏览器，跨境业务与扩展插件标准运行环境', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_capcut',     name: '剪映',            url: 'https://www.capcut.cn/',                                      desc: '全功能视频剪辑工具，支持智能字幕识别、AI配音与短视频素材库', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_potplayer',  name: 'PotPlayer',       url: 'https://potplayer.tv/?lang=zh_CN',                            desc: 'Windows 高性能全格式多媒体播放器，硬件加速解码、无广告', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_honeyview',  name: 'Honeyview',       url: 'https://honeyview.net/',                                      desc: '极速轻量级图片查看器，支持多种图片格式与压缩包免解压预览', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_icaros',     name: 'Icaros',          url: 'https://github.com/Xanashi/Icaros/releases',                  desc: 'Windows 资源管理器视频缩略图补全工具，支持各类格式封面预览', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_everything', name: 'Everything',      url: 'https://www.voidtools.com/zh-cn/downloads/',                  desc: '毫秒级本地文件搜索神器，输入关键词瞬间定位全盘文件与素材', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_sogou',      name: '搜狗输入法',      url: 'https://shurufa.sogou.com/',                                  desc: '中文智能拼音输入法，支持丰富细胞词库与快捷短语同步', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_dingtalk',   name: '钉钉',            url: 'https://www.dingtalk.com/',                                   desc: '团队协同办公与即时通讯平台，支持文档协作、音视频会议与考勤', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_deltachat',  name: 'Delta Chat',      url: 'https://delta.chat/zh_CN/download',                           desc: '电脑端加密通讯客户端，支持与手机端扫码同步多端加密消息', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_i4',         name: 'i4',              url: 'https://i4.cn/',                                              desc: '爱思助手电脑版，iOS 设备验机、素材导入导出与刷机备份工具', visible: true, helpType: '', helpImg: '', helpText: '' },
        { id: 'pc_yuque',      name: '语雀文档',        url: 'https://www.yuque.com/u37186489/tgrg5b/hbeqd8mhfr2f6p2t',     desc: '团队业务知识库与标准SOP操作文档中心，点击直达查阅', visible: true, helpType: '', helpImg: '', helpText: '' }
    ];

    /**
     * 空内容结构（当后台未返回卡片或 fetch 失败时使用，卡片列表全部为空，绝不回退硬编码旧卡片）
     */
    function emptyContent() {
        const secBlocks = normalizeSectionBlocks(null, null);
        return {
            version: 1,
            wifiTitle: secBlocks.wifi.title,
            wifiTip: secBlocks.wifi.tip,
            netTestTip: secBlocks.netTest.tip,
            sectionBlocks: secBlocks,
            baseWifiCards: [],
            proxyList: [],
            companyWifiList: [],
            netTestList: [],
            appStoreList: [],
            pcSoftList: [],
            secretZoneList: [],
            secretZoneEnabled: false,
            music: [],
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

    /** 仅供后台 CMS 在云端完全为空时手动点击「初始化默认卡片模板」使用 */
    window.getInitialTemplateContent = function () {
        const base = emptyContent();
        base.baseWifiCards = normalizeBaseWifiCards(TEMPLATE_BASE_WIFI_CARDS);
        base.proxyList = normalizeProxyCards(TEMPLATE_PROXY_LIST);
        base.companyWifiList = normalizeCompanyWifiCards(TEMPLATE_COMPANY_WIFI_LIST);
        base.netTestList = normalizeNetTestCards(TEMPLATE_NET_TEST_LIST);
        base.appStoreList = normalizeAppStoreCards(TEMPLATE_APP_STORE_LIST);
        base.pcSoftList = normalizePcSoftCards(TEMPLATE_PC_SOFT_LIST);
        base.music = normalizeMusicTracks((typeof musicFiles !== 'undefined' ? musicFiles : []).map(n => ({
            name: String(n).replace(/\.[^/.]+$/, ''),
            sourceMode: 'link',
            url: 'music/' + n,
            linkUrl: 'music/' + n,
            uploadUrl: '',
            cover: ''
        })));
        return base;
    };

    /**
     * 严格以后台返回的 remote 对象构建站点内容（不合并任何硬编码默认卡片）
     */
    function buildRemoteContent(remote) {
        const out = emptyContent();
        if (!remote || typeof remote !== 'object') return out;
        out.baseWifiCards = Array.isArray(remote.baseWifiCards) ? normalizeBaseWifiCards(remote.baseWifiCards) : [];
        out.companyWifiList = Array.isArray(remote.companyWifiList) ? normalizeCompanyWifiCards(remote.companyWifiList) : [];
        out.proxyList = Array.isArray(remote.proxyList) ? normalizeProxyCards(remote.proxyList) : [];
        out.netTestList = Array.isArray(remote.netTestList) ? normalizeNetTestCards(remote.netTestList) : [];
        out.appStoreList = Array.isArray(remote.appStoreList) ? normalizeAppStoreCards(remote.appStoreList) : [];
        out.pcSoftList = Array.isArray(remote.pcSoftList) ? normalizePcSoftCards(remote.pcSoftList) : [];
        out.secretZoneList = Array.isArray(remote.secretZoneList) ? normalizeSecretZoneCards(remote.secretZoneList) : [];
        if (typeof remote.secretZoneEnabled === 'boolean') out.secretZoneEnabled = remote.secretZoneEnabled;
        out.music = Array.isArray(remote.music) ? normalizeMusicTracks(remote.music) : [];
        ['wifiTitle', 'wifiTip', 'netTestTip'].forEach(k => {
            if (typeof remote[k] === 'string') out[k] = remote[k];
        });
        out.sectionBlocks = normalizeSectionBlocks(remote.sectionBlocks, remote);
        out.wifiTitle = out.sectionBlocks.wifi.title;
        out.wifiTip = out.sectionBlocks.wifi.tip;
        out.netTestTip = out.sectionBlocks.netTest.tip;
        if (typeof remote.musicEnabled === 'boolean') out.musicEnabled = remote.musicEnabled;
        if (remote.background && typeof remote.background === 'object') {
            out.background = Object.assign({}, out.background, remote.background);
            out.background.videoEnabled = !!out.background.videoEnabled;
            out.background.dayVideoUrl = String(out.background.dayVideoUrl || '');
            out.background.nightVideoUrl = String(out.background.nightVideoUrl || '');
        }
        if (remote.effects && typeof remote.effects === 'object') {
            out.effects = Object.assign({}, out.effects, remote.effects);
        }
        if (typeof remote.guideHtml === 'string' && remote.guideHtml.trim()) {
            out.guideHtml = remote.guideHtml;
        }
        return out;
    }
    window.buildRemoteContent = buildRemoteContent;

    /**
     * 精简待保存到云端的 SITE_CONTENT，剔除内置大体积 SVG Data URI 和未修改的默认大段文本，
     * 使 JSON 体积从 ~22KB 降至 ~2.6KB，彻底避免 Google Apps Script PropertiesService 单键 9KB 限制报错。
     */
    window.compactSiteContentForSave = function (rawState) {
        const d = buildRemoteContent(rawState || {});
        const stripCommon = (item) => {
            const o = Object.assign({}, item);
            if (!o.helpType) {
                delete o.helpType;
                delete o.helpImg;
                delete o.helpText;
            }
            if (isCardVisible(o)) {
                delete o.visible;
            } else {
                o.visible = false;
            }
            return o;
        };
        const compactBlocks = {};
        Object.keys(d.sectionBlocks || {}).forEach(k => {
            const b = d.sectionBlocks[k] || {};
            const def = DEFAULT_SECTION_BLOCKS[k] || {};
            const diff = {};
            if (typeof b.title === 'string' && b.title !== def.title) diff.title = b.title;
            if (typeof b.tip === 'string' && b.tip !== def.tip) diff.tip = b.tip;
            if (Boolean(b.helpEnabled) !== Boolean(def.helpEnabled)) diff.helpEnabled = Boolean(b.helpEnabled);
            const defActiveType = def.helpEnabled ? def.helpType : '';
            if (b.helpType !== defActiveType) diff.helpType = b.helpType;
            if (b.helpImg && b.helpImg !== def.helpImg) diff.helpImg = b.helpImg;
            if (b.helpText && b.helpText !== def.helpText) diff.helpText = b.helpText;
            if (Object.keys(diff).length > 0) compactBlocks[k] = diff;
        });
        const out = {
            version: 1,
            baseWifiCards: (d.baseWifiCards || []).map(c => {
                const o = stripCommon(c);
                if (o.qrMode === 'image') delete o.qrMode;
                if (!o.wifiString) delete o.wifiString;
                if (!o.tag) delete o.tag;
                if (!o.large) delete o.large;
                if (!o.danger) delete o.danger;
                if (!o.fx || o.fx === 'default') delete o.fx;
                return o;
            }),
            proxyList: (d.proxyList || []).map(c => {
                const o = stripCommon(c);
                if (o.qrMode === 'image') delete o.qrMode;
                if (!o.proxyUrl) delete o.proxyUrl;
                if (!o.firstOnlineAt || o.firstOnlineAt === '2026/10/22 10:00:00') delete o.firstOnlineAt;
                if (o.statusOverride === 'auto') delete o.statusOverride;
                if (!o.manualOverride) delete o.manualOverride;
                if (!o.manualDownAt) delete o.manualDownAt;
                if (!o.manualNote) delete o.manualNote;
                return o;
            }),
            companyWifiList: (d.companyWifiList || []).map(c => {
                const o = stripCommon(c);
                if (o.qrMode === 'image') delete o.qrMode;
                if (!o.ssid || o.ssid === o.name) delete o.ssid;
                if (!o.pwd) delete o.pwd;
                if (!o.qrText) delete o.qrText;
                return o;
            }),
            netTestList: (d.netTestList || []).map(c => {
                const o = stripCommon(c);
                if (o.qrMode === 'link') delete o.qrMode;
                if (!o.imgPath) delete o.imgPath;
                return o;
            }),
            appStoreList: (d.appStoreList || []).map(c => {
                const o = stripCommon(c);
                if (o.qrMode === 'link') delete o.qrMode;
                if (window.isBuiltinAppIcon(o.icon)) delete o.icon;
                if (!o.imgPath) delete o.imgPath;
                return o;
            }),
            pcSoftList: (d.pcSoftList || []).map(c => stripCommon(c)),
            secretZoneList: (d.secretZoneList || []).map(c => {
                const o = stripCommon(c);
                if (o.qrMode === 'link') delete o.qrMode;
                if (window.isBuiltinAppIcon(o.icon)) delete o.icon;
                if (!o.imgPath) delete o.imgPath;
                return o;
            }),
            secretZoneEnabled: !!d.secretZoneEnabled,
            sectionBlocks: compactBlocks,
            music: (d.music || []).map(m => {
                const o = Object.assign({}, m);
                if (o.sourceMode === 'link') delete o.sourceMode;
                if (o.linkUrl === o.url) delete o.linkUrl;
                if (!o.uploadUrl) delete o.uploadUrl;
                if (!o.cover) delete o.cover;
                return o;
            }),
            musicEnabled: d.musicEnabled !== false,
            background: d.background || {},
            effects: d.effects || { pwdFx: 'default', cardHover: true },
            guideHtml: (typeof guideTemplateHTML !== 'undefined' && d.guideHtml === guideTemplateHTML)
                ? ''
                : String(d.guideHtml || '')
        };
        return out;
    };

    window.getSiteContent = function () {
        return window.SiteContent.data || emptyContent();
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

    /** 统一打开任意问号帮助浮层（支持图片模式或文字/Markdown 模式） */
    window.openHelpPopup = function (helpObj) {
        if (!helpObj || typeof helpObj !== 'object') return;
        const type = helpObj.helpType;
        if (type === 'image' && String(helpObj.helpImg || '').trim()) {
            const modal = document.getElementById('wifiGuideModal');
            const img = document.getElementById('wifiGuideImg');
            if (img) img.src = String(helpObj.helpImg).trim();
            if (modal) modal.style.display = 'flex';
        } else if (type === 'text' && String(helpObj.helpText || '').trim()) {
            const modal = document.getElementById('cardHelpModal');
            const body = document.getElementById('modalTextBody');
            const raw = String(helpObj.helpText);
            if (body) body.innerHTML = window.renderGuideContent ? window.renderGuideContent(raw) : raw;
            if (modal) modal.style.display = 'flex';
        }
    };

    /** 打开区块标题右上角「?」帮助说明 */
    window.openSectionHelp = function (secKey) {
        const d = window.getSiteContent ? window.getSiteContent() : (window.SiteContent && window.SiteContent.data);
        const blocks = (d && d.sectionBlocks) || DEFAULT_SECTION_BLOCKS;
        const block = blocks && blocks[secKey];
        if (!block) return;
        window.openHelpPopup(block);
    };

    /** 打开任意分组卡片右上角「?」帮助说明 */
    window.openAnyCardHelp = function (group, index) {
        const d = window.getSiteContent ? window.getSiteContent() : (window.SiteContent && window.SiteContent.data);
        const list = (d && Array.isArray(d[group])) ? d[group] : (window[group] || []);
        const card = list && list[index];
        if (!card) return;
        window.openHelpPopup(card);
    };

    /** 把远程内容写回运行时的全局变量并触发重绘 */
    window.applySiteContent = function () {
        const d = window.SiteContent.data;
        if (!d) return;

        d.baseWifiCards = Array.isArray(d.baseWifiCards) ? normalizeBaseWifiCards(d.baseWifiCards) : [];
        baseWifiCards = d.baseWifiCards;
        if (window.SiteConfig) {
            window.SiteConfig.cfgShowWifiCards = d.baseWifiCards.filter(c => isCardVisible(c)).map(c => c.id).join(',');
        }

        d.proxyList = Array.isArray(d.proxyList) ? normalizeProxyCards(d.proxyList) : [];
        proxyList = d.proxyList;

        d.companyWifiList = Array.isArray(d.companyWifiList) ? normalizeCompanyWifiCards(d.companyWifiList) : [];
        companyWifiList = d.companyWifiList;

        d.netTestList = Array.isArray(d.netTestList) ? normalizeNetTestCards(d.netTestList) : [];
        window.netTestList = d.netTestList;

        d.appStoreList = Array.isArray(d.appStoreList) ? normalizeAppStoreCards(d.appStoreList) : [];
        window.appStoreList = d.appStoreList;

        d.pcSoftList = Array.isArray(d.pcSoftList) ? normalizePcSoftCards(d.pcSoftList) : [];
        window.pcSoftList = d.pcSoftList;

        d.secretZoneList = Array.isArray(d.secretZoneList) ? normalizeSecretZoneCards(d.secretZoneList) : [];
        window.secretZoneList = d.secretZoneList;

        d.music = Array.isArray(d.music) ? normalizeMusicTracks(d.music) : [];
        d.secretZoneEnabled = !!d.secretZoneEnabled;
        d.sectionBlocks = normalizeSectionBlocks(d.sectionBlocks, d);
        d.wifiTitle = d.sectionBlocks.wifi.title;
        d.wifiTip = d.sectionBlocks.wifi.tip;
        d.netTestTip = d.sectionBlocks.netTest.tip;

        window.BG_CONFIG = Object.assign(
            { mode: 'auto', dayUrl: '', nightUrl: '', particles: true, videoEnabled: false, dayVideoUrl: '', nightVideoUrl: '' },
            d.background || {}
        );
        window.applyBgVideo();

        // 统一更新所有区块标题、顶部提示语 & 右上角圆形问号按钮
        const secMap = {
            wifi:       { titleId: 'wifiSectionTitle',       tipId: 'wifiSectionTip',       btnId: 'secHelpBtn-wifi' },
            softRouter: { titleId: 'softRouterSectionTitle', tipId: 'softRouterSectionTip', btnId: 'secHelpBtn-softRouter' },
            proxy:      { titleId: 'proxySectionTitle',      tipId: 'proxySectionTip',      btnId: 'secHelpBtn-proxy' },
            company:    { titleId: 'companySectionTitle',    tipId: 'companySectionTip',    btnId: 'secHelpBtn-company' },
            quick:      { titleId: 'quickSectionTitle',      tipId: 'quickSectionTip',      btnId: 'secHelpBtn-quick' },
            netTest:    { titleId: 'netTestSectionTitle',    tipId: 'netTestTipText',       btnId: 'secHelpBtn-netTest' },
            batch:      { titleId: 'batchSectionTitle',      tipId: 'batchSectionTip',      btnId: 'secHelpBtn-batch' },
            appStore:   { titleId: 'appStoreSectionTitle',   tipId: 'appStoreSectionTip',   btnId: 'secHelpBtn-appStore' },
            pcSoft:     { titleId: 'pcSoftSectionTitle',     tipId: 'pcSoftSectionTip',     btnId: 'secHelpBtn-pcSoft' },
            secretZone: { titleId: 'secretZoneSectionTitle', tipId: 'secretZoneSectionTip', btnId: 'secHelpBtn-secretZone' },
            single:     { titleId: 'singleSectionTitle',     tipId: 'singleSectionTip',     btnId: 'secHelpBtn-single' }
        };
        Object.keys(secMap).forEach(secKey => {
            const cfg = secMap[secKey];
            const block = (d.sectionBlocks && d.sectionBlocks[secKey]) || DEFAULT_SECTION_BLOCKS[secKey] || {};
            const titleEl = document.getElementById(cfg.titleId);
            if (titleEl && typeof block.title === 'string' && block.title.trim()) {
                titleEl.textContent = block.title;
            }
            const tipEl = document.getElementById(cfg.tipId);
            if (tipEl && typeof block.tip === 'string') {
                tipEl.textContent = block.tip;
                tipEl.style.display = block.tip.trim() ? '' : 'none';
            }
            const btnEl = document.getElementById(cfg.btnId);
            if (btnEl) {
                const isEnabled = block.helpEnabled !== false;
                const showHelp = isEnabled && (
                    (block.helpType === 'image' && String(block.helpImg || '').trim())
                    || (block.helpType === 'text' && String(block.helpText || '').trim())
                );
                btnEl.style.display = showHelp ? 'inline-flex' : 'none';
            }
        });

        // 卡片动效开关
        const fx = d.effects || {};
        document.body.classList.toggle('pwd-fx-all', fx.pwdFx === 'all');
        document.body.classList.toggle('pwd-fx-none', fx.pwdFx === 'none');
        document.body.classList.toggle('no-card-hover', fx.cardHover === false);

        const guideBox = document.getElementById('guideContentContainer');
        if (guideBox) {
            const rawGuide = (typeof d.guideHtml === 'string' && d.guideHtml.trim())
                ? d.guideHtml
                : (typeof guideTemplateHTML !== 'undefined' ? guideTemplateHTML : '');
            if (rawGuide) {
                guideBox.innerHTML = window.renderGuideContent
                    ? window.renderGuideContent(rawGuide)
                    : rawGuide;
            }
        }

        const player = document.querySelector('.music-player-widget');
        if (player) player.style.display = d.musicEnabled === false ? 'none' : '';

        if (typeof renderStaticCards === 'function') renderStaticCards();
        if (typeof window.renderNetTestCards === 'function') window.renderNetTestCards();
        if (typeof window.renderBatchExtraSections === 'function') window.renderBatchExtraSections();
        if (typeof applyWifiLayoutConfig === 'function') applyWifiLayoutConfig();
        if (typeof window.createParticles === 'function') window.createParticles();
        if (typeof loadTrack === 'function') loadTrack(0, true);

        // 后台管理台已打开且本地没有未保存修改时，同步刷新为最新远程内容
        const cmsBox = document.getElementById('cmsContainer');
        if (cmsBox && cmsBox.innerHTML.trim() && typeof renderCmsPanel === 'function' && typeof cmsDirty !== 'undefined' && cmsDirty === false) {
            cmsState = window.SiteContent.remote ? JSON.parse(JSON.stringify(d)) : null;
            if (typeof injectAdminControls === 'function' && document.getElementById('adminControlBox')) {
                injectAdminControls();
            } else {
                renderCmsPanel();
            }
        }
    };

    function load() {
        const done = () => { window.SiteContent.loaded = true; window.applySiteContent(); };
        const base = apiUrl('?action=content');

        if (!base) {
            window.SiteContent.data = emptyContent();
            window.SiteContent.remote = false;
            window.SiteContent.fetchFailed = true;
            done();
            return Promise.resolve();
        }

        const attemptFetch = (retryCount) => {
            const url = apiUrl('?action=content&_t=' + Date.now());
            return fetch(url, { cache: 'no-store' })
                .then(r => r.json())
                .then(j => {
                    const remote = (j && j.ok && j.content && typeof j.content === 'object') ? j.content : null;
                    if (remote && Object.keys(remote).length > 0) {
                        window.SiteContent.data = buildRemoteContent(remote);
                        window.SiteContent.remote = true;
                        window.SiteContent.fetchFailed = false;
                    } else if (!window.SiteContent.remote) {
                        // 云端返回为空或未初始化时，严格保持空卡片列表，不回退硬编码默认卡片
                        window.SiteContent.data = emptyContent();
                        window.SiteContent.remote = false;
                        window.SiteContent.fetchFailed = !(j && j.ok);
                    }
                    done();
                })
                .catch(() => {
                    if (retryCount < 1) {
                        return new Promise(res => setTimeout(res, 600)).then(() => attemptFetch(retryCount + 1));
                    }
                    // fetch 失败时严禁回退到硬编码旧数据或 localStorage 缓存
                    if (!window.SiteContent.remote) {
                        window.SiteContent.data = emptyContent();
                        window.SiteContent.remote = false;
                        window.SiteContent.fetchFailed = true;
                    }
                    done();
                });
        };

        return attemptFetch(0);
    }

    /** 统一的上报通道：readResponse=true 时读取 JSON 返回（后台管理用） */
    window.postToApi = function (payload, readResponse) {
        const url = apiUrl('');
        if (!url) return Promise.reject(new Error('未配置 REPORT_API_URL'));
        return fetch(url, {
            method: 'POST',
            mode: readResponse ? 'cors' : 'no-cors',
            cache: 'no-store',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }).then(r => (readResponse ? r.json() : { ok: true }));
    };

    /* ---------------- 前置代理自动探测状态加载器与判定 ---------------- */
    window.probeState = { updatedAt: '', items: {} };

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

    /** 拉取云端探测状态，每 60 秒轮询，实时从后台获取最新状态，不使用 localStorage 缓存 */
    window.fetchProbeState = function () {
        const url = apiUrl('?action=probe&_t=' + Date.now());
        if (!url) {
            if (typeof window.updateProxyCardsInPlace === 'function') window.updateProxyCardsInPlace();
            return Promise.resolve(window.probeState);
        }
        return fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(j => {
                if (j && j.probeIntervalMin && window.SiteConfig) {
                    window.SiteConfig.cfgProbeIntervalMin = String(j.probeIntervalMin);
                }
                if (j && j.ok && j.probe && typeof j.probe === 'object') {
                    const normalized = normalizeProbePayload(j.probe);
                    if (Object.keys(normalized.items).length > 0 || normalized.updatedAt) {
                        window.probeState = normalized;
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
