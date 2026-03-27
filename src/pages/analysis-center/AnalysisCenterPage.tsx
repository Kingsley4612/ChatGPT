import { useEffect, useState } from 'react';
import { BLANK_DATASET_ID, datasetService } from '../../services/dataset.service';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import type { DatasetMeta, ViewConfig, WorkbookConfig } from '../../types/models';
import { useSecurity } from '../../features/security/useSecurity';

interface Props {
  onOpenDataset: (datasetId: string) => void;
  onCreateBlankWorkbook: (datasetId: string) => void;
  onOpenWorkbook: (workbookId: string, datasetId: string) => void;
  onOpenMyAnalysis: () => void;
}

export function AnalysisCenterPage({ onOpenDataset, onCreateBlankWorkbook, onOpenWorkbook, onOpenMyAnalysis }: Props) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [views, setViews] = useState<ViewConfig[]>([]);
  const [workbooks, setWorkbooks] = useState<WorkbookConfig[]>([]);
  const { user } = useSecurity();

  useEffect(() => {
    datasetService.listDatasets().then(setDatasets);
    setViews(viewSaveService.listByUser(user.userId).slice(0, 5));
    setWorkbooks(workbookService.listByUser(user.userId).slice(0, 5));
  }, [user.userId]);

  return (
    <div className="page-shell">
      <div className="hero-grid">
        <section className="card hero-panel">
          <div className="eyebrow">Workspace</div>
          <h2>在线分析工作台</h2>
          <p className="muted">统一进入数据集、个人视图和个人工作簿，继续上次分析上下文。</p>
          <div className="inline-actions">
            <button onClick={() => onCreateBlankWorkbook(BLANK_DATASET_ID)}>新建空白工作簿</button>
            <button onClick={onOpenMyAnalysis}>进入我的分析</button>
          </div>
        </section>
        <section className="card stats-panel">
          <div className="metric-card">
            <strong>{datasets.length}</strong>
            <span>可用数据集</span>
          </div>
          <div className="metric-card">
            <strong>{workbooks.length}</strong>
            <span>最近个人工作簿</span>
          </div>
          <div className="metric-card">
            <strong>{views.length}</strong>
            <span>最近个人视图</span>
          </div>
        </section>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>最近打开/常用数据集</h3>
        <div className="list-grid">
          {datasets.map((d) => (
            <button key={d.datasetId} className="list-item-button" onClick={() => onOpenDataset(d.datasetId)}>
              <strong>{d.name}</strong>
              <span>{d.totalRows.toLocaleString()} 行</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>我的分析结果（最近5个）</h3>
        <ul className="result-list">
          {views.map((v) => (
            <li key={v.viewId}>{v.name}</li>
          ))}
          {workbooks.map((w) => (
            <li key={w.workbookId}>
              <button className="link-button" onClick={() => onOpenWorkbook(w.workbookId, w.datasetId)}>
                {w.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
