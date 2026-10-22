// ================== 独立解耦的使用教程数据中心 ==================
// 若后台（Google Apps Script）下发了自定义教程内容，则优先渲染远程版本
const guideTemplateHTML = `
    <div class="guide-section help-content">
        <h3>🎯 矩阵系统概述与安全定调</h3>
        <p>MatrixNode 中枢系统是我们为了应对高强度跨境账号矩阵运营而量身定制的节点分发引擎。系统采用<strong>全本地沙盒解析架构</strong>，所有的节点格式化、加密协议转换全部在你当前浏览器的物理内存中完成，绝不触碰任何第三方服务器。咱们团队主打安全透明，这套系统的核心就是为了缩短大家在起号、养号过程中的环境配置时间，盯着数据拿结果！</p>
        
        <div class="success-box">
            <strong>💡 自动化台账直通车 (Data Pipeline)</strong><br>
            在「矩阵台账打表」模块中，系统已经打通了剪贴板底层的复合排版格式。只需一键点击，系统不仅会自动为你清洗杂乱的数据，还会<strong>后台静默请求极速接口，查出物理归属地</strong>。查完直接去 Excel 或云文档里 <code>Ctrl+V</code>，7 列数据瞬间严丝合缝。
        </div>
        
        <h3>⚡ 节点引擎：单端极速下发 (适用于单机测速与临时补号)</h3>
        <ul>
            <li><strong>场景定位：</strong> 当你需要临时验证一条高纯度 IP，或是给单独一台业务机补配环境时使用。</li>
            <li><strong>规范资产命名：</strong> 在【前缀标识】输入业务环境（如 <code>Socks:USiOS</code>），在【手机编码】选填机身背面的资产盘点编号（如 <code>257</code>）。</li>
            <li><strong>协议生成：</strong> 粘贴机房下发的四段式源数据 <code>IP:端口:账号:密码</code>。</li>
            <li><strong>无缝流转：</strong> 点击生成后，除了直接弹二维码，该数据还会自动同步到“填写IP报表”的底包库中，避免重复复制。</li>
        </ul>
        
        <h3>📋 矩阵台账打表：多流并发与清洗 (日常核心跑量 SOP)</h3>
        <ul>
            <li><strong>Step 1 (领区定网)：</strong> 建议在界面最上方，精准选中你所属业务组的【前置代理 IP】。</li>
            <li><strong>Step 2 (整包灌入)：</strong> 在【资产数据灌入区】，一次性粘贴今天领到的所有节点明文流。</li>
            <li><strong>Step 3 (执行引擎)：</strong> 点击「⚡ 生成」。表格结构会瞬间拉起，测绘引擎在后台排队静默处理。</li>
            <li><strong>Step 4 (闭环入库)：</strong> 随时可点击绿色的「📋 复制粘贴至 Excel 表」。如果有未查出的地区，则直接留空填入台账。</li>
        </ul>
        
        <div class="warning-box">
            <strong>⚠️ 风控红线与运维纪律</strong>
            <ul style="margin-top: 8px;">
                <li><strong>资产隔离：</strong> 代理数据属于核心业务资产，任何人严禁私自截图、转存或在任何非工作环境中使用。</li>
                <li><strong>异常报备：</strong> 遇到解析阻断、红字报错或接口超时，及时点击页面右下角的企微浮窗，找运维远程介入排查。</li>
            </ul>
        </div>
    </div>
`;

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('guideContentContainer');
    const render = (html) => { if (container) container.innerHTML = html; };

    const ready = window.siteContentReady || Promise.resolve();
    ready.then(() => {
        const remote = window.SiteContent && window.SiteContent.data && window.SiteContent.data.guideHtml;
        const content = remote || guideTemplateHTML;
        render(window.renderGuideContent ? window.renderGuideContent(content) : content);
    });
});
