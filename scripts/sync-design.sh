#!/bin/sh
# 把 design/ 复制到各站的 cd/ 目录。改完 design 后运行，再部署各站。
set -eu
cd "$(dirname "$0")/.."
for dest in public/cd sites/lab/cd sites/games/cd; do
  mkdir -p "$dest"
  rm -rf "$dest/fonts" "$dest/img"
  cp -R design/cd.css design/cd.js design/back.js design/fonts design/img "$dest/"
  echo "synced → $dest"
done
