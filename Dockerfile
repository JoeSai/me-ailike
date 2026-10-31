FROM node:24-alpine
WORKDIR /app
COPY server ./server
COPY public ./public
COPY seed-covers ./seed-covers
ENV PORT=80 DATA_DIR=/data NODE_ENV=production
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
CMD ["sh", "-c", "node server/server.mjs & pid=$!; sleep 2; node server/seed.mjs; wait $pid"]
