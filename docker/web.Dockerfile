# syntax=docker/dockerfile:1
# Email Center 前端镜像：Vite 构建产物纯静态托管。
# 不做 /api 反代，API 路由由宿主机反向代理直接指向 api 容器发布的 4121 端口。
FROM node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# 先拷贝 workspace 清单以利用层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

RUN pnpm install --filter email-center-frontend --frozen-lockfile

COPY frontend/ ./frontend/

# 与生产约定一致：前端统一走 /api 前缀
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter email-center-frontend run build

FROM nginx:alpine

# 仅 SPA fallback（前端为 createWebHistory，深链接刷新需回退 index.html）
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
