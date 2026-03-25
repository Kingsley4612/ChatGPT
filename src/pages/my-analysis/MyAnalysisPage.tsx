import { useMemo, useState } from 'react';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import { useSecurity } from '../../features/security/useSecurity';

interface Props {
  onBack: () => void;
}

export function MyAnalysisPage({ onBack }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { user } = useSecurity();
  const views = useMemo(() => viewSaveService.listByUser(user.userId), [refreshKey, user.userId]);
  const workbooks = useMemo(() => workbookService.listByUser(user.userId), [refreshKey, user.userId]);

  return (
    <div style={{ padding: 16 }}>
      <h2>我的分析</h2>
      <button onClick={onBack}>返回首页</button>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>个人视图</h3>
        {views.length === 0 ? <p>暂无视图</p> : null}
        {views.map((v) => (
          <div key={v.viewId} style={{ marginBottom: 8 }}>
            <span>{v.name}</span>
            <button
              onClick={() => {
                const next = prompt('重命名视图', v.name);
                if (next) {
                  viewSaveService.rename(v.viewId, next);
                  setRefreshKey((x) => x + 1);
                }
              }}
            >
              重命名
            </button>
            <button
              onClick={() => {
                viewSaveService.remove(v.viewId);
                setRefreshKey((x) => x + 1);
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>个人分析工作簿</h3>
        {workbooks.length === 0 ? <p>暂无工作簿</p> : null}
        {workbooks.map((w) => (
          <div key={w.workbookId} style={{ marginBottom: 8 }}>
            <span>{w.name}</span>
            <button
              onClick={() => {
                const next = prompt('重命名工作簿', w.name);
                if (next) {
                  workbookService.save({ ...w, name: next, updatedAt: new Date().toISOString() });
                  setRefreshKey((x) => x + 1);
                }
              }}
            >
              重命名
            </button>
            <button
              onClick={() => {
                workbookService.remove(w.workbookId);
                setRefreshKey((x) => x + 1);
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
