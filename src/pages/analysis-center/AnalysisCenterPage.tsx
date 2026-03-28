import { useEffect, useState } from 'react';
import { isRemotePersistenceEnabled } from '../../config/persistence';
import { BLANK_DATASET_ID, datasetService } from '../../services/dataset.service';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import type { DatasetMeta, ImportJob, ViewConfig, WorkbookConfig } from '../../types/models';
import { useSecurity } from '../../features/security/useSecurity';

interface Props {
  onOpenDataset: (datasetId: string) => void;
  onCreateBlankWorkbook: (datasetId: string) => void;
  onOpenWorkbook: (workbookId: string, datasetId: string) => void;
  onOpenMyAnalysis: () => void;
}

function formatDatasetType(datasetType?: DatasetMeta['datasetType']): string {
  switch (datasetType) {
    case 'source':
      return '导入数据集';
    case 'saved':
      return '结果数据集';
    case 'blank':
      return '空白工作簿';
    case 'sample':
      return '样例数据';
    default:
      return '数据集';
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AnalysisCenterPage({ onOpenDataset, onCreateBlankWorkbook, onOpenWorkbook, onOpenMyAnalysis }: Props) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [views, setViews] = useState<ViewConfig[]>([]);
  const [workbooks, setWorkbooks] = useState<WorkbookConfig[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [datasetKeyword, setDatasetKeyword] = useState('');
  const [mutatingDatasetId, setMutatingDatasetId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { user } = useSecurity();
  const remoteMode = isRemotePersistenceEnabled();

  async function reloadDashboard(): Promise<void> {
    const tasks: Promise<unknown>[] = [
      datasetService.listDatasets(),
      viewSaveService.listByUser(user.userId),
      workbookService.listByUser(user.userId),
    ];

    if (remoteMode) {
      tasks.push(datasetService.listImportJobs());
    }

    const [nextDatasets, nextViews, nextWorkbooks, nextImportJobs] = (await Promise.all(tasks)) as [
      DatasetMeta[],
      ViewConfig[],
      WorkbookConfig[],
      ImportJob[] | undefined,
    ];

    setDatasets(nextDatasets);
    setViews(nextViews.slice(0, 5));
    setWorkbooks(nextWorkbooks.slice(0, 5));
    setImportJobs((nextImportJobs ?? []).slice(0, 8));
  }

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const tasks: Promise<unknown>[] = [datasetService.listDatasets(), viewSaveService.listByUser(user.userId), workbookService.listByUser(user.userId)];
      if (remoteMode) tasks.push(datasetService.listImportJobs());
      const [nextDatasets, nextViews, nextWorkbooks, nextImportJobs] = (await Promise.all(tasks)) as [DatasetMeta[], ViewConfig[], WorkbookConfig[], ImportJob[] | undefined];
      if (cancelled) return;
      setDatasets(nextDatasets);
      setViews(nextViews.slice(0, 5));
      setWorkbooks(nextWorkbooks.slice(0, 5));
      setImportJobs((nextImportJobs ?? []).slice(0, 8));
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [remoteMode, user.userId]);

  useEffect(() => {
    let cancelled = false;
    if (!remoteMode) return () => {
      cancelled = true;
    };

    const timer = setInterval(() => {
      void (async () => {
        const [nextDatasets, nextImportJobs] = await Promise.all([datasetService.listDatasets(), datasetService.listImportJobs()]);

        if (cancelled) return;
        setDatasets(nextDatasets);
        setImportJobs(nextImportJobs.slice(0, 8));
      })();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [remoteMode]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredDatasets = datasets.filter((dataset) => {
    const query = datasetKeyword.trim().toLowerCase();
    if (!query) return true;
    return [
      dataset.name,
      dataset.datasetType,
      dataset.sourceUrl,
      dataset.datasetId,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <div className="page-shell">
      <div className="hero-grid">
        <section className="card hero-panel">
          <div className="eyebrow">Workspace</div>
          <h2>在线分析工作台</h2>
          <p className="muted">统一进入数据集、个人视图和个人工作簿，继续上次分析上下文。</p>
          <div className="inline-actions">
            <button onClick={() => onCreateBlankWorkbook(BLANK_DATASET_ID)}>新建空白工作簿</button>
            {remoteMode ? (
              <button
                onClick={async () => {
                  const defaultUrl = `${window.location.origin}/api/mock/external-dataset?rows=5000`;
                  const name = prompt('输入本次拉取后的数据集名称', `结构化数据-${new Date().toLocaleString()}`);
                  if (!name?.trim()) return;
                  const sourceUrl = prompt('输入结构化数据接口地址', defaultUrl);
                  if (!sourceUrl?.trim()) return;

                  setLoadingJobs(true);
                  try {
                    await datasetService.createImportJob({
                      name: name.trim(),
                      sourceUrl: sourceUrl.trim(),
                    });
                    await reloadDashboard();
                    setToast('已创建导入任务，后台处理中');
                  } catch (error) {
                    setToast(error instanceof Error ? error.message : '创建导入任务失败');
                  } finally {
                    setLoadingJobs(false);
                  }
                }}
              >
                {loadingJobs ? '创建任务中...' : '手动拉取结构化数据'}
              </button>
            ) : null}
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
        <div className="page-heading">
          <div>
            <h3 style={{ margin: 0 }}>最近打开/常用数据集</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>支持搜索、重命名、删除、复制数据集 ID 和查看来源地址。</p>
          </div>
          <input
            value={datasetKeyword}
            onChange={(event) => setDatasetKeyword(event.target.value)}
            placeholder="搜索数据集名称、类型、来源地址"
            style={{ minWidth: 280 }}
          />
        </div>
        <div className="dataset-grid">
          {filteredDatasets.map((dataset) => (
            <div key={dataset.datasetId} className="dataset-card">
              <div className="dataset-card__header">
                <div>
                  <strong>{dataset.name}</strong>
                  <div className="muted">{formatDatasetType(dataset.datasetType)} · {dataset.totalRows.toLocaleString()} 行</div>
                </div>
                {dataset.canManage ? <span className="dataset-badge">可管理</span> : null}
              </div>
              <div className="dataset-meta">
                <span>数据集 ID：{dataset.datasetId}</span>
                <span>更新时间：{formatDateTime(dataset.updatedAt)}</span>
                {dataset.sourceUrl ? <span>来源地址：{dataset.sourceUrl}</span> : null}
              </div>
              <div className="inline-actions">
                <button className="button-secondary" onClick={() => onOpenDataset(dataset.datasetId)}>打开</button>
                <button
                  className="button-secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(dataset.datasetId);
                      setToast('数据集 ID 已复制');
                    } catch {
                      setToast('复制数据集 ID 失败');
                    }
                  }}
                >
                  复制ID
                </button>
                {dataset.sourceUrl ? (
                  <button
                    className="button-secondary"
                    onClick={() => {
                      window.open(dataset.sourceUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    打开来源
                  </button>
                ) : null}
                {remoteMode && dataset.canManage ? (
                  <button
                    className="button-secondary"
                    disabled={mutatingDatasetId === dataset.datasetId}
                    onClick={async () => {
                      const nextName = prompt('输入新的数据集名称', dataset.name);
                      if (!nextName?.trim() || nextName.trim() === dataset.name) return;
                      setMutatingDatasetId(dataset.datasetId);
                      try {
                        await datasetService.renameDataset(dataset.datasetId, nextName.trim());
                        await reloadDashboard();
                        setToast('数据集已重命名');
                      } catch (error) {
                        setToast(error instanceof Error ? error.message : '重命名失败');
                      } finally {
                        setMutatingDatasetId(null);
                      }
                    }}
                  >
                    重命名
                  </button>
                ) : null}
                {remoteMode && dataset.canManage ? (
                  <button
                    disabled={mutatingDatasetId === dataset.datasetId}
                    onClick={async () => {
                      const confirmed = window.confirm(`确认删除数据集“${dataset.name}”吗？`);
                      if (!confirmed) return;
                      setMutatingDatasetId(dataset.datasetId);
                      try {
                        await datasetService.deleteDataset(dataset.datasetId);
                        await reloadDashboard();
                        setToast('数据集已删除');
                      } catch (error) {
                        setToast(error instanceof Error ? error.message : '删除失败');
                      } finally {
                        setMutatingDatasetId(null);
                      }
                    }}
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {remoteMode ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="page-heading" style={{ marginBottom: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>最近导入任务</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>支持手动拉取和后端定时同步，完成后数据集会出现在上方列表。</p>
            </div>
            <button
              className="button-secondary"
              onClick={async () => {
                await reloadDashboard();
              }}
            >
              刷新
            </button>
          </div>
          {importJobs.length === 0 ? <p>暂无导入任务</p> : null}
          {importJobs.map((job) => (
            <div key={job.jobId} className="asset-row">
              <div>
                <strong>{job.jobName}</strong>
                <div className="muted">{job.scheduleType === 'scheduled' ? '定时同步' : '手动拉取'} · {job.status}</div>
                <div className="muted">{job.sourceUrl}</div>
              </div>
              <div className="inline-actions">
                {job.datasetId ? <span className="muted">结果集：{job.datasetId}</span> : null}
                {job.errorMessage ? <span className="muted">{job.errorMessage}</span> : null}
                {job.datasetId ? (
                  <button className="button-secondary" onClick={() => onOpenDataset(job.datasetId!)}>
                    打开结果集
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
