# AGENTS.md

## 项目概述

**BOS Agent Gateway** 是一个生产级 Agent 注册中心与认证反向代理网关，用于集中管理符合 A2A（Agent-to-Agent）协议的 AI 智能体。它提供统一的注册、认证、速率限制和代理转发能力，让多个 A2A Agent 可以通过一个网关暴露给授权用户。

**核心功能：**
- 注册和管理外部 A2A Agent（通过拉取并校验 `/.well-known/agent-card.json`）
- 用户与 API Key 管理（admin 创建用户，每个用户持有 `sk-*` 格式的 API Key）
- 认证反向代理：用户携带 API Key 通过网关向目标 Agent 发送 A2A 消息（支持普通请求和 SSE 流式响应）
- 每个用户可配置独立的速率限制（RPM）
- 后台健康轮询（定期检查 Agent 状态：online/offline/error 并缓存 Agent Card）
- 调用日志追踪（每次代理请求记录耗时、状态码、错误等）
- 管理后台界面（Dashboard 仪表盘、Agent 管理、用户管理）

---

## 技术栈

### 后端（Python）
| 技术 | 用途 |
|------|------|
| Python >= 3.12 | 运行语言 |
| FastAPI | Web 框架 |
| Uvicorn | ASGI 服务器 |
| SQLAlchemy (asyncio) + aiosqlite | ORM + SQLite 异步驱动 |
| Pydantic v2 + pydantic-settings | 数据校验与配置管理 |
| httpx | 异步 HTTP 客户端（代理转发、拉取 Agent Card） |
| a2a-sdk | A2A 协议 SDK（校验 Agent Card JSON Schema） |
| ruff | 代码检查与格式化 |

### 前端（JavaScript）
| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| React Router v7 | 客户端路由 |
| MUI (Material UI) v7 | UI 组件库 |
| Recharts | 图表（Dashboard） |
| Vite 7 | 构建工具与开发服务器 |

### 基础设施
- **数据库**: SQLite（文件: `gateway.db`）
- **包管理**: Python 端用 `uv`，前端用 `npm`
- **无需 Redis / 消息队列**，所有功能自包含

---

## 项目结构

```
bos-agent-gateway/
├── .env                        # 环境变量（已被 .gitignore 忽略）
├── .env.example                # 环境变量模板
├── pyproject.toml              # Python 项目元数据与依赖声明
├── uv.lock                     # Python 依赖锁定文件
├── AGENTS.md                   # 本文件
├── README.md                   # 项目说明与构建文档
│
├── app/                        # 后端 Python 应用包
│   ├── __init__.py
│   ├── main.py                 # FastAPI 入口：lifespan、CORS、路由注册、前端静态文件挂载
│   ├── settings.py             # 环境变量配置（pydantic-settings）
│   ├── database.py             # ORM 模型定义、异步引擎、会话工厂、数据库初始化
│   ├── models.py               # Pydantic 请求/响应模型（AgentCreate、UserResponse 等）
│   ├── dependencies.py         # FastAPI 依赖注入（用户认证、角色鉴权）
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── agents.py           # Agent CRUD API
│   │   ├── users.py            # 用户管理 API
│   │   ├── a2a.py              # A2A 消息代理 API（send / stream）
│   │   └── stats.py            # 统计与仪表盘 API（仅 admin）
│   └── services/
│       ├── __init__.py
│       ├── agent_card.py       # 拉取并校验远端 Agent Card
│       ├── proxy.py            # HTTP 反向代理（普通 + SSE 流式）
│       ├── health.py           # 后台 Agent 健康轮询
│       └── rate_limiter.py     # 内存滑动窗口速率限制器
│
└── frontend/                   # 前端 React 应用
    ├── package.json            # Node.js 依赖与脚本
    ├── vite.config.js          # Vite 配置（含 API 代理）
    ├── index.html              # 入口 HTML
    └── src/
        ├── main.jsx            # React 入口（MUI 主题配置）
        ├── App.jsx             # 主应用（登录弹窗、标签导航）
        ├── api.js              # 后端 API 调用封装
        ├── pages/
        │   ├── Dashboard.jsx   # 仪表盘（KPI、按时调用量图表、Top Agent 排行）
        │   ├── Agents.jsx      # Agent 管理（注册、列表、删除、标签过滤、详情）
        │   └── Users.jsx       # 用户管理（创建、列表、删除、分配 Agent、速率限制）
        └── assets/
```

---

## 数据库模型

| 表名 | 说明 |
|------|------|
| `users` | 用户（username、api_key、role、is_active、rate_limit） |
| `agents` | 注册的 Agent（base_url、name、agent_card、status、is_public） |
| `agent_tags` | Agent 标签（多对多关联，约束：小写字母+数字+连字符，最长 20 字符，每个 Agent 最多 10 个） |
| `user_agent_access` | 用户对 Agent 的访问授权 |
| `invocations` | 调用日志（user_id、agent_id、请求信息、状态码、耗时、错误） |

---

## API 路由概览

| 前缀 | 路由 | 说明 | 权限 |
|------|------|------|------|
| `/v1` | `POST /agents/register` | 注册新 Agent | admin |
| `/v1` | `GET /agents` | 列出所有 Agent（支持标签过滤） | 认证用户 |
| `/v1` | `GET /agents/{id}/card` | 查看 Agent Card 详情 | 认证用户 |
| `/v1` | `PUT /agents/{id}` | 更新 Agent | admin |
| `/v1` | `DELETE /agents/{id}` | 删除 Agent | admin |
| `/v1` | `GET /tags` | 列出所有标签 | 认证用户 |
| `/v1` | `POST /users` | 创建用户 | admin |
| `/v1` | `GET /users` | 列出所有用户 | admin |
| `/v1` | `POST /users/{id}/assign-agents` | 给用户分配 Agent | admin |
| `/v1` | `PUT /users/{id}` | 更新用户 | admin |
| `/v1` | `DELETE /users/{id}` | 删除用户 | admin |
| `/v1` | `POST /users/{id}/regenerate-key` | 重新生成 API Key | admin |
| `/v1` | `GET /stats/overview` | 网关统计总览 | admin |
| `/a2a` | `GET /a2a/{agent_id}/.well-known/agent-card.json` | 获取 Agent Card | 认证用户 |
| `/a2a` | `POST /a2a/{agent_id}/message/send` | 发送 A2A 消息（普通请求） | 认证用户 |
| `/a2a` | `POST /a2a/{agent_id}/message/stream` | 发送 A2A 消息（SSE 流式） | 认证用户 |

API 文档自动生成：启动后访问 `http://localhost:8000/docs`（Swagger UI）。

---

## 开发约定

### Python 后端
- **代码格式化/检查**: 使用 `ruff`，配置在 `pyproject.toml` 中
  - 行长度: 100
  - 目标 Python 版本: 3.12
  - 检查规则: E(错误)、F(Pyflakes)、I(isort)、N(命名)、W(警告)、UP(pyupgrade)、B(安全)、SIM(简化)、ASYNC(异步)
- **引号风格**: 双引号
- **异步优先**: 数据库访问、HTTP 请求全部使用 `async/await`
- **配置管理**: 通过 `pydantic-settings` 从 `.env` 文件加载

### 前端
- **代码检查**: 使用 ESLint
- **格式化**: 遵循项目 ESLint 配置
- **API 调用**: 统一在 `frontend/src/api.js` 中封装
- **UI 组件**: 使用 MUI (Material UI) v7 组件

---

## 常用命令

### 后端
```bash
# 安装依赖
uv sync

# 启动（生产）
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 启动（开发，热重载）
uv run uvicorn app.main:app --reload --port 8000

# 代码检查与格式化
uv run ruff check .
uv run ruff format .
```

### 前端
```bash
cd frontend

# 安装依赖
npm install

# 开发模式（热重载，API 请求自动代理到后端 :8000）
npm run dev

# 生产构建
npm run build

# 代码检查
npm run lint
```

### 完整生产部署
```bash
# 1. 安装后端依赖
uv sync

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 ADMIN_API_KEY 为安全随机字符串

# 3. 构建前端
cd frontend && npm install && npm run build && cd ..

# 4. 启动
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

启动后，后端自动在 `/` 路径挂载前端静态文件（若 `frontend/dist/` 存在），同时 API 文档可通过 `/docs` 访问。

---

## 架构要点

1. **认证方式**: 所有 API 通过 `X-API-Key` 请求头进行 Bearer 式认证。管理员 API Key 在启动时通过 `.env` 配置自动创建。
2. **代理流程**: 用户请求 → 网关认证 → 权限检查 → 速率限制 → 反向代理到目标 Agent → 记录调用日志
3. **速率限制**: 基于内存滑动窗口实现，按用户级别控制。默认 60 RPM，admin 用户不受限制。
4. **健康检查**: 后台 asyncio Task 定时轮询所有注册 Agent 的 Agent Card 端点，更新状态（online/offline/error）并缓存最新的 Agent Card。
5. **SSE 流式代理**: `POST /a2a/{agent_id}/message/stream` 通过 SSE 将目标 Agent 的流式响应逐块转发给客户端。
