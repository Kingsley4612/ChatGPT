# 内网在线分析中心一期 MVP（React + TypeScript）

## 1. 技术方案说明
- 前端采用 **React + TypeScript(strict)**，页面层只做编排与展示。
- 工作簿内核采用 **Univer Adapter** 设计：一期先实现 `UniverAdapter` 接口和轻量 mock，后续可无缝替换为 `@univerjs/*` 真正实例。
- 数据层采用服务端分页/分块加载模型：`DatasetPageRequest(page,pageSize,sort,filter,keyword)`。
- 安全能力由宿主注入 `UserContext + SecurityConfig`（MVP 中以 mock 注入），组件层只消费配置。
- 审计能力统一走 `auditService`，关键操作均落地事件。
- 保存能力拆分为：个人视图（View）与个人分析工作簿（Workbook），都存储于本地 mock（localStorage）。

## 2. 项目目录结构
```txt
src/
  pages/
    analysis-center/
    workbook/
    my-analysis/
  components/
    workbook-shell/
    toolbar/
    watermark/
    security-guard/
  features/
    dataset/
    workbook/
    view-save/
    audit/
    security/
  services/
    dataset.service.ts
    workbook.service.ts
    audit.service.ts
    security.service.ts
  adapters/
    univer/
  types/
  utils/
```

## 3. 核心类型定义
`src/types/models.ts` 中统一定义：
- `DatasetMeta`
- `DatasetField`
- `DatasetPageRequest`
- `DatasetPageResponse`
- `UserContext`
- `SecurityConfig`
- `AuditEvent`
- `ViewConfig`
- `WorkbookConfig`

覆盖字段：数据集 ID/名称/总行数、字段元信息（可排序/可筛选/是否敏感）、权限能力、禁导出/水印/脱敏等安全能力。

## 4. mock API 设计
`dataset.service.ts` 实现：
- 数据集总量模拟 `1,000,000` 行。
- `getDatasetPage` 按页生成当前块数据，避免前端全量加载。
- 支持 `sort/filter/search` 参数。
- 模拟网络延时（120ms）。

## 5. 页面骨架代码
- `AnalysisCenterPage`: 最近打开数据集、我的分析结果、常用数据集入口。
- `WorkbookPage`: 工具栏、主表格、安全状态提示、Sheet 概念、保存入口、状态栏汇总。
- `MyAnalysisPage`: 个人视图/工作簿列表，支持重命名与删除。

## 6. Univer 适配层
`adapters/univer/univerAdapter.ts`
- 封装工作簿状态：隐藏列、列宽、冻结、活动 Sheet。
- 提供接口：`toggleColumn`、`setColumnWidth`、`setFreeze`、`setActiveSheet`。
- 公式白名单校验：`validateFormula`（仅允许一期指定函数）。

## 7. 工作簿页核心逻辑
`WorkbookPage.tsx` 中打通：
- 分页加载数据
- 搜索/排序/筛选
- 敏感字段脱敏
- 隐藏列
- 底部 SUM/AVG/COUNT 汇总
- 翻页与总行数展示

## 8. 视图保存与工作簿保存逻辑
- 个人视图保存字段：筛选、排序、可见列、列宽、冻结状态、当前 Sheet。
- 工作簿保存字段：工作簿名、来源数据集 ID、sheet 配置、公式列配置、视图配置。
- `viewSave.service.ts` 与 `workbook.service.ts` 负责 list/save/remove/rename。

## 9. 安全控制与审计埋点
- 禁导出：UI 明确标记禁用，不提供导出入口。
- 复制能力：受 `UserContext.capabilities.canCopy` + `SecurityConfig.allowCopy` 控制。
- 脱敏：按字段 `sensitive` + `enableMasking` 实时处理。
- 水印：`Watermark` 组件渲染用户标识。
- 审计事件：打开数据集、排序、筛选、搜索、复制、保存视图、保存工作簿（MVP 中已覆盖大部分，复制/打开可扩展到宿主事件桥接）。

## 10. 启动方式
```bash
npm install
npm run dev
```

## 一期公式白名单
`SUM, AVERAGE, MIN, MAX, COUNT, IF, ROUND, CONCAT, LEFT, RIGHT, TODAY, YEAR, MONTH, DAY`
