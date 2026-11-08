// 在线工具清单：首页“工具”区和 /tools/ 共用。加工具只改这里。
window.CD_TOOLS = [
  // 视频下载（/tools/video-download.html）暂不挂出：服务器是海外机房 IP，抖音、B 站、YouTube 都被拦，只测通了 TikTok
  { href: '/tools/pixel-art-lighter.html', name: '像素艺术打火机', note: '给像素画生成法线贴图，拖着光源实时打光（Pixel Art Lighter 汉化版）', img: '/tools/img/pixel-art-lighter.png' },
];
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  for (const box of document.querySelectorAll('[data-tools]')) {
    box.innerHTML = window.CD_TOOLS.map((t, i) => `
      <a class="tcard" href="${esc(t.href)}" data-reveal>
        <span class="tcard-img"><img src="${esc(t.img)}" alt="" loading="lazy">${t.tag ? `<em>${esc(t.tag)}</em>` : ''}</span>
        <span class="tcard-text"><b>${esc(t.name)}</b><small>${esc(t.note)}</small></span>
        <span class="tcard-go" aria-hidden="true">打开 →</span>
      </a>`).join('');
  }
  for (const n of document.querySelectorAll('[data-tools-count]')) n.textContent = String(window.CD_TOOLS.length).padStart(2, '0');
})();
