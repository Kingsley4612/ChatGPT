# Open Source Components

## 1. 说明

本文档只描述当前项目实际使用到的开源组件，不把“未来可能接入”的组件写进来。

最重要的结论：

- 当前项目没有接入 `@univerjs/*`
- 当前项目已经接入 `@glideapps/glide-data-grid` 作为真实表格内核

## 2. 直接依赖

根据当前工作区安装结果，项目直接依赖如下：

| 组件 | 当前安装版本 | 类型 | 用途 |
| --- | --- | --- | --- |
| `react` | `18.3.1` | 运行时 | 组件渲染与状态管理 |
| `react-dom` | `18.3.1` | 运行时 | 浏览器端挂载 React 应用 |
| `@glideapps/glide-data-grid` | `6.0.3` | 运行时 | 虚拟化表格渲染、编辑、行列选择 |
| `papaparse` | `5.5.3` | 运行时 | CSV worker 解析，避免大文件导入阻塞主线程 |
| `xlsx` | `0.18.5` | 运行时 | 解析 `xlsx/xls` 文件并统一导入工作簿 |
| `fast-formula-parser` | `1.0.19` | 运行时 | Excel 风格公式解析与计算，支持单元格引用、范围和常见函数 |
| `lodash` | 当前安装版本见锁文件 | 运行时 | Glide Data Grid 对等依赖 |
| `marked` | 当前安装版本见锁文件 | 运行时 | Glide Data Grid 对等依赖 |
| `react-responsive-carousel` | 当前安装版本见锁文件 | 运行时 | Glide Data Grid 对等依赖 |
| `typescript` | `5.9.3` | 开发依赖 | 静态类型检查与 TS 编译 |
| `vite` | `5.4.21` | 开发依赖 | 本地开发服务器与生产构建 |
| `@vitejs/plugin-react` | `4.7.0` | 开发依赖 | React JSX 支持与开发期刷新 |
| `@types/papaparse` | `5.5.2` | 开发依赖 | `papaparse` TypeScript 类型声明 |

## 3. 关键间接依赖

这些组件不是业务代码直接引用的，但属于当前开发链的关键组成部分：

| 组件 | 当前安装版本 | 来源 | 用途 |
| --- | --- | --- | --- |
| `esbuild` | `0.21.5` | `vite` | 预构建与高性能转换 |
| `rollup` | `4.60.0` | `vite` | 生产打包核心 |
| `@babel/core` | `7.29.0` | `@vitejs/plugin-react` | React 开发链转换支持 |
| `react-refresh` | `0.17.0` | `@vitejs/plugin-react` | 开发期热更新 |

## 4. 没有使用的常见组件

为了避免误判，这里明确列出当前没有使用的常见开源组件类型：

- 没有使用 `@univerjs/*`
- 没有使用 React Router
- 没有使用 Redux、Zustand、MobX
- 没有使用 Ant Design、MUI、Element Plus 一类 UI 组件库
- 没有使用 TanStack Table、AG Grid 一类表格库
- 没有使用 Tailwind CSS

## 5. `UniverAdapter` 的准确含义

[`src/adapters/univer/univerAdapter.ts`](../src/adapters/univer/univerAdapter.ts) 的作用是：

- 为页面层提供统一的表格状态操作接口
- 把“隐藏列、列宽、冻结、当前 sheet、表格状态变换”收敛到一个边界

当前它并不执行以下事情：

- 不创建 Univer 实例
- 不调用 `@univerjs/*`
- 不负责真实表格渲染

当前真实渲染在 [`src/components/workbook-shell/WorkbookShell.tsx`](../src/components/workbook-shell/WorkbookShell.tsx) 中，由 `@glideapps/glide-data-grid` 完成。

## 6. 为什么当前依赖这么少

这是一个典型的 MVP 取舍：

- 先用最少依赖验证产品交互
- 先把领域模型和页面闭环跑通
- 把表格引擎替换点留在适配层

这种做法的好处是：

- 依赖简单
- 迁移成本低
- 架构边界更清楚

对应代价是：

- 工作簿能力还不够系统化
- 页面逻辑较集中
- 表格性能与高级交互能力仍有上限
- 公式引擎、导入链路、表格渲染分别由不同组件承担，需要明确边界
