# 代码侦探 · 共享风格

主页、Lab、Games 用同一套样式和交互。**只改这里**，再同步到各站。

```sh
sh scripts/sync-design.sh      # 复制到 public/cd、sites/lab/cd、sites/games/cd
```

## 内容

| 文件 | 作用 |
|---|---|
| `cd.css` | 颜色、字体、网格纸背景、顶栏、链接行、药丸、悬停预览、返回条 |
| `cd.js` | `data-roll` 文字滚动、`data-reveal` 淡入、`data-peek` 跟随小图、`data-magnet` 磁吸 |
| `fonts/` | 抖音美好体（OFL） |
| `img/` | 豆探透明姿势、红印章 favicon |

## 用法

```html
<link rel="stylesheet" href="/cd/cd.css">
<body class="cd">
  <header class="cd-bar"><a class="cd-brand" href="/"><b>代码侦探</b><span>/ Lab</span></a></header>
  <ul class="cd-rows">
    <li><a class="cd-row" href="…" data-peek="预览图.webp">
      <span class="cd-no">01</span><span class="cd-name" data-roll>名称</span><span class="cd-note">一句话</span><span class="cd-arrow">→</span>
    </a></li>
  </ul>
<script src="/cd/cd.js"></script>
```

## 规则

- 文字短。标题一行，说明一句，能不写就不写。
- 一个强调色（朱红）。其他颜色只出现在作品自己的画面里。
- 每个可点的东西都有反应：行变黑、文字上滚、箭头循环。
- 动效必须尊重 `prefers-reduced-motion`。
