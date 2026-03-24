import type { DatasetField } from '../../types/models';

interface Props {
  datasetName: string;
  workbookName: string;
  formula: string;
  formulaError: string | null;
  fields: DatasetField[];
  selectedWidthField: string;
  selectedWidthValue: number;
  onSelectWidthField: (fieldName: string) => void;
  onChangeWidth: (width: number) => void;
  onSearch: (value: string) => void;
  onFormulaChange: (value: string) => void;
  onApplyFormula: () => void;
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
  formula,
  formulaError,
  fields,
  selectedWidthField,
  selectedWidthValue,
  onSelectWidthField,
  onChangeWidth,
  onSearch,
  onFormulaChange,
  onApplyFormula,
  onFreezeFirstRow,
  onFreezeFirstCol,
  onImportCsv,
  onSaveView,
  onSaveWorkbook,
  onSaveWorkbookAs,
}: Props) {
  return (
    <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <strong>{datasetName}</strong>
      <span style={{ color: '#94a3b8' }}>|</span>
      <span>{workbookName}</span>
      <input placeholder="搜索关键字" onChange={(e) => onSearch(e.target.value)} />
      <span style={{ fontSize: 12, color: '#64748b' }}>筛选支持实时输入</span>
      <button onClick={onFreezeFirstRow}>冻结首行</button>
      <button onClick={onFreezeFirstCol}>冻结首列</button>
      <label style={{ border: '1px dashed #94a3b8', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
        导入 CSV
        <input
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportCsv(file);
          }}
        />
      </label>

      <label style={{ fontSize: 12, color: '#475569' }}>列宽:</label>
      <select value={selectedWidthField} onChange={(e) => onSelectWidthField(e.target.value)}>
        {fields.map((f) => (
          <option key={f.fieldName} value={f.fieldName}>
            {f.title}
          </option>
        ))}
      </select>
      <input type="range" min={80} max={360} value={selectedWidthValue} onChange={(e) => onChangeWidth(Number(e.target.value))} />

      <input
        value={formula}
        onChange={(e) => onFormulaChange(e.target.value)}
        placeholder="输入公式，如 =ROUND(amount,2)"
        style={{ minWidth: 220 }}
      />
      <button onClick={onApplyFormula}>应用公式列</button>
      {formulaError ? <span style={{ color: 'crimson' }}>{formulaError}</span> : null}
      <button onClick={onSaveView}>保存视图</button>
      <button onClick={onSaveWorkbook}>保存</button>
      <button onClick={onSaveWorkbookAs}>另存为</button>
    </div>
  );
}
