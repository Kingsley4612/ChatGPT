# Open Source Components

## 1. 文档范围

本文档只列当前仓库真实使用到的开源组件，不把“未来可能接入”的组件提前算进来。

最重要的结论：

- 当前没有接入 `@univerjs/*`
- 当前真实表格内核是 `@glideapps/glide-data-grid`
- 当前已经包含本地 Docker 化后端
- 后端当前是 `Express + pg + jsonwebtoken + node-cron`

## 2. 前端直接依赖

来自根目录 [`package.json`](../package.json)：

| 组件 | 版本 | 类型 | 当前用途 |
| --- | --- | --- | --- |
| `react` | `18.3.1` | 运行时 | 组件渲染与页面状态管理 |
| `react-dom` | `18.3.1` | 运行时 | 浏览器端挂载 React 应用 |
| `@glideapps/glide-data-grid` | `6.0.3` | 运行时 | 虚拟化表格、单元格编辑、行列选择、冻结等交互 |
| `papaparse` | `5.5.3` | 运行时 | CSV worker 解析，避免大文件导入阻塞主线程 |
| `xlsx` | `0.18.5` | 运行时 | `xlsx/xls` 文件解析 |
| `fast-formula-parser` | `1.0.19` | 运行时 | Excel 风格公式解析与计算 |
| `lodash` | `4.17.23` | 运行时 | Glide Data Grid 对等依赖 |
| `marked` | `4.3.0` | 运行时 | Glide Data Grid 对等依赖 |
| `react-responsive-carousel` | `3.2.23` | 运行时 | Glide Data Grid 对等依赖 |
| `typescript` | `5.6.3` | 开发依赖 | 类型检查与构建前编译 |
| `vite` | `5.4.10` | 开发依赖 | 本地开发服务器与生产构建 |
| `@vitejs/plugin-react` | `4.3.2` | 开发依赖 | React JSX 支持 |
| `@types/papaparse` | `5.5.2` | 开发依赖 | `papaparse` 类型声明 |
| `@types/react` | `18.3.12` | 开发依赖 | React 类型声明 |
| `@types/react-dom` | `18.3.1` | 开发依赖 | ReactDOM 类型声明 |

## 3. 后端直接依赖

来自 [`backend/package.json`](../backend/package.json)：

| 组件 | 版本 | 类型 | 当前用途 |
| --- | --- | --- | --- |
| `express` | `4.21.2` | 运行时 | 提供认证、数据集、编辑会话、工作簿、视图、审计、导入任务接口 |
| `pg` | `8.13.1` | 运行时 | 连接 Postgres，直接执行 SQL |
| `jsonwebtoken` | `9.0.2` | 运行时 | 签发与校验 Bearer Token |
| `node-cron` | `3.0.3` | 运行时 | 定时同步任务调度 |

## 4. Docker 与基础镜像

当前本地 Docker 运行依赖两个基础镜像：

| 镜像 | 默认标签 | 用途 |
| --- | --- | --- |
| `node` | `current-alpine3.23` | `web / api / worker` 运行时基础镜像 |
| `postgres` | `16-alpine` | 本地数据库 |

镜像标签当前可通过 `.env` 配置：

- `NODE_IMAGE`
- `POSTGRES_IMAGE`

## 5. 关键间接依赖

这些组件不是业务代码手工直接调用的，但它们是当前开发链的关键部分：

| 组件 | 来源 | 用途 |
| --- | --- | --- |
| `esbuild` | `vite` | 高速预构建与转换 |
| `rollup` | `vite` | 生产打包 |
| `@babel/core` | `@vitejs/plugin-react` | React 转换支持 |
| `react-refresh` | `@vitejs/plugin-react` | 开发期热更新 |

## 6. 各组件在项目里的真实位置

### 表格

- 真实表格渲染：[`src/components/workbook-shell/WorkbookShell.tsx`](../src/components/workbook-shell/WorkbookShell.tsx)
- 表格状态适配边界：[`src/adapters/univer/univerAdapter.ts`](../src/adapters/univer/univerAdapter.ts)

注意：

- `UniverAdapter` 只是内部命名
- 它不代表仓库已使用 Univer

### 文件导入

- CSV：[`src/services/dataset.service.ts`](../src/services/dataset.service.ts) 中的 `papaparse`
- Excel：[`src/services/dataset.service.ts`](../src/services/dataset.service.ts) 中的 `xlsx`

### 公式

- 公式计算：[`src/services/formula.service.ts`](../src/services/formula.service.ts)
- 底层依赖：`fast-formula-parser`

### 后端接口

- 路由入口：[`backend/src/server.js`](../backend/src/server.js)
- 数据访问层：[`backend/src/store.js`](../backend/src/store.js)
- 导入任务：[`backend/src/import-jobs.js`](../backend/src/import-jobs.js)
- 结构化数据格式处理：[`backend/src/dataset-format.js`](../backend/src/dataset-format.js)

## 7. 当前没有使用的常见组件

为了避免误判，以下组件当前明确没有使用：

- `@univerjs/*`
- React Router
- Redux / Zustand / MobX
- Ant Design / MUI / Element Plus
- AG Grid / TanStack Table / Handsontable
- Tailwind CSS
- Prisma / TypeORM / Sequelize
- NestJS / Koa / Fastify

## 8. 为什么当前依赖结构是这样

当前项目的依赖策略比较克制，原因有三点：

- 先优先验证分析工作台这个产品闭环
- 把复杂能力集中在真正有价值的地方，比如表格渲染、公式、导入、远端存储
- 避免在 MVP 阶段引入过多框架层和抽象层

这种策略的好处：

- 仓库边界清晰
- 调试成本低
- 迁移成本可控

对应代价：

- 页面逻辑集中
- 路由和状态管理仍然偏轻
- 一些工程化能力还需要继续补

## 9. 当前最值得关注的开源组件

如果只看“对产品能力影响最大”的几类组件，当前最关键的是：

- `@glideapps/glide-data-grid`
  直接决定表格展示和大数据量虚拟化交互
- `fast-formula-parser`
  决定当前公式能力
- `papaparse` / `xlsx`
  决定本地文件导入链路
- `express` / `pg`
  决定后端接口和持久化落地
- `node-cron`
  决定定时同步能力

## 10. 结论

当前项目的开源组件组合已经明确形成了一套稳定边界：

- 前端：React + Vite + Glide Data Grid + 文件解析 + 公式引擎
- 后端：Express + pg + JWT + cron
- 部署：Docker Compose + Postgres

它已经不再是单纯的前端原型，而是一套可以在本机完整跑通的数据分析工作台。
