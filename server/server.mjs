// 代码侦探主页：静态页面 + 小后台 + 访问统计。零依赖，数据在 DATA_DIR（SQLite + uploads）。
import http from 'node:http';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dl from './dl.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = join(ROOT, 'public');
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const PORT = +(process.env.PORT || 8080);
const DL_ON = process.env.DL_ENABLED === '1';
const MAX_FILE = 100 * 1024 * 1024;       // 单个附件 100 MB
const MAX_TOTAL = 3 * 1024 * 1024 * 1024; // 附件总量 3 GB，防止占满服务器磁盘
const UPLOADS = join(DATA, 'uploads');
mkdirSync(UPLOADS, { recursive: true });

const db = new DatabaseSync(join(DATA, 'site.db'));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- video | oss | work | archive
  title TEXT NOT NULL,
  desc TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',       -- 主链接：视频=抖音，开源=GitHub，作品=站点
  demo TEXT NOT NULL DEFAULT '',      -- 在线体验链接（开源项目）
  video TEXT NOT NULL DEFAULT '',     -- 讲解视频链接（开源项目）
  tags TEXT NOT NULL DEFAULT '',      -- 逗号分隔
  cover TEXT NOT NULL DEFAULT '',     -- uploads 里的文件名
  tone TEXT NOT NULL DEFAULT '',      -- 作品卡片底色：ink | red | paper | mint
  date TEXT NOT NULL DEFAULT '',      -- YYYY-MM-DD
  sort INTEGER NOT NULL DEFAULT 0,    -- 越大越靠前
  hidden INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored TEXT NOT NULL,
  size INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);
CREATE TABLE IF NOT EXISTS visitors (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h));
`);
db.exec('PRAGMA foreign_keys = ON');

// ---- 凭据：密码哈希与会话密钥保存在 DATA_DIR/auth.json，首次启动时由 ADMIN_PASSWORD 生成 ----
const authFile = join(DATA, 'auth.json');
function hashPw(pw, salt) { return scryptSync(pw, salt, 32).toString('hex'); }
let auth;
if (existsSync(authFile)) auth = JSON.parse(readFileSync(authFile, 'utf8'));
else {
  if (!process.env.ADMIN_PASSWORD) { console.error('首次启动需要环境变量 ADMIN_PASSWORD'); process.exit(1); }
  const salt = randomBytes(16).toString('hex');
  auth = { salt, hash: hashPw(process.env.ADMIN_PASSWORD, salt), secret: randomBytes(32).toString('hex'), visitorSalt: randomBytes(16).toString('hex') };
  writeFileSync(authFile, JSON.stringify(auth), { mode: 0o600 });
}
const sign = v => createHmac('sha256', auth.secret).update(v).digest('hex');
const SESSION_DAYS = 30;
function makeSession() { const exp = Date.now() + SESSION_DAYS * 864e5; return `${exp}.${sign(String(exp))}`; }
function validSession(tok) {
  const [exp, sig] = String(tok || '').split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const isAdmin = req => validSession(cookieOf(req).sid);

// 登录限速：同一 IP 每 15 分钟最多 8 次失败
const fails = new Map();
// 全站失败上限：源站 IP 一旦被绕过 Cloudflare 直连，cf-connecting-ip 可以伪造，按 IP 限速就失效，所以再加一道总量限制
const allFails = { n: 0, t: Date.now() };
function ipOf(req) { return (req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '').toString(); }

// ---- 统计 ----
const today = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10); // 北京时间
const bump = db.prepare('INSERT INTO stats(day,key,n) VALUES(?,?,1) ON CONFLICT(day,key) DO UPDATE SET n=n+1');
function track(key) { bump.run(today(), key); }
function trackVisitor(req) {
  const day = today(), h = createHash('sha256').update(auth.visitorSalt + day + ipOf(req) + (req.headers['user-agent'] || '')).digest('hex').slice(0, 16);
  const r = db.prepare('INSERT OR IGNORE INTO visitors(day,h) VALUES(?,?)').run(day, h);
  if (r.changes) track('uv');
}
// 防抓取：在线工具和三国舆图（/tools/、/sanguo/）只给真人浏览器用。
// 1) 抓取工具（curl、wget、Python、爬虫框架、无头浏览器、AI 爬虫）一律拒绝，页面也不给；正规搜索引擎可以读页面，不能取脚本和数据；
// 2) 页面以外的文件（脚本、数据、图片、字体）要带 Sec-Fetch-Site: same-origin 或本站 Referer，直接打开文件地址、别的网站盗链都拿不到；
// 3) 这些响应标 private，Cloudflare 边缘不缓存，每次都要过这道检查。
// 首页用的工具清单（tools.js、tools.css、封面图）不在保护范围。挡不住有人用真浏览器另存，但能挡住批量抓取和直接下载源码、数据。
const SCRAPER = /curl|wget|python|aiohttp|httpx|scrapy|httrack|go-http|java\/|okhttp|node-fetch|axios|undici|libwww|perl|ruby|php|headless|phantom|puppeteer|playwright|selenium|crawl|spider|scrap|bot\b|ccbot|bytespider/i;   // 别写 app 名：Claude、飞书等桌面应用的内置浏览器 UA 里带自己的名字
const SEARCH = /googlebot|bingbot|baiduspider|sogou|360spider|yisouspider|duckduckbot|applebot\//i;
const PUBLIC_LIST = p => p === '/tools/' || p === '/tools/index.html' || p === '/tools/tools.js' || p === '/tools/tools.css' || p.startsWith('/tools/img/');
const GUARDED = p => /^\/(sanguo|tools)\//.test(p) && !PUBLIC_LIST(p);
const isPage = p => p.endsWith('/') || /\.html?$/.test(p);
function guardOk(req, p) {
  const ua = req.headers['user-agent'] || '';
  if (isPage(p)) return !!ua && (!SCRAPER.test(ua) || SEARCH.test(ua));
  if (!ua || SCRAPER.test(ua)) return false;
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  try { return new URL(req.headers.referer || '').host === req.headers.host; } catch { return false; }
}
const isBot = req => /bot|spider|crawl|curl|python|headless/i.test(req.headers['user-agent'] || '');

// ---- 工具 ----
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg' };
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()', 'Cross-Origin-Opener-Policy': 'same-origin' };
function send(res, code, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { ...SEC, 'Content-Type': isObj ? MIME['.json'] : 'text/plain; charset=utf-8', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readJson(req, limit = 256 * 1024) {
  return new Promise((ok, no) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { no(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { no(new Error('bad json')); } });
    req.on('error', no);
  });
}
function serveFile(req, res, file, headers = {}, status = 200) {
  let st; try { st = statSync(file); } catch { return send(res, 404, 'Not found'); }
  if (!st.isFile()) return send(res, 404, 'Not found');
  const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
  if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
  res.writeHead(status, { ...SEC, 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, ETag: etag, ...headers });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}
const notFound = (req, res) => serveFile(req, res, join(PUBLIC, '404.html'), { 'Cache-Control': 'no-store' }, 404);
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const cleanUrl = v => { v = clean(v, 1000); return v === '' || /^https?:\/\//i.test(v) ? v : ''; };

const ITEM_FIELDS = ['kind', 'title', 'desc', 'url', 'demo', 'video', 'tags', 'cover', 'tone', 'date', 'sort', 'hidden'];
function normItem(b) {
  const kind = ['video', 'oss', 'work', 'archive'].includes(b.kind) ? b.kind : 'oss';
  return { kind, title: clean(b.title, 120), desc: clean(b.desc, 600), url: cleanUrl(b.url), demo: cleanUrl(b.demo), video: cleanUrl(b.video),
    tags: clean(b.tags, 120).replace(/，/g, ','), cover: clean(b.cover, 80).replace(/[^\w.\-]/g, ''), tone: ['ink', 'red', 'paper', 'mint'].includes(b.tone) ? b.tone : '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '', sort: Number.isFinite(+b.sort) ? Math.trunc(+b.sort) : 0, hidden: b.hidden ? 1 : 0 };
}
function filesOf(itemId) { return db.prepare('SELECT id,name,size,downloads FROM files WHERE item_id=? ORDER BY id').all(itemId); }
function itemsWithFiles(where = '') {
  const items = db.prepare(`SELECT * FROM items ${where} ORDER BY sort DESC, date DESC, id DESC`).all();
  const files = db.prepare('SELECT id,item_id,name,size,downloads FROM files ORDER BY id').all();
  for (const it of items) it.files = files.filter(f => f.item_id === it.id);
  return items;
}
function totalUploadBytes() { return db.prepare('SELECT COALESCE(SUM(size),0) s FROM files').get().s; }

// ---- 路由 ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    const m = req.method;

    if (p === '/healthz') return send(res, 200, 'ok');

    // 公开内容
    if (p === '/api/content' && m === 'GET') {
      const items = itemsWithFiles("WHERE hidden=0 AND kind!='archive'");   // 旧作不再公开（2026-11-10）
      return send(res, 200, { items }, { 'Cache-Control': 'no-cache' });
    }
    // 事件：view 或 go:<id>
    if (p === '/api/e' && m === 'POST') {
      const b = await readJson(req, 2048).catch(() => ({}));
      const k = String(b.k || '');
      if (!isBot(req) && /^(view|go:\d{1,6}:[a-z]{1,8}|social:[a-z]{1,12}|copy:wechat)$/.test(k)) {
        track(k); if (k === 'view') trackVisitor(req);
      }
      return send(res, 204, '');
    }
    // 下载
    let mm;
    if ((mm = p.match(/^\/d\/(\d+)$/)) && (m === 'GET' || m === 'HEAD')) {
      const f = db.prepare('SELECT f.*, i.hidden FROM files f JOIN items i ON i.id=f.item_id WHERE f.id=?').get(+mm[1]);
      if (!f || (f.hidden && !isAdmin(req))) return send(res, 404, 'Not found');
      if (m === 'GET' && !isBot(req)) { db.prepare('UPDATE files SET downloads=downloads+1 WHERE id=?').run(f.id); track('dl'); }
      return serveFile(req, res, join(UPLOADS, f.stored), { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'no-store' });
    }
    // 视频下载工具：未上线，默认关闭（服务器会替访客去抓任意网址，开放前要先做 SSRF 防护），DL_ENABLED=1 才开
    if (!DL_ON && (p.startsWith('/api/dl') || p.startsWith('/dl/') || p === '/tools/video-download.html')) return notFound(req, res);
    if (p === '/api/dl' && m === 'POST') {
      const b = await readJson(req, 4096).catch(() => ({}));
      const r = dl.submit(b.url, ipOf(req));
      if (r.error) return send(res, r.code, { error: r.error });
      if (!isBot(req)) track('tool:dl');
      return send(res, 200, r);
    }
    if ((mm = p.match(/^\/api\/dl\/([0-9a-f-]{36})$/)) && m === 'GET') {
      const st = dl.status(mm[1]);
      return st ? send(res, 200, st, { 'Cache-Control': 'no-store' }) : send(res, 404, { error: '任务不存在或已过期' });
    }
    if ((mm = p.match(/^\/dl\/([0-9a-f-]{36})$/)) && (m === 'GET' || m === 'HEAD')) {
      const f = dl.fileOf(mm[1]);
      if (!f) return notFound(req, res);
      return serveFile(req, res, f.path, { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    }
    // 封面等上传图片
    if ((mm = p.match(/^\/u\/([\w.\-]+)$/)) && (m === 'GET' || m === 'HEAD')) {
      if (!IMAGE_EXT.has(extname(mm[1]).toLowerCase())) return send(res, 404, 'Not found');
      return serveFile(req, res, join(UPLOADS, mm[1]), { 'Cache-Control': 'public, max-age=86400' });
    }

    // 后台
    if (p === '/admin' || p === '/admin/') return serveFile(req, res, join(PUBLIC, 'admin', 'index.html'), { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    if (p === '/api/admin/login' && m === 'POST') {
      const ip = ipOf(req), rec = fails.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - rec.t > 15 * 60e3) { rec.n = 0; rec.t = Date.now(); }
      if (Date.now() - allFails.t > 15 * 60e3) { allFails.n = 0; allFails.t = Date.now(); }
      if (rec.n >= 8 || allFails.n >= 40) return send(res, 429, { error: '尝试次数过多，请 15 分钟后再试' });
      const b = await readJson(req, 2048).catch(() => ({}));
      const given = Buffer.from(hashPw(String(b.password || ''), auth.salt)), real = Buffer.from(auth.hash);
      if (given.length !== real.length || !timingSafeEqual(given, real)) { rec.n++; allFails.n++; fails.set(ip, rec); return send(res, 401, { error: '密码不对' }); }
      fails.delete(ip);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${encodeURIComponent(makeSession())}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}` });
    }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: '请先登录' });
      if (m !== 'GET' && req.headers['x-admin'] !== '1') return send(res, 403, { error: 'bad request' });
      return await adminApi(req, res, url, m);
    }

    // 静态文件
    if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (p === '/tools' || p === '/sanguo') { res.writeHead(301, { ...SEC, Location: p + '/' }); return res.end(); }
    if (GUARDED(p) && !guardOk(req, p)) return send(res, 403, 'Forbidden', { 'Cache-Control': 'no-store' });
    let rel = p.endsWith('/') ? p + 'index.html' : p;
    const file = normalize(join(PUBLIC, decodeURIComponent(rel)));
    if (!file.startsWith(PUBLIC + sep) || file.startsWith(join(PUBLIC, 'admin') + sep)) return send(res, 404, 'Not found');
    if (!existsSync(file)) {
      if (extname(rel)) return send(res, 404, 'Not found');
      return notFound(req, res);
    }
    const ext = extname(file).toLowerCase();
    const media = ['.woff2', '.png', '.jpg', '.webp', '.svg'].includes(ext);
    const cache = GUARDED(p) ? (media ? 'private, max-age=604800' : 'private, no-cache') : ext === '.html' ? 'no-cache' : media ? 'public, max-age=604800' : 'no-cache';
    return serveFile(req, res, file, { 'Cache-Control': cache, ...(GUARDED(p) ? { Vary: 'User-Agent, Referer, Sec-Fetch-Site', ...(isPage(p) ? {} : { 'X-Robots-Tag': 'noindex' }) } : {}) });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: '服务器出错' });
  }
});

async function adminApi(req, res, url, m) {
  const p = url.pathname; let mm;
  if (p === '/api/admin/items' && m === 'GET') return send(res, 200, { items: itemsWithFiles(), used: totalUploadBytes(), quota: MAX_TOTAL, maxFile: MAX_FILE });
  if (p === '/api/admin/items' && m === 'POST') {
    const v = normItem(await readJson(req)); if (!v.title) return send(res, 400, { error: '标题不能为空' });
    if (!v.sort) v.sort = (db.prepare('SELECT COALESCE(MAX(sort),0)+10 s FROM items WHERE kind=?').get(v.kind).s);
    const r = db.prepare(`INSERT INTO items(${ITEM_FIELDS.join(',')}) VALUES(${ITEM_FIELDS.map(() => '?').join(',')})`).run(...ITEM_FIELDS.map(f => v[f]));
    return send(res, 200, { id: Number(r.lastInsertRowid) });
  }
  if ((mm = p.match(/^\/api\/admin\/items\/(\d+)$/))) {
    const id = +mm[1];
    if (m === 'PUT') {
      const v = normItem(await readJson(req)); if (!v.title) return send(res, 400, { error: '标题不能为空' });
      db.prepare(`UPDATE items SET ${ITEM_FIELDS.map(f => f + '=?').join(',')} WHERE id=?`).run(...ITEM_FIELDS.map(f => v[f]), id);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      for (const f of filesOf(id)) { const s = db.prepare('SELECT stored FROM files WHERE id=?').get(f.id); try { unlinkSync(join(UPLOADS, s.stored)); } catch {} }
      db.prepare('DELETE FROM items WHERE id=?').run(id);
      return send(res, 200, { ok: true });
    }
  }
  // 上传：PUT /api/admin/upload?name=xxx&as=cover|file&item=<id>，请求体就是文件本身
  if (p === '/api/admin/upload' && m === 'PUT') {
    const name = clean(url.searchParams.get('name'), 160).replace(/[\/\\\0]/g, '_') || 'file';
    const as = url.searchParams.get('as') === 'cover' ? 'cover' : 'file';
    const len = +req.headers['content-length'] || 0;
    if (as === 'cover' && !IMAGE_EXT.has(extname(name).toLowerCase())) return send(res, 400, { error: '封面只支持 png / jpg / webp / gif' });
    if (as === 'cover' && len > 8 * 1024 * 1024) return send(res, 413, { error: '封面不能超过 8 MB' });
    if (len > MAX_FILE) return send(res, 413, { error: `单个文件不能超过 ${MAX_FILE / 1048576} MB` });
    if (totalUploadBytes() + len > MAX_TOTAL) return send(res, 413, { error: '附件总空间已满，先删一些旧文件' });
    const item = +url.searchParams.get('item');
    if (as === 'file' && !db.prepare('SELECT 1 FROM items WHERE id=?').get(item)) return send(res, 400, { error: '请先保存条目再上传附件' });
    const stored = randomUUID().replace(/-/g, '').slice(0, 16) + (as === 'cover' ? extname(name).toLowerCase() : '.bin');
    const dest = join(UPLOADS, stored), out = createWriteStream(dest);
    let size = 0, over = false;
    req.on('data', c => { size += c.length; if (size > (as === 'cover' ? 8 * 1048576 : MAX_FILE)) { over = true; req.destroy(); } });
    await new Promise(r => { req.pipe(out); out.on('close', r); out.on('error', r); req.on('aborted', () => { over = true; out.destroy(); }); });
    if (over || size === 0 || !req.complete) { try { unlinkSync(dest); } catch {} return send(res, 400, { error: '上传中断或文件过大' }); }
    if (as === 'cover') return send(res, 200, { cover: stored });
    const r = db.prepare('INSERT INTO files(item_id,name,stored,size) VALUES(?,?,?,?)').run(item, name, stored, size);
    return send(res, 200, { id: Number(r.lastInsertRowid), name, size });
  }
  if ((mm = p.match(/^\/api\/admin\/files\/(\d+)$/)) && m === 'DELETE') {
    const f = db.prepare('SELECT stored FROM files WHERE id=?').get(+mm[1]);
    if (f) { try { unlinkSync(join(UPLOADS, f.stored)); } catch {} db.prepare('DELETE FROM files WHERE id=?').run(+mm[1]); }
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/stats' && m === 'GET') {
    const days = Math.min(90, Math.max(7, +url.searchParams.get('days') || 30));
    const since = new Date(Date.now() + 8 * 36e5 - days * 864e5).toISOString().slice(0, 10);
    const rows = db.prepare('SELECT day,key,n FROM stats WHERE day>=? ORDER BY day').all(since);
    const items = Object.fromEntries(db.prepare('SELECT id,title FROM items').all().map(i => [i.id, i.title]));
    const files = db.prepare('SELECT f.id,f.name,f.downloads,i.title item FROM files f JOIN items i ON i.id=f.item_id ORDER BY f.downloads DESC LIMIT 20').all();
    return send(res, 200, { since, rows, items, files });
  }
  return send(res, 404, { error: 'not found' });
}

server.listen(PORT, () => console.log(`listening on :${PORT}, data in ${DATA}`));
