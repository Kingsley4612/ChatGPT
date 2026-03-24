interface Props {
  datasetName: string;
  onSearch: (value: string) => void;
  onSaveView: () => void;
  onSaveWorkbook: () => void;
}

export function Toolbar({ datasetName, onSearch, onSaveView, onSaveWorkbook }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderBottom: '1px solid #eee' }}>
      <strong>{datasetName}</strong>
      <input placeholder="搜索关键字" onChange={(e) => onSearch(e.target.value)} />
      <button onClick={onSaveView}>保存视图</button>
      <button onClick={onSaveWorkbook}>保存工作簿</button>
    </div>
  );
}
