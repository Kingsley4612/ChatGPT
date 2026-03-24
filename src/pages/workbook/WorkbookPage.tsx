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

interface Props {
  datasetId: string;
  onBack: () => void;
}

interface SheetState {
  name: string;
  grid: UniverGridState;
}

const SHEETS = ['明细', '分析'];

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
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<string>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [workbookName, setWorkbookName] = useState('临时工作簿');
  const [activeSheet, setActiveSheet] = useState(SHEETS[0]);
  const [formula, setFormula] = useState('=ROUND(amount,2)');
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  const { user, security } = useSecurity();
  const { emit } = useAudit(datasetId);
  const { meta, page: pageData, loading, error } = useDataset(datasetId, {
    page,
    pageSize: 100,
    keyword,
    sortBy,
    sortOrder,
    filters,
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

  const activeSheetState = sheetStates.find((s) => s.name === activeSheet) ?? sheetStates[0];

  useEffect(() => {
    emit('open_dataset', { datasetId });
  }, [datasetId, emit]);

  const rowsWithFormula = useMemo(() => {
    if (!pageData) return [];
    return pageData.rows.map((row) => ({ ...row, calc_col: evaluateFormula(formula, row) }));
  }, [pageData, formula]);

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
    return [...meta.fields, { fieldName: 'calc_col', title: '公式列', type: 'number', sortable: false, filterable: false, sensitive: false }];
  }, [meta]);

  const summary = useMemo(() => {
    if (!maskedRows.length || !meta) return { sum: 0, avg: 0, count: 0 };
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
  }, [maskedRows, meta, selectedCells]);

  if (error) return <div>加载失败: {error}</div>;
  if (!meta || !pageData || !adapter || !activeSheetState) return <div>{loading ? '加载中...' : '暂无数据'}</div>;

  const updateActiveSheet = (updater: (state: UniverGridState) => UniverGridState) => {
    setSheetStates((prev) =>
      prev.map((sheet) => (sheet.name === activeSheetState.name ? { ...sheet, grid: updater(sheet.grid) } : sheet)),
    );
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
            onFormulaChange={setFormula}
            onApplyFormula={() => {
              if (!adapter.validateFormula(formula)) {
                setFormulaError('公式不在白名单中');
                return;
              }
              setFormulaError(null);
            }}
            onFreezeFirstRow={() => updateActiveSheet((state) => adapter.setFreeze(state, 1, state.freeze.col))}
            onFreezeFirstCol={() => updateActiveSheet((state) => adapter.setFreeze(state, state.freeze.row, 1))}
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
                name: viewName,
                datasetId,
                filters,
                sortBy,
                sortOrder,
                visibleColumns: displayFields
                  .filter((f) => !activeSheetState.grid.hiddenColumns.includes(f.fieldName))
                  .map((f) => f.fieldName),
                columnWidths: activeSheetState.grid.columnWidths,
                freeze: activeSheetState.grid.freeze,
                activeSheet: activeSheetState.grid.activeSheet,
                createdAt: new Date().toISOString(),
              });
              emit('save_view', { viewName });
            }}
            onSaveWorkbook={() => {
              if (!user.capabilities.canSaveWorkbook) return;
              const name = prompt('输入工作簿名', workbookName);
              if (!name) return;
              setWorkbookName(name);
              workbookService.save({
                workbookId: crypto.randomUUID(),
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
              emit('save_workbook', { workbookName: name });
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                if (!(user.capabilities.canCopy && security.allowCopy)) return;
                await navigator.clipboard.writeText(JSON.stringify(maskedRows.slice(0, 20)));
                emit('copy', { rowCount: Math.min(maskedRows.length, 20) });
              }}
            >
              复制前20行
            </button>
            {displayFields.map((f) => (
              <label key={f.fieldName}>
                <input
                  type="checkbox"
                  checked={!activeSheetState.grid.hiddenColumns.includes(f.fieldName)}
                  onChange={() => updateActiveSheet((state) => adapter.toggleColumn(state, f.fieldName))}
                />
                {f.title}
              </label>
            ))}
          </div>

          <WorkbookShell
            fields={displayFields}
            rows={maskedRows}
            hiddenColumns={activeSheetState.grid.hiddenColumns}
            columnWidths={activeSheetState.grid.columnWidths}
            freeze={activeSheetState.grid.freeze}
            selectedCells={selectedCells}
            onSelectCell={(rowIndex, fieldName, multi) => {
              setSelectedCells((prev) => {
                const next = new Set(prev);
                const key = `${rowIndex}:${fieldName}`;
                if (!multi) next.clear();
                if (next.has(key)) {
                  next.delete(key);
                } else {
                  next.add(key);
                }
                return next;
              });
            }}
            onColumnWidthChange={(fieldName, width) =>
              updateActiveSheet((state) => adapter.setColumnWidth(state, fieldName, width))
            }
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

          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>上一页</button>
            <button disabled={!pageData.hasMore} onClick={() => setPage((p) => p + 1)}>下一页</button>
            <span> 当前第 {page + 1} 页 / 总行数 {meta.totalRows.toLocaleString()} </span>
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {SHEETS.map((sheetName) => (
              <button
                key={sheetName}
                style={{ fontWeight: sheetName === activeSheet ? 700 : 400 }}
                onClick={() => {
                  setActiveSheet(sheetName);
                  updateActiveSheet((state) => adapter.setActiveSheet(state, sheetName));
                }}
              >
                {sheetName}
              </button>
            ))}
          </div>

          <footer style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
            状态栏汇总: SUM={summary.sum.toFixed(2)} | AVG={summary.avg.toFixed(2)} | COUNT={summary.count}
          </footer>
        </SecurityGuard>
      </div>
    </Watermark>
  );
}
