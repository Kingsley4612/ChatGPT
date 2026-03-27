interface Props {
  datasetName: string;
  workbookName: string;
  importing: boolean;
  isFirstRowFrozen: boolean;
  isFirstColFrozen: boolean;
  onSearch: (value: string) => void;
  onFreezeFirstRow: () => void;
  onFreezeFirstCol: () => void;
  onImportCsv: (file: File) => void;
  onSaveView: () => void;
  onSaveWorkbook: () => void;
  onSaveWorkbookAs: () => void;
}

export function Toolbar({
  datasetName,
  workbookName,
  importing,
  isFirstRowFrozen,
  isFirstColFrozen,
  onSearch,
  onFreezeFirstRow,
  onFreezeFirstCol,
  onImportCsv,
  onSaveView,
  onSaveWorkbook,
  onSaveWorkbookAs,
}: Props) {
  return (
    <div className="card toolbar-card">
      <div className="toolbar-section toolbar-title-block">
        <strong>{datasetName}</strong>
        <span className="muted">{workbookName}</span>
      </div>
      <div className="toolbar-section">
        <input placeholder="搜索关键字" onChange={(e) => onSearch(e.target.value)} />
        <span className="muted">搜索和筛选均支持模糊匹配</span>
      </div>
      <div className="toolbar-section">
        <button onClick={onFreezeFirstRow}>{isFirstRowFrozen ? '取消冻结首行' : '冻结首行'}</button>
        <button onClick={onFreezeFirstCol}>{isFirstColFrozen ? '取消冻结首列' : '冻结首列'}</button>
        <label className={`file-trigger${importing ? ' is-disabled' : ''}`}>
          {importing ? '导入中...' : '导入 CSV'}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportCsv(file);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      <div className="toolbar-section">
        <button onClick={onSaveView}>保存视图</button>
        <button onClick={onSaveWorkbook}>保存</button>
        <button onClick={onSaveWorkbookAs}>另存为</button>
      </div>
    </div>
  );
}
