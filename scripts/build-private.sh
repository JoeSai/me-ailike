#!/bin/sh
# 把 private/ 里要上线的部分整理到一个临时目录：三国舆图的脚本和数据打成一个压缩后的 main.js（去掉注释、改短变量名），
# 原始源码不上服务器。用法：sh scripts/build-private.sh <输出目录>，deploy.sh 会调用。
set -eu
cd "$(dirname "$0")/.."
OUT="${1:?输出目录}"
rm -rf "$OUT"; mkdir -p "$OUT/tools" "$OUT/sanguo/js" "$OUT/sanguo/data"
cp -R private/tools/. "$OUT/tools/"
rm -f "$OUT/tools/video-download.html"   # 视频下载未上线，接口也默认关闭
S=private/sites/sanguo
for x in index.html css img fonts vendor; do cp -R "$S/$x" "$OUT/sanguo/"; done
cp "$S/data/geo.json" "$OUT/sanguo/data/"
"$S/node_modules/.bin/esbuild" "$S/js/main.js" --bundle --format=esm --minify --legal-comments=none --charset=utf8 --target=es2022 \
  --outfile="$OUT/sanguo/js/main.js" --log-level=warning
# 换掉缓存参数，访客一定拿到新打包的文件
V=$(shasum "$OUT/sanguo/js/main.js" | cut -c1-8)
sed -i '' "s#js/main.js?v=[0-9a-z]*#js/main.js?v=$V#" "$OUT/sanguo/index.html"
find "$OUT" -name '.DS_Store' -delete
echo "私有部分已整理到 $OUT（三国舆图 main.js $(wc -c < "$OUT/sanguo/js/main.js") 字节）"
