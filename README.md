# 内网在线分析中心 v2.0.0

> 一个面向内网分析场景的在线工作簿系统，当前已经支持本地 Docker 后端、Postgres 持久化、结构化接口导入、类 Excel 编辑和结果独立保存。

## 1. 当前版本说明

当前仓库已经从早期纯前端 MVP，演进到“前端 + 本地 Docker 后端 + Postgres + worker”的完整本地版本。

这一版重点解决了几件事：

- 前端不再只依赖浏览器 `localStorage`
- 已支持本地 Docker 全链路部署
- 已支持通过 HTTP 接口手动拉取结构化数据
- 已支持大数据量分页读取和虚拟化表格渲染
- 已支持导入数据集管理：重命名、删除、来源查看、复制数据集 ID
- 已支持远端编辑会话与结果数据集独立保存

## 2. 你现在能做什么

当前可直接使用的能力：

- 账号、密码、组织登录
- 新建空白工作簿
- 打开已有数据集
- `csv / xls / xlsx` 文件导入到当前工作簿
- 通过 HTTP 接口手动拉取结构化 JSON 数据
- 保存工作簿、另存为、保存视图
- 将编辑结果独立保存为结果数据集
- 数据集搜索、重命名、删除、复制 ID、打开来源地址
- 冻结首行、冻结首列、列宽调整
- 双击单元格编辑、双击表头改名
- 行列插入、删除、多选
- 公式输入、单元格引用、公式栏编辑
- 水印、脱敏、复制状态展示、审计记录

## 3. 系统架构

本地 Docker 模式下，共有四个服务：

- `web`
  承载前端静态资源，并把 `/api/*` 反向代理到 `api`
- `api`
  提供认证、数据集、编辑会话、工作簿、视图、审计接口
- `worker`
  轮询导入任务队列，执行结构化数据拉取和定时同步
- `postgres`
  保存源数据集、结果数据集、工作簿、视图、审计、导入任务

浏览器只访问一个入口：

- `http://localhost:8080`

## 4. 仓库结构

```txt
.
├── backend/                # 本地 Node 后端
├── docs/                   # 开发文档、开源组件说明
├── src/                    # 前端源码
├── docker-compose.yml      # 本地 Docker 编排
├── Dockerfile.web          # 前端镜像
├── web-server.mjs          # 前端静态服务 + API 代理
└── .env.docker.example     # Docker 环境变量示例
```

前端核心目录：

```txt
src/
├── adapters/
├── components/
├── config/
├── features/
├── pages/
├── services/
├── types/
└── utils/
```

## 5. 运行方式

### 5.1 纯前端模式

适合做轻量调试，不依赖 Docker。

```bash
npm install
npm run dev
```

默认访问地址：

```txt
http://localhost:5173
```

这一模式下，登录态、视图、工作簿、审计会保存在浏览器本地。

### 5.2 本地 Docker 全链路模式

推荐使用这一模式，这也是当前主文档默认描述的运行方式。

先复制环境文件：

```bash
cp .env.docker.example .env
```

当前默认值：

```bash
NODE_IMAGE=node:current-alpine3.23
POSTGRES_IMAGE=postgres:16-alpine
VITE_PERSISTENCE_MODE=remote
VITE_API_BASE_URL=/api
```

然后启动：

```bash
docker compose up -d --build
```

默认端口：

- Web: `http://localhost:8080`
- API: `http://localhost:8081`
- Postgres: `localhost:5432`

查看状态：

```bash
docker compose ps
```

停止服务：

```bash
docker compose down
```

如果需要连同数据库卷一起清空：

```bash
docker compose down -v
```

## 6. 登录账号

当前默认本地账号：

- 账号：`kingsley`
- 密码：`kingsley`
- 组织：`风控部`

远端模式下，登录成功后会拿到 Bearer Token，并写入浏览器 `localStorage`。

## 7. 手动拉取结构化数据

首页有一个按钮：`手动拉取结构化数据`。

这个功能不是上传文件，而是：

1. 你输入一个接口地址
2. 前端创建一条导入任务
3. `worker` 容器异步请求这个接口
4. 后端把返回的结构化 JSON 转成数据集并写入 Postgres
5. 新数据集出现在首页列表里

当前支持的典型返回格式：

```json
[
  { "市": "赤峰", "县": "松山", "容量": 100 },
  { "市": "通辽", "县": "科尔沁", "容量": 80 }
]
```

```json
{
  "data": [
    { "市": "赤峰", "县": "松山", "容量": 100 }
  ]
}
```

```json
{
  "users": [
    { "id": 1, "firstName": "Emily", "lastName": "Johnson" }
  ]
}
```

当前已验证可用的样例接口：

- `https://dummyjson.com/users?limit=100`

## 8. 数据保存在哪里

### 8.1 导入数据集

手动拉取或定时同步进来的数据，保存在：

- `source_datasets`
- `source_dataset_columns`
- `source_dataset_rows`

### 8.2 结果数据集

编辑会话“保存结果集”后，保存在：

- `saved_datasets`
- `saved_dataset_columns`
- `saved_dataset_rows`

### 8.3 工作簿

“保存工作簿 / 另存为”保存在：

- `workbooks`

工作簿的完整内容放在 `payload` 字段里，类型是 `jsonb`。

### 8.4 视图

“保存视图”保存在：

- `views`

### 8.5 审计和导入任务

- 审计：`audit_events`
- 导入任务：`import_jobs`
- 编辑会话：`edit_sessions` 及相关子表

## 9. 数据集管理能力

首页的数据集卡片当前支持：

- 打开数据集
- 搜索过滤
- 复制数据集 ID
- 打开来源地址
- 重命名数据集
- 删除数据集

删除时有保护逻辑：

- 如果该数据集仍被工作簿或视图引用，会拒绝删除
- 前端会显示明确提示，而不是静默失败

## 10. 页面说明

### 登录页

- 输入账号、密码、组织
- 远端模式下请求 `/api/auth/login`

### 首页

- 展示数据集列表
- 展示最近导入任务
- 展示最近视图和工作簿
- 支持新建空白工作簿
- 支持手动拉取结构化数据

### 我的分析

- 展示个人工作簿和视图
- 支持重命名、删除、重新打开

### 工作簿页

当前已实现：

- 类 Excel 网格
- 分页读取
- 双击编辑
- 公式栏
- 冻结首行/首列
- 行列增删
- 颜色标记
- 视图保存
- 工作簿保存
- 结果数据集保存

## 11. 关键 API

当前后端接口：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/datasets`
- `PATCH /api/datasets/:id`
- `DELETE /api/datasets/:id`
- `GET /api/datasets/:id/schema`
- `GET /api/datasets/:id/rows`
- `POST /api/import-jobs`
- `GET /api/import-jobs`
- `GET /api/import-jobs/:id`
- `POST /api/edit-sessions`
- `GET /api/edit-sessions/:id/schema`
- `GET /api/edit-sessions/:id/rows`
- `PATCH /api/edit-sessions/:id/patches`
- `POST /api/edit-sessions/:id/save`
- `GET /api/workbooks`
- `GET /api/workbooks/:id`
- `POST /api/workbooks`
- `DELETE /api/workbooks/:id`
- `GET /api/views`
- `POST /api/views`
- `PATCH /api/views/:id`
- `DELETE /api/views/:id`
- `GET /api/audit/events`
- `POST /api/audit/events`

## 12. 文档索引

- 开发文档：[docs/development.md](./docs/development.md)
- 开源组件说明：[docs/open-source-components.md](./docs/open-source-components.md)
- 工作簿模块说明：[src/features/workbook/README.md](./src/features/workbook/README.md)

## 13. 已知限制

- 还没有接入正式权限平台或 SSO
- 页面切换仍然使用本地状态，不是 React Router
- 公式引擎已可用，但还不是完整 Excel 工作簿体系
- 还没有多人协同编辑
- 删除数据集目前只保护工作簿和视图引用，不做更复杂的依赖分析
- 当前部署目标是“本机 Docker 稳定运行”，不是企业级生产集群
