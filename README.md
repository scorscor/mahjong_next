# 麻将 Next - 现代网页版麻将游戏

基于 Vue 3 和 Node.js 的实时多人在线麻将游戏，支持花牌、赖子、扎鸟等高级规则。

## 🎮 功能特性

### 核心玩法
- **经典麻将规则**：支持 4 人麻将，完整胡牌牌型检测（标准胡、七对子、十三幺）
- **花牌系统**：8 张花牌（春夏秋冬梅兰竹菊），自动替换并补牌，每张计 1 番
- **赖子牌**：翻牌确定万能牌，支持硬胡（×2）和软胡（×1）判定
- **扎鸟玩法**：胡牌后摸鸟牌，按牌面位置确定中鸟者，最高 4 倍翻分

### 技术亮点
- **实时对战**：基于 Socket.IO 的低延迟 WebSocket 实时通信
- **安全洗牌**：使用 Node.js crypto.randomBytes 加密安全随机数
- **PWA 支持**：可安装到桌面，支持离线缓存
- **响应式设计**：完美适配移动端和桌面端，支持横屏/竖屏
- **皮肤系统**：4 种桌面主题（经典绿、蓝色海洋、红木、夜间模式）
- **音效系统**：完整的游戏音效（摸牌、打牌、碰、杠、胡）
- **快捷聊天**：预设短语和表情实时互动

## 🛠️ 技术栈

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4.0 | 前端框架，Composition API |
| Vite | 5.0.0 | 构建工具与开发服务器 |
| Pinia | 2.1.0 | 状态管理 |
| Vue Router | 4.2.0 | 路由管理 |
| Socket.IO Client | 4.6.1 | WebSocket 客户端 |

### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | ES Module | 运行时环境 |
| Express | 4.18.2 | HTTP 服务器 |
| Socket.IO | 4.6.1 | WebSocket 服务端 |
| Vitest | 4.1.4 | 测试框架 |
| Docker | - | 容器化部署 |

## 📐 系统架构

```
┌─────────────────┐                    ┌─────────────────┐
│   Vue 3 前端    │                    │   Node.js 后端  │
│   (Vite Dev)    │                    │   (Express)     │
├─────────────────┤                    ├─────────────────┤
│                 │  WebSocket         │                 │
│  Socket.IO      │◄──────────────────►│  Socket.IO      │
│  Client         │   实时游戏数据      │  Server         │
│                 │                    │                 │
│                 │  HTTP REST         │                 │
│  Fetch/Ajax     │◄──────────────────►│  Express Routes │
│                 │   /api/health      │                 │
└─────────────────┘                    └─────────────────┘
```

## 📦 项目结构

```
mojang_next/
├── frontend/                    # 前端项目
│   ├── src/
│   │   ├── pages/              # 页面组件（路由级）
│   │   │   ├── index/          # 首页 - 创建/加入房间
│   │   │   ├── room/           # 房间页 - 等待玩家
│   │   │   ├── game/           # 游戏页 - 核心游戏界面
│   │   │   └── scoreboard/     # 记分板 - 比赛结果
│   │   ├── components/         # 可复用组件
│   │   │   ├── TileCard/       # 麻将牌卡片
│   │   │   ├── AudioControl/   # 音效控制
│   │   │   ├── QuickChat/      # 快捷聊天
│   │   │   ├── SkinPicker/     # 皮肤选择
│   │   │   └── Toast/          # 提示消息
│   │   ├── composables/        # Vue 组合式函数
│   │   │   ├── useAudio.js     # 音效管理
│   │   │   ├── useTableSkin.js # 桌面皮肤
│   │   │   └── useToast.js     # 提示消息
│   │   ├── store/              # Pinia 状态管理
│   │   │   └── game.js         # 游戏状态 Store
│   │   ├── utils/              # 工具函数
│   │   ├── router/             # 路由配置
│   │   ├── App.vue             # 根组件
│   │   └── main.js             # 入口文件
│   ├── public/                 # 静态资源
│   │   ├── audio/              # 游戏音效
│   │   ├── icons/              # PWA 图标
│   │   ├── manifest.json       # PWA 配置
│   │   └── sw.js               # Service Worker
│   ├── vite.config.js          # Vite 配置
│   ├── nginx.conf              # Nginx 部署配置
│   └── vercel.json             # Vercel 部署配置
│
├── backend/                     # 后端项目
│   ├── src/
│   │   ├── game/               # 游戏核心逻辑
│   │   │   ├── MahjongGame.js  # 游戏主逻辑（645行）
│   │   │   ├── AdvancedRules.js# 高级规则（216行）
│   │   │   ├── MatchSession.js # 比赛会话（109行）
│   │   │   ├── TileSet.js      # 牌组管理（134行）
│   │   │   ├── WinChecker.js   # 胡牌检测（407行）
│   │   │   ├── Scorer.js       # 计分系统（332行）
│   │   │   └── Room.js         # 房间管理（90行）
│   │   ├── socket/             # Socket 通信
│   │   │   └── handlers.js     # 事件处理器（480行）
│   │   ├── store/              # 数据存储
│   │   │   └── GameStore.js    # 内存存储（81行）
│   │   └── server.js           # 服务器入口
│   ├── tests/                  # 单元测试（9个测试文件）
│   ├── Dockerfile              # Docker 部署配置
│   ├── vitest.config.js        # 测试配置
│   └── package.json            # 依赖配置
│
└── README.md                    # 项目文档
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18.x
- npm >= 9.x

### 安装后端

```bash
cd backend
npm install

# 开发模式（带热重载）
npm run dev

# 生产模式
npm start

# 运行测试
npm test
```

后端服务将在 `http://localhost:3000` 启动

### 安装前端

```bash
cd frontend
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

前端服务将在 `http://localhost:5173` 启动，自动代理到后端

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 后端服务端口 |
| `NODE_ENV` | development | 运行环境 |
| `VITE_SOCKET_URL` | http://localhost:3000 | 前端 Socket 服务器地址 |

## 🎯 游戏规则

### 牌组构成
- **基础牌**：108 张（万、条、筒各 36 张，风牌 16 张，箭牌 12 张）
- **花牌**：8 张（春夏秋冬梅兰竹菊各 1 张）
- **总计**：144 张

### 基本规则
- 4 人游戏，每人 13 张牌
- 支持吃、碰、杠、胡
- 声明优先级：胡 > 杠 > 碰 > 吃
- 自摸：3 家付分
- 点炮：1 家付分

### 番型计分

| 番型 | 番数 | 条件 |
|------|------|------|
| 清一色 | 8 | 单一花色，无字牌 |
| 字一色 | 8 | 全字牌 |
| 大三元 | 8 | 三种箭牌各一刻 |
| 十三幺 | 8 | 13 种幺九牌各一张 + 一对 |
| 碰碰胡 | 6 | 四刻 + 一对 |
| 混一色 | 6 | 单一花色 + 字牌 |
| 七对子 | 4 | 七个对子 |
| 门前清 | 2 | 无明牌 |
| 断幺 | 2 | 无幺九牌 |
| 平和 | 2 | 全顺子 + 非字牌对子 |
| 自摸 | 1 | 自己摸牌胡 |
| 边张/嵌张/单钓 | 1 | 特定听牌方式 |
| 箭刻 | 1 | 箭牌刻子 |
| 花牌 | 1/张 | 每张花牌计 1 番 |

### 花牌规则
- 发牌时自动检测花牌并明置
- 从牌墙末尾补牌
- 花牌有固定座位归属（春→东，夏→南，秋→西，冬→北）
- 胡牌后每张花牌计 1 番

### 赖子规则
- 翻牌墙末尾一张，+1 为赖子（如翻五万，六万为赖子）
- 赖子可替代任意牌组成面子
- **硬胡**：赖子本身成刻/成对，×2 翻倍
- **软胡**：赖子替代其他牌，×1 正常计分
- 赖子可单独成杠（暗杠）

### 扎鸟规则
- 胡牌后从牌墙摸鸟牌（1-4 张）
- 大胡（≥6 番）：4 张鸟
- 自摸：2 张鸟
- 普通：1 张鸟
- 按牌面数字逆时针确定中鸟位置
- 中鸟者支付双倍分数

## 🔌 API 概览

项目主要使用 Socket.IO WebSocket 通信，HTTP 仅用于健康检查。

### HTTP API
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 服务健康状态检查 |

### Socket.IO 事件（主要）

| 事件 | 方向 | 说明 |
|------|------|------|
| `create_room` | 客户端→服务器 | 创建房间 |
| `join_room` | 客户端→服务器 | 加入房间 |
| `start_game` | 客户端→服务器 | 开始游戏（房主） |
| `draw_tile` | 客户端→服务器 | 摸牌 |
| `discard_tile` | 客户端→服务器 | 打牌 |
| `declare_claim` | 客户端→服务器 | 声明吃/碰/杠/胡 |
| `game_started` | 服务器→客户端 | 游戏开始 |
| `game_state_update` | 服务器→客户端 | 状态同步 |
| `game_over` | 服务器→客户端 | 游戏结束 |

## 🧪 测试

后端包含完整的测试套件：

```bash
cd backend
npm test
```

### 测试覆盖

| 测试文件 | 覆盖范围 |
|----------|----------|
| mahjonggame.test.js | 游戏主逻辑 |
| tileset.test.js | 牌组管理 |
| winchecker.test.js | 胡牌检测 |
| advanced-rules.test.js | 高级规则（花牌、赖子、扎鸟） |
| match-session.test.js | 比赛会话计分 |
| room.test.js | 房间管理 |
| gamestore.test.js | 数据存储 |
| socket-integration.test.js | Socket 通信集成 |

**测试用例数**：95+

## 📱 PWA 安装

前端支持 PWA，可以安装到桌面：

1. 使用 Chrome 或 Edge 浏览器访问
2. 点击地址栏的安装图标
3. 或选择菜单 > 安装应用

### PWA 特性
- 独立应用模式（standalone）
- 竖屏锁定优化
- 离线缓存支持
- 自定义主题色

## 🌐 部署

### Docker 部署（后端）

```bash
cd backend

# 构建镜像
docker build -t mahjong-next .

# 运行容器
docker run -p 3000:3000 mahjong-next
```

### Vercel 部署（前端）

前端已配置 `vercel.json`，可直接部署到 Vercel：

```bash
cd frontend
vercel
```

### Nginx 配置

前端项目包含 `nginx.conf` 配置文件，支持：
- 静态资源缓存（7 天）
- Gzip 压缩
- Socket.IO 代理
- SPA 路由回退

## 📊 项目统计

| 指标 | 数值 |
|------|------|
| 前端文件 | 39 个 |
| 后端文件 | 23 个 |
| Vue 组件 | 11 个 |
| 测试用例 | 95+ |
| 代码行数 | 8,000+ |

## 🗺️ Roadmap

### 待改进项
- [ ] 前端测试覆盖（当前 0%）
- [ ] 数据库持久化（Mongoose 已预留）
- [ ] CI/CD 配置（GitHub Actions）
- [ ] docker-compose 一键部署
- [ ] 用户认证系统
- [ ] 游戏历史记录
- [ ] 排位赛/匹配系统
- [ ] AI 对手

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 贡献流程
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m '添加某个特性'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 代码规范
- 使用 ESLint 进行代码检查
- 遵循 Vue 3 Composition API 最佳实践
- 保持测试覆盖

## 📄 许可证

MIT License

## 👨‍💻 作者

zhanshrd

---

**在线体验**：[GitHub](https://github.com/zhanshrd/mahjong_next)