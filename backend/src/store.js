import crypto from 'node:crypto';
import { query, withTransaction } from './db.js';

const SOURCE_STORE = {
  metaTable: 'source_datasets',
  columnsTable: 'source_dataset_columns',
  rowsTable: 'source_dataset_rows',
  idColumn: 'dataset_id',
  datasetType: 'source',
};

const SAVED_STORE = {
  metaTable: 'saved_datasets',
  columnsTable: 'saved_dataset_columns',
  rowsTable: 'saved_dataset_rows',
  idColumn: 'dataset_id',
  datasetType: 'saved',
};

const SESSION_STORE = {
  metaTable: 'edit_sessions',
  columnsTable: 'edit_session_columns',
  rowsTable: 'edit_session_rows',
  idColumn: 'session_id',
  datasetType: 'session',
};

function escapeLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeRowData(fields, row = {}) {
  return Object.fromEntries(
    fields.map((field) => [
      field.fieldName,
      row[field.fieldName] == null ? '' : row[field.fieldName],
    ]),
  );
}

function buildDatasetMeta(record, fields) {
  return {
    datasetId: record.dataset_id,
    name: record.name,
    totalRows: Number(record.total_rows ?? 0),
    fields,
    updatedAt: toIsoString(record.updated_at ?? record.created_at ?? new Date()),
    datasetType: record.dataset_type,
    sourceUrl: record.source_url ?? undefined,
    requestedBy: record.requested_by ?? undefined,
    ownerUserId: record.owner_user_id ?? undefined,
    sourceDatasetId: record.source_dataset_id ?? undefined,
    canManage: Boolean(record.can_manage),
  };
}

function mapFieldRow(row) {
  return {
    fieldName: row.field_name,
    title: row.title,
    type: row.data_type,
    sortable: true,
    filterable: true,
    sensitive: false,
    ...(row.config ?? {}),
  };
}

async function listFieldsByStore(client, store, id) {
  const result = await client.query(
    `
      SELECT field_name, title, data_type, config
      FROM ${store.columnsTable}
      WHERE ${store.idColumn} = $1
      ORDER BY position ASC
    `,
    [id],
  );

  return result.rows.map(mapFieldRow);
}

async function resolveDatasetStore(client, datasetId, userId) {
  const sourceResult = await client.query(
    `
      SELECT dataset_id, name, dataset_type, total_rows, updated_at, source_url, requested_by, NULL::text AS owner_user_id, NULL::text AS source_dataset_id, (requested_by = $2) AS can_manage
      FROM source_datasets
      WHERE dataset_id = $1
      LIMIT 1
    `,
    [datasetId, userId ?? null],
  );

  if (sourceResult.rows[0]) {
    return {
      store: SOURCE_STORE,
      record: sourceResult.rows[0],
    };
  }

  const savedResult = await client.query(
    `
      SELECT dataset_id, name, dataset_type, total_rows, updated_at, NULL::text AS source_url, NULL::text AS requested_by, owner_user_id, source_dataset_id, (owner_user_id = $2) AS can_manage
      FROM saved_datasets
      WHERE dataset_id = $1
      LIMIT 1
    `,
    [datasetId, userId ?? null],
  );

  const savedRecord = savedResult.rows[0];
  if (!savedRecord) {
    return null;
  }

  if (userId && savedRecord.owner_user_id !== userId) {
    return null;
  }

  return {
    store: SAVED_STORE,
    record: savedRecord,
  };
}

async function resolveSession(client, sessionId, userId) {
  const result = await client.query(
    `
      SELECT session_id, base_dataset_id, base_dataset_type, owner_user_id, name, total_rows, updated_at, created_at
      FROM edit_sessions
      WHERE session_id = $1
      LIMIT 1
    `,
    [sessionId],
  );

  const row = result.rows[0];
  if (!row) return null;
  if (userId && row.owner_user_id !== userId) return null;
  return row;
}

async function insertColumns(client, store, id, fields) {
  if (!fields.length) return;

  const values = [];
  const params = [];

  fields.forEach((field, index) => {
    const base = index * 6;
    params.push(id, index, field.fieldName, field.title, field.type, JSON.stringify({
      sortable: field.sortable ?? true,
      filterable: field.filterable ?? true,
      sensitive: field.sensitive ?? false,
    }));
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`);
  });

  await client.query(
    `
      INSERT INTO ${store.columnsTable} (${store.idColumn}, position, field_name, title, data_type, config)
      VALUES ${values.join(', ')}
    `,
    params,
  );
}

async function insertRows(client, store, id, rows) {
  if (!rows.length) return;

  const chunkSize = 500;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const params = [];

    chunk.forEach((row, index) => {
      const base = index * 4;
      params.push(id, row.rowIndex, row.rowKey, JSON.stringify(row.rowData));
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`);
    });

    await client.query(
      `
        INSERT INTO ${store.rowsTable} (${store.idColumn}, row_index, row_key, row_data)
        VALUES ${values.join(', ')}
      `,
      params,
    );
  }
}

async function reindexSessionRows(client, sessionId) {
  await client.query(
    `
      WITH ordered AS (
        SELECT row_key, ROW_NUMBER() OVER (ORDER BY row_index ASC, row_key ASC) - 1 AS next_row_index
        FROM edit_session_rows
        WHERE session_id = $1
      )
      UPDATE edit_session_rows AS target
      SET row_index = ordered.next_row_index
      FROM ordered
      WHERE target.session_id = $1
        AND target.row_key = ordered.row_key
    `,
    [sessionId],
  );
}

async function reindexSessionColumns(client, sessionId) {
  await client.query(
    `
      WITH ordered AS (
        SELECT field_name, ROW_NUMBER() OVER (ORDER BY position ASC, field_name ASC) - 1 AS next_position
        FROM edit_session_columns
        WHERE session_id = $1
      )
      UPDATE edit_session_columns AS target
      SET position = ordered.next_position
      FROM ordered
      WHERE target.session_id = $1
        AND target.field_name = ordered.field_name
    `,
    [sessionId],
  );
}

async function appendPatchLog(client, sessionId, operation) {
  await client.query(
    `
      INSERT INTO edit_patches (patch_id, session_id, patch_type, payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [crypto.randomUUID(), sessionId, operation.type, JSON.stringify(operation)],
  );
}

async function countRowsByStore(client, store, id) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total FROM ${store.rowsTable} WHERE ${store.idColumn} = $1`,
    [id],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function countDatasetDependencies(client, datasetId, userId) {
  const [
    workbookResult,
    viewResult,
  ] = await Promise.all([
    client.query(
      `
        SELECT COUNT(*)::int AS total
        FROM workbooks
        WHERE dataset_id = $1 AND owner_user_id = $2
      `,
      [datasetId, userId],
    ),
    client.query(
      `
        SELECT COUNT(*)::int AS total
        FROM views
        WHERE dataset_id = $1 AND owner_user_id = $2
      `,
      [datasetId, userId],
    ),
  ]);

  return {
    workbooks: Number(workbookResult.rows[0]?.total ?? 0),
    views: Number(viewResult.rows[0]?.total ?? 0),
  };
}

async function readRowsPage(client, store, id, fields, req) {
  const allowedFields = new Set(fields.map((field) => field.fieldName));
  const filters = req.filters && typeof req.filters === 'object' ? req.filters : {};
  const params = [id];
  const whereClauses = [`${store.idColumn} = $1`];

  if (req.keyword) {
    params.push(`%${req.keyword}%`);
    whereClauses.push(`row_data::text ILIKE $${params.length}`);
  }

  Object.entries(filters).forEach(([fieldName, value]) => {
    if (!allowedFields.has(fieldName) || value === '' || value == null) return;
    params.push(`%${String(value)}%`);
    whereClauses.push(`COALESCE(row_data ->> '${escapeLiteral(fieldName)}', '') ILIKE $${params.length}`);
  });

  const sortField = allowedFields.has(req.sortBy) ? req.sortBy : null;
  const sortDirection = req.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const orderSql = sortField
    ? `COALESCE(row_data ->> '${escapeLiteral(sortField)}', '') ${sortDirection}, row_index ASC`
    : `row_index ${sortDirection}`;

  const countResult = await client.query(
    `
      SELECT COUNT(*)::int AS total
      FROM ${store.rowsTable}
      WHERE ${whereClauses.join(' AND ')}
    `,
    params,
  );

  const totalRows = Number(countResult.rows[0]?.total ?? 0);
  const offset = Math.max(0, Number(req.offset ?? 0));
  const limit = Math.max(1, Math.min(500, Number(req.limit ?? 100)));

  params.push(offset, limit);
  const rowsResult = await client.query(
    `
      SELECT row_index, row_key, row_data
      FROM ${store.rowsTable}
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${orderSql}
      OFFSET $${params.length - 1}
      LIMIT $${params.length}
    `,
    params,
  );

  return {
    totalRows,
    rowKeys: rowsResult.rows.map((row) => row.row_key),
    rowIndexes: rowsResult.rows.map((row) => Number(row.row_index ?? 0)),
    rows: rowsResult.rows.map((row) => row.row_data ?? {}),
    hasMore: offset + rowsResult.rows.length < totalRows,
  };
}

export async function listDatasets(userId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        SELECT dataset_id, name, dataset_type, total_rows, updated_at, source_url, requested_by, NULL::text AS owner_user_id, NULL::text AS source_dataset_id, (requested_by = $1) AS can_manage
        FROM source_datasets
        UNION ALL
        SELECT dataset_id, name, dataset_type, total_rows, updated_at, NULL::text AS source_url, NULL::text AS requested_by, owner_user_id, source_dataset_id, (owner_user_id = $1) AS can_manage
        FROM saved_datasets
        WHERE owner_user_id = $1
        ORDER BY updated_at DESC
      `,
      [userId],
    );

    const datasets = [];
    for (const row of result.rows) {
      const store = row.dataset_type === 'saved' ? SAVED_STORE : SOURCE_STORE;
      const fields = await listFieldsByStore(client, store, row.dataset_id);
      datasets.push(buildDatasetMeta(row, fields));
    }

    return datasets;
  });
}

export async function getDatasetSchema(datasetId, userId) {
  return withTransaction(async (client) => {
    const resolved = await resolveDatasetStore(client, datasetId, userId);
    if (!resolved) {
      return null;
    }

    const fields = await listFieldsByStore(client, resolved.store, datasetId);
    return buildDatasetMeta(resolved.record, fields);
  });
}

export async function getDatasetRows(datasetId, userId, req) {
  return withTransaction(async (client) => {
    const resolved = await resolveDatasetStore(client, datasetId, userId);
    if (!resolved) {
      return null;
    }

    const fields = await listFieldsByStore(client, resolved.store, datasetId);
    return readRowsPage(client, resolved.store, datasetId, fields, req);
  });
}

export async function renameDataset(datasetId, userId, name) {
  return withTransaction(async (client) => {
    const resolved = await resolveDatasetStore(client, datasetId, userId);
    if (!resolved) {
      throw new Error('数据集不存在');
    }

    if (!resolved.record.can_manage) {
      throw new Error('禁止修改该数据集');
    }

    await client.query(
      `
        UPDATE ${resolved.store.metaTable}
        SET name = $2, updated_at = NOW()
        WHERE ${resolved.store.idColumn} = $1
      `,
      [datasetId, name],
    );

    const nextRecord = {
      ...resolved.record,
      name,
      updated_at: new Date().toISOString(),
    };
    const fields = await listFieldsByStore(client, resolved.store, datasetId);
    return buildDatasetMeta(nextRecord, fields);
  });
}

export async function deleteDataset(datasetId, userId) {
  return withTransaction(async (client) => {
    const resolved = await resolveDatasetStore(client, datasetId, userId);
    if (!resolved) {
      throw new Error('数据集不存在');
    }

    if (!resolved.record.can_manage) {
      throw new Error('禁止删除该数据集');
    }

    const dependencyCounts = await countDatasetDependencies(client, datasetId, userId);
    if (dependencyCounts.workbooks > 0 || dependencyCounts.views > 0) {
      const reasons = [];
      if (dependencyCounts.workbooks > 0) {
        reasons.push(`工作簿 ${dependencyCounts.workbooks} 个`);
      }
      if (dependencyCounts.views > 0) {
        reasons.push(`视图 ${dependencyCounts.views} 个`);
      }
      throw new Error(`该数据集仍被引用，无法删除：${reasons.join('，')}`);
    }

    await client.query(
      `
        DELETE FROM ${resolved.store.metaTable}
        WHERE ${resolved.store.idColumn} = $1
      `,
      [datasetId],
    );
  });
}

export async function listWorkbooksByUser(userId) {
  const result = await query(
    `
      SELECT payload
      FROM workbooks
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId],
  );

  return result.rows.map((row) => row.payload);
}

export async function getWorkbookById(workbookId, userId) {
  const result = await query(
    `
      SELECT payload
      FROM workbooks
      WHERE workbook_id = $1 AND owner_user_id = $2
      LIMIT 1
    `,
    [workbookId, userId],
  );

  return result.rows[0]?.payload ?? null;
}

export async function saveWorkbook(workbook) {
  await query(
    `
      INSERT INTO workbooks (workbook_id, owner_user_id, owner_org, dataset_id, name, payload, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      ON CONFLICT (workbook_id) DO UPDATE
      SET
        owner_user_id = EXCLUDED.owner_user_id,
        owner_org = EXCLUDED.owner_org,
        dataset_id = EXCLUDED.dataset_id,
        name = EXCLUDED.name,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
    `,
    [
      workbook.workbookId,
      workbook.ownerUserId,
      workbook.ownerOrg,
      workbook.datasetId,
      workbook.name,
      JSON.stringify(workbook),
      workbook.createdAt,
      workbook.updatedAt,
    ],
  );

  return workbook;
}

export async function deleteWorkbook(workbookId, userId) {
  await query(
    `DELETE FROM workbooks WHERE workbook_id = $1 AND owner_user_id = $2`,
    [workbookId, userId],
  );
}

export async function listViewsByUser(userId) {
  const result = await query(
    `
      SELECT payload
      FROM views
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId],
  );

  return result.rows.map((row) => row.payload);
}

export async function saveView(view) {
  await query(
    `
      INSERT INTO views (view_id, owner_user_id, owner_org, dataset_id, name, payload, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
      ON CONFLICT (view_id) DO UPDATE
      SET
        owner_user_id = EXCLUDED.owner_user_id,
        owner_org = EXCLUDED.owner_org,
        dataset_id = EXCLUDED.dataset_id,
        name = EXCLUDED.name,
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `,
    [
      view.viewId,
      view.ownerUserId,
      view.ownerOrg,
      view.datasetId,
      view.name,
      JSON.stringify(view),
      view.createdAt,
    ],
  );

  return view;
}

export async function renameView(viewId, userId, name) {
  await query(
    `
      UPDATE views
      SET
        name = $3,
        payload = jsonb_set(payload, '{name}', to_jsonb($3::text), true),
        updated_at = NOW()
      WHERE view_id = $1 AND owner_user_id = $2
    `,
    [viewId, userId, name],
  );
}

export async function deleteView(viewId, userId) {
  await query(
    `DELETE FROM views WHERE view_id = $1 AND owner_user_id = $2`,
    [viewId, userId],
  );
}

export async function logAuditEvent(event) {
  await query(
    `
      INSERT INTO audit_events (event_id, action, user_id, dataset_id, workbook_id, event_timestamp, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      crypto.randomUUID(),
      event.action,
      event.userId,
      event.datasetId ?? null,
      event.workbookId ?? null,
      event.timestamp,
      JSON.stringify(event.payload ?? {}),
    ],
  );
}

export async function listAuditEvents(userId) {
  const result = await query(
    `
      SELECT action, user_id, dataset_id, workbook_id, event_timestamp, payload
      FROM audit_events
      WHERE user_id = $1
      ORDER BY event_timestamp DESC
      LIMIT 200
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    action: row.action,
    userId: row.user_id,
    datasetId: row.dataset_id ?? undefined,
    workbookId: row.workbook_id ?? undefined,
    timestamp: toIsoString(row.event_timestamp),
    payload: row.payload ?? {},
  }));
}

export async function createImportJob({ jobName, sourceUrl, requestedBy, scheduleType = 'manual', requestConfig = {} }) {
  const job = {
    jobId: crypto.randomUUID(),
    jobName,
    sourceUrl,
    scheduleType,
    status: 'queued',
    requestedBy,
    requestConfig,
    createdAt: new Date().toISOString(),
  };

  await query(
    `
      INSERT INTO import_jobs (job_id, job_name, source_url, schedule_type, status, requested_by, request_config)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      job.jobId,
      job.jobName,
      job.sourceUrl,
      job.scheduleType,
      job.status,
      job.requestedBy,
      JSON.stringify(job.requestConfig),
    ],
  );

  return job;
}

export async function listImportJobs() {
  const result = await query(
    `
      SELECT job_id, job_name, source_url, schedule_type, status, requested_by, dataset_id, request_config, error_message, created_at, started_at, finished_at
      FROM import_jobs
      ORDER BY created_at DESC
      LIMIT 30
    `,
  );

  return result.rows.map((row) => ({
    jobId: row.job_id,
    jobName: row.job_name,
    sourceUrl: row.source_url,
    scheduleType: row.schedule_type,
    status: row.status,
    requestedBy: row.requested_by,
    datasetId: row.dataset_id ?? undefined,
    requestConfig: row.request_config ?? {},
    errorMessage: row.error_message ?? undefined,
    createdAt: toIsoString(row.created_at),
    startedAt: row.started_at ? toIsoString(row.started_at) : undefined,
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : undefined,
  }));
}

export async function getImportJob(jobId) {
  const result = await query(
    `
      SELECT job_id, job_name, source_url, schedule_type, status, requested_by, dataset_id, request_config, error_message, created_at, started_at, finished_at
      FROM import_jobs
      WHERE job_id = $1
      LIMIT 1
    `,
    [jobId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    jobId: row.job_id,
    jobName: row.job_name,
    sourceUrl: row.source_url,
    scheduleType: row.schedule_type,
    status: row.status,
    requestedBy: row.requested_by,
    datasetId: row.dataset_id ?? undefined,
    requestConfig: row.request_config ?? {},
    errorMessage: row.error_message ?? undefined,
    createdAt: toIsoString(row.created_at),
    startedAt: row.started_at ? toIsoString(row.started_at) : undefined,
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : undefined,
  };
}

export async function hasActiveImportJobForSource(sourceUrl) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM import_jobs
      WHERE source_url = $1
        AND status IN ('queued', 'running')
    `,
    [sourceUrl],
  );

  return Number(result.rows[0]?.total ?? 0) > 0;
}

export async function claimNextImportJob() {
  return withTransaction(async (client) => {
    const selectResult = await client.query(
      `
        SELECT job_id
        FROM import_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `,
    );

    const jobId = selectResult.rows[0]?.job_id;
    if (!jobId) return null;

    const result = await client.query(
      `
        UPDATE import_jobs
        SET status = 'running', started_at = NOW()
        WHERE job_id = $1
        RETURNING job_id, job_name, source_url, schedule_type, status, requested_by, request_config, created_at, started_at
      `,
      [jobId],
    );

    const row = result.rows[0];
    return row
      ? {
          jobId: row.job_id,
          jobName: row.job_name,
          sourceUrl: row.source_url,
          scheduleType: row.schedule_type,
          status: row.status,
          requestedBy: row.requested_by,
          requestConfig: row.request_config ?? {},
          createdAt: toIsoString(row.created_at),
          startedAt: row.started_at ? toIsoString(row.started_at) : undefined,
        }
      : null;
  });
}

export async function markImportJobSucceeded(jobId, datasetId) {
  await query(
    `
      UPDATE import_jobs
      SET status = 'succeeded', dataset_id = $2, finished_at = NOW(), error_message = NULL
      WHERE job_id = $1
    `,
    [jobId, datasetId],
  );
}

export async function markImportJobFailed(jobId, message) {
  await query(
    `
      UPDATE import_jobs
      SET status = 'failed', error_message = $2, finished_at = NOW()
      WHERE job_id = $1
    `,
    [jobId, message],
  );
}

export async function storeImportedDataset({ name, sourceUrl, requestedBy, fields, rows }) {
  return withTransaction(async (client) => {
    const datasetId = crypto.randomUUID();
    const now = new Date().toISOString();

    await client.query(
      `
        INSERT INTO source_datasets (dataset_id, name, dataset_type, source_url, requested_by, total_rows, created_at, updated_at)
        VALUES ($1, $2, 'source', $3, $4, $5, $6, $6)
      `,
      [datasetId, name, sourceUrl, requestedBy ?? null, rows.length, now],
    );

    await insertColumns(client, SOURCE_STORE, datasetId, fields);
    await insertRows(
      client,
      SOURCE_STORE,
      datasetId,
      rows.map((row, index) => ({
        rowIndex: index,
        rowKey: `row-${index + 1}`,
        rowData: normalizeRowData(fields, row),
      })),
    );

    return datasetId;
  });
}

export async function createEditSession({ datasetId, userId, name }) {
  return withTransaction(async (client) => {
    const resolved = await resolveDatasetStore(client, datasetId, userId);
    if (!resolved) {
      throw new Error('dataset not found');
    }

    const sessionId = crypto.randomUUID();
    const sessionName = name || `${resolved.record.name} 编辑会话`;
    const totalRows = await countRowsByStore(client, resolved.store, datasetId);

    await client.query(
      `
        INSERT INTO edit_sessions (session_id, base_dataset_id, base_dataset_type, owner_user_id, name, total_rows)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [sessionId, datasetId, resolved.record.dataset_type, userId, sessionName, totalRows],
    );

    await client.query(
      `
        INSERT INTO edit_session_columns (session_id, position, field_name, title, data_type, config)
        SELECT $1, position, field_name, title, data_type, config
        FROM ${resolved.store.columnsTable}
        WHERE ${resolved.store.idColumn} = $2
      `,
      [sessionId, datasetId],
    );

    await client.query(
      `
        INSERT INTO edit_session_rows (session_id, row_index, row_key, row_data)
        SELECT $1, row_index, row_key, row_data
        FROM ${resolved.store.rowsTable}
        WHERE ${resolved.store.idColumn} = $2
      `,
      [sessionId, datasetId],
    );

    const fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
    return {
      sessionId,
      datasetId,
      name: sessionName,
      totalRows,
      fields,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function getEditSessionSchema(sessionId, userId) {
  return withTransaction(async (client) => {
    const session = await resolveSession(client, sessionId, userId);
    if (!session) return null;

    const fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
    return {
      sessionId,
      datasetId: session.base_dataset_id,
      name: session.name,
      totalRows: Number(session.total_rows ?? 0),
      fields,
      updatedAt: toIsoString(session.updated_at ?? session.created_at),
    };
  });
}

export async function getEditSessionRows(sessionId, userId, req) {
  return withTransaction(async (client) => {
    const session = await resolveSession(client, sessionId, userId);
    if (!session) return null;

    const fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
    return readRowsPage(client, SESSION_STORE, sessionId, fields, req);
  });
}

export async function applyEditSessionOperations({ sessionId, userId, operations }) {
  return withTransaction(async (client) => {
    const session = await resolveSession(client, sessionId, userId);
    if (!session) {
      throw new Error('edit session not found');
    }

    let fields = await listFieldsByStore(client, SESSION_STORE, sessionId);

    for (const operation of operations) {
      switch (operation.type) {
        case 'set_cell': {
          if (!fields.some((field) => field.fieldName === operation.fieldName)) {
            throw new Error(`unknown field ${operation.fieldName}`);
          }

          await client.query(
            `
              UPDATE edit_session_rows
              SET row_data = jsonb_set(row_data, ARRAY[$3::text], to_jsonb($4::text), true)
              WHERE session_id = $1 AND row_key = $2
            `,
            [sessionId, operation.rowKey, operation.fieldName, String(operation.value ?? '')],
          );
          await appendPatchLog(client, sessionId, operation);
          break;
        }

        case 'rename_column': {
          await client.query(
            `
              UPDATE edit_session_columns
              SET title = $3
              WHERE session_id = $1 AND field_name = $2
            `,
            [sessionId, operation.fieldName, String(operation.title ?? '')],
          );
          await appendPatchLog(client, sessionId, operation);
          fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
          break;
        }

        case 'insert_column': {
          const insertIndex = Math.max(0, Number(operation.insertIndex ?? fields.length));
          const nextField = operation.field;
          if (!nextField?.fieldName) {
            throw new Error('insert_column requires field metadata');
          }

          await client.query(
            `
              UPDATE edit_session_columns
              SET position = position + 1
              WHERE session_id = $1 AND position >= $2
            `,
            [sessionId, insertIndex],
          );

          await client.query(
            `
              INSERT INTO edit_session_columns (session_id, position, field_name, title, data_type, config)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            `,
            [
              sessionId,
              insertIndex,
              nextField.fieldName,
              nextField.title ?? '',
              nextField.type ?? 'string',
              JSON.stringify({
                sortable: nextField.sortable ?? true,
                filterable: nextField.filterable ?? true,
                sensitive: nextField.sensitive ?? false,
              }),
            ],
          );

          await client.query(
            `
              UPDATE edit_session_rows
              SET row_data = row_data || jsonb_build_object($2::text, ''::text)
              WHERE session_id = $1
            `,
            [sessionId, nextField.fieldName],
          );

          await appendPatchLog(client, sessionId, operation);
          fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
          break;
        }

        case 'delete_columns': {
          const fieldNames = Array.isArray(operation.fieldNames) ? operation.fieldNames : [];
          if (!fieldNames.length) break;

          await client.query(
            `
              DELETE FROM edit_session_columns
              WHERE session_id = $1 AND field_name = ANY($2)
            `,
            [sessionId, fieldNames],
          );

          for (const fieldName of fieldNames) {
            await client.query(
              `
                UPDATE edit_session_rows
                SET row_data = row_data - $2
                WHERE session_id = $1
              `,
              [sessionId, fieldName],
            );
          }

          await reindexSessionColumns(client, sessionId);
          await appendPatchLog(client, sessionId, operation);
          fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
          break;
        }

        case 'insert_rows': {
          const inputRows = Array.isArray(operation.rows) ? operation.rows : [];
          if (!inputRows.length) break;

          const insertAfter = operation.insertAfterRowIndex == null
            ? -1
            : Math.max(-1, Number(operation.insertAfterRowIndex));
          const insertIndex = insertAfter + 1;

          await client.query(
            `
              UPDATE edit_session_rows
              SET row_index = row_index + $2
              WHERE session_id = $1 AND row_index >= $3
            `,
            [sessionId, inputRows.length, insertIndex],
          );

          await insertRows(
            client,
            SESSION_STORE,
            sessionId,
            inputRows.map((row, index) => ({
              rowIndex: insertIndex + index,
              rowKey: crypto.randomUUID(),
              rowData: normalizeRowData(fields, row),
            })),
          );

          await client.query(
            `
              UPDATE edit_sessions
              SET total_rows = total_rows + $2, updated_at = NOW()
              WHERE session_id = $1
            `,
            [sessionId, inputRows.length],
          );
          await appendPatchLog(client, sessionId, operation);
          break;
        }

        case 'delete_rows': {
          const rowKeys = Array.isArray(operation.rowKeys) ? operation.rowKeys : [];
          if (!rowKeys.length) break;

          await client.query(
            `
              DELETE FROM edit_session_rows
              WHERE session_id = $1 AND row_key = ANY($2)
            `,
            [sessionId, rowKeys],
          );
          await reindexSessionRows(client, sessionId);
          await client.query(
            `
              UPDATE edit_sessions
              SET total_rows = (SELECT COUNT(*)::int FROM edit_session_rows WHERE session_id = $1), updated_at = NOW()
              WHERE session_id = $1
            `,
            [sessionId],
          );
          await appendPatchLog(client, sessionId, operation);
          break;
        }

        default:
          throw new Error(`unsupported operation ${operation.type}`);
      }
    }

    await client.query(
      `UPDATE edit_sessions SET updated_at = NOW() WHERE session_id = $1`,
      [sessionId],
    );

    const nextSession = await resolveSession(client, sessionId, userId);
    const nextFields = await listFieldsByStore(client, SESSION_STORE, sessionId);
    return {
      sessionId,
      datasetId: nextSession.base_dataset_id,
      name: nextSession.name,
      totalRows: Number(nextSession.total_rows ?? 0),
      fields: nextFields,
      updatedAt: toIsoString(nextSession.updated_at ?? new Date()),
    };
  });
}

export async function saveEditSessionAsDataset({ sessionId, userId, name }) {
  return withTransaction(async (client) => {
    const session = await resolveSession(client, sessionId, userId);
    if (!session) {
      throw new Error('edit session not found');
    }

    const datasetId = crypto.randomUUID();
    const datasetName = name?.trim() || `${session.name} 保存结果`;
    const fields = await listFieldsByStore(client, SESSION_STORE, sessionId);
    const totalRows = await countRowsByStore(client, SESSION_STORE, sessionId);

    await client.query(
      `
        INSERT INTO saved_datasets (dataset_id, name, dataset_type, owner_user_id, source_dataset_id, edit_session_id, total_rows)
        VALUES ($1, $2, 'saved', $3, $4, $5, $6)
      `,
      [datasetId, datasetName, userId, session.base_dataset_id, sessionId, totalRows],
    );

    await client.query(
      `
        INSERT INTO saved_dataset_columns (dataset_id, position, field_name, title, data_type, config)
        SELECT $1, position, field_name, title, data_type, config
        FROM edit_session_columns
        WHERE session_id = $2
      `,
      [datasetId, sessionId],
    );

    await client.query(
      `
        INSERT INTO saved_dataset_rows (dataset_id, row_index, row_key, row_data)
        SELECT $1, row_index, row_key, row_data
        FROM edit_session_rows
        WHERE session_id = $2
      `,
      [datasetId, sessionId],
    );

    return {
      datasetId,
      name: datasetName,
      totalRows,
      fields,
      updatedAt: new Date().toISOString(),
      datasetType: 'saved',
    };
  });
}
