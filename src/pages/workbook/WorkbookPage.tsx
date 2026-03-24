import { useEffect, useMemo, useState } from 'react';
import { WorkbookShell } from '../../components/workbook-shell/WorkbookShell';
import { Toolbar } from '../../components/toolbar/Toolbar';
import { SecurityGuard } from '../../components/security-guard/SecurityGuard';
import { Watermark } from '../../components/watermark/Watermark';
import { useDataset } from '../../features/dataset/useDataset';
import { useSecurity } from '../../features/security/useSecurity';
import { buildWatermarkText } from '../../services/security.service';
import { maskValue } from '../../utils/mask';
import { UniverAdapter } from '../../adapters/univer/univerAdapter';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import { useAudit } from '../../features/audit/useAudit';

interface Props {
  datasetId: string;
  onBack: () => void;
}

export function WorkbookPage({ datasetId, onBack }: Props) {
  const [page, setPage] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<string>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { user, security } = useSecurity();
  const { emit } = useAudit(datasetId);
  const { meta, page: pageData, loading, error } = useDataset(datasetId, {
    page,
    pageSize: 50,
    keyword,
    sortBy,
    sortOrder,
    filters,
  });

  const adapter = useMemo(() => {
    if (!meta) return null;
    return new UniverAdapter({ fields: meta.fields, sheets: ['明细', '分析'] });
  }, [meta]);

  useEffect(() => {
    emit('open_dataset', { datasetId });
  }, [datasetId]);

  const maskedRows = useMemo(() => {
    if (!meta || !pageData) return [];
    return pageData.rows.map((row) => {
      const next = { ...row };
      meta.fields.forEach((field) => {
        if (security.enableMasking) {
          next[field.fieldName] = maskValue(next[field.fieldName], field);
        }
      });
      return next;
    });
  }, [meta, pageData, security.enableMasking]);

  const summary = useMemo(() => {
    if (!maskedRows.length || !meta) return { sum: 0, avg: 0, count: 0 };
    const numField = meta.fields.find((f) => f.type === 'number')?.fieldName;
    const values = numField ? maskedRows.map((r) => Number(r[numField]) || 0) : [];
    const sum = values.reduce((acc, cur) => acc + cur, 0);
    return { sum, avg: values.length ? sum / values.length : 0, count: maskedRows.length };
  }, [maskedRows, meta]);

  if (error) return <div>加载失败: {error}</div>;
  if (!meta || !pageData || !adapter) return <div>{loading ? '加载中...' : '暂无数据'}</div>;

  const state = adapter.getState();

  return (
    <Watermark enabled={security.enableWatermark} text={buildWatermarkText(user, security)}>
      <div style={{ padding: 12 }}>
        <button onClick={onBack}>返回</button>
        <SecurityGuard user={user} security={security}>
          <Toolbar
            datasetName={meta.name}
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
                visibleColumns: meta.fields.filter((f) => !state.hiddenColumns.includes(f.fieldName)).map((f) => f.fieldName),
                columnWidths: state.columnWidths,
                freeze: state.freeze,
                activeSheet: state.activeSheet,
                createdAt: new Date().toISOString(),
              });
              emit('save_view', { viewName });
            }}
            onSaveWorkbook={() => {
              if (!user.capabilities.canSaveWorkbook) return;
              const workbookName = prompt('输入工作簿名', `工作簿-${new Date().toLocaleString()}`);
              if (!workbookName) return;
              workbookService.save({
                workbookId: crypto.randomUUID(),
                name: workbookName,
                datasetId,
                sheets: [
                  {
                    sheetId: 's1',
                    name: state.activeSheet,
                    viewConfig: {
                      filters,
                      sortBy,
                      sortOrder,
                      visibleColumns: meta.fields.map((f) => f.fieldName),
                      columnWidths: state.columnWidths,
                      freeze: state.freeze,
                      activeSheet: state.activeSheet,
                    },
                    formulaColumns: [{ fieldName: 'calc_col', formula: '=ROUND(amount,2)' }],
                  },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              emit('save_workbook', { workbookName });
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={async () => {
                if (!(user.capabilities.canCopy && security.allowCopy)) return;
                await navigator.clipboard.writeText(JSON.stringify(maskedRows.slice(0, 20)));
                emit('copy', { rowCount: Math.min(maskedRows.length, 20) });
              }}
            >
              复制前20行
            </button>
            {meta.fields.map((f) => (
              <label key={f.fieldName}>
                <input type="checkbox" checked={!state.hiddenColumns.includes(f.fieldName)} onChange={() => adapter.toggleColumn(f.fieldName)} />
                {f.title}
              </label>
            ))}
          </div>
          <WorkbookShell
            fields={meta.fields}
            rows={maskedRows}
            hiddenColumns={state.hiddenColumns}
            columnWidths={state.columnWidths}
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
          <div style={{ marginTop: 8 }}>
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>上一页</button>
            <button disabled={!pageData.hasMore} onClick={() => setPage((p) => p + 1)}>下一页</button>
            <span> 当前第 {page + 1} 页 / 总行数 {meta.totalRows.toLocaleString()} </span>
          </div>
          <footer style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
            状态栏汇总: SUM={summary.sum.toFixed(2)} | AVG={summary.avg.toFixed(2)} | COUNT={summary.count}
          </footer>
        </SecurityGuard>
      </div>
    </Watermark>
  );
}
