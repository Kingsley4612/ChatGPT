import { useEffect, useMemo, useState } from 'react';
import { WorkbookShell } from '../../components/workbook-shell/WorkbookShell';
import { Toolbar } from '../../components/toolbar/Toolbar';
import { SecurityGuard } from '../../components/security-guard/SecurityGuard';
import { Watermark } from '../../components/watermark/Watermark';
import { useDataset } from '../../features/dataset/useDataset';
import { useSecurity } from '../../features/security/useSecurity';
import { buildWatermarkText } from '../../services/security.service';
import { maskValue } from '../../utils/mask';
import { UniverAdapter, type UniverGridState } from '../../adapters/univer/univerAdapter';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import { useAudit } from '../../features/audit/useAudit';
import { datasetService } from '../../services/dataset.service';

interface Props {
  datasetId: string;
  onBack: () => void;
}

interface SheetState {
  name: string;
  grid: UniverGridState;
}

const SHEETS = ['明细(原始数据)', '分析(编辑与计算)'];

function evaluateFormula(formula: string, row: Record<string, unknown>): unknown {
  const normalized = formula.trim().toUpperCase();
  if (normalized.startsWith('=ROUND(')) {
    const raw = formula.slice(formula.indexOf('(') + 1, formula.lastIndexOf(')'));
    const [field, digits] = raw.split(',').map((x) => x.trim());
    const v = Number(row[field] ?? 0);
    const d = Number(digits ?? 0);
    return Number.isNaN(v) ? '' : Number(v.toFixed(d));
  }
  return '#N/A';
}

export function WorkbookPage({ datasetId, onBack }: Props) {
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<string>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [workbookName, setWorkbookName] = useState('临时工作簿');
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(SHEETS[0]);
  const [formula, setFormula] = useState('=ROUND(amount,2)');
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [editedRows, setEditedRows] = useState<Record<string, unknown>[] | null>(null);
  const [addedRows, setAddedRows] = useState<Record<string, unknown>[]>([]);
  const [customColumns, setCustomColumns] = useState<Array<{ fieldName: string; title: string }>>([]);
  const [selectedWidthField, setSelectedWidthField] = useState('orderId');

  const { user, security } = useSecurity();
  const { emit } = useAudit(datasetId);
  const { meta, page: pageData, loading, error } = useDataset(datasetId, {
    page,
    pageSize: 100,
    keyword,
    sortBy,
    sortOrder,
    filters,
    reloadKey: refreshKey,
  });

  const adapter = useMemo(() => {
    if (!meta) return null;
    return new UniverAdapter({ fields: meta.fields, sheets: SHEETS });
  }, [meta]);

  const [sheetStates, setSheetStates] = useState<SheetState[]>([]);

  useEffect(() => {
    if (!adapter) return;
    setSheetStates(SHEETS.map((name) => ({ name, grid: adapter.initialState })));
  }, [adapter]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeSheetState = sheetStates.find((s) => s.name === activeSheet) ?? sheetStates[0];

  useEffect(() => {
    emit('open_dataset', { datasetId });
  }, [datasetId, emit]);

  useEffect(() => {
    setEditedRows(null);
    setAddedRows([]);
  }, [pageData]);

  const baseRows = editedRows ?? pageData?.rows ?? [];
  const rawRows = [...baseRows, ...addedRows];

  const rowsWithFormula = useMemo(() => {
    return rawRows.map((row) => ({ ...row, calc_col: evaluateFormula(formula, row) }));
  }, [rawRows, formula]);

  const maskedRows = useMemo(() => {
    if (!meta || !rowsWithFormula.length) return [];
    return rowsWithFormula.map((row) => {
      const next = { ...row };
      meta.fields.forEach((field) => {
        if (security.enableMasking) {
          next[field.fieldName] = maskValue(next[field.fieldName], field);
        }
      });
      return next;
    });
  }, [meta, rowsWithFormula, security.enableMasking]);

  const displayFields = useMemo(() => {
    if (!meta) return [];
    const custom = customColumns.map((c) => ({
      fieldName: c.fieldName,
      title: c.title,
      type: 'string' as const,
      sortable: true,
      filterable: true,
      sensitive: false,
    }));
    return [...meta.fields, ...custom, { fieldName: 'calc_col', title: '公式列', type: 'number', sortable: false, filterable: false, sensitive: false }];
  }, [meta, customColumns]);
  const selectedWidthValue = activeSheetState?.grid.columnWidths[selectedWidthField] ?? 140;

  const summary = useMemo(() => {
    if (!maskedRows.length) return { sum: 0, avg: 0, count: 0 };
    const numericValues: number[] = [];

    selectedCells.forEach((key) => {
      const [rowIdxRaw, fieldName] = key.split(':');
      const row = maskedRows[Number(rowIdxRaw)];
      const value = Number(row?.[fieldName]);
      if (!Number.isNaN(value)) numericValues.push(value);
    });

    const values = numericValues.length
      ? numericValues
      : maskedRows
          .flatMap((r) => Object.values(r))
          .map((x) => Number(x))
          .filter((x) => !Number.isNaN(x));

    const sum = values.reduce((acc, cur) => acc + cur, 0);
    return { sum, avg: values.length ? sum / values.length : 0, count: values.length };
  }, [maskedRows, selectedCells]);

  if (error) return <div>加载失败: {error}</div>;
  if (!meta || !pageData || !adapter || !activeSheetState) return <div>{loading ? '加载中...' : '暂无数据'}</div>;

  const updateActiveSheet = (updater: (state: UniverGridState) => UniverGridState) => {
    setSheetStates((prev) => prev.map((sheet) => (sheet.name === activeSheetState.name ? { ...sheet, grid: updater(sheet.grid) } : sheet)));
  };

  return (
    <Watermark enabled={security.enableWatermark} text={buildWatermarkText(user, security)}>
      <div style={{ padding: 12 }}>
        <button onClick={onBack}>返回</button>
        <SecurityGuard user={user} security={security}>
          <Toolbar
            datasetName={meta.name}
            workbookName={workbookName}
            formula={formula}
            formulaError={formulaError}
            fields={displayFields}
            selectedWidthField={selectedWidthField}
            selectedWidthValue={selectedWidthValue}
            onSelectWidthField={setSelectedWidthField}
            onChangeWidth={(width) => {
              updateActiveSheet((state) => adapter.setColumnWidth(state, selectedWidthField, width));
            }}
            onFormulaChange={setFormula}
            onImportCsv={async (file) => {
              const text = await file.text();
              const result = await datasetService.importCsv(text);
              setPage(0);
              setRefreshKey((x) => x + 1);
              setToast(`导入成功：${result.imported} 行`);
            }}
            onApplyFormula={() => {
              if (!adapter.validateFormula(formula)) {
                setFormulaError('公式不在白名单中');
                setToast('公式不在白名单中');
                return;
              }
              setFormulaError(null);
              setToast('公式已应用');
            }}
            onFreezeFirstRow={() => {
              updateActiveSheet((state) => adapter.setFreeze(state, 1, state.freeze.col));
              setToast('已冻结首行');
            }}
            onFreezeFirstCol={() => {
              updateActiveSheet((state) => adapter.setFreeze(state, state.freeze.row, 1));
              setToast('已冻结首列');
            }}
            onSearch={(value) => {
              setKeyword(value);
              emit('search', { keyword: value });
            }}
            onSaveView={() => {
              if (!user.capabilities.canSaveView) return;
              const viewName = prompt('输入视图名称', `视图-${new Date().toLocaleString()}`);
              if (!viewName) return;
              viewSaveService.save({
                viewId: crypto.randomUUID(),
                ownerUserId: user.userId,
                ownerOrg: user.department,
                name: viewName,
                datasetId,
                filters,
                sortBy,
                sortOrder,
                visibleColumns: displayFields.filter((f) => !activeSheetState.grid.hiddenColumns.includes(f.fieldName)).map((f) => f.fieldName),
                columnWidths: activeSheetState.grid.columnWidths,
                freeze: activeSheetState.grid.freeze,
                activeSheet: activeSheetState.grid.activeSheet,
                createdAt: new Date().toISOString(),
              });
              emit('save_view', { viewName });
              setToast(`视图“${viewName}”保存成功`);
            }}
            onSaveWorkbook={() => {
              if (!user.capabilities.canSaveWorkbook) return;
              const name = workbookName;
              const id = workbookId ?? crypto.randomUUID();
              workbookService.save({
                workbookId: id,
                ownerUserId: user.userId,
                ownerOrg: user.department,
                name,
                datasetId,
                sheets: sheetStates.map((sheet, index) => ({
                  sheetId: `s${index + 1}`,
                  name: sheet.name,
                  viewConfig: {
                    filters,
                    sortBy,
                    sortOrder,
                    visibleColumns: displayFields.map((f) => f.fieldName),
                    columnWidths: sheet.grid.columnWidths,
                    freeze: sheet.grid.freeze,
                    activeSheet: sheet.grid.activeSheet,
                  },
                  formulaColumns: [{ fieldName: 'calc_col', formula }],
                })),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              setWorkbookId(id);
              emit('save_workbook', { workbookName: name });
              setToast(`工作簿“${name}”保存成功`);
            }}
            onSaveWorkbookAs={() => {
              if (!user.capabilities.canSaveWorkbook) return;
              const name = prompt('另存为工作簿名称', `${workbookName}-副本`);
              if (!name) return;
              const id = crypto.randomUUID();
              setWorkbookName(name);
              setWorkbookId(id);
              workbookService.save({
                workbookId: id,
                ownerUserId: user.userId,
                ownerOrg: user.department,
                name,
                datasetId,
                sheets: sheetStates.map((sheet, index) => ({
                  sheetId: `s${index + 1}`,
                  name: sheet.name,
                  viewConfig: {
                    filters,
                    sortBy,
                    sortOrder,
                    visibleColumns: displayFields.map((f) => f.fieldName),
                    columnWidths: sheet.grid.columnWidths,
                    freeze: sheet.grid.freeze,
                    activeSheet: sheet.grid.activeSheet,
                  },
                  formulaColumns: [{ fieldName: 'calc_col', formula }],
                })),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              setToast(`已另存为“${name}”`);
            }}
          />
          <div className="card" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                if (!(user.capabilities.canCopy && security.allowCopy)) return;
                await navigator.clipboard.writeText(JSON.stringify(maskedRows.slice(0, 20)));
                emit('copy', { rowCount: Math.min(maskedRows.length, 20) });
                setToast('已复制前20行');
              }}
            >
              复制前20行
            </button>
            <button
              onClick={async () => {
                await datasetService.clearImportedRows();
                setPage(0);
                setRefreshKey((x) => x + 1);
                setToast('已恢复系统示例数据');
              }}
            >
              恢复示例数据
            </button>
            <button
              onClick={() => {
                const empty = Object.fromEntries(displayFields.map((f) => [f.fieldName, '']));
                setAddedRows((prev) => [...prev, empty]);
                setToast('已新增一行');
              }}
            >
              新增行
            </button>
            <button
              onClick={() => {
                const name = prompt('请输入新列名称(英文/数字)', `col_${customColumns.length + 1}`);
                if (!name) return;
                if (displayFields.some((f) => f.fieldName === name)) {
                  setToast('列名已存在');
                  return;
                }
                setCustomColumns((prev) => [...prev, { fieldName: name, title: name }]);
                setToast(`已新增列 ${name}`);
              }}
            >
              新增列
            </button>
            {displayFields.map((f) => (
              <label key={f.fieldName}>
                <input type="checkbox" checked={!activeSheetState.grid.hiddenColumns.includes(f.fieldName)} onChange={() => updateActiveSheet((state) => adapter.toggleColumn(state, f.fieldName))} />
                {f.title}
              </label>
            ))}
          </div>
          <div className="card" style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>当前筛选：</strong>
            {Object.entries(filters)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} style={{ background: '#e2e8f0', borderRadius: 12, padding: '2px 8px' }}>
                  {k}: {v}
                  <button
                    style={{ marginLeft: 6, background: '#64748b', padding: '2px 6px' }}
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, [k]: '' }));
                      setToast(`已移除筛选 ${k}`);
                    }}
                  >
                    x
                  </button>
                </span>
              ))}
            <button
              onClick={() => {
                setFilters({});
                setToast('已清空所有筛选');
              }}
            >
              清空筛选
            </button>
          </div>

          <WorkbookShell
            fields={displayFields}
            rows={maskedRows}
            hiddenColumns={activeSheetState.grid.hiddenColumns}
            columnWidths={activeSheetState.grid.columnWidths}
            freeze={activeSheetState.grid.freeze}
            selectedCells={selectedCells}
            onSelectRange={(startRow, endRow, startField, endField, append) => {
              const rowMin = Math.min(startRow, endRow);
              const rowMax = Math.max(startRow, endRow);
              const visible = displayFields.filter((f) => !activeSheetState.grid.hiddenColumns.includes(f.fieldName));
              const colStart = visible.findIndex((f) => f.fieldName === startField);
              const colEnd = visible.findIndex((f) => f.fieldName === endField);
              const colMin = Math.min(colStart, colEnd);
              const colMax = Math.max(colStart, colEnd);

              setSelectedCells((prev) => {
                const next = append ? new Set(prev) : new Set<string>();
                for (let r = rowMin; r <= rowMax; r += 1) {
                  for (let c = colMin; c <= colMax; c += 1) {
                    const field = visible[c];
                    if (field) next.add(`${r}:${field.fieldName}`);
                  }
                }
                return next;
              });
            }}
            onEditCell={(rowIndex, fieldName, value) => {
              if (rowIndex < baseRows.length) {
                setEditedRows((prev) => {
                  const current = [...(prev ?? baseRows)];
                  current[rowIndex] = { ...current[rowIndex], [fieldName]: value };
                  return current;
                });
              } else {
                const addedIndex = rowIndex - baseRows.length;
                setAddedRows((prev) => {
                  const current = [...prev];
                  current[addedIndex] = { ...(current[addedIndex] ?? {}), [fieldName]: value };
                  return current;
                });
              }
              setToast(`已修改单元格 ${fieldName}`);
            }}
            filterValues={filters}
            onSort={(fieldName, order) => {
              setSortBy(fieldName);
              setSortOrder(order);
              emit('sort', { fieldName, order });
            }}
            onFilter={(fieldName, value) => {
              setFilters((prev) => ({ ...prev, [fieldName]: value }));
              emit('filter', { fieldName, value });
            }}
          />

          <div className="card" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>上一页</button>
            <button disabled={!pageData.hasMore} onClick={() => setPage((p) => p + 1)}>下一页</button>
            <span> 当前第 {page + 1} 页 / 总行数 {meta.totalRows.toLocaleString()} </span>
          </div>

          <div className="card" style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Sheet 说明：<strong>明细</strong>用于看原始数据；<strong>分析</strong>用于做编辑与公式试算。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
            {SHEETS.map((sheetName) => (
              <button
                key={sheetName}
                style={{ fontWeight: sheetName === activeSheet ? 700 : 400, background: sheetName === activeSheet ? '#1d4ed8' : '#64748b' }}
                onClick={() => {
                  setActiveSheet(sheetName);
                  updateActiveSheet((state) => adapter.setActiveSheet(state, sheetName));
                }}
              >
                {sheetName}
              </button>
            ))}
            </div>
          </div>

          <footer className="card" style={{ marginTop: 8 }}>
            状态栏汇总: SUM={summary.sum.toFixed(2)} | AVG={summary.avg.toFixed(2)} | COUNT={summary.count}
          </footer>
        </SecurityGuard>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </Watermark>
  );
}
