(function () {
  const ROOM = 'MatrixNode';
  const PUBLIC_SITE_URL = 'https://sorenskr.github.io/proxy-setup-tool-beta/';
  const API = (typeof REPORT_API_URL !== 'undefined' && REPORT_API_URL) ? REPORT_API_URL.trim() : '';
  const READ_KEY = 'inboxLastReadId';
  let messages = [];
  let timer = null;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /** 图片压缩到最大边 1280px 的 JPEG base64 */
  function compressImageFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('解析图片失败')); };
        img.onload = function () {
          const max = 1280;
          let w = img.width || 800;
          let h = img.height || 600;
          if (w > max || h > max) {
            if (w >= h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** 发送文字或图片到云端 INBOX_SUBMIT 接口 */
  async function sendInboxPayload(text, file, roomOverride) {
    if (!API) throw new Error('云端接口地址未配置');
    const body = {
      action: 'INBOX_SUBMIT',
      room: roomOverride || ROOM,
      ua: navigator.userAgent,
      text: (text || '').trim()
    };
    if (file) {
      const dataUrl = await compressImageFile(file);
      body.type = 'image';
      body.base64 = dataUrl.split(',')[1] || '';
      body.mimeType = 'image/jpeg';
      body.fileName = file.name ? file.name.replace(/\.[^.]+$/, '.jpg') : 'inbox.jpg';
    } else {
      body.type = 'text';
    }
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!j || !j.ok) {
      throw new Error((j && j.error) || '提交失败');
    }
    return j;
  }

  /** 获取手机扫码用的上传页地址（本机调试时自动指向线上 Pages 地址，保证手机 4G/WiFi 都能打开） */
  function getMobileUploadUrl() {
    const host = String(location.hostname || '');
    const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
    const base = isLocal ? PUBLIC_SITE_URL : (location.origin + location.pathname);
    return base + '?inboxpage=1&room=' + encodeURIComponent(ROOM);
  }

  /** 若手机扫码带 ?inboxpage=1 打开本页，直接渲染全屏手机上传界面 */
  function checkAndRenderStandaloneMobilePage() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return false; }
    if (params.get('inboxpage') !== '1') return false;
    const roomParam = params.get('room') || ROOM;

    document.title = '📡 内容上传';
    document.body.innerHTML = [
      '<div style="min-height:100vh;background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;padding:24px 18px;box-sizing:border-box;">',
      '  <div style="max-width:520px;margin:0 auto;">',
      '    <h2 style="margin:6px 0 6px;font-size:22px;">📡 扫码内容上传</h2>',
      '    <p style="color:#8b949e;font-size:14px;margin:0 0 18px;">发送文字或图片，电脑端右下角收件箱会自动收到</p>',
      '    <textarea id="mInboxTxt" placeholder="在此输入要发送的文字内容…" style="width:100%;min-height:140px;background:#161b22;border:1px solid #30363d;border-radius:12px;color:#e6edf3;padding:14px;font-size:16px;resize:vertical;box-sizing:border-box;"></textarea>',
      '    <label style="display:block;margin:14px 0;padding:16px;border:1px dashed #388bfd;border-radius:12px;color:#58a6ff;text-align:center;background:#0d1a2e;cursor:pointer;font-weight:600;">',
      '      📷 选择 / 拍摄图片',
      '      <input type="file" id="mInboxImg" accept="image/*" style="display:none">',
      '    </label>',
      '    <div id="mInboxPreview" style="font-size:13px;color:#8b949e;margin:6px 0;"></div>',
      '    <button id="mInboxBtn" type="button" style="width:100%;margin-top:12px;padding:15px;border:0;border-radius:12px;background:#238636;color:#fff;font-size:17px;font-weight:700;cursor:pointer;">🚀 立即发送</button>',
      '    <div id="mInboxMsg" style="margin-top:14px;font-size:14px;min-height:22px;font-weight:600;"></div>',
      '  </div>',
      '</div>'
    ].join('');

    const fileInput = document.getElementById('mInboxImg');
    const previewEl = document.getElementById('mInboxPreview');
    const txtEl = document.getElementById('mInboxTxt');
    const btnEl = document.getElementById('mInboxBtn');
    const msgEl = document.getElementById('mInboxMsg');

    function setMsg(text, ok) {
      msgEl.textContent = text;
      msgEl.style.color = ok ? '#3fb950' : '#f85149';
    }

    fileInput.onchange = function () {
      const f = this.files && this.files[0];
      previewEl.textContent = f ? ('已选择图片：' + f.name + '（约 ' + Math.round(f.size / 1024) + ' KB）') : '';
    };

    btnEl.onclick = async function () {
      const text = txtEl.value.trim();
      const file = fileInput.files && fileInput.files[0];
      if (!text && !file) {
        setMsg('⚠️ 请输入文字或选择图片后再发送', false);
        return;
      }
      btnEl.disabled = true;
      setMsg(file ? '⏳ 正在压缩并上传图片…' : '⏳ 正在发送…', true);
      try {
        await sendInboxPayload(text, file, roomParam);
        setMsg('✅ 发送成功！电脑端右下角收件箱已收到', true);
        txtEl.value = '';
        fileInput.value = '';
        previewEl.textContent = '';
      } catch (err) {
        setMsg('❌ 发送失败：' + (err && err.message ? err.message : String(err)), false);
      } finally {
        btnEl.disabled = false;
      }
    };
    return true;
  }

  window.openInboxQr = function () {
    const modal = document.getElementById('inboxQrModal');
    const box = document.getElementById('inboxQrBox');
    if (!modal || !box || !window.QRCode) return;
    modal.style.display = 'flex';
    box.innerHTML = '<div style="padding:20px;color:#999">二维码生成中…</div>';
    const url = getMobileUploadUrl();
    QRCode.toDataURL(url, { width: 240, margin: 2 }, function (err, data) {
      if (err) { box.innerHTML = '<div style="color:#FF5555">二维码生成失败</div>'; return; }
      box.innerHTML = '<img src="' + data + '" alt="上传页二维码" style="width:240px;height:240px;border-radius:12px">';
    });
  };
  window.closeInboxQr = function () {
    const m = document.getElementById('inboxQrModal'); if (m) m.style.display = 'none';
  };
  window.toggleInbox = function () {
    const panel = document.getElementById('inboxPanel');
    if (!panel) return;
    const open = panel.style.display === 'flex' || panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'flex';
    if (!open) { markAllRead(); renderInbox(); fetchInbox(); }
  };

  /** 收件箱面板内直接选图与发送 */
  window.onInboxDirectFileChange = function (input) {
    const f = input && input.files && input.files[0];
    const nameEl = document.getElementById('inboxDirectFileName');
    if (nameEl) nameEl.textContent = f ? f.name : '';
  };

  window.submitInboxDirect = async function () {
    const txtEl = document.getElementById('inboxDirectText');
    const fileEl = document.getElementById('inboxDirectFile');
    const nameEl = document.getElementById('inboxDirectFileName');
    const btnEl = document.getElementById('inboxDirectSendBtn');
    const text = txtEl ? txtEl.value.trim() : '';
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!text && !file) {
      if (typeof showToast === 'function') showToast('⚠️ 请输入文字或选择图片');
      return;
    }
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '发送中…'; }
    try {
      await sendInboxPayload(text, file, ROOM);
      if (txtEl) txtEl.value = '';
      if (fileEl) fileEl.value = '';
      if (nameEl) nameEl.textContent = '';
      if (typeof showToast === 'function') showToast('✅ 已发送到收件箱');
      await fetchInbox();
      markAllRead();
    } catch (e) {
      if (typeof showToast === 'function') showToast('❌ 发送失败：' + e.message);
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = '发送'; }
    }
  };

  function lastReadId(){ return localStorage.getItem(READ_KEY) || ''; }
  function markAllRead(){ if (messages.length) localStorage.setItem(READ_KEY, messages[0].id || ''); updateBadge(); }
  function updateBadge(){
    const badge = document.getElementById('inboxBadge'); if (!badge) return;
    const lid = lastReadId();
    const unread = messages.filter(function(m){ return !lid || m.id > lid; }).length;
    if (unread > 0){ badge.style.display=''; badge.textContent = unread>99?'99+':unread; } else badge.style.display='none';
  }

  function renderInbox(){
    const list = document.getElementById('inboxList');
    if (list) {
      if (!messages.length){
        list.innerHTML = '<div class="inbox-empty">暂无内容，可在上方直接发送或点「📱 手机扫码」上传文字/图片</div>';
      } else {
        list.innerHTML = messages.map(function(m){
          let s = '<div class="inbox-item" data-id="' + esc(m.id) + '">';
          s += '<div class="inbox-time">' + esc(m.time) + '</div>';
          if (m.type === 'image' && m.imgUrl) {
            s += '<img class="inbox-img" src="' + esc(m.imgUrl) + '" alt="图片" onclick="window.open(this.src)">';
            s += '<button type="button" class="inbox-ocr-btn" onclick="runOcr(this,\'' + esc(m.id) + '\',\'' + esc(m.imgUrl) + '\')">🔍 识别图片文字</button>';
            s += '<div class="inbox-ocr-out" id="ocr-' + esc(m.id) + '" style="display:none"></div>';
          }
          if (m.text) s += '<div class="inbox-text">' + esc(m.text).replace(/\n/g,'<br>') + '</div>';
          if (m.ocrText) s += '<div class="inbox-ocr-known">识别：' + esc(m.ocrText) + '</div>';
          s += '<button type="button" class="inbox-copy" onclick="copyInboxText(this)">📋 复制内容</button>';
          s += '</div>';
          return s;
        }).join('');
      }
    }
    renderAdminInboxTable();
  }

  function renderAdminInboxTable(){
    const tbody = document.getElementById('adminInboxTbody');
    if (!tbody) return;
    if (!messages.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">暂无收件箱消息（扫码上传文字或图片后自动同步至此）</td></tr>';
      return;
    }
    tbody.innerHTML = messages.map(function(m){
      const isImg = m.type === 'image' && m.imgUrl;
      const typeLabel = isImg ? '📷 图片' : '📝 文字';
      const thumbHtml = isImg
        ? '<img src="' + esc(m.imgUrl) + '" alt="缩略图" style="height:46px;max-width:90px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--glass-border)" onclick="window.open(this.src)">'
        : '<span style="color:var(--text-muted)">—</span>';
      const linkHtml = isImg
        ? '<a href="' + esc(m.imgUrl) + '" target="_blank" rel="noopener noreferrer" class="text-link">查看原图</a>'
        : '<span style="color:var(--text-muted)">—</span>';
      return '<tr>' +
        '<td style="white-space:nowrap;font-family:Consolas,monospace;font-size:12px;">' + esc(m.time || '') + '</td>' +
        '<td style="white-space:nowrap;">' + typeLabel + '</td>' +
        '<td style="max-width:260px;white-space:pre-wrap;word-break:break-word;">' + (m.text ? esc(m.text) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td>' + thumbHtml + '</td>' +
        '<td style="max-width:260px;white-space:pre-wrap;word-break:break-word;">' + (m.ocrText ? esc(m.ocrText) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td style="white-space:nowrap;">' + linkHtml + '</td>' +
      '</tr>';
    }).join('');
  }

  window.copyInboxText = function(btn){
    const item = btn.closest('.inbox-item');
    const t = item.querySelector('.inbox-text');
    let out = t ? t.innerText : '';
    const o = item.querySelector('.inbox-ocr-out, .inbox-ocr-known');
    if (o && o.offsetParent !== null) out += '\n' + o.innerText.replace(/^识别：/,'');
    const done = function(){ (typeof showToast==='function') ? showToast('已复制') : alert('已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out.trim()).then(done, fallback);
    else fallback();
    function fallback(){ var ta=document.createElement('textarea'); ta.value=out; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');done();}catch(e){} ta.remove(); }
  };

  window.runOcr = function(btn, id, imgUrl){
    const out = document.getElementById('ocr-' + id);
    if (!window.Tesseract){ alert('OCR 库未加载'); return; }
    btn.disabled = true; btn.textContent = '识别中…（首次需下载中文语言包）';
    out.style.display = 'block'; out.textContent = '正在识别…';
    window.Tesseract.recognize(imgUrl, 'chi_sim+eng', {})
      .then(function(res){
        const text = (res && res.data && res.data.text ? res.data.text : '').trim();
        out.textContent = text || '（没识别到文字）';
        btn.textContent = '🔍 重新识别'; btn.disabled = false;
        const found = messages.find(function(x){ return x && x.id === id; });
        if (found) { found.ocrText = text; renderAdminInboxTable(); }
        return fetch(API, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({ action:'INBOX_OCR', room:ROOM, id:id, ocrText:text }) });
      })
      .catch(function(e){ out.textContent='识别失败：'+e.message; btn.textContent='🔍 识别图片文字'; btn.disabled=false; });
  };

  async function fetchInbox(){
    if (!API) return;
    try {
      const r = await fetch(API + '?action=inbox&room=' + encodeURIComponent(ROOM) + '&t=' + Date.now(), { cache:'no-store' });
      const j = await r.json();
      if (j.ok && Array.isArray(j.messages)) { messages = j.messages; renderInbox(); updateBadge(); }
    } catch (e) {}
  }

  window.refreshAdminInbox = function(){
    fetchInbox().then(function(){
      if (typeof showToast === 'function') showToast('📨 收件箱已同步');
    });
  };

  window.initInbox = function(){
    if (checkAndRenderStandaloneMobilePage()) return;
    fetchInbox();
    timer = setInterval(fetchInbox, 15000);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) fetchInbox(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initInbox);
  else window.initInbox();
})();
