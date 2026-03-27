# 内网在线分析中心一期 MVP

> 目标：在禁止数据导出的前提下，提供接近 Excel 体验的在线分析模块，并可嵌入现有内网系统。

## 项目概览

这是一个基于 React + TypeScript + Vite 的前端演示项目，当前以本地 mock 数据和 `localStorage` 持久化为主，用来验证在线分析中心的一期核心交互。

当前实现重点：

- 登录态与用户归属
- 数据集列表与工作簿入口
- 类 Excel 网格展示与单元格编辑
- 排序、筛选、搜索、列宽调整、冻结首行首列
- 行列选择、批量删除、状态栏汇总
- `xlsx/xls/csv` 文件导入到当前工作簿
- 个人视图保存、个人工作簿保存/另存为
- 水印、脱敏、复制开关、审计记录

## 技术栈

- 运行时：React、ReactDOM
- 开发语言：TypeScript
- 构建与开发服务器：Vite
- 样式方案：原生 CSS

重要说明：

- 当前仓库没有直接接入 `@univerjs/*`。
- 当前实际接入的表格内核是 `@glideapps/glide-data-grid`，用于承载大数据量虚拟滚动、编辑和选择能力。
- [`UniverAdapter`](./src/adapters/univer/univerAdapter.ts) 仍然保留为“表格能力适配边界”，但当前渲染内核已经切换为 Glide Data Grid。

## 文档索引

- 根说明文档：当前文件
- 开发文档：[`docs/development.md`](./docs/development.md)
- 开源组件说明：[`docs/open-source-components.md`](./docs/open-source-components.md)
- 工作簿模块说明：[`src/features/workbook/README.md`](./src/features/workbook/README.md)

## 目录结构

```txt
src/
  adapters/
    univer/
  components/
    security-guard/
    toolbar/
    watermark/
    workbook-shell/
  features/
    audit/
    dataset/
    security/
    view-save/
    workbook/
  pages/
    analysis-center/
    login/
    my-analysis/
    workbook/
  services/
  types/
  utils/
```

## 页面与功能

### 1. 登录页

- 账号、密码、组织登录
- 登录成功后写入当前用户到 `localStorage`
- 密码校验使用浏览器原生 `crypto.subtle` 做 PBKDF2 派生

### 2. 在线分析中心首页

- 展示最近可用数据集
- 展示当前用户最近保存的个人视图与工作簿
- 支持进入“我的分析”或直接打开数据集

### 3. 我的分析页

- 查看当前用户保存的视图和工作簿
- 支持重命名、删除
- 支持重新打开工作簿

### 4. 工作簿页

当前已经实现：

- 工具栏搜索
- 单元格内联公式输入与计算
- 冻结第 1 行/首列
- 列宽调整
- `xlsx/xls/csv` 文件导入到当前工作簿
- 保存视图
- 保存工作簿 / 另存为
- 复制前 20 行
- 恢复示例数据
- 新增行 / 新增列
- 删除选中行 / 删除选中列
- 复选框隐藏列 / 显示列
- 单元格拖拽框选
- 行选择 / 列选择
- 双击单元格编辑
- 双击第 1 行单元格改列名
- 表头排序
- 列头即时筛选
- 分页翻页
- 状态栏 `SUM / AVG / COUNT`

当前未实现或仅做预留：

- 真正的 `@univerjs/*` 集成
- 完整多 Sheet 编辑界面
- 后端 API、服务端持久化、权限中心接入
- 跨表引用、动态数组溢出和多 Sheet 公式联动

## 核心实现说明

### 数据集与分页

[`src/services/dataset.service.ts`](./src/services/dataset.service.ts)

- 内置示例数据集 `risk_orders`
- 默认总量模拟 `1,000,000` 行
- 未导入 CSV 时，按页动态生成数据
- 已导入 CSV 时，基于导入内容做本地筛选、排序和分页
- 搜索与筛选支持模糊匹配
- 人工延迟约 `80ms`

### 安全与登录

[`src/services/security.service.ts`](./src/services/security.service.ts)

- 当前用户存在 `analysis.current.user`
- 安全配置采用前端 mock
- 页面通过 `SecurityGuard` 展示复制/导出/脱敏状态
- 页面通过 `Watermark` 添加固定水印层

### 审计

[`src/services/audit.service.ts`](./src/services/audit.service.ts)

- 审计事件写入 `analysis.audit.events`
- 当前记录的动作包括：
  - `open_dataset`
  - `sort`
  - `filter`
  - `search`
  - `copy`
  - `save_view`
  - `save_workbook`

### 保存能力

- 个人视图：[`src/features/view-save/viewSave.service.ts`](./src/features/view-save/viewSave.service.ts)
- 工作簿：[`src/services/workbook.service.ts`](./src/services/workbook.service.ts)

二者都使用 `localStorage` 做演示持久化，并按当前用户归属过滤。

## 当前使用的开源组件

项目直接依赖和构建链细节见：

- [`docs/open-source-components.md`](./docs/open-source-components.md)
- [`docs/development.md`](./docs/development.md)

结论先说清楚：

- 当前直接使用的开源组件包括 React、ReactDOM、TypeScript、Vite、`@vitejs/plugin-react`、`@glideapps/glide-data-grid`、`papaparse`、`xlsx`、`fast-formula-parser`
- 当前没有接入第三方 UI 组件库、状态管理库、路由库，但已经接入第三方表格内核
- `UniverAdapter` 仍然是内部命名，不等于项目已经使用 Univer

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址一般为：

```txt
http://localhost:5173/
```

如果占用端口，Vite 会自动切换到其他端口。

## 构建

```bash
npm run build
npm run preview
```

## 演示账号

当前代码中已配置演示账号：

- 账号：`kingsley`

密码哈希存放在 [`src/services/security.service.ts`](./src/services/security.service.ts) 中；如果需要固定明文演示密码，建议在后续版本补一个单独的演示环境说明，而不要把明文密码长期写进公开文档。

## 已知限制

- 当前应用是单页前端应用，页面切换使用本地 `useState`，未引入路由库
- 工作簿主逻辑集中在 [`src/pages/workbook/WorkbookPage.tsx`](./src/pages/workbook/WorkbookPage.tsx)
- 当前表格渲染基于 `@glideapps/glide-data-grid`，已具备虚拟化能力；公式计算已接入 `fast-formula-parser`，但跨表、动态数组溢出、协同和完整 Excel 能力仍未覆盖
- 导入支持 `csv/xlsx/xls`，但当前仍是前端本地解析与本地持久化，不是服务端批量导入链路
- 持久化全部在浏览器本地，不适合多端协作或正式生产环境
