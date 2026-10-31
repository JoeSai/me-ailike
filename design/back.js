// 子站作品页的返回条：<script src="/cd/back.js" data-href="/" data-label="Lab"></script>
// 自带样式，不依赖 cd.css，不会影响作品自己的布局。
(() => {
  const me = document.currentScript, href = me?.dataset.href || '/', label = me?.dataset.label || '代码侦探', center = me?.dataset.pos === 'top-center';
  const css = `.cd-back{position:fixed;left:14px;top:14px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 8px;border-radius:999px;font:600 13px/1.4 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;color:#1c1b18;background:rgba(239,233,220,.86);box-shadow:0 0 0 1.5px #1c1b18;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);text-decoration:none;transition:background .25s,color .25s,transform .35s cubic-bezier(.3,1.6,.5,1)}
.cd-back:hover{background:#1c1b18;color:#efe9dc;transform:translateX(-3px)}
.cd-back i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#d63f26;color:#efe9dc;font-style:normal;font-size:12px;animation:cdb 3.2s ease-in-out infinite}
@keyframes cdb{0%,70%,100%{transform:translateX(0)}80%{transform:translateX(-3px)}90%{transform:translateX(0)}}
@media (prefers-reduced-motion:reduce){.cd-back i{animation:none}}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const a = document.createElement('a'); a.className = 'cd-back'; if (center) a.style.cssText = 'left:50%;margin-left:-40px'; a.href = href; a.setAttribute('aria-label', `返回${label}`);
  a.innerHTML = `<i aria-hidden="true">←</i><span></span>`; a.lastChild.textContent = label;
  document.body.appendChild(a);
})();
