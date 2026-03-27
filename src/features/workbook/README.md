# Workbook Feature

## 当前状态

工作簿功能在一期 MVP 中主要集中实现于 [`src/pages/workbook/WorkbookPage.tsx`](../../pages/workbook/WorkbookPage.tsx)。

这是一个有意的阶段性取舍，目的是先把以下链路打通：

- 数据加载
- 搜索、筛选、排序
- 单元格公式
- 单元格编辑
- 列名双击编辑
- 选择与汇总
- 列显隐、列宽、冻结
- `csv/xlsx/xls` 导入
- 个人视图保存
- 工作簿保存与另存为

## 为什么没有完全拆分

当前版本优先验证业务闭环，而不是先做细粒度模块化，因此大量状态和操作逻辑仍保留在页面层。

这种做法的收益：

- MVP 落地快
- 交互路径清晰
- 修改时不需要跨太多文件

这种做法的代价：

- 页面文件较大
- 状态耦合较高
- 后续测试与扩展成本会上升

## 当前内部职责边界

- `WorkbookPage.tsx`
  - 工作簿主状态
  - 保存与恢复
  - 公式栏与编辑交互
  - 搜索/筛选/排序
  - 快照模式管理

- `components/workbook-shell/WorkbookShell.tsx`
  - 基于 `@glideapps/glide-data-grid` 的表格 UI 渲染
  - 行列选择
  - 虚拟化滚动
  - 单元格编辑

- `services/formula.service.ts`
  - 基于 `fast-formula-parser` 的公式解析与计算
  - 单元格引用、范围引用、函数求值

- `components/toolbar/Toolbar.tsx`
  - 顶部工具栏交互

- `adapters/univer/univerAdapter.ts`
  - 表格状态变换边界

## 二期建议拆分

进入下一阶段后，建议至少拆成以下模块：

- `features/workbook/useWorkbookGrid.ts`
  - 网格状态、列宽、冻结、显隐

- `features/workbook/useWorkbookSelection.ts`
  - 单元格/行/列选择与汇总

- `features/workbook/useWorkbookPersistence.ts`
  - 视图保存、工作簿保存、恢复

- `features/workbook/useWorkbookFormula.ts`
  - 公式输入校验与执行

- `features/workbook/useWorkbookSnapshot.ts`
  - CSV 导入、本地快照、编辑、新增删除

## 关于 `UniverAdapter`

这里需要再次强调：

- 当前没有接入 `@univerjs/*`
- 当前已经接入 `@glideapps/glide-data-grid`
- 当前已经接入 `fast-formula-parser`
- `UniverAdapter` 是适配边界，不是真实 Univer 集成实现

如果后续决定接入真正的表格内核，应优先保持页面层接口稳定，在适配层内部完成替换。
