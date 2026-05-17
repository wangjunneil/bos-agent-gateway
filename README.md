# BOS Agent Gateway

生产级 A2A（Agent-to-Agent）智能体注册中心与认证反向代理网关。集中管理符合 A2A 协议的 AI Agent，提供统一的注册、认证、速率限制和代理转发能力。

## 技术栈

| 层次 | 技术 |
|------|------|
| 后端框架 | Python 3.12+ / FastAPI |
| 服务器 | Uvicorn |
| 数据库 | SQLite（通过 SQLAlchemy + aiosqlite） |
| 配置管理 | Pydantic Settings |
| HTTP 客户端 | httpx |
| 协议 | A2A SDK |
| 前端 | React 19 + MUI v7 + Vite 7 |
| 包管理 | uv (Python) / npm (前端) |

## 环境要求

- Python >= 3.12
- [uv](https://docs.astral.sh/uv/) (Python 包管理器)
- Node.js >= 18（仅构建前端时需要）

## 快速开始

### 1. 克隆项目并安装依赖

```bash
cd bos-agent-gateway

# 安装 Python 依赖
uv sync
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，**必须修改** `ADMIN_API_KEY` 为一个安全的随机字符串（例如使用 `openssl rand -hex 32` 生成）：

```env
ADMIN_API_KEY=sk-your-secure-random-string-here
ADMIN_USERNAME=admin
DATABASE_URL=sqlite+aiosqlite:///./gateway.db
HEALTH_POLL_INTERVAL_SECONDS=60
HEALTH_POLL_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT_RPM=60
DEBUG=false
```

### 3. 构建前端（仅管理界面，可选）

如果不需要 Web 管理界面，可跳过此步骤。后端在没有前端构建产物时仍然可以正常提供 API 服务。

```bash
cd frontend
npm install
npm run build
cd ..
```

构建产物输出到 `frontend/dist/`，后端启动时会自动将其挂载到 `/` 路径。

### 4. 启动服务

```bash
# 生产模式
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 开发模式（热重载）
uv run uvicorn app.main:app --reload --port 8000
```

启动后：
- 管理界面: http://localhost:8000 （需已构建前端）
- API 文档 (Swagger): http://localhost:8000/docs
- API 文档 (ReDoc): http://localhost:8000/redoc

### 5. 验证服务

```bash
# 检查 API 文档是否可访问
curl http://localhost:8000/docs

# 使用管理员 API Key 测试接口
curl -H "X-API-Key: sk-your-secure-random-string-here" http://localhost:8000/v1/agents
```

## 配置说明

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ADMIN_API_KEY` | (必填) | 管理员 API Key，启动时自动创建 admin 用户 |
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./gateway.db` | 数据库连接 URL |
| `HEALTH_POLL_INTERVAL_SECONDS` | `60` | Agent 健康检查轮询间隔（秒） |
| `HEALTH_POLL_ENABLED` | `true` | 是否启用健康检查轮询 |
| `RATE_LIMIT_ENABLED` | `true` | 是否启用速率限制 |
| `RATE_LIMIT_DEFAULT_RPM` | `60` | 默认每用户每分钟请求数限制 |
| `DEBUG` | `false` | 调试模式（启用详细日志） |

## 项目结构

```
bos-agent-gateway/
├── app/                    # Python 后端
│   ├── main.py             # 应用入口
│   ├── settings.py         # 配置管理
│   ├── database.py         # 数据库模型与初始化
│   ├── models.py           # Pydantic 请求/响应模型
│   ├── dependencies.py     # 认证与权限依赖
│   ├── routers/            # API 路由
│   │   ├── agents.py       # Agent 管理
│   │   ├── users.py        # 用户管理
│   │   ├── a2a.py          # A2A 消息代理
│   │   └── stats.py        # 统计与仪表盘
│   └── services/           # 业务逻辑
│       ├── agent_card.py   # Agent Card 拉取与校验
│       ├── proxy.py        # HTTP 反向代理
│       ├── health.py       # 健康检查轮询
│       └── rate_limiter.py # 速率限制器
├── frontend/               # React 前端
│   ├── src/
│   │   ├── App.jsx         # 主应用
│   │   ├── api.js          # API 调用封装
│   │   └── pages/          # 页面组件
│   │       ├── Dashboard.jsx
│   │       ├── Agents.jsx
│   │       └── Users.jsx
│   └── vite.config.js      # Vite 配置
├── pyproject.toml          # Python 项目配置
├── .env.example            # 环境变量模板
└── .gitignore
```

## 开发命令

```bash
# === 后端 ===

# 安装依赖
uv sync

# 代码检查
uv run ruff check .

# 代码格式化
uv run ruff format .

# 启动（开发模式）
uv run uvicorn app.main:app --reload --port 8000


# === 前端 ===

cd frontend

# 安装依赖
npm install

# 启动开发服务器（API 自动代理到后端 :8000）
npm run dev

# 代码检查
npm run lint

# 生产构建
npm run build


# === 完整构建并启动 ===
uv sync
cp .env.example .env   # 然后编辑 .env
cd frontend && npm install && npm run build && cd ..
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 使用流程

1. **启动网关** → 使用配置的 `ADMIN_API_KEY` 作为管理员凭证
2. **注册 Agent** → 在管理界面或 API 中注册 A2A Agent 的 `base_url`，网关会自动拉取并校验 Agent Card
3. **创建用户** → 为调用方创建用户，系统自动生成 `sk-*` 格式的 API Key
4. **分配权限** → 将 Agent 分配给指定用户，按需设置速率限制
5. **代理调用** → 用户携带 API Key，通过 `POST /a2a/{agent_id}/message/send` 或 `/message/stream` 向 Agent 发送消息，网关自动完成认证、鉴权和转发
