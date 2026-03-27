# Development Guide

## 1. 文档目的

本文档面向开发人员，描述当前项目的真实实现方式、模块职责、数据流、持久化模型，以及项目实际使用到的开源组件。

核心原则只有一条：

- 文档以当前代码为准

因此本文会明确区分：

- 已实现能力
- 预留抽象
- 尚未接入的能力

## 2. 项目定位

该项目是“内网在线分析中心”的前端 MVP，用于验证以下场景：

- 用户登录后进入分析工作台
- 查看可用数据集
- 打开一个类 Excel 的工作簿页面
- 在前端完成搜索、筛选、排序、单元格编辑、内联公式、列宽、冻结、保存视图、保存工作簿等交互
- 在不提供导出入口的前提下，叠加水印、脱敏、复制开关和审计记录

当前阶段没有真实后端，没有数据库，也没有统一权限平台接入。

## 3. 技术选型

### 3.1 运行时

- React
- ReactDOM

用途：

- 组件渲染
- `useState` / `useEffect` / `useMemo` 管理页面状态
- 使用函数组件实现页面与模块

### 3.2 语言与类型系统

- TypeScript

用途：

- 为数据集、用户、安全配置、审计事件、视图、工作簿等领域对象提供类型定义
- 约束服务层、页面层与组件层之间的数据接口

### 3.3 构建工具

- Vite
- `@vitejs/plugin-react`

用途：

- 本地开发服务器
- 模块热更新
- 生产构建
- React JSX 转换支持

### 3.4 样式方案

- 原生 CSS

当前没有引入：

- Ant Design
- MUI
- Tailwind CSS
- Sass / Less
- CSS-in-JS 库

## 4. 当前代码结构

```txt
src/
  main.tsx
  styles.css
  adapters/
    univer/univerAdapter.ts
  components/
    security-guard/SecurityGuard.tsx
    toolbar/Toolbar.tsx
    watermark/Watermark.tsx
    workbook-shell/WorkbookShell.tsx
  features/
    audit/useAudit.ts
    dataset/useDataset.ts
    security/useSecurity.ts
    view-save/viewSave.service.ts
    workbook/README.md
  pages/
    analysis-center/AnalysisCenterPage.tsx
    login/LoginPage.tsx
    my-analysis/MyAnalysisPage.tsx
    workbook/WorkbookPage.tsx
  services/
    audit.service.ts
    dataset.service.ts
    security.service.ts
    workbook.service.ts
  types/
    models.ts
  utils/
    formulaWhitelist.ts
    mask.ts
```

## 5. 路由与页面流转

当前没有使用 React Router。

页面切换在 [`src/main.tsx`](../src/main.tsx) 中通过本地状态完成：

- `login`
- `home`
- `my-analysis`
- `workbook`

流转关系：

1. 未登录时进入 `login`
2. 登录成功后进入 `home`
3. 从首页可进入：
   - 数据集工作簿页
   - 我的分析页
4. 从“我的分析”中可重新打开工作簿

这种实现方式适合 MVP，但有明显边界：

- 无 URL 路由
- 无浏览器历史管理
- 无深链接
- 无页面级权限守卫

如果进入下一阶段，应首先引入真正的路由层。

## 6. 模块职责

### 6.1 `pages/`

页面容器层，负责组织交互流程。

- `LoginPage.tsx`
  - 登录表单
  - 提交登录
  - 显示错误信息

- `AnalysisCenterPage.tsx`
  - 加载数据集列表
  - 加载当前用户最近视图和工作簿
  - 提供入口跳转

- `MyAnalysisPage.tsx`
  - 展示当前用户的视图与工作簿
  - 重命名和删除

- `WorkbookPage.tsx`
  - 当前项目最核心、最复杂的页面
  - 聚合数据加载、选择、筛选、排序、保存、公式、CSV 导入、复制、删除、状态栏汇总等能力
  - 处理双击编辑、列名改名等工作簿交互

### 6.2 `components/`

UI 展示与轻交互层。

- `WorkbookShell.tsx`
  - 使用 `@glideapps/glide-data-grid` 渲染表格
  - 虚拟化滚动
  - 单元格编辑
  - 行列选择

- `Toolbar.tsx`
  - 搜索
  - 冻结
  - CSV 导入
  - 列宽调整
  - 保存视图 / 工作簿

- `SecurityGuard.tsx`
  - 展示导出、复制、脱敏状态

- `Watermark.tsx`
  - 在页面上覆盖固定水印层

### 6.3 `services/`

服务层主要负责 mock 数据、持久化与领域逻辑。

- `dataset.service.ts`
  - 提供数据集元信息
  - 按页生成示例数据
  - 使用 `papaparse` worker 解析 CSV，并使用 `xlsx` 解析 Excel 文件后导入当前工作簿
  - 搜索、筛选、排序、分页

- `security.service.ts`
  - 登录
  - 获取当前用户
  - 退出登录
  - 构建水印文本

- `audit.service.ts`
  - 记录审计事件到本地

- `workbook.service.ts`
  - 工作簿保存、查询、删除

### 6.4 `features/`

这里主要放 hook 和局部领域能力。

- `useDataset`
  - 封装数据集元信息和分页数据加载

- `useSecurity`
  - 读取当前用户和安全配置

- `useAudit`
  - 统一发出审计事件

- `viewSave.service.ts`
  - 个人视图持久化

### 6.5 `adapters/`

[`src/adapters/univer/univerAdapter.ts`](../src/adapters/univer/univerAdapter.ts) 是当前项目中最容易被误读的部分。

它当前不是 Univer 集成代码，而是一个内部抽象层，承担以下职责：

- 隐藏列状态切换
- 列宽变更
- 冻结状态变更
- 当前 Sheet 状态
- 公式白名单校验入口

当前类名叫 `UniverAdapter`，只是表达“以后可替换为 Univer 或其他表格引擎”的意图。当前仓库并未安装或使用 `@univerjs/*`，实际渲染内核已接入 `@glideapps/glide-data-grid`。

## 7. 关键数据模型

核心类型定义位于 [`src/types/models.ts`](../src/types/models.ts)。

### 7.1 数据集

- `DatasetField`
- `DatasetMeta`
- `DatasetPageRequest`
- `DatasetPageResponse`

### 7.2 用户与安全

- `UserContext`
- `SecurityConfig`

### 7.3 审计

- `AuditAction`
- `AuditEvent`

### 7.4 持久化对象

- `ViewConfig`
- `WorkbookConfig`

这些类型决定了页面状态、服务层输出和持久化结构的基本边界。

## 8. 工作簿页面实现细节

[`src/pages/workbook/WorkbookPage.tsx`](../src/pages/workbook/WorkbookPage.tsx) 是当前 MVP 的核心。

### 8.1 为什么这个文件很大

当前项目处于 MVP 阶段，许多工作簿能力集中在一个页面内完成，原因是：

- 先验证交互闭环
- 先验证本地数据模型是否可行
- 暂时不为过早抽象付出拆分成本

这带来的问题也很明显：

- 文件较长
- 状态较多
- 交互耦合较强
- 测试粒度不够细

### 8.2 主要状态

工作簿页当前维护了多类状态：

- 分页：`page`
- 刷新：`refreshKey`
- 搜索：`keyword`
- 过滤：`filters`
- 排序：`sortBy` / `sortOrder`
- 工作簿名与 ID：`workbookName` / `workbookId`
- 公式：`formula` / `formulaError`
- 表格外观：`gridState`
- 选择状态：`selectedCells` / `selectedRows` / `selectedColumns`
- 临时提示：`toast`
- 自定义列与已删除列：`customColumns` / `removedColumns`
- 本地快照：`snapshotRows`

### 8.3 两种数据来源模式

工作簿页存在两种数据运行模式：

#### 模式 A：分页 mock 数据模式

当没有 `snapshotRows` 时：

- 页面通过 `useDataset` 从 `datasetService` 按页获取数据
- 数据总量默认为 100 万行
- 用于验证“分页加载 + 表格浏览”能力

#### 模式 B：本地快照模式

当工作簿被保存、加载或导入 CSV 后：

- 页面使用 `snapshotRows` 作为当前数据源
- 后续的筛选、排序、分页都在本地快照上进行
- 支持继续编辑、新增行列、删除行列

这意味着当前实现更偏“前端交互验证”，不是完整的大规模服务端数据分析链路。

### 8.4 单元格公式

当前公式能力分成两层：

1. 输入方式
   - 直接在单元格中输入，以 `=` 开头时按公式解析

2. 真正执行
   - 位置：[`src/services/formula.service.ts`](../src/services/formula.service.ts)
   - 当前通过 `fast-formula-parser` 执行 Excel 风格公式
   - 已支持单元格引用、范围引用和常见函数，如 `SUM`、`AVERAGE`、`IF`、`ROUND`

因此要特别注意：

- 当前不是完整 Excel 工作簿引擎
- 当前没有跨 Sheet 公式、动态数组溢出和命名区域

### 8.5 表格渲染方式

当前表格渲染基于 `@glideapps/glide-data-grid`：

- Canvas 驱动的虚拟化表格
- 支持大数据量滚动与编辑
- 行列选择由表格内核管理

优点：

- 实现透明
- 依赖极少
- 方便演示和改造

缺点：

- 对超大规模复杂交互不够强
- 虚拟化、公式引擎、撤销重做、快捷键体系都没有
- 后续若继续增强，页面复杂度会迅速上升

## 9. 服务层说明

### 9.1 `dataset.service.ts`

关键行为：

- 固定数据集 ID：`risk_orders`
- 默认字段：
  - `orderId`
  - `customerName`
  - `amount`
  - `region`
  - `createdAt`
- 未导入 CSV 时按页生成行数据
- 已导入 CSV 时使用工作簿快照行
- 搜索与筛选均采用模糊匹配
- 排序使用中文地区比较器
- 人工延迟约 `80ms`

### 9.2 `security.service.ts`

关键行为：

- 当前用户存储键：`analysis.current.user`
- 通过 `PBKDF2` 验证密码
- `mockSecurityConfig` 控制：
  - 禁导出
  - 开启水印
  - 开启脱敏
  - 是否允许复制

### 9.3 `audit.service.ts`

关键行为：

- 审计事件存到 `analysis.audit.events`
- 最多保留 500 条
- 同时打印 `console.info('[AUDIT]', event)`

### 9.4 `viewSave.service.ts` 与 `workbook.service.ts`

二者都使用 `localStorage`。

区别：

- 视图保存的是筛选、排序、列宽、冻结、可见列等“观察配置”
- 工作簿保存的是名称、数据集、sheet 配置、列定义、快照行、颜色标记等

## 10. 浏览器原生 API 依赖

项目虽然开源依赖少，但较依赖浏览器原生能力：

- `localStorage`
  - 当前用户
  - 审计日志
  - 视图
  - 工作簿
  - 导入 CSV 数据

- `crypto.subtle`
  - 登录密码哈希校验

- `crypto.randomUUID()`
  - 生成视图 ID、工作簿 ID

- `navigator.clipboard.writeText`
  - 复制前 20 行

- `File.text()`
  - 浏览器选择上传文件

- `Worker`
  - `papaparse` 解析 CSV 时避免阻塞主线程

## 11. 开源组件说明

### 11.1 结论

当前项目“真正直接使用”的开源组件非常少。

直接依赖层：

- React
- ReactDOM
- `@glideapps/glide-data-grid`
- `papaparse`
- `xlsx`
- `fast-formula-parser`
- TypeScript
- Vite
- `@vitejs/plugin-react`

关键间接依赖层：

- `esbuild`
- `rollup`
- `@babel/core`
- `react-refresh`

当前没有使用：

- `@glideapps/glide-data-grid` 之外的第三方表格库
- 第三方 UI 组件库
- 第三方状态管理库
- 第三方路由库
- `@univerjs/*`

### 11.2 当前安装版本

根据当前工作区 `npm ls` 结果：

直接依赖：

- `react@18.3.1`
- `react-dom@18.3.1`
- `typescript@5.9.3`
- `vite@5.4.21`
- `@vitejs/plugin-react@4.7.0`

关键间接依赖：

- `esbuild@0.21.5`
- `rollup@4.60.0`
- `@babel/core@7.29.0`
- `react-refresh@0.17.0`

注意：

- `package.json` 中使用的是 `^` 范围版本
- 因此“声明版本”和“当前安装版本”可能不同
- 文档描述实际运行环境时，应优先写当前安装版本

### 11.3 每个组件的作用

#### React

职责：

- 构建页面和组件
- 管理组件状态与副作用
- 驱动工作簿页面的交互刷新

本项目中的典型使用：

- `useState`
- `useEffect`
- `useMemo`
- 函数组件

#### ReactDOM

职责：

- 将 React 组件树挂载到浏览器 DOM

本项目入口：

- [`src/main.tsx`](../src/main.tsx)

#### TypeScript

职责：

- 提供静态类型
- 定义领域模型
- 帮助控制页面、服务和持久化结构的一致性

重点文件：

- [`src/types/models.ts`](../src/types/models.ts)

#### Vite

职责：

- 启动开发服务器
- 处理 ESM 模块
- 构建生产包

脚本入口：

- `npm run dev`
- `npm run build`
- `npm run preview`

#### `@vitejs/plugin-react`

职责：

- 让 Vite 正确处理 React JSX
- 接入开发期 React 刷新能力

#### esbuild

职责：

- Vite 开发/构建链中的高性能预构建与转换工具

在本项目中：

- 不是手写调用
- 由 Vite 间接使用

#### rollup

职责：

- Vite 生产构建阶段的打包器核心

在本项目中：

- 同样是 Vite 间接使用

#### `@babel/core`

职责：

- 由 `@vitejs/plugin-react` 间接使用，服务于 JSX/React 开发链转换

#### react-refresh

职责：

- 支持开发期组件热更新体验

### 11.4 为什么文档必须特别说明 `UniverAdapter`

因为从命名上看，开发者很容易误以为项目已经基于 Univer。

实际情况是：

- 当前仓库中没有 `@univerjs/*` 依赖
- 当前表格渲染由 `@glideapps/glide-data-grid` 承担
- `UniverAdapter` 只是抽象边界

正确理解应该是：

- 页面层依赖 `UniverAdapter`
- `UniverAdapter` 当前内部只做状态变换
- 将来如果要替换成真正的表格引擎，可以优先在适配层收敛改动

## 12. 当前实现的优势与代价

### 优势

- 依赖少，启动快，理解成本低
- 代码路径短，适合演示和快速迭代
- 容易观察每个功能是如何落地的
- 适合先验证在线分析中心的交互闭环

### 代价

- 工作簿页逻辑集中
- 没有正式路由层
- 没有后端 API
- 大文件导入仍然是浏览器本地处理，浏览器内存上限仍然是约束
- 没有测试体系

## 13. 下一步建议

如果这个项目要从演示走向可持续开发，建议优先做以下事情：

1. 把 `WorkbookPage.tsx` 拆成更小的状态模块和 UI 模块
2. 引入真正的路由层
3. 补导入进度、错误定位和字段映射能力
4. 明确公式白名单与执行器的对应关系
5. 评估是否需要更完整的 Excel 公式引擎
6. 把 `localStorage` mock 服务替换成后端 API
