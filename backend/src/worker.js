import cron from 'node-cron';
import { config } from './config.js';
import { initializeDatabase } from './db.js';
import { enqueueScheduledImport, processNextImportJob } from './import-jobs.js';

async function start() {
  await initializeDatabase();

  for (const source of config.scheduledImportSources) {
    if (!source?.schedule || !source?.url || !source?.name) {
      continue;
    }

    cron.schedule(source.schedule, () => {
      void enqueueScheduledImport({
        jobName: source.name,
        sourceUrl: source.url,
        requestedBy: source.requestedBy ?? 'system',
      });
    });
  }

  console.log('[worker] polling import queue');

  setInterval(() => {
    void processNextImportJob();
  }, config.importPollIntervalMs);
}

start().catch((error) => {
  console.error('[worker] failed to start', error);
  process.exit(1);
});
