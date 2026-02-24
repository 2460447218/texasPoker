# 德州扑克在线版部署指南

本项目采用 **前后端分离** 架构，但为了部署方便，我们已经修改了后端代码，支持将前端打包后的文件托管在后端服务器上。

这意味着你可以将整个项目部署为一个 Node.js 服务。

## 方案一：云平台一键部署 (推荐)

推荐使用 **Render**、**Railway** 或 **Heroku** 等提供免费层级的 PaaS 服务。

### 1. 准备代码
确保你的代码已经提交到 GitHub。

### 2. 配置前端构建
在部署前，你需要先编译前端代码为 H5 网页。

1.  在本地电脑上，进入 `frontend` 目录。
2.  运行构建命令：
    ```bash
    npm run build:h5
    ```
3.  构建完成后，会在 `frontend/dist/build/h5` 目录下生成一堆静态文件（index.html, static 文件夹等）。
4.  **关键步骤**：将 `frontend/dist/build/h5` 目录下的**所有文件**，复制到 `backend/public` 文件夹中。
    *   如果 `backend` 下没有 `public` 文件夹，请手动创建一个。
    *   复制后，`backend/public/index.html` 应该是存在的。
5.  将包含 `public` 文件夹的 `backend` 代码提交到 GitHub。

### 3. 部署到 Render (示例)
1.  注册并登录 [Render](https://render.com/)。
2.  点击 **New +** -> **Web Service**。
3.  连接你的 GitHub 仓库。
4.  配置如下：
    *   **Root Directory**: `backend` (非常重要！因为我们的 server.js 在这里)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node server.js`
5.  点击 **Create Web Service**。
6.  等待部署完成后，Render 会给你一个 URL (例如 `https://texas-poker.onrender.com`)。

### 4. 开始游戏
打开那个 URL，你就能看到游戏界面了！
*   注意：在线上环境中，前端页面的“服务器地址”框，请留空或填入你的线上域名（如果有自动推导逻辑，留空即可）。

---

## 方案二：传统服务器部署 (VPS)

如果你有自己的云服务器 (阿里云/腾讯云/AWS)，可以使用此方案。

### 1. 环境准备
确保服务器安装了：
*   Node.js (v14+)
*   Nginx (可选，用于反向代理)
*   PM2 (用于进程守护)

### 2. 获取代码
```bash
git clone https://github.com/your-repo/texas-poker.git
cd texas-poker
```

### 3. 构建前端
```bash
cd frontend
npm install
npm run build:h5
# 将构建产物移动到后端目录
mkdir -p ../backend/public
cp -r dist/build/h5/* ../backend/public/
```

### 4. 启动后端
```bash
cd ../backend
npm install
# 使用 PM2 启动
pm2 start server.js --name texas-poker
```

### 5. (可选) 配置 Nginx
如果你想通过域名访问（例如 `poker.example.com`），可以配置 Nginx 反向代理到 3000 端口。

```nginx
server {
    listen 80;
    server_name poker.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 常见问题

### 1. WebSocket 连接失败
*   **现象**：一直显示“正在连接服务器...”。
*   **原因**：可能是服务器防火墙没开 3000 端口，或者 Nginx 没有配置 WebSocket 转发（Upgrade 头）。
*   **解决**：检查安全组规则，或者参考上面的 Nginx 配置。如果是 Render/Heroku，它们通常只开放 80/443 端口，代码里的 `process.env.PORT` 会自动处理，你只需要访问它提供的 HTTPS 域名即可。

### 2. 页面显示空白
*   **原因**：前端静态文件没有正确复制到 `backend/public` 目录。
*   **解决**：检查 `backend/public/index.html` 是否存在。

### 3. 手机访问不了
*   **原因**：如果是局域网部署，确保手机和电脑在同一 WiFi，且防火墙允许通过。如果是云服务器，确保安全组开放了端口。
