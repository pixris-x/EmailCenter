# Email Center 前端镜像：Vite 构建产物纯静态托管

FROM m.daocloud.io/docker.io/library/node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

RUN pnpm install \
    --filter email-center-frontend \
    --frozen-lockfile

COPY frontend/ ./frontend/

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm --filter email-center-frontend run build


FROM m.daocloud.io/docker.io/library/nginx:alpine

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

RUN find /usr/share/nginx/html -type d -exec chmod 755 {} \; \
    && find /usr/share/nginx/html -type f -exec chmod 644 {} \;

EXPOSE 80