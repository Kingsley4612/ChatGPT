import express from 'express';
import { authMiddleware, authenticateAccount, signAccessToken } from './auth.js';
import { config } from './config.js';
import { initializeDatabase } from './db.js';
import { enqueueImportJob } from './import-jobs.js';
import {
  applyEditSessionOperations,
  createEditSession,
  deleteDataset,
  deleteView,
  deleteWorkbook,
  getDatasetRows,
  getDatasetSchema,
  getEditSessionRows,
  getEditSessionSchema,
  getImportJob,
  getWorkbookById,
  listAuditEvents,
  listDatasets,
  listImportJobs,
  listViewsByUser,
  listWorkbooksByUser,
  logAuditEvent,
  renameDataset,
  renameView,
  saveEditSessionAsDataset,
  saveView,
  saveWorkbook,
} from './store.js';

function buildMockRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    市: `测试市${index % 20}`,
    县: `测试县${index % 100}`,
    所: `供电所${index % 60}`,
    发电户号: `15${String(index).padStart(10, '0')}`,
    发电户名: `样例用户${index + 1}`,
    发电户地址: `测试地址-${index + 1}`,
    发电方式: ['光伏发电', '风电', '自发自用余电上网'][index % 3],
    消纳方式: ['全额上网', '自发自用余电上网'][index % 2],
    扶贫标志: String((index % 9) + 1).padStart(2, '0'),
    合同容量: String((index % 500) + 10),
  }));
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function getDatasetErrorStatus(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('数据集不存在')) return 404;
  if (message.includes('禁止')) return 403;
  if (message.includes('仍被引用')) return 409;
  return 500;
}

async function bootstrap() {
  await initializeDatabase();

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/mock/external-dataset', (req, res) => {
    const rows = Math.max(1, Math.min(200_000, Number(req.query.rows ?? 5000)));
    res.json({
      data: buildMockRows(rows),
      total: rows,
    });
  });

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { account, password, org } = req.body ?? {};
    if (!account || !password || !org) {
      res.status(400).json({ message: '账号/密码/组织不能为空' });
      return;
    }

    const user = await authenticateAccount(account, password, org);
    const accessToken = signAccessToken(user);

    res.json({ accessToken, user });
  }));

  app.post('/api/auth/logout', (_req, res) => {
    res.status(204).send();
  });

  app.use('/api', authMiddleware);

  app.get('/api/workbooks', asyncHandler(async (req, res) => {
    const ownerUserId = String(req.query.ownerUserId ?? req.user.userId);
    if (ownerUserId !== req.user.userId) {
      res.status(403).json({ message: '禁止访问其他用户工作簿' });
      return;
    }

    res.json(await listWorkbooksByUser(ownerUserId));
  }));

  app.get('/api/workbooks/:workbookId', asyncHandler(async (req, res) => {
    const workbook = await getWorkbookById(req.params.workbookId, req.user.userId);
    if (!workbook) {
      res.status(404).json({ message: '工作簿不存在' });
      return;
    }
    res.json(workbook);
  }));

  app.post('/api/workbooks', asyncHandler(async (req, res) => {
    const workbook = req.body;
    if (!workbook?.workbookId) {
      res.status(400).json({ message: '缺少工作簿标识' });
      return;
    }

    if (workbook.ownerUserId !== req.user.userId) {
      res.status(403).json({ message: '禁止保存到其他用户工作簿空间' });
      return;
    }

    res.json(await saveWorkbook(workbook));
  }));

  app.delete('/api/workbooks/:workbookId', asyncHandler(async (req, res) => {
    await deleteWorkbook(req.params.workbookId, req.user.userId);
    res.status(204).send();
  }));

  app.get('/api/views', asyncHandler(async (req, res) => {
    const ownerUserId = String(req.query.ownerUserId ?? req.user.userId);
    if (ownerUserId !== req.user.userId) {
      res.status(403).json({ message: '禁止访问其他用户视图' });
      return;
    }

    res.json(await listViewsByUser(ownerUserId));
  }));

  app.post('/api/views', asyncHandler(async (req, res) => {
    const view = req.body;
    if (!view?.viewId) {
      res.status(400).json({ message: '缺少视图标识' });
      return;
    }

    if (view.ownerUserId !== req.user.userId) {
      res.status(403).json({ message: '禁止保存到其他用户视图空间' });
      return;
    }

    res.json(await saveView(view));
  }));

  app.patch('/api/views/:viewId', asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};
    if (!name?.trim()) {
      res.status(400).json({ message: '视图名称不能为空' });
      return;
    }

    await renameView(req.params.viewId, req.user.userId, name.trim());
    res.status(204).send();
  }));

  app.delete('/api/views/:viewId', asyncHandler(async (req, res) => {
    await deleteView(req.params.viewId, req.user.userId);
    res.status(204).send();
  }));

  app.get('/api/audit/events', asyncHandler(async (req, res) => {
    res.json(await listAuditEvents(req.user.userId));
  }));

  app.post('/api/audit/events', asyncHandler(async (req, res) => {
    await logAuditEvent(req.body);
    res.status(204).send();
  }));

  app.get('/api/datasets', asyncHandler(async (req, res) => {
    res.json(await listDatasets(req.user.userId));
  }));

  app.patch('/api/datasets/:datasetId', asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};
    if (!name?.trim()) {
      res.status(400).json({ message: '数据集名称不能为空' });
      return;
    }
    try {
      res.json(await renameDataset(req.params.datasetId, req.user.userId, name.trim()));
    } catch (error) {
      res.status(getDatasetErrorStatus(error)).json({
        message: error instanceof Error ? error.message : '数据集重命名失败',
      });
    }
  }));

  app.delete('/api/datasets/:datasetId', asyncHandler(async (req, res) => {
    try {
      await deleteDataset(req.params.datasetId, req.user.userId);
      res.status(204).send();
    } catch (error) {
      res.status(getDatasetErrorStatus(error)).json({
        message: error instanceof Error ? error.message : '数据集删除失败',
      });
    }
  }));

  app.get('/api/datasets/:datasetId/schema', asyncHandler(async (req, res) => {
    const dataset = await getDatasetSchema(req.params.datasetId, req.user.userId);
    if (!dataset) {
      res.status(404).json({ message: '数据集不存在' });
      return;
    }
    res.json(dataset);
  }));

  app.get('/api/datasets/:datasetId/rows', asyncHandler(async (req, res) => {
    const result = await getDatasetRows(req.params.datasetId, req.user.userId, {
      offset: req.query.offset,
      limit: req.query.limit,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      keyword: req.query.keyword,
      filters: req.query.filters ? JSON.parse(String(req.query.filters)) : undefined,
    });

    if (!result) {
      res.status(404).json({ message: '数据集不存在' });
      return;
    }

    res.json(result);
  }));

  app.post('/api/import-jobs', asyncHandler(async (req, res) => {
    const { name, sourceUrl } = req.body ?? {};
    if (!name?.trim() || !sourceUrl?.trim()) {
      res.status(400).json({ message: '名称和接口地址不能为空' });
      return;
    }

    const job = await enqueueImportJob({
      jobName: name.trim(),
      sourceUrl: sourceUrl.trim(),
      requestedBy: req.user.userId,
      scheduleType: 'manual',
    });

    res.status(202).json(job);
  }));

  app.get('/api/import-jobs', asyncHandler(async (_req, res) => {
    res.json(await listImportJobs());
  }));

  app.get('/api/import-jobs/:jobId', asyncHandler(async (req, res) => {
    const job = await getImportJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ message: '任务不存在' });
      return;
    }
    res.json(job);
  }));

  app.post('/api/edit-sessions', asyncHandler(async (req, res) => {
    const { datasetId, name } = req.body ?? {};
    if (!datasetId) {
      res.status(400).json({ message: '缺少数据集标识' });
      return;
    }

    const session = await createEditSession({
      datasetId,
      userId: req.user.userId,
      name,
    });
    res.status(201).json(session);
  }));

  app.get('/api/edit-sessions/:sessionId/schema', asyncHandler(async (req, res) => {
    const session = await getEditSessionSchema(req.params.sessionId, req.user.userId);
    if (!session) {
      res.status(404).json({ message: '编辑会话不存在' });
      return;
    }
    res.json(session);
  }));

  app.get('/api/edit-sessions/:sessionId/rows', asyncHandler(async (req, res) => {
    const result = await getEditSessionRows(req.params.sessionId, req.user.userId, {
      offset: req.query.offset,
      limit: req.query.limit,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      keyword: req.query.keyword,
      filters: req.query.filters ? JSON.parse(String(req.query.filters)) : undefined,
    });

    if (!result) {
      res.status(404).json({ message: '编辑会话不存在' });
      return;
    }
    res.json(result);
  }));

  app.patch('/api/edit-sessions/:sessionId/patches', asyncHandler(async (req, res) => {
    const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
    const session = await applyEditSessionOperations({
      sessionId: req.params.sessionId,
      userId: req.user.userId,
      operations,
    });
    res.json(session);
  }));

  app.post('/api/edit-sessions/:sessionId/save', asyncHandler(async (req, res) => {
    const dataset = await saveEditSessionAsDataset({
      sessionId: req.params.sessionId,
      userId: req.user.userId,
      name: req.body?.name,
    });
    res.status(201).json(dataset);
  }));

  app.use((error, _req, res, _next) => {
    console.error('[api] request failed', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : '服务内部错误',
    });
  });

  app.listen(config.port, () => {
    console.log(`[api] listening on ${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
