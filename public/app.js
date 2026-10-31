// 代码侦探主页：读取 /api/content 渲染页面；统计只记点击和访问次数，不用 cookie。
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = document.documentElement;
root.classList.add('js');

function beacon(k) {
  try { navigator.sendBeacon('/api/e', new Blob([JSON.stringify({ k })], { type: 'application/json' })); } catch {}
}
beacon('view');

const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fmtDate = d => d ? d.replace(/-/g, '.') : '';
const tagsOf = it => it.tags ? it.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
const ext = (url, id, field, label, cls = '') => url ? `<a class="act ${cls}" href="${esc(url)}" target="_blank" rel="noreferrer" data-go="${id}:${field}">${label}</a>` : '';

let oss = [], tag = '全部', query = '', expanded = false;
const LIMIT = 10;

function renderVideos(list) {
  const sec = $('#videos');
  if (!list.length) { sec.hidden = true; return; }
  $('#video-list').innerHTML = list.map(v => `
    <a class="vcard reveal in" href="${esc(v.url)}" target="_blank" rel="noreferrer" data-go="${v.id}:url">
      <div class="vcard-cover">${v.cover ? `<img src="/u/${esc(v.cover)}" alt="" loading="lazy">` : ''}<span class="play" aria-hidden="true">▶</span></div>
      <h3>${esc(v.title)}</h3>${v.desc ? `<p>${esc(v.desc)}</p>` : ''}${v.date ? `<time class="mono" datetime="${esc(v.date)}">${fmtDate(v.date)}</time>` : ''}
    </a>`).join('');
}

function renderChips() {
  const counts = new Map();
  for (const it of oss) for (const t of tagsOf(it)) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [['全部', oss.length], ...[...counts].sort((a, b) => b[1] - a[1])];
  $('#chips').innerHTML = tags.map(([t, n]) => `<button class="chip" type="button" aria-pressed="${t === tag}" data-tag="${esc(t)}">${esc(t)}<small>${n}</small></button>`).join('');
}

function renderOss() {
  const q = query.trim().toLowerCase();
  const list = oss.filter(it => (tag === '全部' || tagsOf(it).includes(tag)) && (!q || (it.title + it.desc + it.tags).toLowerCase().includes(q)));
  const shown = expanded || q || tag !== '全部' ? list : list.slice(0, LIMIT);
  $('#oss-list').innerHTML = shown.length ? shown.map((it, i) => {
    const files = (it.files || []).map(f => `<a class="act act-dl" href="/d/${f.id}" download>↓ ${esc(f.name)} <small>${fmtSize(f.size)}</small></a>`).join('');
    const title = it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noreferrer" data-go="${it.id}:url">${esc(it.title)}</a>` : esc(it.title);
    return `<li class="row reveal in">
      <span class="row-no mono">${String(list.indexOf(it) + 1).padStart(2, '0')}</span>
      <div><h3 class="row-name">${title}</h3><p class="row-desc">${esc(it.desc)}</p>${it.date ? `<span class="row-date mono">${fmtDate(it.date)}</span>` : ''}</div>
      <div class="row-tags">${tagsOf(it).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="row-acts">${ext(it.url, it.id, 'url', it.url.includes('github.com') ? 'GitHub ↗' : '打开项目 ↗')}${ext(it.demo, it.id, 'demo', '在线体验 ↗')}${ext(it.video, it.id, 'video', '看讲解视频 ▶')}${files}</div>
    </li>`;
  }).join('') : '<li class="empty">没有找到，换个词试试。</li>';
  const more = $('#more');
  const hidden = list.length - shown.length;
  more.hidden = hidden <= 0;
  more.textContent = `展开全部 ${list.length} 个项目 ↓`;
}

function renderWorks(list) {
  $('#work-list').innerHTML = list.map((w, i) => `
    <a class="wcard tone-${esc(w.tone || (i % 2 ? 'ink' : 'red'))} reveal" href="${esc(w.url)}" target="_blank" rel="noreferrer" data-go="${w.id}:url">
      <span class="wcard-go" aria-hidden="true">→</span><h3>${esc(w.title)}</h3><p>${esc(w.desc)}</p>
    </a>`).join('');
  if (!list.length) $('#works').hidden = true;
}

function renderArchive(list) {
  const el = $('#archive');
  if (!list.length) return;
  el.hidden = false;
  el.innerHTML = `<b>旧作</b>` + list.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noreferrer" data-go="${a.id}:url">${esc(a.title)} ↗</a>`).join('');
}

function observeReveals() {
  const els = [...document.querySelectorAll('.reveal:not(.in)')];
  if (!('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  els.forEach((e, i) => { e.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(e); });
}

fetch('/api/content').then(r => r.json()).then(({ items }) => {
  const by = k => items.filter(i => i.kind === k);
  const videos = by('video').filter(v => v.url);
  oss = by('oss');
  $('#count').textContent = `${oss.length} 个开源项目 · ${videos.length} 条精选视频 · ${items.reduce((n, i) => n + (i.files || []).length, 0)} 份可下载资源`;
  renderVideos(videos); renderChips(); renderOss(); renderWorks(by('work')); renderArchive(by('archive'));
  observeReveals();
}).catch(() => { $('#oss-list').innerHTML = '<li class="empty">内容加载失败，刷新试试。</li>'; });

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { const [id, f] = go.dataset.go.split(':'); beacon(`go:${id}:${f}`); }
  const so = e.target.closest('[data-social]'); if (so) beacon(`social:${so.dataset.social}`);
  const chip = e.target.closest('.chip'); if (chip) { tag = chip.dataset.tag; expanded = false; renderChips(); renderOss(); }
});
$('#more').addEventListener('click', () => { expanded = true; renderOss(); });
$('#q').addEventListener('input', e => { query = e.target.value; renderOss(); });

// 复制微信号
$('#copy').addEventListener('click', async e => {
  const btn = e.currentTarget, id = $('#wxid').textContent;
  try { await navigator.clipboard.writeText(id); } catch {
    const r = document.createRange(); r.selectNodeContents($('#wxid')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges();
  }
  beacon('copy:wechat'); btn.textContent = '已复制'; setTimeout(() => (btn.textContent = '复制'), 1600);
});

// 豆探：点一下换动作，鼠标移动时轻微跟随
const mascot = $('#mascot'), img = mascot.querySelector('img'), poses = img.dataset.poses.split(',');
let pose = 0;
mascot.addEventListener('click', () => {
  pose = (pose + 1) % poses.length; img.src = poses[pose];
  mascot.classList.remove('bounce'); void mascot.offsetWidth; mascot.classList.add('bounce');
});
if (matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  addEventListener('pointermove', e => {
    mascot.style.setProperty('--px', `${(e.clientX / innerWidth - .5) * -14}px`);
    mascot.style.setProperty('--py', `${(e.clientY / innerHeight - .5) * -10}px`);
  });
}
