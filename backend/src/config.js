function parsePort(value, fallback) {
  const next = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function parseJson(value, fallback) {
  if (!value?.trim()) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[config] failed to parse JSON env value:', error);
    return fallback;
  }
}

export const config = {
  port: parsePort(process.env.PORT, 8081),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://analysis:analysis@postgres:5432/analysis_center',
  jwtSecret: process.env.JWT_SECRET ?? 'analysis-center-local-dev-secret',
  loginAccount: process.env.APP_LOGIN_ACCOUNT ?? 'kingsley',
  loginPassword: process.env.APP_LOGIN_PASSWORD ?? 'kingsley',
  loginOrg: process.env.APP_LOGIN_ORG ?? '风控部',
  loginUserName: process.env.APP_LOGIN_USER_NAME ?? 'kingsley',
  scheduledImportSources: parseJson(process.env.SCHEDULED_IMPORT_SOURCES, []),
  importPollIntervalMs: parsePort(process.env.IMPORT_POLL_INTERVAL_MS, 3000),
};
