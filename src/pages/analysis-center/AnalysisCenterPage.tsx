import { useEffect, useState } from 'react';
import { datasetService } from '../../services/dataset.service';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import type { DatasetMeta, ViewConfig, WorkbookConfig } from '../../types/models';

interface Props {
  onOpenDataset: (datasetId: string) => void;
  onOpenMyAnalysis: () => void;
}

export function AnalysisCenterPage({ onOpenDataset, onOpenMyAnalysis }: Props) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [views, setViews] = useState<ViewConfig[]>([]);
  const [workbooks, setWorkbooks] = useState<WorkbookConfig[]>([]);

  useEffect(() => {
    datasetService.listDatasets().then(setDatasets);
    setViews(viewSaveService.list().slice(0, 5));
    setWorkbooks(workbookService.list().slice(0, 5));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>在线分析中心</h2>
      <button onClick={onOpenMyAnalysis}>进入我的分析</button>
      <h3>最近打开/常用数据集</h3>
      {datasets.map((d) => (
        <div key={d.datasetId}>
          <button onClick={() => onOpenDataset(d.datasetId)}>{d.name}</button> ({d.totalRows.toLocaleString()} 行)
        </div>
      ))}
      <h3>我的分析结果（最近5个）</h3>
      <ul>
        {views.map((v) => (
          <li key={v.viewId}>{v.name}</li>
        ))}
        {workbooks.map((w) => (
          <li key={w.workbookId}>{w.name}</li>
        ))}
      </ul>
    </div>
  );
}
