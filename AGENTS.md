# AGENTS.md

## 项目概述

**BOS Agent Gateway** 是一个生产级 Dify 统一 API 网关，用于集中管理多个 Dify 应用的 API Key、速率限制和代理转发。它提供统一的注册、认证和代理能力，让多个 Dify 工作流应用可以通过一个网关暴露给授权用户。

**核心功能：**
- 注册和管理 Dify 应用（通过 Dify API Key + Base URL，拉取 `/v1/info` 校验）
- 用户与 API Key 管理（admin 创建用户，每个用户持有 `sk-*` 格式的 API Key）
- 认证反向代理：用户携带 API Key 通过网关向目标 Dify 应用发送请求（支持普通请求和 SSE 流式响应）
- 自动注入 Dify Bearer Token，用户无需持有 Dify 密钥
- 每个用户可配置独立的速率限制（RPM）
- 后台健康轮询（定期检查 Dify 应用状态：online/offline/error 并同步应用信息）
- 调用日志追踪（每次代理请求记录耗时、状态码、错误、task_id 等）
- 会话追踪：每次 `/chat-messages` 调用自动记录 user → conversation → task_id 映射到 SQLite + Redis
- Redis 支持：`GATEWAY:<user>:<conversation_id>` 缓存 task_id，提供查询接口
- Agent 详情页：查看 Dify 应用下各用户的会话列表和消息历史
- 管理后台界面（Dashboard 仪表盘、Agent 管理、用户管理、Agent 详情）

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
| httpx | 异步 HTTP 客户端（代理转发、拉取 Dify 信息） |
| redis + hiredis | Redis 异步客户端（task_id 缓存） |
| ruff | 代码检查与格式化 |

### 前端（JavaScript）
| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| MUI (Material UI) v7 | UI 组件库 |
| Recharts | 图表（Dashboard） |
| react-markdown | Markdown 渲染（Agent 详情页） |
| Vite 7 | 构建工具与开发服务器 |

### 基础设施
- **数据库**: SQLite（文件: `gateway.db`）
- **缓存**: Redis（可选，`.env` 中 `REDIS_ENABLED` 控制）
- **包管理**: Python 端用 `uv`，前端用 `npm`
- **无需消息队列**，所有功能自包含

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
│   ├── database.py             # ORM 模型定义（User, Agent, Invocation, UserSession 等）
│   ├── models.py               # Pydantic 请求/响应模型
│   ├── dependencies.py         # FastAPI 依赖注入（用户认证、角色鉴权）
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── agents.py           # Agent CRUD + Dify 代理（conversations/messages/users）
│   │   ├── users.py            # 用户管理 API
│   │   ├── proxy.py            # 通配路由代理 /agent/{id}/{path}（支持 SSE + task_id 提取）
│   │   ├── sessions.py         # 会话查询接口 /v1/sessions/task-id
│   │   └── stats.py            # 统计与仪表盘 API（仅 admin）
│   └── services/
│       ├── __init__.py
│       ├── dify.py             # Dify 服务：fetch_dify_info()
│       ├── health.py           # 后台 Agent 健康轮询（调 Dify /v1/info）
│       ├── rate_limiter.py     # 内存滑动窗口速率限制器
│       └── redis.py            # Redis 客户端（task_id 缓存）
│
└── frontend/                   # 前端 React 应用
    ├── package.json            # Node.js 依赖与脚本
    ├── vite.config.js          # Vite 配置（含 API 代理 + chunk 拆分）
    ├── index.html              # 入口 HTML
    └── src/
        ├── main.jsx            # React 入口（MUI 主题：SAP Cloud 风格）
        ├── App.jsx             # 主应用（登录弹窗、标签导航、Agent 详情路由）
        ├── api.js              # 后端 API 调用封装
        ├── index.css           # 全局样式
        ├── App.css             # 应用样式
        ├── pages/
        │   ├── Dashboard.jsx   # 仪表盘（KPI、按时调用量图表、Top Agent 排行、点击进入详情）
        │   ├── Agents.jsx      # Agent 管理（注册、列表、删除、API Key 编辑）
        │   ├── Users.jsx       # 用户管理（创建、列表、删除、分配 Agent、速率限制、Key 管理）
        │   └── AgentDetail.jsx # Agent 详情（会话列表 + 消息历史，Markdown 渲染）
        └── assets/
```

---

## 数据库模型

| 表名 | 说明 |
|------|------|
| `users` | 用户（username、api_key、role、is_active、rate_limit） |
| `agents` | 注册的 Dify 应用（base_url、name、agent_info、dify_api_key、status、is_public） |
| `agent_tags` | Agent 标签（多对多关联） |
| `user_agent_access` | 用户对 Agent 的访问授权 |
| `invocations` | 调用日志（user_id、agent_id、请求信息、状态码、耗时、task_id、错误） |
| `user_sessions` | Dify 会话追踪（agent_id、dify_user、conversation_id、latest_task_id） |

---

## API 路由概览

| 前缀 | 路由 | 说明 | 权限 |
|------|------|------|------|
| `/v1` | `POST /agents/` | 注册新 Dify 应用 | admin |
| `/v1` | `GET /agents/` | 列出所有 Agent（支持标签过滤） | 认证用户 |
| `/v1` | `GET /agents/{id}` | 查看 Agent 详情 | 认证用户 |
| `/v1` | `PATCH /agents/{id}` | 更新 Agent | admin |
| `/v1` | `DELETE /agents/{id}` | 删除 Agent | admin |
| `/v1` | `GET /agents/{id}/users` | 列出该 Agent 下的 dify_user | 认证用户 |
| `/v1` | `GET /agents/{id}/conversations` | 代理查 Dify 会话列表 | 认证用户 |
| `/v1` | `GET /agents/{id}/messages` | 代理查 Dify 消息历史 | 认证用户 |
| `/v1` | `DELETE /agents/{id}/conversations/{cid}` | 代理删除 Dify 会话 | 认证用户 |
| `/v1` | `POST /agents/{id}/conversations/{cid}/name` | 代理重命名 Dify 会话 | 认证用户 |
| `/v1` | `DELETE /agents/{id}/conversations/{cid}` | 代理删除 Dify 会话 | 认证用户 |
| `/v1` | `POST /agents/{id}/conversations/{cid}/name` | 代理重命名 Dify 会话 | 认证用户 |
| `/v1` | `GET /tags` | 列出所有标签 | admin |
| `/v1` | `POST /users` | 创建用户 | admin |
| `/v1` | `GET /users` | 列出所有用户 | admin |
| `/v1` | `GET /users/{id}` | 查看用户详情 | admin |
| `/v1` | `POST /users/{id}/assign-agents` | 给用户分配 Agent | admin |
| `/v1` | `PATCH /users/{id}` | 更新用户 | admin |
| `/v1` | `DELETE /users/{id}` | 删除用户 | admin |
| `/v1` | `POST /users/{id}/regenerate-key` | 重新生成 API Key | admin |
| `/v1` | `GET /stats/` | 网关统计总览 | admin |
| `/v1` | `GET /stats/agents/{id}` | 单个 Agent 统计 | admin |
| `/v1` | `GET /sessions/task-id` | 查询 Redis 中的 task_id | 认证用户 |
| `/agent` | `ANY /agent/{id}/{path}` | 代理到 Dify，自动注入 Bearer Token | 认证用户 |

API 文档：`http://localhost:8000/docs`（Swagger UI）和 `http://localhost:8000/redoc`（ReDoc）。

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
- **API 调用**: 统一在 `frontend/src/api.js` 中封装
- **UI 组件**: 使用 MUI (Material UI) v7 组件
- **样式**: SAP Cloud 风格（浅色主题，#0070F2 主色）

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

---

## 架构要点

1. **认证方式**: 所有 API 通过 `X-API-Key` 请求头进行 Bearer 式认证。管理员 API Key 在首次启动时通过 `.env` 配置创建，之后不受 `.env` 变更影响。
2. **代理流程**: 用户请求 → 网关认证 → 权限检查 → 速率限制 → 注入 `Authorization: Bearer {dify_api_key}` → 反向代理到 Dify → 记录调用日志 → 提取 task_id/conversation_id → 写 user_sessions + Redis
3. **速率限制**: 基于内存滑动窗口实现，按用户级别控制。默认 60 RPM，admin 用户不受限制。
4. **健康检查**: 后台 asyncio Task 定时轮询所有注册 Agent 的 `/v1/info` 端点，更新状态（online/offline/error）并同步应用信息。
5. **SSE 流式代理**: `/agent/{id}/v1/chat-messages` 自动识别 `response_mode: streaming`，流式透传并提取 `task_id` + `conversation_id`。
6. **会话追踪**: 每次 `/chat-messages` 调用从请求体提取 `user` 参数，从响应提取 `conversation_id` 和 `task_id`，写入 `user_sessions` 表和 Redis（`GATEWAY:<user>:<conversation_id>`）。
7. **Redis**: 可选组件，`.env` 中 `REDIS_ENABLED=true` 启用。提供 `GET /v1/sessions/task-id` 接口查询缓存。
