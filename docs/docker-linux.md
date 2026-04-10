# Linux Docker 部署

这个项目现在可以直接通过 Docker Compose 在 Linux 上启动。

## 前置要求

- Docker Engine
- Docker Compose 插件

## 启动项目

```bash
docker compose up --build -d
```

启动后：

- 前端地址：`http://localhost:8080`
- 后端健康检查：`http://localhost:3000/api/health`

## 停止项目

```bash
docker compose down
```

## 自定义端口

```bash
FRONTEND_PORT=80 BACKEND_PORT=3000 docker compose up --build -d
```

## 说明

- 前端由 Nginx 托管，并通过反向代理转发 `/api` 和 `/socket.io` 到后端服务
- 当前端没有设置 `VITE_SOCKET_URL` 时，会默认使用浏览器当前访问域名，适合 Docker 部署
