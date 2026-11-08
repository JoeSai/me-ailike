#!/bin/sh
# 部署到 me.ailike.fun。只动 /path/to/site，不碰 服务器上的其他服务。
# 用法：sh scripts/deploy.sh          （需要本机 ssh 包装脚本，路径见 SSH）
set -eu
SSH="${SSH:?先在 scripts/.deploy.local 或环境变量里设置 SSH}"
REMOTE=/path/to/site
cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d-%H%M%S)

echo "1/4 备份服务器上的现有版本"
sh "$SSH" "cd $REMOTE && mkdir -p backups && tar --exclude=backups --exclude='._*' --exclude=data -czf backups/before-$STAMP.tgz . && ls -la backups | tail -3"

echo "2/4 上传新版本（不含 data 和备份）"
# DEPLOY_EXCLUDE：空格分隔的路径，跳过还没准备好上线的文件，例如 DEPLOY_EXCLUDE="public/tools/draft.html"
EXCLUDES=""; for x in ${DEPLOY_EXCLUDE:-}; do EXCLUDES="$EXCLUDES --exclude=$x"; done
# shellcheck disable=SC2086
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs $EXCLUDES -cf - Dockerfile compose.yaml .dockerignore server public seed-covers \
  | sh "$SSH" "cd $REMOTE && mkdir -p data && rm -rf server public seed-covers && tar xf - && find . -name '._*' -not -path './backups/*' -delete"

echo "3/4 首次部署时写入后台密码（密码文件只在本机和服务器 .env 里）"
if ! sh "$SSH" "test -f $REMOTE/data/auth.json || test -f $REMOTE/.env"; then
  sh "$SSH" "cd $REMOTE && umask 077 && printf 'ADMIN_PASSWORD=%s\n' \"\$(cat)\" > .env" < .admin-password
fi

echo "4/4 只重建主页容器"
sh "$SSH" "cd $REMOTE && chown -R 1000:1000 data 2>/dev/null || true; docker compose up -d --build --no-deps web && sleep 4 && docker ps --filter name=personal-site-web --format '{{.Names}} {{.Status}}'"
echo "完成：https://me.ailike.fun/"
