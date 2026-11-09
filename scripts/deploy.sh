#!/bin/sh
# 部署到 me.ailike.fun。只动服务器上的主页目录，不碰服务器上的其他服务。
# 用法：sh scripts/deploy.sh
# 本机配置写在 scripts/.deploy.local（不入库）：SSH、REMOTE
# private/ 里的工具和作品会一并打包上线。
set -eu
cd "$(dirname "$0")/.."
[ -f scripts/.deploy.local ] && . scripts/.deploy.local
SSH="${SSH:?先在 scripts/.deploy.local 或环境变量里设置 SSH}"
REMOTE="${REMOTE:?先在 scripts/.deploy.local 或环境变量里设置 REMOTE}"
# 服务器上会先删掉 public 再解包，缺了 private 会让线上工具和舆图消失，所以默认拒绝
if [ ! -d private/tools ] || [ ! -d private/sites/sanguo ]; then
  [ "${ALLOW_NO_PRIVATE:-0}" = 1 ] || { echo "缺少 private/。确需只发主页，设 ALLOW_NO_PRIVATE=1"; exit 1; }
fi
STAMP=$(date +%Y%m%d-%H%M%S)

echo "1/4 备份服务器上的现有版本"
sh "$SSH" "cd $REMOTE && mkdir -p backups && tar --exclude=backups --exclude='._*' --exclude=data -czf backups/before-$STAMP.tgz . && ls -la backups | tail -3"

echo "2/4 上传新版本（不含 data 和备份）"
# DEPLOY_EXCLUDE：空格分隔的路径，跳过还没准备好上线的文件，例如 DEPLOY_EXCLUDE="public/tools/draft.html"
EXCLUDES=""; for x in ${DEPLOY_EXCLUDE:-}; do EXCLUDES="$EXCLUDES --exclude=$x"; done
# shellcheck disable=SC2086
# 私有部分先整理到临时目录（三国舆图的源码压缩打包，不上传原始源码），再映射进 public：tools → public/tools，sanguo → public/sanguo
STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
sh scripts/build-private.sh "$STAGE/public" >/dev/null
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs $EXCLUDES \
  -cf - Dockerfile compose.yaml .dockerignore server public seed-covers -C "$STAGE" public/tools public/sanguo \
  | sh "$SSH" "cd $REMOTE && mkdir -p data && rm -rf server public seed-covers && tar xf - && find . -name '._*' -not -path './backups/*' -delete"

echo "3/4 首次部署时写入后台密码（密码文件只在本机和服务器 .env 里）"
if ! sh "$SSH" "test -f $REMOTE/data/auth.json || test -f $REMOTE/.env"; then
  sh "$SSH" "cd $REMOTE && umask 077 && printf 'ADMIN_PASSWORD=%s\n' \"\$(cat)\" > .env" < .admin-password
fi

echo "4/4 只重建主页容器"
sh "$SSH" "cd $REMOTE && chown -R 1000:1000 data 2>/dev/null || true; docker compose up -d --build --no-deps web && sleep 4 && docker ps --filter name=personal-site-web --format '{{.Names}} {{.Status}}'"
echo "完成：https://me.ailike.fun/"
