# BOS Agent Gateway

Dify 统一 API 网关。集中管理多个 Dify 工作流应用，提供统一的注册、认证、速率限制和代理转发能力。

## 技术栈

| 层次 | 技术 |
|------|------|
| 后端框架 | Python 3.12+ / FastAPI |
| 服务器 | Uvicorn |
| 数据库 | SQLite（SQLAlchemy + aiosqlite） |
| 缓存 | Redis（可选） |
| 前端 | React 19 + MUI v7 + Vite 7 |
| 包管理 | uv (Python) / npm (前端) |

## 环境要求

- Python >= 3.12
- [uv](https://docs.astral.sh/uv/)
- Node.js >= 18
- Redis（可选，`.env` 中 `REDIS_ENABLED=true` 启用）

## 快速开始

### 1. 安装依赖

```bash
cd bos-agent-gateway
uv sync
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，修改 `ADMIN_API_KEY` 为安全的随机字符串：

```env
ADMIN_API_KEY=sk-change-me
ADMIN_USERNAME=admin
DATABASE_URL=sqlite+aiosqlite:///./gateway.db
HEALTH_POLL_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT_RPM=60
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=true
DEBUG=false
```

### 3. 构建前端

```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. 启动

```bash
# 生产模式
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 开发模式（热重载）
uv run uvicorn app.main:app --reload --port 8000
```

访问：
- 管理界面: http://localhost:8000
- API 文档 (Swagger): http://localhost:8000/docs
- API 文档 (ReDoc): http://localhost:8000/redoc

## 使用流程

1. **启动网关** → 使用 `.env` 中配置的 `ADMIN_API_KEY` 登录管理后台
2. **注册 Dify 应用** → 输入 Dify Base URL + API Key，网关自动拉取 `/v1/info` 校验
3. **创建用户** → 为调用方创建用户，系统生成 `sk-*` API Key
4. **分配权限** → 将应用分配给用户，可配置速率限制
5. **代理调用** → 用户通过 `/agent/{id}/v1/chat-messages` 调用，网关自动注入 Dify Bearer Token

## 配置说明

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ADMIN_API_KEY` | (必填) | 管理员 API Key |
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./gateway.db` | 数据库连接 |
| `HEALTH_POLL_INTERVAL_SECONDS` | `60` | 健康检查间隔 |
| `HEALTH_POLL_ENABLED` | `true` | 启用健康检查 |
| `RATE_LIMIT_ENABLED` | `true` | 启用速率限制 |
| `RATE_LIMIT_DEFAULT_RPM` | `60` | 默认 RPM |
| `REDIS_HOST` | `localhost` | Redis 地址 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_ENABLED` | `true` | 启用 Redis |
| `DEBUG` | `false` | 调试模式 |

## API 调用示例

```bash
# 注册 Dify 应用
curl -X POST 'http://localhost:8000/v1/agents/' \
  -H 'X-API-Key: sk-admin-key' \
  -H 'Content-Type: application/json' \
  -d '{"base_url":"https://flow.boscloud.cn","dify_api_key":"app-xxx","tags":["chat"]}'

# 通过网关发送流式对话
curl -X POST 'http://localhost:8000/agent/{agent_id}/v1/chat-messages' \
  -H 'X-API-Key: sk-user-key' \
  -H 'Content-Type: application/json' \
  -d '{"inputs":{},"query":"hello","response_mode":"streaming","user":"abc-123"}'

# 查询 task_id
curl 'http://localhost:8000/v1/sessions/task-id?user=abc-123&conversation_id=xxx' \
  -H 'X-API-Key: sk-user-key'
```

## 项目结构

```
bos-agent-gateway/
├── app/                    # Python 后端
│   ├── main.py             # 应用入口
│   ├── settings.py         # 配置管理
│   ├── database.py         # 数据库模型
│   ├── models.py           # Pydantic 模型
│   ├── dependencies.py     # 认证与权限
│   ├── routers/            # API 路由
│   │   ├── agents.py       # Agent 管理 + Dify 代理
│   │   ├── users.py        # 用户管理
│   │   ├── proxy.py        # 反向代理（SSE + task_id）
│   │   ├── sessions.py     # 会话查询
│   │   └── stats.py        # 统计仪表盘
│   └── services/           # 业务逻辑
│       ├── dify.py         # Dify API 交互
│       ├── health.py       # 健康检查轮询
│       ├── rate_limiter.py # 速率限制
│       └── redis.py        # Redis 缓存
├── frontend/               # React 前端
│   ├── src/
│   │   ├── App.jsx         # 主应用
│   │   ├── api.js          # API 封装
│   │   └── pages/          # 页面
│   │       ├── Dashboard.jsx
│   │       ├── Agents.jsx
│   │       ├── Users.jsx
│   │       └── AgentDetail.jsx
│   └── vite.config.js
├── pyproject.toml
├── .env.example
└── .gitignore
```

## 开发命令

```bash
# === 后端 ===
uv sync                          # 安装依赖
uv run ruff check .              # 代码检查
uv run ruff format .             # 代码格式化
uv run uvicorn app.main:app --reload --port 8000  # 开发模式

# === 前端 ===
cd frontend
npm install                      # 安装依赖
npm run dev                      # 开发模式
npm run build                    # 生产构建
npm run lint                     # 代码检查
```
