// 首次部署的初始内容：只在 items 表为空时写入。之后一切在 /admin 里改。
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
mkdirSync(join(DATA, 'uploads'), { recursive: true });
const db = new DatabaseSync(join(DATA, 'site.db'));
if (!db.prepare("SELECT name FROM sqlite_master WHERE name='items'").get()) { console.error('先启动一次 server 建表'); process.exit(1); }
if (db.prepare('SELECT COUNT(*) c FROM items').get().c) { console.log('已有内容，跳过 seed'); process.exit(0); }

const DOUYIN = 'https://www.douyin.com/user/MS4wLjABAAAArWDxkCgxKLOPmi8kLilz-FXmDDy6KRQjK_DmpEfVcNB9J-UTGg9OnI2EzuH3CL-2';
const gh = (path) => `https://github.com/${path}`;
const items = [
  // 视频：封面从 seed-covers 复制。url 先用抖音主页占位，在后台换成单条视频链接。
  { kind: 'video', title: 'HatchZip：原地解压压缩包', desc: '双击就在原地展开，不用再找解压到哪了。', url: DOUYIN, cover: 'hatchzip.jpg', date: '2026-10-25' },
  { kind: 'video', title: 'PixelFX：开源像素特效库', desc: '给像素游戏加爆炸、火花和魔法，几行代码。', url: DOUYIN, cover: 'pixelfx.jpg', date: '2026-10-31' },
  { kind: 'video', title: 'Pixel VFX Forge：一句话做像素特效', desc: '说一句话，生成一张能直接进游戏的特效。', url: DOUYIN, cover: 'pixel-vfx.jpg', date: '2026-10-28' },
  { kind: 'video', title: 'TwinDesk：电脑手机合成一张桌子', desc: '鼠标推出屏幕就走进另一台电脑。免费开源。', url: DOUYIN, cover: 'twindesk.jpg', date: '2026-10-31' },

  // 开源项目：来自飞书表格“开源项目推荐”
  { kind: 'oss', title: 'pixelfx', desc: '开源像素特效库', url: gh('patch-gg/pixelfx'), tags: '游戏', date: '2026-10-31' },
  { kind: 'oss', title: 'POSE-DB-01', desc: '姿势收集数据库', url: 'https://ai-pose-gallery.pages.dev/', tags: '其他', date: '2026-10-29' },
  { kind: 'oss', title: 'pixel-vfx-forge', desc: '一句话做像素特效（skill 在该网页下载）', url: 'https://www.scenario.com/explorations/pixel-vfx-forge/', tags: '游戏,美术', date: '2026-10-28' },
  { kind: 'oss', title: 'hatchzip', desc: '原地解压压缩包', url: gh('xevrion/hatchzip'), tags: '工具', date: '2026-10-25' },
  { kind: 'oss', title: 'sprite-normals', desc: '像素艺术法线生成器', url: gh('Hugo-Dz/spritefusion-sprite-normals'), tags: '游戏', date: '2026-10-22' },
  { kind: 'oss', title: 'motion-prompt', desc: '动效提示词，博主翻译成了中文术语', url: gh('showheyohtaki/motion-prompt'), demo: 'https://showheyohtaki.github.io/motion-prompt/', tags: '前端创意', date: '2026-10-20' },
  { kind: 'oss', title: 'tv-vibehack', desc: '电视去广告', url: gh('Gathin23/cleanyourtv'), tags: '工具', date: '2026-10-19' },
  { kind: 'oss', title: 'SCSKiller', desc: '消除游戏着色器编译类型的卡顿', url: gh('BlueHeisenberg/SCSKiller'), tags: '工具,游戏', date: '2026-10-14' },
  { kind: 'oss', title: 'rea', desc: '逆向工程', url: gh('morluto/rea'), tags: '全栈', date: '2026-10-10' },
  { kind: 'oss', title: 'sprite-gen', desc: '一张图生成角色动画', url: gh('aldegad/sprite-gen'), tags: '美术', date: '2026-10-04' },
  { kind: 'oss', title: 'See-through', desc: '角色拆图', url: gh('shitagaki-lab/see-through'), tags: '美术', date: '2026-10-03' },
  { kind: 'oss', title: '字面 JIZURA', desc: '文字 PV', url: gh('852wa/JIZURA'), demo: 'https://852wa.github.io/JIZURA/zh-hans/', tags: '视频创作', date: '2026-09-26' },
  { kind: 'oss', title: 'threejs-ai-playground', desc: '口袋引力', tags: '游戏' },
  { kind: 'oss', title: 'butterfly-qr', desc: '月光蝶群二维码', url: gh('JoeSai/butterfly-qr'), tags: '前端创意', date: '2026-09-01' },
  { kind: 'oss', title: 'Goldie', desc: 'App 上架用的屏幕截图生成器', url: gh('kacperkapusciak/goldie'), tags: 'iOS,安卓,App', date: '2026-08-31' },
  { kind: 'oss', title: 'OpenMAIC', desc: '开放式多智能体交互式课堂', url: gh('THU-MAIC/OpenMAIC'), tags: '教育', date: '2026-08-30' },
  { kind: 'oss', title: 'Kando', desc: '高效的桌面跨平台菜单', url: gh('kando-menu/kando'), tags: '效率工具', date: '2026-08-29' },
  { kind: 'oss', title: 'threeui', desc: '网页设计中真实可互动的 3D 组件模板', url: gh('MengTo/threeui'), tags: '网页设计', date: '2026-08-28' },
  { kind: 'oss', title: 'ai-creature-cabinet', desc: 'AI 生物陈列柜', url: gh('albertobeiz/kindergrimm'), tags: '前端创意', date: '2026-08-21' },
  { kind: 'oss', title: 'html-video', desc: '面向编程智能体的程序化视频工具', url: gh('nexu-io/html-video'), tags: '视频创作', date: '2026-07-06' },

  // 作品
  { kind: 'work', title: 'Games', desc: '翻开一本手绘游戏册，开始玩。西瓜保卫战等 Unity 小游戏。', url: 'https://games.ailike.fun/', tone: 'red' },
  { kind: 'work', title: 'Lab', desc: '浏览器里的互动视觉作品。', url: 'https://lab.ailike.fun/', tone: 'ink' },

  // 归档
  { kind: 'archive', title: '终场预言局', desc: '2026 世界杯赛前预测', url: 'https://worldcup.ailike.fun/' },
  { kind: 'archive', title: 'Unity 面试手册', desc: '从入门到发布的系统化面试知识', url: 'https://unity.ailike.fun/' },
];
const cols = ['kind','title','desc','url','demo','video','tags','cover','tone','date','sort'];
const ins = db.prepare(`INSERT INTO items(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
const count = {};
for (const it of items) {
  count[it.kind] = (count[it.kind] || 0) + 1;
  const sort = 1000 - count[it.kind] * 10;
  if (it.cover) { const src = join(ROOT, 'seed-covers', it.cover); if (existsSync(src)) copyFileSync(src, join(DATA, 'uploads', it.cover)); }
  ins.run(...cols.map(c => c === 'sort' ? sort : (it[c] ?? '')));
}
console.log(`seeded ${items.length} items`);
