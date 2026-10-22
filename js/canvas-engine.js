// ================== 2.5D 混合现实渲染引擎 (真实摄影 + 电影运镜 + 动态VFX) ==================

let canvas, ctx, canvasWidth, canvasHeight;
let activeParticles = [];
let clickParticles = [];
let currentVisualMode = 'day'; 
let animationId = null;
let bgOverlayDiv = null;

// ================== 顶级摄影与3D渲染图库矩阵 (无限随机池) ==================
const nightImages = [
    "1614730321146-b6fa6a46bcb4", "1462331940025-496dfbfc7564", "1451187580459-43490279c0fa", 
    "1506443007198-d890471b4020", "1465101162946-4377e57745c3", "1436891620584-47fd0e565afb", 
    "1446776811953-b23d061170f6", "1501862700950-18382cd41497", "1444703686981-a3abbc4d4fe3", 
    "1464802686167-b9e427b5338c", "1419242902214-272b3f66ee7a", "1484589065579-248aad0d8eb2"
];

const dayImages = [
    "1542224566-6e85f2e6772f", "1506501139174-099022df5260", "1572099606223-6e29045d7de3", 
    "1464822759023-fed622ff2c3b", "1513002749550-c59d786c8ce7", "1518098268026-4e89f1a2cd8e", 
    "1433838552652-f9a46b332c40", "1580137189272-c8378c88776a", "1518599904135-236b3f7f18eb", 
    "1486870591958-9b9d0d1dda99", "1513360371669-4dc3ef7bb908", "1495571217036-7c30983ee235"
];

window.resizeCanvas = function() { 
    if(!canvas) return;
    canvasWidth = canvas.width = window.innerWidth; 
    canvasHeight = canvas.height = window.innerHeight; 
};

function getEnvironmentMode() {
    return window.isNightMode ? 'night' : 'day'; 
}

// ================== 核心：电影运镜 (Cinematic Pan) 与背景拉取 ==================
function loadRealisticBackground() {
    // 注入 CSS 镜头漫游动画 (Ken Burns Effect)
    if (!document.getElementById('cinematic-pan-style')) {
        const style = document.createElement('style');
        style.id = 'cinematic-pan-style';
        style.innerHTML = `
            @keyframes cinematicPan {
                0% { transform: scale(1.0) translate(0px, 0px); }
                100% { transform: scale(1.15) translate(-1.5%, 1.5%); }
            }
        `;
        document.head.appendChild(style);
    }

// 后台下发自定义背景时优先使用，否则回退到随机摄影图
let customUrl = '';
if (window.BG_CONFIG && window.BG_CONFIG.mode === 'custom') {
    customUrl = currentVisualMode === 'night' ? (window.BG_CONFIG.nightUrl || window.BG_CONFIG.dayUrl || '') : (window.BG_CONFIG.dayUrl || window.BG_CONFIG.nightUrl || '');
}
const pool = currentVisualMode === 'night' ? nightImages : dayImages;
const randomId = pool[Math.floor(Math.random() * pool.length)];
const imgUrl = customUrl || `https://images.unsplash.com/photo-${randomId}?q=80&w=1920&auto=format&fit=crop`;

    let newBg = document.createElement('div');
    newBg.style.position = 'fixed';
    newBg.style.top = '0'; newBg.style.left = '0';
    newBg.style.width = '100vw'; newBg.style.height = '100vh';
    newBg.style.zIndex = '-2'; 
    newBg.style.background = `url(${imgUrl}) center/cover no-repeat`;
    newBg.style.opacity = '0';
    newBg.style.transition = 'opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // 赋予背景图无尽的平滑缩放与移动，让真实画面“活”过来！
    newBg.style.animation = 'cinematicPan 45s linear infinite alternate';
    
    const overlayColor = currentVisualMode === 'night' ? 'rgba(5, 10, 20, 0.65)' : 'rgba(245, 248, 255, 0.25)';
    newBg.style.boxShadow = `inset 0 0 0 3000px ${overlayColor}`;

    document.body.appendChild(newBg);

    const img = new Image();
    img.src = imgUrl;
    img.onload = () => {
        newBg.style.opacity = '1';
        document.body.style.background = 'transparent'; 
        if (bgOverlayDiv) {
            let oldBg = bgOverlayDiv;
            setTimeout(() => { if(oldBg && oldBg.parentNode) oldBg.parentNode.removeChild(oldBg); }, 1500);
        }
        bgOverlayDiv = newBg;
    };
}

// ================== 前景 Canvas 动态视觉生态 (VFX) ==================
class VFXEntity {
    constructor(type) {
        this.type = type; this.reset(true);
    }
    reset(init = false) {
        if (this.type === 'star') {
            this.x = Math.random() * canvasWidth; this.y = Math.random() * canvasHeight;
            this.size = Math.random() * 1.5 + 0.2; this.alpha = Math.random(); this.speedAlpha = (Math.random() - 0.5) * 0.02;
        } else if (this.type === 'shooting_star') {
            this.x = Math.random() * canvasWidth * 1.5; this.y = Math.random() * -canvasHeight;
            this.length = Math.random() * 120 + 40; this.speedX = -(Math.random() * 25 + 15); this.speedY = Math.random() * 25 + 15;
            this.thickness = Math.random() * 1.5 + 0.5; this.active = Math.random() > 0.94; 
        } else if (this.type === 'bird') {
            this.x = init ? Math.random() * canvasWidth : -60; this.y = Math.random() * (canvasHeight * 0.5); 
            this.wingSpan = Math.random() * 5 + 2; this.flapSpeed = Math.random() * 0.12 + 0.06; 
            this.flightPath = Math.random() * 0.02 + 0.01; this.speedX = Math.random() * 1.0 + 0.5; this.flap = Math.random() * Math.PI;
        } else if (this.type === 'fog') {
            this.x = Math.random() * canvasWidth; this.y = Math.random() * canvasHeight;
            this.size = Math.random() * 250 + 100; this.speedX = (Math.random() - 0.5) * 0.6; this.opacity = Math.random() * 0.04 + 0.01;
        } else if (this.type === 'dust') {
            // 白天独有：阳光下缓缓上升的金色浮尘，增加极强的前景层次感
            this.x = Math.random() * canvasWidth; this.y = init ? Math.random() * canvasHeight : canvasHeight + 10;
            this.size = Math.random() * 2 + 0.5; this.speedY = -(Math.random() * 0.5 + 0.2);
            this.speedX = (Math.random() - 0.5) * 0.5; this.opacity = Math.random() * 0.6 + 0.1;
        } else if (this.type === 'stardust') {
            // 夜晚独有：深空中的幽蓝星际悬浮粒子
            this.x = Math.random() * canvasWidth; this.y = Math.random() * canvasHeight;
            this.size = Math.random() * 3 + 1; this.speedY = (Math.random() - 0.5) * 0.3;
            this.speedX = (Math.random() - 0.5) * 0.3; this.opacity = Math.random() * 0.5 + 0.1;
            this.hue = Math.random() > 0.5 ? 200 : 280; // 幽蓝 或 紫色
        }
    }
    update() {
        if (this.type === 'star') { this.alpha += this.speedAlpha; if (this.alpha > 1 || this.alpha < 0) this.speedAlpha *= -1; }
        else if (this.type === 'shooting_star' && this.active) { this.x += this.speedX; this.y += this.speedY; if (this.x < -200 || this.y > canvasHeight + 200) this.reset(); }
        else if (this.type === 'bird') { this.x += this.speedX; this.y += Math.sin(this.x * this.flightPath) * 0.5; this.flap += this.flapSpeed; if (this.x > canvasWidth + 60) this.reset(); }
        else if (this.type === 'fog') { this.x += this.speedX; if(this.x > canvasWidth+250 || this.x < -250) this.speedX *= -1; }
        else if (this.type === 'dust') { this.y += this.speedY; this.x += this.speedX + Math.sin(this.y * 0.01)*0.2; if(this.y < -10 || this.x > canvasWidth || this.x < 0) this.reset(); }
        else if (this.type === 'stardust') { this.y += this.speedY; this.x += this.speedX; if(this.y < -10 || this.y > canvasHeight+10 || this.x > canvasWidth+10 || this.x < -10) this.reset(); }
    }
    draw() {
        if(!ctx) return;
        if (this.type === 'star') { 
            ctx.fillStyle = `rgba(255,255,255,${this.alpha})`; ctx.beginPath(); ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fill(); 
        }
        else if (this.type === 'shooting_star' && this.active) {
            let grad = ctx.createLinearGradient(this.x, this.y, this.x - this.speedX*2, this.y - this.speedY*2);
            grad.addColorStop(0, `rgba(255,255,255, 0.9)`); grad.addColorStop(1, `rgba(255,255,255, 0)`);
            ctx.strokeStyle = grad; ctx.lineWidth = this.thickness; ctx.lineCap = 'round'; 
            ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - this.speedX*2, this.y - this.speedY*2); ctx.stroke();
        }
        else if (this.type === 'bird') {
            ctx.strokeStyle = `rgba(30, 40, 50, ${0.4 + this.flapSpeed})`; ctx.lineWidth = 1.2; 
            let wingY = Math.sin(this.flap) * this.wingSpan; 
            ctx.beginPath(); ctx.moveTo(this.x - this.wingSpan, this.y - wingY);
            ctx.quadraticCurveTo(this.x, this.y, this.x + this.wingSpan, this.y - wingY); ctx.stroke();
        }
        else if (this.type === 'fog') {
            let grad = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.size);
            grad.addColorStop(0,`rgba(255,255,255,${this.opacity})`); grad.addColorStop(1,'rgba(255,255,255,0)');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fill();
        }
        else if (this.type === 'dust') {
            ctx.fillStyle = `rgba(255, 230, 150, ${this.opacity})`; ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(255,230,150,0.5)';
            ctx.beginPath(); ctx.arc(this.x,this.y,this.size,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
        }
        else if (this.type === 'stardust') {
            let grad = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.size*2);
            grad.addColorStop(0, `hsla(${this.hue}, 100%, 70%, ${this.opacity})`);
            grad.addColorStop(1, `hsla(${this.hue}, 100%, 70%, 0)`);
            ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(this.x,this.y,this.size*2,0,Math.PI*2); ctx.fill();
        }
    }
}

// 点击时的交互粒子爆裂效果
class ClickParticle {
    constructor(x, y, mode) {
        this.x = x; this.y = y; this.mode = mode; this.size = Math.random() * 3 + 1.5;
        this.speedX = (Math.random() - 0.5) * 5; this.speedY = (Math.random() - 0.5) * 5 - 1; 
        this.gravity = mode === 'night' ? 0 : 0.08; this.life = 1.0; this.decay = Math.random() * 0.02 + 0.015;
        this.color = mode === 'night' ? `hsl(${Math.random()*60+180}, 100%, 80%)` : `hsl(${Math.random()*40+320}, 85%, 70%)`;
        this.rot = 0; this.rotSpeed = (Math.random() - 0.5) * 0.3;
    }
    update() { this.speedY += this.gravity; this.x += this.speedX; this.y += this.speedY; this.rot += this.rotSpeed; this.life -= this.decay; }
    draw() {
        if(this.life <= 0 || !ctx) return;
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.globalAlpha = this.life;
        if(this.mode === 'night') {
            ctx.fillStyle = this.color; ctx.beginPath();
            ctx.moveTo(0, -this.size); ctx.quadraticCurveTo(this.size*0.2, -this.size*0.2, this.size, 0);
            ctx.quadraticCurveTo(this.size*0.2, this.size*0.2, 0, this.size); ctx.quadraticCurveTo(-this.size*0.2, this.size*0.2, -this.size, 0);
            ctx.quadraticCurveTo(-this.size*0.2, -this.size*0.2, 0, -this.size); ctx.fill();
        } else {
            ctx.fillStyle = this.color; ctx.beginPath(); ctx.ellipse(0, 0, this.size, this.size*0.5, 0, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

// ================== 全局引擎调度 ==================
window.createParticles = function() {
    canvas = document.getElementById('bgCanvas'); if(!canvas) return;
    ctx = canvas.getContext('2d'); window.resizeCanvas();
    activeParticles = []; clickParticles = []; 
    currentVisualMode = getEnvironmentMode();

    // 拉取顶级大图并注入电影级呼吸推镜
    loadRealisticBackground();

// 后台可关闭粒子特效（手机省电流畅模式）
if (window.BG_CONFIG && window.BG_CONFIG.particles === false) {
    activeParticles = []; clickParticles = [];
    if (ctx) ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    return;
}

// 注入前景 3D 生态微粒
if (currentVisualMode === 'night') {
        for(let i=0;i<180;i++) activeParticles.push(new VFXEntity('star'));
        for(let i=0;i<5;i++) activeParticles.push(new VFXEntity('shooting_star'));
        for(let i=0;i<35;i++) activeParticles.push(new VFXEntity('stardust')); // 深空幽蓝星尘
    } else {
        for(let i=0;i<15;i++) activeParticles.push(new VFXEntity('fog'));
        const birdCount = Math.floor(Math.random() * 6) + 4; 
        for(let i=0;i<birdCount;i++) activeParticles.push(new VFXEntity('bird'));
        for(let i=0;i<50;i++) activeParticles.push(new VFXEntity('dust')); // 阳光金色浮尘
    }
};

window.animate = function() {
    if(!ctx) return; ctx.clearRect(0,0,canvasWidth,canvasHeight); 
    
    // 只渲染动态特效图层，真实的画面交由被 CSS 驱动的深层 DOM 呈现
    activeParticles.forEach(p => { p.update(); p.draw(); });

    for(let i = clickParticles.length - 1; i >= 0; i--) {
        let cp = clickParticles[i]; cp.update(); cp.draw(); if(cp.life <= 0) clickParticles.splice(i, 1);
    }
    
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(window.animate);
};

window.addEventListener('click', (e) => {
    if (e.target.closest('.modal-content') || e.target.closest('.feedback-modal-content') || e.target.closest('.contact-float') || e.target.closest('.container')) return;
    let mode = currentVisualMode === 'night' ? 'night' : 'day';
    for(let i=0; i<16; i++) { clickParticles.push(new ClickParticle(e.clientX, e.clientY, mode)); }
});
