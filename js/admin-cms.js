/* ============================================================
 * admin-cms.js —— 隐藏式后台：站点内容管理台
 * 入口：连点 Logo 5 次输入密钥 → 「🔒 审计大屏」底部
 * 能力：WiFi 卡片 / 前置代理 / 公司 WiFi / 音乐 / 背景 / 教程
 * ============================================================ */

const CMS_TOKEN_KEY = 'mnAdminToken';
let cmsState = null;
let cmsDirty = false; // 有未保存的本地修改时，不允许被远程内容覆盖

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

/** 前台「基础网络卡片」展示开关（存在 localStorage，保存时同步到云端） */
function getShownIds() {
    const raw = localStorage.getItem('cfgShowWifiCards') || '';
    return raw.split(',').filter(Boolean);
}
function setShownIds(ids) {
    localStorage.setItem('cfgShowWifiCards', ids.filter(Boolean).join(','));
}
window.cmsToggleShow = function (index, checked) {
    const card = (cmsState.baseWifiCards || [])[index];
    if (!card) return;
    cmsDirty = true;
    const ids = getShownIds();
    const on = ids.indexOf(card.id) >= 0;
    if (checked && !on) ids.push(card.id);
    if (!checked && on) ids.splice(ids.indexOf(card.id), 1);
    setShownIds(ids);
    if (typeof applyWifiLayoutConfig === 'function') applyWifiLayoutConfig();
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

/* ---------------- 渲染主入口 ---------------- */

function renderCmsPanel() {
    const box = document.getElementById('cmsContainer');
    if (!box) return;
    if (!cmsState) cmsState = clone(window.getSiteContent());

    box.innerHTML = `
        <div class="cms-card">
            <div class="cms-card-head">
                <h4>🛠️ 站点内容管理台（改动保存后全员实时生效）</h4>
                <div class="cms-actions">
                    <button type="button" class="btn-ghost" onclick="cmsReload()">↺ 还原未保存的修改</button>
                    <button type="button" class="btn-primary" onclick="cmsSaveContent()">🚀 保存并全网下发</button>
                </div>
            </div>
            <div class="cms-tip">图片与音乐可上传到 Google Drive（单个 ≤ 8MB），也可直接粘贴外链 URL。</div>
            ${window.hasCloudApi && window.hasCloudApi() ? '' : '<div class="cms-tip cms-warn">⚠️ 尚未部署云端后台（REPORT_API_URL 为空）：下面的改动可以点「保存」先存到这台设备的浏览器里立即生效，但其他设备看不到；部署好 Google 后端后再保存一次即可全网同步。</div>'}
            <div class="cms-tip" id="cmsCloudStatus">${cmsStatusText()}</div>
        </div>

        ${cmsSectionWifiText()}
        ${cmsSectionWifi()}
        ${cmsSectionProxy('proxyList', '🌐 前置代理二维码', 'proxyGrid')}
        ${cmsSectionProxy('companyWifiList', '🏢 公司 WiFi 二维码', 'companyGrid')}
        ${cmsSectionMusic()}
        ${cmsSectionBackground()}
        ${cmsSectionGuide()}
    `;
}

function cmsReload() {
    cmsState = clone(window.getSiteContent());
    cmsDirty = false;
    renderCmsPanel();
    showToast('↺ 已还原为线上内容');
}

/** 云端连接状态文案 */
function cmsStatusText() {
    if (!window.hasCloudApi || !window.hasCloudApi()) return '📴 云端接口未配置：保存为「仅本机生效」。';
    if (window.SiteContent && window.SiteContent.remote) return '☁️ 已连接云端：保存后所有设备刷新即可看到。';
    return '☁️ 云端接口已配置，但云端暂无内容（或旧版后端不支持内容接口）。请先用 `apps-script/Code.gs` 重新部署后端，再保存一次。';
}

/* ---------------- 0. 版面文案（代理 & WiFi 区块标题/提示） ---------------- */

function cmsSectionWifiText() {
    return `
        <div class="cms-card">
            <h4>📝 「代理 & WiFi」版面文案</h4>
            <div class="cms-grid">
                <div class="cms-field"><label>区块标题</label>
                    <input type="text" value="${esc(cmsState.wifiTitle || '')}" oninput="cmsSetText('wifiTitle',this.value)"></div>
                <div class="cms-field"><label>提示文字（留空则整行隐藏）</label>
                    <input type="text" value="${esc(cmsState.wifiTip || '')}" oninput="cmsSetText('wifiTip',this.value)"></div>
            </div>
        </div>`;
}

/* ---------------- 自动归类 & 排序 ---------------- */

/** 自动归类：按「有没有二维码 / 什么类型的码」判断，后台据此分组展示 */
function cmsCat(item, group) {
    if (group === 'baseWifiCards') {
        if (item.wifiString) return { key: 'wifi', cls: 'wifi', label: '📡 WiFi 协议自动生码（无图片）' };
        if (item.img) return { key: 'image', cls: 'image', label: '🖼 图片二维码' };
        return { key: 'none', cls: 'none', label: '📝 纯文字卡（无二维码）' };
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
    proxyList: ['image', 'none'],
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

/* ---------------- 1. 基础网络卡片 ---------------- */

function cmsSectionWifi() {
    const shown = getShownIds();
    const fxSelected = (v) => (!v || v === 'default') ? 'default' : v;
    const rows = cmsGroupedRows('baseWifiCards', (c, i) => `
        <div class="cms-item">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(c, 'baseWifiCards').cls}">${esc(c.name || '未命名')}</span>
                <span class="cms-spacer"></span>
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
                <label class="cms-check cms-show"><input type="checkbox" ${shown.indexOf(c.id) >= 0 ? 'checked' : ''} onchange="cmsToggleShow(${i},this.checked)"> 前台展示</label>
                <button type="button" class="cms-del" onclick="cmsDel('baseWifiCards',${i})">🗑 删除</button>
            </div>
            ${c.helpType === 'text' ? `<div class="cms-field mt-15"><label>❓ 问号弹窗文字内容（支持 Markdown：# 标题、**加粗**、- 列表、:::success 提示框…）</label>
                <textarea class="cms-guide-editor" rows="6" onchange="cmsSet('baseWifiCards',${i},'helpText',this.value)">${esc(c.helpText || '')}</textarea></div>` : ''}
        </div>`);

    return `
        <div class="cms-card">
            <h4>📶 基础网络卡片（首屏动态卡片）</h4>
            <div class="cms-tip">已按「有无二维码」自动归类分组；用 ↑ ↓ 可在同一分组内调整前后顺序。</div>
            ${rows || '<div class="cms-tip">暂无卡片</div>'}
            <button type="button" class="cms-add" onclick="cmsAdd('baseWifiCards')">➕ 新增基础网络卡片</button>
        </div>`;
}

/* ---------------- 2/3. 前置代理 & 公司 WiFi ---------------- */

function cmsSectionProxy(group, title) {
    const rows = cmsGroupedRows(group, (c, i) => `
        <div class="cms-item">
            <div class="cms-item-head">
                <span class="cms-badge ${cmsCat(c, group).cls}">${esc(c.name || '未命名')}</span>
                <span class="cms-spacer"></span>
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
        </div>`);

    return `
        <div class="cms-card">
            <h4>${title}</h4>
            <div class="cms-tip">已按「是否已上传二维码」自动归类；用 ↑ ↓ 可在同一分组内调整顺序。</div>
            ${rows || '<div class="cms-tip">暂无条目</div>'}
            <button type="button" class="cms-add" onclick="cmsAdd('${group}')">➕ 新增条目</button>
        </div>`;
}

/* ---------------- 4. 音乐 ---------------- */

function cmsSectionMusic() {
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

    return `
        <div class="cms-card">
            <h4>🎵 背景音乐歌单</h4>
            <label class="cms-check">
                <input type="checkbox" ${cmsState.musicEnabled === false ? '' : 'checked'} onchange="cmsSetFlag('musicEnabled',this.checked)"> 启用背景音乐播放器
            </label>
            ${rows || '<div class="cms-tip">歌单为空</div>'}
            <button type="button" class="cms-add" onclick="cmsAdd('music')">➕ 新增曲目</button>
        </div>`;
}

/* ---------------- 5. 背景与视效 ---------------- */

function cmsSectionBackground() {
    const b = cmsState.background || {};
    const isCustom = b.mode === 'custom';
    return `
        <div class="cms-card">
            <h4>🎨 背景与视效</h4>
            <div class="cms-grid">
                <div class="cms-field"><label>背景模式</label>
                    <select onchange="cmsSetBg('mode',this.value)">
                        <option value="auto" ${!isCustom ? 'selected' : ''}>自动（随机摄影图）</option>
                        <option value="custom" ${isCustom ? 'selected' : ''}>自定义图片</option>
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
            </div>
        </div>`;
}

/* ---------------- 6. 使用教程 ---------------- */

function cmsSectionGuide() {
    return `
        <div class="cms-card">
            <h4>📖 使用教程正文（支持 Markdown / HTML）</h4>
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
            <textarea class="cms-guide-editor" rows="14" onchange="cmsSetGuide(this.value)">${esc(cmsState.guideHtml || '')}</textarea>
            <button type="button" class="btn-ghost" onclick="cmsPreviewGuide()">👀 预览教程</button>
        </div>`;
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
    if (key === 'mode' || key === 'dayUrl' || key === 'nightUrl') renderCmsPanel();
    // 背景实时预览（仅本机生效，保存后才全网下发）
    if (window.SiteContent && key !== 'particles') { window.SiteContent.data = cmsState; window.applySiteContent(); }
};
window.cmsSetGuide = function (html) { cmsDirty = true; cmsState.guideHtml = html; };

/** 在教程编辑器光标处插入 Markdown 片段 */
window.cmsMdInsert = function (before, after) {
    const ta = document.querySelector('.cms-guide-editor');
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
        cmsState[group].push({ id: nid, name: '新网络', pwd: '', img: '', wifiString: '', tag: '', large: false, danger: false });
        // 新增的卡片默认直接在前台展示，避免“加了却看不到”
        const ids = getShownIds();
        if (ids.indexOf(nid) < 0) { ids.push(nid); setShownIds(ids); }
        if (typeof applyWifiLayoutConfig === 'function') applyWifiLayoutConfig();
    } else if (group === 'music') {
        cmsState[group].push({ name: '新曲目', url: '' });
    } else {
        cmsState[group].push({ name: '新条目', imgPath: '' });
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
            mimeType: file.type || (kind === 'audio' ? 'audio/mpeg' : 'image/png'),
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
    if (textBox) textBox.innerHTML = cmsState.guideHtml;
    setTimeout(() => { if (modal) modal.style.display = 'none'; }, 0);
};

window.cmsSaveContent = function () {
    // 未配置云端时：保存到本机浏览器（localStorage），本机立即生效
    if (!window.hasCloudApi || !window.hasCloudApi()) {
        try {
            localStorage.setItem('mnContentLocal', JSON.stringify(cmsState));
        } catch (e) { return showToast('❌ 本机保存失败：浏览器存储不可用'); }
        if (window.SiteContent) { window.SiteContent.data = cmsState; window.applySiteContent(); }
        cmsDirty = false;
        return showToast('💾 已保存到本机并生效（部署云端后可同步给所有人）');
    }

    const token = getAdminToken();
    if (!token) return;
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
                window.postToApi(Object.assign({ action: 'UPDATE_CONFIG', token: getAdminToken() }, cfg), true).catch(() => {});

                showToast('✅ 已保存并全网下发');
                Promise.resolve(window.refreshSiteContent()).then(() => {
                    cmsState = clone(window.getSiteContent());
                    cmsDirty = false;
                    renderCmsPanel();
                    if (typeof injectAdminControls === 'function') injectAdminControls();
                    if (typeof applyWifiLayoutConfig === 'function') applyWifiLayoutConfig();
                });
            } else {
                try { localStorage.setItem('mnContentLocal', JSON.stringify(cmsState)); } catch (e) {}
                if (window.SiteContent) { window.SiteContent.data = cmsState; window.applySiteContent(); }
                cmsDirty = false;
                showToast('⚠️ 云端下发失败（' + ((j && j.error) || '密钥错误') + '），已先保存到本机');
                localStorage.removeItem(CMS_TOKEN_KEY);
            }
        })
        .catch(e => {
            try { localStorage.setItem('mnContentLocal', JSON.stringify(cmsState)); } catch (e2) {}
            if (window.SiteContent) { window.SiteContent.data = cmsState; window.applySiteContent(); }
            cmsDirty = false;
            showToast('⚠️ 网络异常（' + e.message + '），已先保存到本机');
        });
};
