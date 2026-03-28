import { buildStructuredDataset, extractRows } from './dataset-format.js';
import {
  claimNextImportJob,
  createImportJob,
  hasActiveImportJobForSource,
  markImportJobFailed,
  markImportJobSucceeded,
  storeImportedDataset,
} from './store.js';

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function fetchStructuredPayload(sourceUrl) {
  const { signal, clear } = createAbortSignal(60_000);

  try {
    const response = await fetch(sourceUrl, { signal });
    if (!response.ok) {
      throw new Error(`外部接口请求失败: ${response.status}`);
    }
    return response.json();
  } finally {
    clear();
  }
}

export async function enqueueImportJob(options) {
  return createImportJob(options);
}

export async function enqueueScheduledImport(options) {
  const active = await hasActiveImportJobForSource(options.sourceUrl);
  if (active) return null;

  return createImportJob({
    ...options,
    scheduleType: 'scheduled',
  });
}

export async function processNextImportJob() {
  const job = await claimNextImportJob();
  if (!job) {
    return null;
  }

  try {
    const payload = await fetchStructuredPayload(job.sourceUrl);
    const rows = extractRows(payload);
    const structured = buildStructuredDataset(rows);
    const datasetId = await storeImportedDataset({
      name: job.jobName,
      sourceUrl: job.sourceUrl,
      requestedBy: job.requestedBy,
      fields: structured.fields,
      rows: structured.rows,
    });

    await markImportJobSucceeded(job.jobId, datasetId);
    return { jobId: job.jobId, datasetId, imported: structured.rows.length };
  } catch (error) {
    await markImportJobFailed(job.jobId, error instanceof Error ? error.message : String(error));
    return { jobId: job.jobId, error: error instanceof Error ? error.message : String(error) };
  }
}
