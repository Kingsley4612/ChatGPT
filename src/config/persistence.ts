export type PersistenceMode = 'local' | 'remote';

function normalizeMode(value: string | undefined): PersistenceMode {
  return value === 'remote' ? 'remote' : 'local';
}

function normalizeApiBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, '') ?? '';
}

export const persistenceConfig = {
  mode: normalizeMode(import.meta.env.VITE_PERSISTENCE_MODE),
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
};

export function isRemotePersistenceEnabled(): boolean {
  return persistenceConfig.mode === 'remote' && persistenceConfig.apiBaseUrl.length > 0;
}
