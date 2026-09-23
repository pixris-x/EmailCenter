# Email Center 后端镜像：仅安装 backend 生产依赖，镜像内不携带任何密钥

FROM m.daocloud.io/docker.io/library/node:22-alpine

ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/

RUN pnpm install \
    --filter email-center-backend \
    --prod \
    --frozen-lockfile

COPY backend/src ./backend/src
COPY backend/scripts ./backend/scripts

WORKDIR /app/backend

EXPOSE 4121

CMD ["node", "src/server.js"]