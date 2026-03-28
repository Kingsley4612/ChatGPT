import { useEffect, useState } from 'react';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import { useSecurity } from '../../features/security/useSecurity';

interface Props {
  onBack: () => void;
  onOpenWorkbook: (workbookId: string, datasetId: string) => void;
}

export function MyAnalysisPage({ onBack, onOpenWorkbook }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [views, setViews] = useState<Awaited<ReturnType<typeof viewSaveService.listByUser>>>([]);
  const [workbooks, setWorkbooks] = useState<Awaited<ReturnType<typeof workbookService.listByUser>>>([]);
  const { user } = useSecurity();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [nextViews, nextWorkbooks] = await Promise.all([
        viewSaveService.listByUser(user.userId),
        workbookService.listByUser(user.userId),
      ]);

      if (cancelled) return;
      setViews(nextViews);
      setWorkbooks(nextWorkbooks);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, user.userId]);

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Personal Assets</div>
          <h2>我的分析</h2>
        </div>
        <button className="button-secondary" onClick={onBack}>返回首页</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>个人视图</h3>
        {views.length === 0 ? <p>暂无视图</p> : null}
        {views.map((v) => (
          <div key={v.viewId} className="asset-row">
            <div>
              <strong>{v.name}</strong>
              <div className="muted">{v.datasetId}</div>
            </div>
            <div className="inline-actions">
              <button
              onClick={async () => {
                const next = prompt('重命名视图', v.name);
                if (next) {
                  await viewSaveService.rename(v.viewId, next);
                  setRefreshKey((x) => x + 1);
                }
              }}
            >
              重命名
            </button>
              <button
              onClick={async () => {
                await viewSaveService.remove(v.viewId);
                setRefreshKey((x) => x + 1);
              }}
            >
              删除
            </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>个人分析工作簿</h3>
        {workbooks.length === 0 ? <p>暂无工作簿</p> : null}
        {workbooks.map((w) => (
          <div key={w.workbookId} className="asset-row">
            <div>
              <button className="link-button link-button--strong" onClick={() => onOpenWorkbook(w.workbookId, w.datasetId)}>
                {w.name}
              </button>
              <div className="muted">数据集：{w.datasetId}</div>
            </div>
            <div className="inline-actions">
              <button
              onClick={async () => {
                const next = prompt('重命名工作簿', w.name);
                if (next) {
                  await workbookService.save({ ...w, name: next, updatedAt: new Date().toISOString() });
                  setRefreshKey((x) => x + 1);
                }
              }}
            >
              重命名
            </button>
              <button
              onClick={async () => {
                await workbookService.remove(w.workbookId);
                setRefreshKey((x) => x + 1);
              }}
            >
              删除
            </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
