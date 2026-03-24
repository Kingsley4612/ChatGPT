interface Props {
  datasetName: string;
  workbookName: string;
  formula: string;
  formulaError: string | null;
  onSearch: (value: string) => void;
  onFormulaChange: (value: string) => void;
  onApplyFormula: () => void;
  onFreezeFirstRow: () => void;
  onFreezeFirstCol: () => void;
  onSaveView: () => void;
  onSaveWorkbook: () => void;
}

export function Toolbar({
  datasetName,
  workbookName,
  formula,
  formulaError,
  onSearch,
  onFormulaChange,
  onApplyFormula,
  onFreezeFirstRow,
  onFreezeFirstCol,
  onSaveView,
  onSaveWorkbook,
}: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
      <strong>{datasetName}</strong>
      <span>|</span>
      <span>{workbookName}</span>
      <input placeholder="搜索关键字" onChange={(e) => onSearch(e.target.value)} />
      <button onClick={onFreezeFirstRow}>冻结首行</button>
      <button onClick={onFreezeFirstCol}>冻结首列</button>
      <input
        value={formula}
        onChange={(e) => onFormulaChange(e.target.value)}
        placeholder="输入公式，如 =ROUND(amount,2)"
        style={{ minWidth: 220 }}
      />
      <button onClick={onApplyFormula}>应用公式列</button>
      {formulaError ? <span style={{ color: 'crimson' }}>{formulaError}</span> : null}
      <button onClick={onSaveView}>保存视图</button>
      <button onClick={onSaveWorkbook}>保存工作簿</button>
    </div>
  );
}
