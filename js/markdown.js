/* ============================================================
 * markdown.js —— 极简 Markdown 渲染器（零依赖，离线可用）
 * 供后台「使用教程」编辑器使用：
 *   - 内容里带 HTML 标签  → 按 HTML 原样渲染（兼容旧教程）
 *   - 否则按 Markdown 渲染
 * 支持语法：
 *   # / ## / ###  标题（对应 h3 / h4 / h5）
 *   **加粗**  *斜体*  `代码`  [文字](链接)
 *   - 列表项 / 1. 列表项
 *   > 引用
 *   --- 分割线
 *   :::success 绿色提示框（可带标题）  :::warning 红色警告框  ::: 结束
 * ============================================================ */
(function () {
    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function inline(s) {
        return esc(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    window.isHtmlContent = function (text) {
        return /<(h\d|div|p|ul|ol|li|strong|b|em|i|code|a|br|span|table|blockquote|section|img)\b/i.test(String(text || ''));
    };

    window.mdToHtml = function (md) {
        const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
        let html = '';
        let listType = null;   // 'ul' | 'ol'
        let inQuote = false;
        let boxType = null;    // 'success' | 'warning'
        let boxStarted = false;

        const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
        const closeQuote = () => { if (inQuote) { html += '</blockquote>'; inQuote = false; } };
        const closeBox = () => { if (boxType) { html += '</div>'; boxType = null; boxStarted = false; } };
        const closeAll = () => { closeList(); closeQuote(); closeBox(); };

        for (const raw of lines) {
            const line = raw.replace(/\s+$/, '');

            // ::: 提示框语法
            const boxOpen = line.match(/^:::(success|warning)\s*(.*)$/);
            if (boxOpen) {
                closeAll();
                boxType = boxOpen[1];
                html += `<div class="${boxType}-box">`;
                if (boxOpen[2].trim()) html += `<strong>${inline(boxOpen[2].trim())}</strong><br>`;
                boxStarted = true;
                continue;
            }
            if (/^:::\s*$/.test(line.trim())) { closeList(); closeQuote(); closeBox(); continue; }

            if (boxType) {
                if (line.trim()) html += `${boxStarted ? '' : ''}<span style="display:block;">${inline(line.trim())}</span>`;
                boxStarted = false;
                continue;
            }

            // 空行
            if (!line.trim()) { closeList(); closeQuote(); continue; }

            // 分割线
            if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeAll(); html += '<hr>'; continue; }

            // 标题
            const h = line.match(/^(#{1,4})\s+(.*)$/);
            if (h) {
                closeAll();
                const tag = h[1].length === 1 ? 'h3' : (h[1].length === 2 ? 'h4' : 'h5');
                html += `<${tag}>${inline(h[2].trim())}</${tag}>`;
                continue;
            }

            // 引用
            const q = line.match(/^>\s?(.*)$/);
            if (q) {
                closeList(); closeBox();
                if (!inQuote) { html += '<blockquote>'; inQuote = true; }
                html += `<p>${inline(q[1])}</p>`;
                continue;
            }
            closeQuote();

            // 列表
            const ul = line.match(/^\s*[-*+]\s+(.*)$/);
            const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
            if (ul || ol) {
                closeBox();
                const want = ul ? 'ul' : 'ol';
                if (listType !== want) {
                    closeList();
                    html += `<${want}>`;
                    listType = want;
                }
                html += `<li>${inline((ul || ol)[1])}</li>`;
                continue;
            }
            closeList();

            // 普通段落（每个非空行一个段落，回车即换行，符合直觉）
            html += `<p>${inline(line.trim())}</p>`;
        }
        closeAll();
        return html;
    };

    /** 教程内容统一渲染入口：HTML 原样，Markdown 转换 */
    window.renderGuideContent = function (raw) {
        const text = String(raw || '');
        if (!text.trim()) return '';
        return window.isHtmlContent(text) ? text : window.mdToHtml(text);
    };
})();
