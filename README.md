# me.ailike.fun · 代码侦探主页

个人主页：视频、开源项目、作品与在线工具入口，附带一个轻量后台（访问统计、封面管理）。

线上：<https://me.ailike.fun/>

## 仓库结构

本仓库公开，只放主页本身。工具与个人作品的源码在私有仓库 `私有仓库`，本地克隆到 `private/`（已被本仓库忽略）。

```
me-ailike/                 公开：JoeSai/me-ailike
├── server/                Node 服务（静态文件、后台 API、视频下载接口）
├── public/                主页静态文件；tools/ 只含工具目录页与卡片清单（tools.js）
├── design/                主页、Lab、Games 共用的样式（改这里，再跑 scripts/sync-design.sh）
├── seed-covers/           首次启动时写入的默认封面
├── scripts/deploy.sh      部署到服务器
└── private/               私有：私有仓库（独立 git 仓库）
    ├── tools/             各个在线工具页面，上线到 /tools/
    ├── tools-src/         工具的原始素材与构建脚本
    └── sites/
        ├── sanguo/        三国舆图，上线到 /sanguo/
        ├── lab/           lab.ailike.fun
        └── games/         游戏作品页
```

## 新机器上准备

```sh
git clone https://github.com/JoeSai/me-ailike.git
cd me-ailike
git clone https://github.com/私有仓库.git private
```

## 本地运行

```sh
ADMIN_PASSWORD=任意密码 node server/server.mjs     # http://localhost:8080
```

## 部署

```sh
echo 'SSH=/path/to/ssh-wrapper' > scripts/.deploy.local   # 只需一次，不入库
sh scripts/deploy.sh
```

脚本会备份服务器现有版本，再把 `public/` 连同 `private/tools`、`private/sites/sanguo` 的运行文件一起上传，只重建主页容器。缺少 `private/` 时默认拒绝部署，免得线上工具消失。

## 加一个在线工具

1. 页面放进 `private/tools/`，在私有仓库提交。
2. 在本仓库 `public/tools/tools.js` 的 `CD_TOOLS` 里加一张卡片，封面放 `public/tools/img/`。
3. 两个仓库各自提交、推送，然后部署。
