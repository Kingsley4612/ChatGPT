import { Pool } from 'pg';
import { config } from './config.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      account TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      user_name TEXT NOT NULL,
      department TEXT NOT NULL,
      role_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
      capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS source_datasets (
      dataset_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dataset_type TEXT NOT NULL DEFAULT 'source',
      source_url TEXT,
      requested_by TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS source_dataset_columns (
      dataset_id TEXT NOT NULL REFERENCES source_datasets(dataset_id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      title TEXT NOT NULL,
      data_type TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (dataset_id, field_name)
    );

    CREATE TABLE IF NOT EXISTS source_dataset_rows (
      dataset_id TEXT NOT NULL REFERENCES source_datasets(dataset_id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      row_key TEXT NOT NULL,
      row_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (dataset_id, row_key)
    );

    CREATE INDEX IF NOT EXISTS idx_source_dataset_rows_dataset_row_index
      ON source_dataset_rows (dataset_id, row_index);

    CREATE TABLE IF NOT EXISTS saved_datasets (
      dataset_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dataset_type TEXT NOT NULL DEFAULT 'saved',
      owner_user_id TEXT NOT NULL,
      source_dataset_id TEXT,
      edit_session_id TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS saved_dataset_columns (
      dataset_id TEXT NOT NULL REFERENCES saved_datasets(dataset_id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      title TEXT NOT NULL,
      data_type TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (dataset_id, field_name)
    );

    CREATE TABLE IF NOT EXISTS saved_dataset_rows (
      dataset_id TEXT NOT NULL REFERENCES saved_datasets(dataset_id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      row_key TEXT NOT NULL,
      row_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (dataset_id, row_key)
    );

    CREATE INDEX IF NOT EXISTS idx_saved_dataset_rows_dataset_row_index
      ON saved_dataset_rows (dataset_id, row_index);

    CREATE TABLE IF NOT EXISTS edit_sessions (
      session_id TEXT PRIMARY KEY,
      base_dataset_id TEXT NOT NULL,
      base_dataset_type TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS edit_session_columns (
      session_id TEXT NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      title TEXT NOT NULL,
      data_type TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (session_id, field_name)
    );

    CREATE TABLE IF NOT EXISTS edit_session_rows (
      session_id TEXT NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      row_key TEXT NOT NULL,
      row_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (session_id, row_key)
    );

    CREATE INDEX IF NOT EXISTS idx_edit_session_rows_session_row_index
      ON edit_session_rows (session_id, row_index);

    CREATE TABLE IF NOT EXISTS edit_patches (
      patch_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
      patch_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workbooks (
      workbook_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      owner_org TEXT NOT NULL,
      dataset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS views (
      view_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      owner_org TEXT NOT NULL,
      dataset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      event_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      dataset_id TEXT,
      workbook_id TEXT,
      event_timestamp TIMESTAMPTZ NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      job_id TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      schedule_type TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'queued',
      requested_by TEXT,
      dataset_id TEXT,
      request_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created_at
      ON import_jobs (status, created_at);
  `);
}

async function seedDefaultUser(client) {
  const capabilities = {
    canCopy: true,
    canSaveView: true,
    canSaveWorkbook: true,
  };

  await client.query(
    `
      INSERT INTO users (user_id, account, password, user_name, department, role_codes, capabilities)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      ON CONFLICT (account) DO UPDATE
      SET
        password = EXCLUDED.password,
        user_name = EXCLUDED.user_name,
        department = EXCLUDED.department,
        role_codes = EXCLUDED.role_codes,
        capabilities = EXCLUDED.capabilities,
        updated_at = NOW()
    `,
    [
      config.loginAccount,
      config.loginAccount,
      config.loginPassword,
      config.loginUserName,
      config.loginOrg,
      JSON.stringify(['analyst']),
      JSON.stringify(capabilities),
    ],
  );
}

export async function initializeDatabase() {
  const client = await pool.connect();
  const advisoryLockKey = 4_821_902_709;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey]);
    await createTables(client);
    await seedDefaultUser(client);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockKey]);
    } catch {
      // Ignore unlock failures during shutdown or partial startup.
    }
    client.release();
  }
}
