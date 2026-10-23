(function () {
  const ROOM = 'MatrixNode';
  const PUBLIC_SITE_URL = 'https://sorenskr.github.io/proxy-setup-tool-beta/';
  const API = (typeof REPORT_API_URL !== 'undefined' && REPORT_API_URL) ? REPORT_API_URL.trim() : '';
  const NET_ERR_MSG = '请开启代理后重试（网络不可达，请确认已挂代理后重试）';
  const OCR_ERR_MSG = '识别失败，请换清晰图或手动输入';

  // 仅保存当前浏览器页面本次会话发送的消息（内存态，刷新或关闭标签页即清空，不持久化）
  let sessionMessages = [];
  // 审计大屏「扫码收件箱 (MN_Inbox)」全量云端备份列表（仅在展开大屏区块或点击刷新时拉取）
  let adminMessages = [];
  let directPastedFile = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 从各种 Google Drive 链接中提取文件 ID */
  function extractDriveFileId(url) {
    if (!url) return '';
    const s = String(url).trim();
    let m = /[?&]id=([a-zA-Z0-9_-]{10,})/.exec(s);
    if (m) return m[1];
    m = /\/file\/d\/([a-zA-Z0-9_-]{10,})/.exec(s);
    if (m) return m[1];
    m = /googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/.exec(s);
    if (m) return m[1];
    return '';
  }

  /**
   * 将 Google Drive 的 uc?export=view 链接转为支持 <img> 直接渲染和 CORS 的 lh3 直链
   * 解决 Google Drive 303 跳转被浏览器 Cross-Origin-Resource-Policy 拦截导致图片看不见的问题
   */
  window.normalizeInboxImgUrl = function (url) {
    if (!url) return '';
    const s = String(url).trim();
    if (!s) return '';
    if (s.startsWith('data:image/')) return s;
    const id = extractDriveFileId(s);
    if (id) {
      return 'https://lh3.googleusercontent.com/d/' + id;
    }
    return s;
  };

  /** 图片加载失败时自动尝试备用缩略图直链 */
  window.onInboxImgError = function (imgEl, rawUrl, localBackup) {
    if (!imgEl) return;
    if (localBackup && imgEl.src !== localBackup) {
      imgEl.src = localBackup;
      return;
    }
    const step = parseInt(imgEl.getAttribute('data-fallback-step') || '0', 10);
    const id = extractDriveFileId(rawUrl || imgEl.src);
    if (id && step === 0) {
      imgEl.setAttribute('data-fallback-step', '1');
      imgEl.src = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
      return;
    }
    if (id && step === 1) {
      imgEl.setAttribute('data-fallback-step', '2');
      imgEl.src = 'https://drive.google.com/uc?export=view&id=' + id;
    }
  };

  /** 格式化时间字符串（兼容 ISO 时间戳与本地时间字符串） */
  function formatInboxTime(t) {
    if (!t) return '';
    const s = String(t).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const bj = new Date(d.getTime() + 8 * 3600 * 1000);
        const p = function (n) { return String(n).padStart(2, '0'); };
        return bj.getUTCFullYear() + '/' + p(bj.getUTCMonth() + 1) + '/' + p(bj.getUTCDate()) +
          ' ' + p(bj.getUTCHours()) + ':' + p(bj.getUTCMinutes()) + ':' + p(bj.getUTCSeconds());
      }
    }
    return s;
  }

  function nowLocalTimeStr() {
    if (typeof window.getChinaTime === 'function') return window.getChinaTime();
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /** 带超时控制的 fetch，网络异常时统一转换为友好提示 */
  async function fetchWithTimeout(url, options, timeoutMs) {
    const ms = timeoutMs || 20000;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    try {
      const opts = Object.assign({}, options || {});
      if (ctrl) opts.signal = ctrl.signal;
      return await fetch(url, opts);
    } catch (err) {
      throw new Error(NET_ERR_MSG);
    } finally {
      if (tid) clearTimeout(tid);
    }
  }

  function friendlyErrorMsg(err) {
    const raw = (err && err.message) ? String(err.message) : String(err || '');
    if (!raw ||
        raw === NET_ERR_MSG ||
        /failed to fetch|networkerror|load failed|abort|timeout|network request failed|fetch/i.test(raw)) {
      return NET_ERR_MSG;
    }
    return raw;
  }

  /** 图片高清压缩（最大边 1800px，JPEG 质量 0.90，保证 OCR 中文小字清晰不糊） */
  function compressImageFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('解析图片失败')); };
        img.onload = function () {
          const max = 1800;
          let w = img.width || 1000;
          let h = img.height || 800;
          if (w > max || h > max) {
            if (w >= h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.90));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** 发送文字、图片或图文组合到云端 INBOX_SUBMIT 接口（后台照常写入 Google 表格 MN_Inbox 备份） */
  async function sendInboxPayload(text, file, roomOverride) {
    if (!API) throw new Error('云端接口地址未配置');
    const cleanText = (text || '').trim();
    const body = {
      action: 'INBOX_SUBMIT',
      room: roomOverride || ROOM,
      ua: navigator.userAgent,
      text: cleanText
    };
    let localDataUrl = '';
    if (file) {
      localDataUrl = await compressImageFile(file);
      body.type = 'image';
      body.base64 = localDataUrl.split(',')[1] || '';
      body.mimeType = 'image/jpeg';
      body.fileName = file.name ? file.name.replace(/\.[^.]+$/, '.jpg') : 'inbox.jpg';
    } else {
      body.type = 'text';
    }
    const r = await fetchWithTimeout(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }, 25000);
    let j = null;
    try {
      j = await r.json();
    } catch (e) {
      throw new Error(NET_ERR_MSG);
    }
    if (!j || !j.ok) {
      throw new Error((j && j.error) || '提交失败');
    }
    return {
      ok: true,
      message: j.message || null,
      localDataUrl: localDataUrl,
      text: cleanText
    };
  }

  /**
   * 获取手机扫码用的静态短地址（直接指向本站 /inbox.html，避免 script.google.com 超长 302 链接导致 iOS Safari 报错）
   */
  function getMobileUploadUrl() {
    const host = String(location.hostname || '');
    const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
    let base = isLocal ? PUBLIC_SITE_URL : (location.origin + location.pathname);
    base = base.replace(/\/(?:index|inbox)\.html?$/i, '/');
    if (!base.endsWith('/')) base += '/';
    return base + 'inbox.html';
  }

  /** 兼容旧版带 ?inboxpage=1 的二维码链接，自动渲染移动端上传页 */
  function checkAndRenderStandaloneMobilePage() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return false; }
    if (params.get('inboxpage') !== '1') return false;
    const roomParam = params.get('room') || ROOM;

    try {
      const v = document.getElementById('bgVideo');
      if (v) { v.pause(); v.removeAttribute('src'); }
      const a = document.getElementById('bgAudio');
      if (a) { a.pause(); a.removeAttribute('src'); }
    } catch (e) {}

    document.title = '📡 扫码传内容';
    document.body.innerHTML = [
      '<div id="mInboxRoot" style="min-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;padding:20px 16px 12px;box-sizing:border-box;-webkit-text-size-adjust:100%;">',
      '  <div style="width:100%;max-width:520px;margin:0 auto;">',
      '    <div style="display:flex;align-items:center;gap:8px;margin:4px 0 6px;">',
      '      <span style="font-size:22px;">📡</span>',
      '      <h2 style="margin:0;font-size:20px;font-weight:700;color:#f0f6fc;">扫码传内容</h2>',
      '    </div>',
      '    <p style="color:#8b949e;font-size:13.5px;margin:0 0 16px;line-height:1.45;">文字与图片可在下方同一窗口直接发送（支持纯文字、纯图片或图文一起发）</p>',
      '    <div style="background:#161b22;border:1px solid #30363d;border-radius:14px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);">',
      '      <textarea id="mInboxTxt" placeholder="在此输入文字内容（也可直接选择下方图片一起发送）…" style="width:100%;min-height:130px;background:transparent;border:0;color:#e6edf3;padding:4px 2px;font-size:16px;line-height:1.5;resize:vertical;box-sizing:border-box;outline:none;font-family:inherit;"></textarea>',
      '      <div id="mInboxPreviewWrap" style="display:none;align-items:center;gap:10px;margin-top:8px;padding:8px 10px;background:#0d1117;border:1px solid #30363d;border-radius:10px;">',
      '        <img id="mInboxPreviewImg" src="" alt="预览" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #30363d;flex-shrink:0;">',
      '        <div id="mInboxPreviewName" style="flex:1;font-size:12.5px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>',
      '        <button type="button" id="mInboxClearImg" style="background:transparent;border:0;color:#8b949e;font-size:16px;padding:4px 8px;cursor:pointer;">✕</button>',
      '      </div>',
      '      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #21262d;">',
      '        <label style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border:1px dashed #388bfd;border-radius:10px;color:#58a6ff;background:#0d1a2e;cursor:pointer;font-size:14px;font-weight:600;user-select:none;">',
      '          📎 添加图片',
      '          <input type="file" id="mInboxImg" accept="image/*" style="display:none">',
      '        </label>',
      '        <button id="mInboxBtn" type="button" style="flex:1;max-width:180px;padding:11px 18px;border:0;border-radius:10px;background:#238636;color:#fff;font-size:15.5px;font-weight:700;cursor:pointer;">🚀 发送</button>',
      '      </div>',
      '    </div>',
      '    <div id="mInboxMsg" style="margin-top:14px;font-size:14px;min-height:22px;font-weight:600;line-height:1.45;"></div>',
      '  </div>',
      '  <div style="width:100%;max-width:520px;margin:24px auto 0;text-align:right;">',
      '    <a href="https://drop.lol" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#6e7681;opacity:0.45;text-decoration:none;user-select:none;">drop.lol</a>',
      '  </div>',
      '</div>'
    ].join('');

    const fileInput = document.getElementById('mInboxImg');
    const previewWrap = document.getElementById('mInboxPreviewWrap');
    const previewImg = document.getElementById('mInboxPreviewImg');
    const previewName = document.getElementById('mInboxPreviewName');
    const clearBtn = document.getElementById('mInboxClearImg');
    const txtEl = document.getElementById('mInboxTxt');
    const btnEl = document.getElementById('mInboxBtn');
    const msgEl = document.getElementById('mInboxMsg');
    let selectedFile = null;

    function setMsg(text, ok) {
      msgEl.textContent = text;
      msgEl.style.color = ok ? '#3fb950' : '#f85149';
    }

    function updateMobilePreview(file) {
      selectedFile = file || null;
      if (!selectedFile) {
        previewWrap.style.display = 'none';
        previewImg.removeAttribute('src');
        previewName.textContent = '';
        fileInput.value = '';
        return;
      }
      previewWrap.style.display = 'flex';
      previewName.textContent = selectedFile.name + ' (' + Math.max(1, Math.round(selectedFile.size / 1024)) + ' KB)';
      try {
        previewImg.src = URL.createObjectURL(selectedFile);
      } catch (e) {}
    }

    fileInput.onchange = function () {
      const f = this.files && this.files[0];
      updateMobilePreview(f || null);
    };

    clearBtn.onclick = function () {
      updateMobilePreview(null);
    };

    txtEl.addEventListener('paste', function (e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          const f = items[i].getAsFile();
          if (f) updateMobilePreview(f);
          break;
        }
      }
    });

    btnEl.onclick = async function () {
      const text = txtEl.value.trim();
      const file = selectedFile || (fileInput.files && fileInput.files[0]);
      if (!text && !file) {
        setMsg('⚠️ 请输入文字或添加图片后再发送', false);
        return;
      }
      btnEl.disabled = true;
      btnEl.style.opacity = '0.6';
      setMsg(file ? '⏳ 正在高清处理并上传内容…' : '⏳ 正在发送…', true);
      try {
        await sendInboxPayload(text, file, roomParam);
        setMsg('✅ 发送成功！已写入云端收件箱备份', true);
        txtEl.value = '';
        updateMobilePreview(null);
      } catch (err) {
        setMsg('❌ ' + friendlyErrorMsg(err), false);
      } finally {
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
      }
    };
    return true;
  }

  /* ---------------- 弹窗开闭动画（淡入淡出 + 轻微缩放 200ms） ---------------- */
  function openAnimatedModal(el, displayMode) {
    if (!el) return;
    if (el._hideTimer) { clearTimeout(el._hideTimer); el._hideTimer = null; }
    el.style.display = displayMode || 'flex';
    void el.offsetWidth;
    el.classList.add('is-open');
  }

  function closeAnimatedModal(el) {
    if (!el) return;
    el.classList.remove('is-open');
    if (el._hideTimer) clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      if (!el.classList.contains('is-open')) {
        el.style.display = 'none';
      }
    }, 210);
  }

  window.openInboxQr = function () {
    const modal = document.getElementById('inboxQrModal');
    const box = document.getElementById('inboxQrBox');
    if (!modal || !box || !window.QRCode) return;
    openAnimatedModal(modal, 'flex');
    box.innerHTML = '<div style="padding:20px;color:#999">二维码生成中…</div>';
    const url = getMobileUploadUrl();
    QRCode.toDataURL(url, { width: 240, margin: 2 }, function (err, data) {
      if (err) { box.innerHTML = '<div style="color:#FF5555">二维码生成失败</div>'; return; }
      box.innerHTML = '<img src="' + data + '" alt="上传页二维码" style="width:240px;height:240px;border-radius:12px;display:block;">';
    });
  };

  window.closeInboxQr = function () {
    closeAnimatedModal(document.getElementById('inboxQrModal'));
  };

  window.openInboxImgModal = function (url) {
    const modal = document.getElementById('inboxImgPreviewModal');
    const img = document.getElementById('inboxImgPreviewTarget');
    const link = document.getElementById('inboxImgOriginLink');
    const norm = window.normalizeInboxImgUrl(url);
    if (!modal || !img) {
      window.open(norm || url, '_blank');
      return;
    }
    img.setAttribute('data-fallback-step', '0');
    img.onerror = function () { window.onInboxImgError(img, url); };
    img.src = norm;
    if (link) link.href = norm || url;
    openAnimatedModal(modal, 'flex');
  };

  window.closeInboxImgModal = function () {
    closeAnimatedModal(document.getElementById('inboxImgPreviewModal'));
  };

  window.toggleInbox = function () {
    const panel = document.getElementById('inboxPanel');
    if (!panel) return;
    const isOpen = panel.classList.contains('is-open') && panel.style.display !== 'none';
    if (isOpen) {
      closeAnimatedModal(panel);
    } else {
      openAnimatedModal(panel, 'flex');
      renderInbox();
    }
  };

  /* ---------------- 收件箱面板内一体化选图、粘贴图片与发送 ---------------- */
  function updateDirectPreview(file) {
    directPastedFile = file || null;
    const wrap = document.getElementById('inboxDirectPreviewWrap');
    const img = document.getElementById('inboxDirectPreviewImg');
    const nameEl = document.getElementById('inboxDirectFileName');
    const fileEl = document.getElementById('inboxDirectFile');
    if (!directPastedFile) {
      if (wrap) wrap.style.display = 'none';
      if (img) img.removeAttribute('src');
      if (nameEl) nameEl.textContent = '';
      if (fileEl) fileEl.value = '';
      return;
    }
    if (wrap) wrap.style.display = 'flex';
    if (nameEl) nameEl.textContent = directPastedFile.name + ' (' + Math.max(1, Math.round(directPastedFile.size / 1024)) + ' KB)';
    if (img) {
      try { img.src = URL.createObjectURL(directPastedFile); } catch (e) {}
    }
  }

  window.onInboxDirectFileChange = function (input) {
    const f = input && input.files && input.files[0];
    updateDirectPreview(f || null);
  };

  window.clearInboxDirectFile = function () {
    updateDirectPreview(null);
  };

  function setDirectStatus(msg, isErr) {
    const el = document.getElementById('inboxDirectStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'inbox-composer-status' + (msg ? (isErr ? ' is-err' : ' is-ok') : '');
  }

  window.submitInboxDirect = async function () {
    const txtEl = document.getElementById('inboxDirectText');
    const fileEl = document.getElementById('inboxDirectFile');
    const btnEl = document.getElementById('inboxDirectSendBtn');
    const text = txtEl ? txtEl.value.trim() : '';
    const file = directPastedFile || (fileEl && fileEl.files && fileEl.files[0]);
    if (!text && !file) {
      setDirectStatus('请输入文字或添加图片', true);
      if (typeof showToast === 'function') showToast('⚠️ 请输入文字或添加图片');
      return;
    }
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '发送中…'; }
    setDirectStatus(file ? '正在上传…' : '正在发送…', false);
    try {
      const res = await sendInboxPayload(text, file, ROOM);
      const serverMsg = (res && res.message) || {};
      const newMsg = {
        id: serverMsg.id || ('local_' + Date.now()),
        time: serverMsg.time || nowLocalTimeStr(),
        type: serverMsg.type || (file ? 'image' : 'text'),
        text: serverMsg.text !== undefined ? serverMsg.text : text,
        imgUrl: serverMsg.imgUrl || res.localDataUrl || '',
        localDataUrl: res.localDataUrl || '',
        ocrText: ''
      };
      // 仅将本次会话本页面发送成功的消息追加到当前页面对话框列表（不拉取全房间历史）
      sessionMessages.unshift(newMsg);
      renderInbox();

      if (txtEl) txtEl.value = '';
      updateDirectPreview(null);
      setDirectStatus('✅ 已发送', false);
      setTimeout(function () { setDirectStatus('', false); }, 2500);
      if (typeof showToast === 'function') showToast('✅ 已发送（本会话可见，云端已备份）');
    } catch (e) {
      const msg = friendlyErrorMsg(e);
      setDirectStatus(msg, true);
      if (typeof showToast === 'function') showToast('❌ ' + msg);
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = '发送'; }
    }
  };

  /** 渲染右下角收件箱面板（仅展示当前页面本次会话发送的 sessionMessages，刷新即清空） */
  function renderInbox() {
    const list = document.getElementById('inboxList');
    if (!list) return;
    if (!sessionMessages.length) {
      list.innerHTML = '<div class="inbox-empty">本次会话暂无发送内容（仅显示本页当前会话发送的消息，刷新页面自动清空；所有记录均已在后台云端表格备份）</div>';
      return;
    }
    list.innerHTML = sessionMessages.map(function (m) {
      const displayImgRaw = m.localDataUrl || m.imgUrl || '';
      const hasImg = Boolean(displayImgRaw);
      const normImg = hasImg ? window.normalizeInboxImgUrl(displayImgRaw) : '';
      const fullImgTarget = m.imgUrl || m.localDataUrl || '';
      const timeText = formatInboxTime(m.time);
      let s = '<div class="inbox-item" data-id="' + esc(m.id) + '">';
      s += '<div class="inbox-time">' + esc(timeText) + '</div>';
      if (m.text !== undefined && m.text !== null && String(m.text).trim() !== '') {
        s += '<div class="inbox-text">' + esc(m.text).replace(/\n/g, '<br>') + '</div>';
      }
      if (hasImg) {
        s += '<img class="inbox-img" src="' + esc(normImg) + '" referrerpolicy="no-referrer" alt="收件箱图片" title="点击查看大图" onerror="window.onInboxImgError(this,\'' + esc(m.imgUrl || '') + '\')" onclick="openInboxImgModal(\'' + esc(fullImgTarget) + '\')">';
        s += '<button type="button" class="inbox-ocr-btn" onclick="runOcr(this,\'' + esc(m.id) + '\',\'' + esc(displayImgRaw) + '\')">🔍 识别图片文字</button>';
        s += '<div class="inbox-ocr-out" id="ocr-' + esc(m.id) + '" style="display:none"></div>';
      }
      if (m.ocrText) {
        s += '<div class="inbox-ocr-known">识别：' + esc(m.ocrText) + '</div>';
      }
      s += '<button type="button" class="inbox-copy" onclick="copyInboxText(this)">📋 复制内容</button>';
      s += '</div>';
      return s;
    }).join('');
  }

  /** 渲染审计大屏里的后台全量 MN_Inbox 备份表 */
  function renderAdminInboxTable() {
    const tbody = document.getElementById('adminInboxTbody');
    if (!tbody) return;
    if (!adminMessages.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">暂无收件箱消息（点击右上角「🔄 刷新收件箱」同步 Google 表格 MN_Inbox 全量备份）</td></tr>';
      return;
    }
    tbody.innerHTML = adminMessages.map(function (m) {
      const hasImg = Boolean(m.imgUrl);
      const hasTxt = m.text !== undefined && m.text !== null && String(m.text).trim() !== '';
      const normImg = hasImg ? window.normalizeInboxImgUrl(m.imgUrl) : '';
      const typeLabel = (hasImg && hasTxt) ? '🖼️ 图文' : (hasImg ? '📷 图片' : '📝 文字');
      const thumbHtml = hasImg
        ? '<img src="' + esc(normImg) + '" referrerpolicy="no-referrer" alt="缩略图" title="点击查看大图" style="height:46px;max-width:90px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--glass-border)" onerror="window.onInboxImgError(this,\'' + esc(m.imgUrl) + '\')" onclick="openInboxImgModal(\'' + esc(m.imgUrl) + '\')">'
        : '<span style="color:var(--text-muted)">—</span>';
      const linkHtml = hasImg
        ? '<a href="javascript:void(0)" onclick="openInboxImgModal(\'' + esc(m.imgUrl) + '\')" class="text-link">查看大图</a>'
        : '<span style="color:var(--text-muted)">—</span>';
      return '<tr>' +
        '<td style="white-space:nowrap;font-family:Consolas,monospace;font-size:12px;">' + esc(formatInboxTime(m.time || '')) + '</td>' +
        '<td style="white-space:nowrap;">' + typeLabel + '</td>' +
        '<td style="max-width:260px;white-space:pre-wrap;word-break:break-word;">' + (hasTxt ? esc(m.text) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td>' + thumbHtml + '</td>' +
        '<td style="max-width:260px;white-space:pre-wrap;word-break:break-word;">' + (m.ocrText ? esc(m.ocrText) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td style="white-space:nowrap;">' + linkHtml + '</td>' +
      '</tr>';
    }).join('');
  }

  window.copyInboxText = function (btn) {
    const item = btn.closest('.inbox-item');
    const t = item.querySelector('.inbox-text');
    let out = t ? t.innerText : '';
    const o = item.querySelector('.inbox-ocr-out, .inbox-ocr-known');
    if (o && o.offsetParent !== null && !o.classList.contains('is-err')) {
      out += (out ? '\n' : '') + o.innerText.replace(/^识别：/, '');
    }
    const textToCopy = out.trim();
    if (!textToCopy) {
      if (typeof showToast === 'function') showToast('⚠️ 当前暂无可复制的文字，请先识别图片文字');
      return;
    }
    const done = function () { (typeof showToast === 'function') ? showToast('✅ 已复制内容') : alert('已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textToCopy).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = textToCopy;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  };

  /**
   * 预处理图片为本地高清 Canvas DataURL（自动放大过小图片、开启 CORS），
   * 彻底解决 Google Drive 图片在 Tesseract Web Worker 中跨域加载失败的问题
   */
  function prepareImageForOcr(rawImgUrl) {
    if (rawImgUrl && String(rawImgUrl).startsWith('data:image/')) {
      return Promise.resolve(rawImgUrl);
    }
    const normUrl = window.normalizeInboxImgUrl(rawImgUrl);
    const id = extractDriveFileId(rawImgUrl);
    const candidates = [normUrl];
    if (id) {
      candidates.push('https://drive.google.com/thumbnail?id=' + id + '&sz=w1600');
    }

    function tryLoad(idx) {
      return new Promise(function (resolve, reject) {
        if (idx >= candidates.length) {
          reject(new Error('图片加载失败'));
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';
        const t = setTimeout(function () {
          img.onload = null; img.onerror = null;
          tryLoad(idx + 1).then(resolve, reject);
        }, 12000);
        img.onload = function () {
          clearTimeout(t);
          try {
            let w = img.naturalWidth || img.width || 800;
            let h = img.naturalHeight || img.height || 600;
            if (w < 1200) {
              const scale = Math.min(2.5, 1200 / Math.max(1, w));
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/png'));
          } catch (e) {
            tryLoad(idx + 1).then(resolve, reject);
          }
        };
        img.onerror = function () {
          clearTimeout(t);
          tryLoad(idx + 1).then(resolve, reject);
        };
        img.src = candidates[idx] + (candidates[idx].indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
      });
    }
    return tryLoad(0);
  }

  /** 执行中文+英文 OCR 识别（优先高速 chi_sim 语言包镜像，失败明确提示） */
  window.runOcr = async function (btn, id, imgUrl) {
    const out = document.getElementById('ocr-' + id);
    if (!out) return;
    if (!window.Tesseract) {
      out.style.display = 'block';
      out.className = 'inbox-ocr-out is-err';
      out.textContent = OCR_ERR_MSG;
      if (typeof showToast === 'function') showToast('⚠️ ' + OCR_ERR_MSG);
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ 正在加载图片…';
    out.style.display = 'block';
    out.className = 'inbox-ocr-out';
    out.textContent = '正在读取高清图片并加载中文识别引擎 (chi_sim)…';

    try {
      const sourceDataUrl = await prepareImageForOcr(imgUrl);

      const recognizeWithLangPath = function (langPathUrl) {
        return window.Tesseract.recognize(sourceDataUrl, 'chi_sim+eng', {
          langPath: langPathUrl,
          logger: function (m) {
            if (!m || !m.status) return;
            const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
            if (m.status.indexOf('loading language') !== -1) {
              btn.textContent = '⏳ 加载中文包 ' + pct + '%';
              out.textContent = '正在加载中文语言包 (chi_sim)：' + pct + '%…';
            } else if (m.status.indexOf('recognizing') !== -1) {
              btn.textContent = '🔍 识别中 ' + pct + '%';
              out.textContent = '正在识别图片文字：' + pct + '%…';
            }
          }
        });
      };

      let res;
      try {
        res = await recognizeWithLangPath('https://tessdata.projectnaptha.com/4.0.0_fast');
      } catch (e1) {
        res = await recognizeWithLangPath('https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast');
      }

      const rawText = (res && res.data && res.data.text ? res.data.text : '');
      const cleanedText = rawText
        .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
        .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
        .trim();

      if (!cleanedText) {
        out.className = 'inbox-ocr-out is-err';
        out.textContent = OCR_ERR_MSG;
        btn.textContent = '🔍 重新识别';
        btn.disabled = false;
        if (typeof showToast === 'function') showToast('⚠️ ' + OCR_ERR_MSG);
        return;
      }

      out.className = 'inbox-ocr-out';
      out.textContent = cleanedText;
      btn.textContent = '🔍 重新识别';
      btn.disabled = false;

      const foundSession = sessionMessages.find(function (x) { return x && x.id === id; });
      if (foundSession) foundSession.ocrText = cleanedText;
      const foundAdmin = adminMessages.find(function (x) { return x && x.id === id; });
      if (foundAdmin) {
        foundAdmin.ocrText = cleanedText;
        renderAdminInboxTable();
      }
      if (API) {
        fetchWithTimeout(API, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'INBOX_OCR', room: ROOM, id: id, ocrText: cleanedText })
        }, 15000).catch(function () {});
      }
    } catch (err) {
      out.className = 'inbox-ocr-out is-err';
      out.textContent = OCR_ERR_MSG;
      btn.textContent = '🔍 重新识别';
      btn.disabled = false;
      if (typeof showToast === 'function') showToast('⚠️ ' + OCR_ERR_MSG);
    }
  };

  /** 仅供审计大屏拉取 MN_Inbox 全量备份列表，不影响右下角当前会话对话框 */
  async function fetchAdminInbox(showErrToast) {
    if (!API) return;
    try {
      const r = await fetchWithTimeout(
        API + '?action=inbox&room=' + encodeURIComponent(ROOM) + '&t=' + Date.now(),
        { cache: 'no-store' },
        18000
      );
      const j = await r.json();
      if (j && j.ok && Array.isArray(j.messages)) {
        adminMessages = j.messages;
        renderAdminInboxTable();
      }
    } catch (e) {
      if (showErrToast && typeof showToast === 'function') {
        showToast('❌ ' + NET_ERR_MSG);
      }
    }
  }

  window.refreshAdminInbox = function (silent) {
    fetchAdminInbox(!silent).then(function () {
      if (!silent && typeof showToast === 'function') showToast('📨 收件箱云端备份已同步');
    });
  };

  window.initInbox = function () {
    if (checkAndRenderStandaloneMobilePage()) return;

    // 支持在收件箱输入框直接 Ctrl+V 粘贴截图
    const directTxt = document.getElementById('inboxDirectText');
    if (directTxt) {
      directTxt.addEventListener('paste', function (e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image') !== -1) {
            const f = items[i].getAsFile();
            if (f) updateDirectPreview(f);
            break;
          }
        }
      });
    }

    // 初始渲染本会话空状态（不再自动轮询或拉取全房间消息）
    renderInbox();
    renderAdminInboxTable();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initInbox);
  else window.initInbox();
})();
