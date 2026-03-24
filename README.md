# 内网在线分析中心一期 MVP（可下载即用版）

> 目标：在禁止数据导出的前提下，提供接近 Excel 体验的在线分析模块，并可嵌入现有内网系统。

## 1. 技术方案说明
- 前端：React + TypeScript(strict) + Vite。
- 表格内核：采用 `UniverAdapter` 适配层模式（页面不直接依赖底层内核）。
- 数据加载：严格分页分块（`DatasetPageRequest`），模拟 10 万 ~ 100 万行。
- 安全模型：宿主注入 `UserContext` 与 `SecurityConfig`；前端只消费。
- 审计：关键操作统一 `auditService.log`。

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
`src/types/models.ts`：
- Dataset: `DatasetMeta`, `DatasetField`, `DatasetPageRequest`, `DatasetPageResponse`
- Security/Auth: `UserContext`, `SecurityConfig`
- Audit: `AuditEvent`
- Persistence: `ViewConfig`, `WorkbookConfig`

## 4. mock API 设计（支持百万级）
`dataset.service.ts`
- 总量模拟 `1,000,000` 行。
- `getDatasetPage` 仅返回请求页。
- 支持 `keyword + sort + filter`。
- 人工延迟模拟（120ms）。

## 5. 页面骨架
- **在线分析中心首页**：最近数据集、我的分析结果入口。
- **工作簿页**：工具栏、安全状态、主表格、Sheet 标签、分页与状态栏。
- **我的分析页**：个人视图/工作簿的打开、重命名、删除。

## 6. Univer 适配层
`adapters/univer/univerAdapter.ts`
- 隐藏/显示列
- 列宽调整
- 冻结首行/首列
- Sheet 切换状态
- 公式白名单校验

## 7. 工作簿核心能力（一期已打通）
- 类 Excel 网格展示（行列头、单元格选中）
- 单元格双击编辑
- 冻结首行/首列
- 列宽调整
- 排序、筛选、搜索
- 筛选支持即时输入 + 包含匹配 + 筛选条件标签清除
- 隐藏列/显示列
- 多 Sheet
- CSV 导入（仅导入到个人当前会话，不涉及导出）
- 公式白名单校验并应用公式列（示例：`ROUND`）
- 底部状态栏 `SUM / AVG / COUNT`（支持基于选中单元格统计）

## 8. 保存能力
### 个人视图
保存：筛选、排序、可见列、列宽、冻结、当前 sheet。  
实现：`viewSave.service.ts`（localStorage mock）

### 个人分析工作簿
保存：工作簿名、数据集 ID、sheet 配置、公式列配置、视图配置。  
实现：`workbook.service.ts`（localStorage mock）

## 9. 安全控制与审计
- 禁导出（默认无导出入口）
- 复制能力开关控制
- 敏感字段脱敏
- 页面水印
- 审计埋点：打开数据集、排序、筛选、搜索、复制、保存视图、保存工作簿

## 10. 本地运行
```bash
npm install
npm run dev
```

> 若内网限制公网 npm：
```bash
npm config set registry <你的内网npm镜像>
npm install
npm run dev
```
