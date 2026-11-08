// 视频下载工具：服务器用 yt-dlp 下载到临时目录，访客轮询进度后取文件。
// 限流保护服务器（同机还跑着 VPN）：同时只跑 1 个任务、排队上限、每个 IP 每小时次数、单文件大小、下载限速、30 分钟后删除。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import { isIP } from 'node:net';

const BIN = process.env.YTDLP || 'yt-dlp';
const ROOT = process.env.DL_DIR || '/tmp/cd-dl';
const MAX_RUN = 1;               // 同时下载数
const MAX_QUEUE = 5;             // 排队上限
const PER_IP_HOUR = 6;           // 每个 IP 每小时次数
const MAX_SIZE = '500M';         // 单个文件
const MAX_TOTAL = 3 * 1024 ** 3; // 临时目录总量
const KEEP_MS = 30 * 60e3;       // 文件保留时间
const JOB_MS = 12 * 60e3;        // 单个任务最长时间
const RATE = '8M';               // 下载限速（字节/秒）

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

const jobs = new Map();          // id -> job
const queue = [];
const hits = new Map();          // ip -> [时间戳]
let running = 0;

// 从分享文案里取出第一个链接，比如“复制打开抖音…… https://v.douyin.com/xxx/ ……”
export function pickUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s"'<>，。、！？【】（）]+/i);
  if (!m) return '';
  let u; try { u = new URL(m[0]); } catch { return ''; }
  const h = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return '';
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || isIP(h.replace(/^\[|\]$/g, ''))) return '';
  if (!h.includes('.') || /(^|\.)ailike\.fun$/.test(h)) return '';
  return u.href.slice(0, 1000);
}

function dirSize() {
  let n = 0;
  for (const j of jobs.values()) if (j.size) n += j.size;
  return n;
}

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if ((j.state === 'done' || j.state === 'error') && now - j.ended > KEEP_MS) drop(id);
  }
  for (const [ip, ts] of hits) {
    const keep = ts.filter(t => now - t < 3600e3);
    keep.length ? hits.set(ip, keep) : hits.delete(ip);
  }
}
setInterval(sweep, 60e3).unref();

// 平台改版后旧版 yt-dlp 会失效：启动后和之后每天空闲时升级一次
function update() {
  if (running) return setTimeout(update, 10 * 60e3).unref();
  // pip 安装的 yt-dlp 不能 -U，改用同一个 venv 里的 pip 升级
  const pip = BIN.replace(/yt-dlp$/, 'pip');
  const c = BIN.startsWith('/opt/ytdlp/')
    ? spawn(pip, ['install', '-U', '-q', '--no-cache-dir', 'yt-dlp[default]'], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(BIN, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
  c.on('close', code => console.log('[dl] yt-dlp 升级', code === 0 ? '完成' : '失败', out.trim().split('\n').pop() || ''));
  c.on('error', e => console.error('[dl] update', e.message));
}
setTimeout(update, 20e3).unref();
setInterval(update, 24 * 3600e3).unref();

function drop(id) {
  jobs.delete(id);
  rmSync(join(ROOT, id), { recursive: true, force: true });
}

// 腾出磁盘：先删最早完成的
function makeRoom() {
  const done = [...jobs.values()].filter(j => j.state === 'done').sort((a, b) => a.ended - b.ended);
  while (dirSize() > MAX_TOTAL && done.length) drop(done.shift().id);
}

const REASONS = [
  [/Unsupported URL|no suitable InfoExtractor/i, '这个网站暂时不支持'],
  [/larger than max-filesize|File is larger/i, '视频超过 500 MB'],
  [/does not pass filter|is_live|live event/i, '直播或超过 90 分钟的视频不支持'],
  [/Fresh cookies|cookies|login required|log in|Sign in to confirm|not a bot/i, '这个平台要求登录才能下载，暂时下不了'],
  [/Private video|private/i, '这是私密视频'],
  [/HTTP Error 404|not found|has been removed|unavailable/i, '视频不存在或已删除'],
  [/HTTP Error 403|Forbidden/i, '平台拒绝了下载请求，稍后再试'],
  [/timed out|timeout/i, '连接超时，稍后再试'],
];
const reasonOf = log => {
  const key = log.split('\n').filter(l => /ERROR|max-filesize|pass filter/i.test(l)).join('\n') || log;
  return (REASONS.find(([re]) => re.test(key)) || [, '下载失败，换个链接试试'])[1];
};

function run(job) {
  running++;
  job.state = 'running';
  job.started = Date.now();
  const dir = join(ROOT, job.id);
  mkdirSync(dir, { recursive: true });
  const args = [
    '--ignore-config', '--no-playlist', '--no-exec', '--no-mtime', '--newline', '--no-colors',
    '--ies', 'default,-generic',
    '--js-runtimes', 'node',
    '--max-filesize', MAX_SIZE, '--limit-rate', RATE,
    '--match-filter', '!is_live & duration <=? 5400',
    '-f', 'bv*+ba/b', '-S', 'res:1080,vcodec:h264,acodec:aac,ext:mp4:m4a',
    '--merge-output-format', 'mp4',
    '--socket-timeout', '20', '--retries', '3', '--fragment-retries', '3',
    '--cache-dir', join(ROOT, '.cache'),
    '-o', join(dir, '%(title).70B [%(id)s].%(ext)s'),
    '--no-simulate', '--progress',
    '--print', 'before_dl:T %(title)s',
    '--print', 'after_move:F %(filepath)s',
    '--progress-template', 'download:P %(progress._percent_str)s',
    '--', job.url,
  ];
  const child = spawn(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  let log = '', file = '', parts = 0, last = -1;
  const timer = setTimeout(() => { job.timedOut = true; child.kill('SIGKILL'); }, JOB_MS);
  const onLine = line => {
    if (line.startsWith('T ')) job.title = line.slice(2).trim().slice(0, 200);
    else if (line.startsWith('F ')) file = line.slice(2).trim();
    else if (line.startsWith('P ')) {
      const v = parseFloat(line.slice(2));
      if (Number.isFinite(v)) {
        if (v + 5 < last) parts++;  // 视频和音频分开下载时进度会从头开始
        last = v;
        job.progress = Math.min(99, Math.round(parts ? 50 + v / 2 : v));
        job.part = parts + 1;
      }
    } else if (line.trim()) log = (log + line + '\n').slice(-6000);
  };
  let buf = '';
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } });
  child.stderr.on('data', d => { log = (log + d).slice(-6000); });
  child.on('close', code => {
    clearTimeout(timer);
    if (buf) onLine(buf);
    running--;
    job.ended = Date.now();
    let st = null;
    if (!file) { const f = readdirSync(dir).filter(n => !/\.(part|ytdl|temp)$/.test(n)); if (f.length === 1) file = join(dir, f[0]); }
    try { if (file && file.startsWith(dir + '/')) st = statSync(file); } catch {}
    if (code === 0 && st && st.isFile()) {
      Object.assign(job, { state: 'done', progress: 100, file, name: basename(file), size: st.size });
      makeRoom();
    } else {
      const why = job.timedOut ? '下载太久被停止了，换个短一点的视频试试' : reasonOf(log);
      Object.assign(job, { state: 'error', error: why });
      if (log.trim()) console.error('[dl]', job.url, log.trim().split('\n').slice(-3).join(' | '));
      rmSync(dir, { recursive: true, force: true });
    }
    next();
  });
  child.on('error', e => { console.error('[dl] spawn', e.message); });
}

function next() {
  while (running < MAX_RUN && queue.length) run(queue.shift());
}

// 返回 { id } 或 { error, code }
export function submit(text, ip) {
  const url = pickUrl(text);
  if (!url) return { code: 400, error: '没找到链接，请粘贴视频页面地址或分享文案' };
  sweep();
  const now = Date.now();
  const mine = [...jobs.values()].filter(j => j.ip === ip && (j.state === 'queued' || j.state === 'running'));
  if (mine.length) return { code: 429, error: '你还有一个视频在下载，等它完成再试' };
  const ts = hits.get(ip) || [];
  if (ts.length >= PER_IP_HOUR) return { code: 429, error: `每小时最多下载 ${PER_IP_HOUR} 个，过一会儿再来` };
  if (queue.length >= MAX_QUEUE) return { code: 503, error: '现在排队的人太多，过几分钟再试' };
  const id = randomUUID();
  const job = { id, url, ip, state: 'queued', progress: 0, created: now };
  jobs.set(id, job);
  ts.push(now); hits.set(ip, ts);
  queue.push(job);
  next();
  return { id };
}

export function status(id) {
  const j = jobs.get(id);
  if (!j) return null;
  const ahead = j.state === 'queued' ? queue.indexOf(j) + 1 : 0;
  return { state: j.state, progress: j.progress, part: j.part || 1, title: j.title || '', name: j.name || '', size: j.size || 0, error: j.error || '', ahead,
    expires: j.state === 'done' ? j.ended + KEEP_MS : 0 };
}

export function fileOf(id) {
  const j = jobs.get(id);
  return j && j.state === 'done' ? { path: j.file, name: j.name } : null;
}
