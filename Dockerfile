FROM node:24-alpine
WORKDIR /app
# 视频下载工具：ffmpeg 合并音视频；yt-dlp 从 PyPI 装进 node 用户可写的 venv，服务每天自动升级
# （服务器上 GitHub 发行文件下载常超时，所以不用单文件版）
RUN apk add --no-cache ffmpeg python3 \
 && python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir -q "yt-dlp[default]" \
 && chown -R node:node /opt/ytdlp && /opt/ytdlp/bin/yt-dlp --version
ENV YTDLP=/opt/ytdlp/bin/yt-dlp
COPY server ./server
COPY public ./public
COPY seed-covers ./seed-covers
ENV PORT=80 DATA_DIR=/data NODE_ENV=production
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
CMD ["sh", "-c", "node server/server.mjs & pid=$!; sleep 2; node server/seed.mjs; wait $pid"]
