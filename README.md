# 💕 双人默契大作战（情侣 1v1 专享你画我猜网页版）

专为情侣二人单线联机设计的“你画我猜”极简 Web 游戏。无繁琐大厅、无广告、触屏优化，支持手机与平板互联，一键生成拍立得纪念卡。

---

## ✨ 核心特色功能

1. **🔗 暗号 / 专属链接秒进**：无需注册，点击链接（如 `?room=sweet520`）直达专属房间，两人进房自动开局。
2. **📱 移动端与平板深度优化**：
   - 使用统一 `PointerEvents`，完美支持手指触屏与 Apple Pencil。
   - 彻底禁用移动端下拉刷新、双指缩放及误触滚动（`touch-action: none`）。
   - **归一化相对坐标传输**：解决手机（19.5:9）与平板（4:3）分辨率不同导致的画笔错位问题。
3. **💌 专属恋爱回忆词库**：
   - 内置“甜蜜约会、吃货美食、生活搞笑、萌宠日常”四大情侣专属分类。
   - 支持游戏中随时“**+ 投喂新词**”，把两人的私密梗存入词库。
4. **💬 快捷调侃表情气泡**：
   - 底部内置调侃弹幕（“灵魂画手”、“这是啥呀完全看不懂”），点击后在画板上方轻柔飘动。
5. **📸 拍立得画作回忆卡**：
   - 每一轮猜中后，自动将画作渲染为拍立得明信片风格图片，包含题目、画手、猜题者、耗时与甜蜜印章。
   - 手机端长按图片即可直接保存到相册，发朋友圈秀恩爱。

---

## 🚀 本地快速启动与测试

### 1. 启动服务
```bash
npm start
```
控制台将输出：
```text
💕 情侣你画我猜服务已启动!
🌐 本地访问地址: http://localhost:3000
```

### 2. 本地模拟双人测试
* 在电脑浏览器打开两个标签页：
  * 玩家 A（画手）：`http://localhost:3000/?room=520&name=大聪明`
  * 玩家 B（猜题人）：`http://localhost:3000/?room=520&name=仙女宝贝`
* 也可以在手机连接同一 Wi-Fi，通过电脑局域网 IP（如 `http://192.168.x.x:3000`）在手机 Safari/Chrome 上直接体验触屏画画。

---

## ☁️ 免费部署上线指南（发给女朋友玩）

推荐部署在 **Render** 或 **Railway**，单服务架构（Node.js + Socket.io），完全免费、零跨域配置。

### 方案 A：部署在 Render（首选，永久免费）

1. **上传代码到 GitHub**：
   在 GitHub 上新建一个私有或公开仓库（例如 `couple-draw-and-guess`），将本项目推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "feat: init couple draw and guess game"
   git branch -M main
   git remote add origin https://github.com/你的用户名/couple-draw-and-guess.git
   git push -u origin main
   ```
2. **在 Render 创建 Web Service**：
   - 打开 [Render.com](https://render.com/) 并用 GitHub 账号登录。
   - 点击 **New +** -> **Web Service**。
   - 选择刚创建的 GitHub 仓库并点击 Connect。
   - 配置项设置：
     - **Name**：`sweet-draw`（随心取名）
     - **Environment**：`Node`
     - **Build Command**：`npm install`
     - **Start Command**：`node server.js`
     - **Instance Type**：`Free`
   - 点击底部的 **Deploy Web Service**。
3. **获取在线链接**：
   等待 1~2 分钟构建完成，Render 会分配一个专属域名（如 `https://sweet-draw.onrender.com`）。
   将带房间号的链接分享给女朋友即可开始玩：
   `https://sweet-draw.onrender.com/?room=our520`

> 💡 *提示：Render 免费版在连续 15 分钟无人访问时会自动休眠，第一次打开约需等待 40~50 秒唤醒，之后便全程丝滑运行。*

---

### 方案 B：部署在 Railway

1. 打开 [Railway.app](https://railway.app/)，点击 **New Project** -> **Deploy from GitHub repo**。
2. 选择该仓库，Railway 会自动识别 `package.json` 中的 `npm start` 命令并一键完成容器化部署。
3. 在 Settings 中生成公开域名即可（无冷启动休眠）。
