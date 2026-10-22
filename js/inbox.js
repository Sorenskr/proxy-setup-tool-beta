(function () {
  const ROOM = 'MatrixNode';
  const API = (typeof REPORT_API_URL !== 'undefined' && REPORT_API_URL) ? REPORT_API_URL.trim() : '';
  const READ_KEY = 'inboxLastReadId';
  let messages = [];
  let timer = null;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  window.openInboxQr = function () {
    const modal = document.getElementById('inboxQrModal');
    const box = document.getElementById('inboxQrBox');
    if (!modal || !box || !window.QRCode) return;
    modal.style.display = 'flex';
    box.innerHTML = '<div style="padding:20px;color:#999">二维码生成中…</div>';
    const url = API + '?action=inboxpage&room=' + encodeURIComponent(ROOM);
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
    const open = panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'block';
    if (!open) { markAllRead(); renderInbox(); }
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
        list.innerHTML = '<div class="inbox-empty">暂无内容，扫码发送的文字/图片会出现在这里</div>';
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
    fetchInbox();
    timer = setInterval(fetchInbox, 15000);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) fetchInbox(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initInbox);
  else window.initInbox();
})();

