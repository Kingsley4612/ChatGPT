# Development Guide

## 1. 文档目标

本文档面向开发者，描述当前代码的真实实现方式，而不是产品设想。

阅读完本文后，你应该能回答这些问题：

- 这个项目现在到底是纯前端，还是前后端一体
- 前端和后端分别负责什么
- 数据集、工作簿、视图、结果集分别存在哪里
- “手动拉取结构化数据”这条链路是怎么跑起来的
- 现在的扩展点在哪里，下一步改什么最合适

## 2. 当前系统形态

当前版本是一个本地运行的一体化分析系统，包含：

- React + TypeScript 前端
- Node.js + Express 后端
- Postgres 持久化
- Worker 异步导入与定时同步
- Docker Compose 本地编排

系统运行模式分两种：

- `local`
  浏览器本地演示模式，主要用于无后端的快速验证
- `remote`
  当前推荐模式。前端通过 `/api` 调后端，数据落到 Postgres

本仓库当前的主开发目标，是 `remote` 模式。

## 3. 整体架构

### 3.1 服务组成

Docker 模式下有四个服务：

- `web`
  提供前端静态资源，并做 `/api` 反向代理
- `api`
  处理登录、数据集、工作簿、视图、审计、导入任务、编辑会话
- `worker`
  轮询导入任务，执行外部接口拉取与定时任务
- `postgres`
  保存所有业务数据

### 3.2 请求流

浏览器只访问：

- `http://localhost:8080`

`web` 容器内的 [`web-server.mjs`](../web-server.mjs) 会把：

- `/api/*`

代理到：

- `http://api:8081`

因此前端配置中只需要：

- `VITE_API_BASE_URL=/api`

## 4. 目录说明

### 4.1 前端

```txt
src/
├── adapters/
│   └── univer/univerAdapter.ts
├── components/
│   ├── security-guard/
│   ├── toolbar/
│   ├── watermark/
│   └── workbook-shell/
├── config/
│   └── persistence.ts
├── features/
│   ├── audit/
│   ├── dataset/
│   ├── security/
│   ├── view-save/
│   └── workbook/
├── pages/
│   ├── analysis-center/
│   ├── login/
│   ├── my-analysis/
│   └── workbook/
├── services/
├── types/
└── utils/
```

### 4.2 后端

```txt
backend/src/
├── auth.js
├── config.js
├── dataset-format.js
├── db.js
├── import-jobs.js
├── server.js
├── store.js
└── worker.js
```

## 5. 前端模块职责

### 5.1 页面层

#### `src/pages/login/LoginPage.tsx`

- 登录表单
- 远端模式下提交账号、密码、组织
- 显示登录错误

#### `src/pages/analysis-center/AnalysisCenterPage.tsx`

- 加载数据集、导入任务、工作簿、视图
- 新建空白工作簿
- 手动拉取结构化数据
- 数据集管理：
  - 搜索
  - 打开
  - 重命名
  - 删除
  - 打开来源地址
  - 复制数据集 ID

#### `src/pages/my-analysis/MyAnalysisPage.tsx`

- 展示当前用户工作簿与视图
- 重命名与删除
- 重新打开工作簿

#### `src/pages/workbook/WorkbookPage.tsx`

这是当前前端最复杂的页面，负责：

- 数据集和编辑会话加载
- 工作簿 UI 状态
- 筛选、排序、搜索、分页
- 单元格编辑、公式、颜色标记
- 行列插入/删除
- 保存视图、保存工作簿、保存结果集

### 5.2 组件层

#### `src/components/workbook-shell/WorkbookShell.tsx`

- 使用 `@glideapps/glide-data-grid` 渲染网格
- 处理单元格、行、列选择
- 承载双击编辑、冻结、滚动联动等表格交互

#### `src/components/toolbar/Toolbar.tsx`

- 工作簿工具栏
- 搜索、冻结、导入、保存等操作入口

#### `src/components/security-guard/SecurityGuard.tsx`

- 展示导出、复制、脱敏等安全状态

#### `src/components/watermark/Watermark.tsx`

- 页面水印展示

### 5.3 服务层

#### `src/services/dataset.service.ts`

核心职责：

- 区分 `local` / `remote` 模式
- 空白工作簿虚拟数据集
- 本地 `csv/xls/xlsx` 导入解析
- 远端数据集列表、分页、导入任务、编辑会话
- 数据集重命名、删除

#### `src/services/http.service.ts`

- 统一 `fetch` 封装
- 统一注入 Bearer Token
- 统一处理错误消息
- 401/403 时清理本地会话

#### `src/services/security.service.ts`

- 登录、退出、会话读取
- `local` 模式下演示账号校验
- `remote` 模式下走 `/api/auth/login`

#### `src/services/session-storage.service.ts`

- 统一管理 token 和当前用户
- 统一广播会话变化事件

#### `src/services/workbook.service.ts`

- 工作簿列表、读取、保存、删除
- 自动切换 `local` / `remote`

#### `src/features/view-save/viewSave.service.ts`

- 视图保存、重命名、删除

#### `src/services/audit.service.ts`

- 审计写入和读取

## 6. 后端模块职责

### `backend/src/server.js`

- Express 启动入口
- API 路由注册
- 鉴权中间件挂载

### `backend/src/auth.js`

- 登录账号校验
- JWT 生成与校验
- `/api` 路径鉴权

### `backend/src/db.js`

- Postgres 连接池
- 建表逻辑
- 事务封装

### `backend/src/store.js`

当前最核心的后端业务层，负责：

- 数据集读取与分页
- 工作簿、视图、审计的存取
- 导入任务元数据
- 编辑会话
- 结果集保存
- 数据集重命名与删除

### `backend/src/import-jobs.js`

- 调用外部结构化接口
- 提取对象数组
- 规范化列结构
- 写入 `source_*` 三张表

### `backend/src/dataset-format.js`

- 从外部接口返回中提取“结构化对象数组”
- 推断列结构和字段类型
- 当前已兼容：
  - 顶层数组
  - `data/items/rows/records/result`
  - `users/products/list`
  - 顶层对象里的首个对象数组

### `backend/src/worker.js`

- 轮询导入队列
- 定时调度同步任务

## 7. 页面流转

当前没有引入 React Router。

页面切换在 [`src/main.tsx`](../src/main.tsx) 中通过本地状态完成：

- `login`
- `home`
- `my-analysis`
- `workbook`

这种做法适合当前单机版本，但边界也很明确：

- 没有 URL 深链接
- 没有浏览器历史路由
- 没有页面级路由守卫

## 8. 核心数据模型

核心前端类型位于 [`src/types/models.ts`](../src/types/models.ts)。

### 8.1 数据集

- `DatasetField`
- `DatasetMeta`
- `DatasetPageRequest`
- `DatasetPageResponse`

其中 `DatasetMeta` 现在已经扩展了：

- `sourceUrl`
- `requestedBy`
- `ownerUserId`
- `sourceDatasetId`
- `canManage`

### 8.2 编辑会话

- `EditSessionSchema`
- `EditSessionOperation`

### 8.3 工作簿与视图

- `WorkbookConfig`
- `ViewConfig`

### 8.4 用户与安全

- `UserContext`
- `SecurityConfig`

## 9. 数据库存储模型

### 9.1 源数据集

- `source_datasets`
- `source_dataset_columns`
- `source_dataset_rows`

来源：

- 手动拉取结构化数据
- 定时同步

### 9.2 结果数据集

- `saved_datasets`
- `saved_dataset_columns`
- `saved_dataset_rows`

来源：

- 编辑会话保存结果集

### 9.3 编辑会话

- `edit_sessions`
- `edit_session_columns`
- `edit_session_rows`
- `edit_patches`

### 9.4 工作簿与视图

- `workbooks`
- `views`

### 9.5 其他表

- `users`
- `audit_events`
- `import_jobs`

## 10. 关键链路

### 10.1 登录链路

1. 登录页调用 `login(payload)`
2. `remote` 模式下走 `/api/auth/login`
3. 后端返回 `accessToken + user`
4. 前端写入：
   - `analysis.current.token`
   - `analysis.current.user`

### 10.2 手动拉取结构化数据

1. 首页输入名称和接口地址
2. 前端请求 `POST /api/import-jobs`
3. 后端写入 `import_jobs`
4. `worker` 轮询到任务并请求外部接口
5. 结果经 `dataset-format.js` 解析成字段和行
6. 写入 `source_*` 三张表
7. 首页重新拉取列表后，出现新数据集

### 10.3 打开工作簿

1. 首页点击数据集
2. 工作簿页调用 `useDataset`
3. 获取 schema 和 rows
4. 交给 `WorkbookShell` 虚拟化渲染

### 10.4 保存工作簿

1. 前端收集当前视图、字段、行快照、颜色、冻结等状态
2. 保存到 `/api/workbooks`
3. 后端落到 `workbooks.payload`

### 10.5 保存结果集

1. 当前工作簿若使用远端编辑会话
2. 调用 `/api/edit-sessions/:id/save`
3. 后端把会话内容写到 `saved_*` 三张表

## 11. 数据集管理能力

目前支持：

- 重命名数据集
- 删除数据集
- 查看来源地址
- 复制数据集 ID

删除限制：

- 如果该数据集仍被当前用户的工作簿或视图引用，则拒绝删除
- 当前返回 `409`

当前删除保护只覆盖：

- `workbooks`
- `views`

还没有做跨更多业务对象的完整引用图分析。

## 12. 配置

### 12.1 前端

前端持久化模式在 [`src/config/persistence.ts`](../src/config/persistence.ts)：

- `VITE_PERSISTENCE_MODE`
- `VITE_API_BASE_URL`

### 12.2 Docker

当前 `.env` 支持：

- `NODE_IMAGE`
- `POSTGRES_IMAGE`
- `VITE_PERSISTENCE_MODE`
- `VITE_API_BASE_URL`

### 12.3 后端

后端配置在 [`backend/src/config.js`](../backend/src/config.js)。

主要包括：

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- 默认登录账号
- 导入任务轮询频率
- 定时导入任务配置

## 13. 开发时最常用命令

### 前端

```bash
npm run build
```

### 后端

```bash
cd backend && npm run check
```

### Docker

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose down
```

## 14. 当前限制

- 前端仍然是本地状态路由，不是正式路由系统
- 公式引擎已可用，但还不是完整多 Sheet Excel 引擎
- 编辑会话当前是“会话表 + patch 日志”方案，不是多人协同架构
- 接口导入只支持结构化 JSON，不支持 XML、HTML 表格、分页游标串联抓取
- 工作簿主逻辑仍集中在 [`src/pages/workbook/WorkbookPage.tsx`](../src/pages/workbook/WorkbookPage.tsx)

## 15. 下一步建议

如果继续演进，建议优先级如下：

1. 为“手动拉取结构化数据”补请求头、请求方法、请求体配置
2. 为数据集管理补详情页和删除前依赖预览
3. 把工作簿页面继续拆分，降低 `WorkbookPage.tsx` 复杂度
4. 引入正式路由层
5. 视情况补权限模型和更完整的后端部署方案
