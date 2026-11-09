// 代码侦探主页：读取 /api/content 渲染页面；统计只记点击和访问次数，不用 cookie。
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function beacon(k) {
  try { navigator.sendBeacon('/api/e', new Blob([JSON.stringify({ k })], { type: 'application/json' })); } catch {}
}
beacon('view');

const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const tagsOf = it => it.tags ? it.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
const pad = n => String(n).padStart(2, '0');
const act = (url, id, field, label) => url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer" data-go="${id}:${field}">${label}</a>` : '';

let oss = [], tag = '全部', query = '', expanded = false;
const LIMIT = 10;

function renderVideos(list) {
  if (!list.length) { $('#videos').hidden = true; return; }
  $('#n-videos').textContent = pad(list.length);
  $('#video-list').innerHTML = list.map(v => `
    <a class="vcard" data-reveal href="${esc(v.url)}" target="_blank" rel="noreferrer" data-go="${v.id}:url">
      <div class="vcard-cover">${v.cover ? `<img src="/u/${esc(v.cover)}" alt="" loading="lazy">` : ''}<span class="play" aria-hidden="true">▶</span></div>
      <h3>${esc(v.title)}</h3>
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
  $('#n-oss').textContent = pad(oss.length);
  $('#oss-list').innerHTML = shown.length ? shown.map((it, i) => {
    const files = (it.files || []).map(f => `<a href="/d/${f.id}" download title="${fmtSize(f.size)}">↓ ${esc(f.name)}</a>`).join('');
    const name = it.url ? `<a class="stretch" href="${esc(it.url)}" target="_blank" rel="noreferrer" data-go="${it.id}:url" data-roll>${esc(it.title)}</a>` : `<span>${esc(it.title)}</span>`;
    return `<li class="cd-row oss">
      <span class="cd-no">${pad(i + 1)}</span><span class="cd-name">${name}</span>
      <span class="cd-note">${esc(it.desc)}</span><span class="cd-tags">${tagsOf(it).join(' · ')}</span>
      <span class="acts">${act(it.demo, it.id, 'demo', '体验 ↗')}${act(it.video, it.id, 'video', '视频 ▶')}${files}</span>
      <span class="cd-arrow" style="--d:${(i % 6) * .35}s" aria-hidden="true">${it.url ? '↗' : ''}</span>
    </li>`;
  }).join('') : '<li class="empty">没有找到。</li>';
  const hidden = list.length - shown.length;
  $('#more').hidden = hidden <= 0;
  $('#more').textContent = `展开全部 ${list.length} 个 ↓`;
  CD.init($('#oss-list'));
}

function renderWorks(list) {
  if (!list.length) { $('#works').hidden = true; return; }
  $('#n-works').textContent = pad(list.length);
  $('#work-list').innerHTML = list.map((w, i) => `
    <li><a class="cd-row" href="${esc(w.url)}" target="_blank" rel="noreferrer" data-go="${w.id}:url" ${w.cover ? `data-peek="/u/${esc(w.cover)}"` : ''}>
      <span class="cd-no">${pad(i + 1)}</span><span class="cd-name" data-roll>${esc(w.title)}</span><span class="cd-note">${esc(w.desc)}</span><span class="cd-arrow" style="--d:${i * .5}s">→</span>
    </a></li>`).join('');
}

fetch('/api/content').then(r => r.json()).then(({ items }) => {
  const by = k => items.filter(i => i.kind === k);
  const videos = by('video').filter(v => v.url);
  oss = by('oss');
  renderVideos(videos); renderChips(); renderOss(); renderWorks(by('work'));
  CD.init();
}).catch(() => { $('#oss-list').innerHTML = '<li class="empty">加载失败，刷新试试。</li>'; });

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { const [id, f] = go.dataset.go.split(':'); beacon(`go:${id}:${f}`); }
  const so = e.target.closest('[data-social]'); if (so) beacon(`social:${so.dataset.social}`);
  const chip = e.target.closest('.chip'); if (chip) { tag = chip.dataset.tag; expanded = false; renderChips(); renderOss(); }
});
$('#more').addEventListener('click', () => { expanded = true; renderOss(); });
$('#q').addEventListener('input', e => { query = e.target.value; renderOss(); });

// 复制微信号
$('#copy').addEventListener('click', async () => {
  const id = $('#wxid').textContent, hint = $('#copy-hint');
  try { await navigator.clipboard.writeText(id); } catch {
    const r = document.createRange(); r.selectNodeContents($('#wxid')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges();
  }
  beacon('copy:wechat'); hint.textContent = '已复制'; setTimeout(() => (hint.textContent = '复制'), 1600);
});

// 豆探：待机时呼吸眨眼，点一下轮流做一个动作（精灵图逐帧播放）
const SPRITE = { w: 407, h: 360, cols: 8, dir: '/img/doutan/', v: 1,
  acts: { idle: { n: 20, fps: 7.5 }, jump: { n: 21, fps: 15 }, cool: { n: 29, fps: 15 }, wave: { n: 24, fps: 15 }, peek: { n: 32, fps: 15 } } };
const mascot = $('#mascot'), sprite = mascot.querySelector('.mascot-sprite');
const ORDER = ['jump', 'cool', 'wave', 'peek'], ready = {};
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let next = 0, cur = 'idle', t0 = performance.now();
function load(name) {
  return ready[name] ||= new Promise(ok => { const im = new Image(); im.onload = im.onerror = () => ok(); im.src = `${SPRITE.dir}doutan-${name}.webp?v=${SPRITE.v}`; });
}
function show(name, i) {
  const a = SPRITE.acts[name], rows = Math.ceil(a.n / SPRITE.cols), cols = Math.min(a.n, SPRITE.cols);
  const c = i % SPRITE.cols, r = Math.floor(i / SPRITE.cols);
  sprite.style.backgroundImage = `url(${SPRITE.dir}doutan-${name}.webp?v=${SPRITE.v})`;
  sprite.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  sprite.style.backgroundPosition = `${cols > 1 ? c / (cols - 1) * 100 : 0}% ${rows > 1 ? r / (rows - 1) * 100 : 0}%`;
}
function tick(now) {
  const a = SPRITE.acts[cur], i = Math.floor((now - t0) / 1000 * a.fps);
  if (cur !== 'idle' && i >= a.n) { cur = 'idle'; t0 = now; mascot.classList.remove('busy'); }
  const A = SPRITE.acts[cur];
  show(cur, cur === 'idle' ? (still ? 3 : Math.floor((now - t0) / 1000 * A.fps) % A.n) : Math.min(i, a.n - 1));
  if (!still || cur !== 'idle') requestAnimationFrame(tick);
}
load('idle').then(() => { mascot.classList.add('on'); requestAnimationFrame(tick); });
// 首屏加载完再悄悄预取动作图，点的时候不用等
addEventListener('load', () => setTimeout(() => ORDER.forEach(load), 1200));
mascot.addEventListener('click', async () => {
  if (cur !== 'idle') return;
  const name = ORDER[next]; next = (next + 1) % ORDER.length;
  mascot.classList.add('busy');
  await load(name);
  cur = name; t0 = performance.now();
  if (still) requestAnimationFrame(tick);
  beacon('go:0:mascot');
});
if (matchMedia('(pointer: fine)').matches && !still) {
  addEventListener('pointermove', e => {
    mascot.style.setProperty('--px', `${(e.clientX / innerWidth - .5) * -14}px`);
    mascot.style.setProperty('--py', `${(e.clientY / innerHeight - .5) * -10}px`);
  }, { passive: true });
}
