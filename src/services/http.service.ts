import { persistenceConfig } from '../config/persistence';
import { clearStoredSession, getStoredAccessToken } from './session-storage.service';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

function buildRequestUrl(path: string): string {
  const baseUrl = persistenceConfig.apiBaseUrl.trim();
  const normalizedPath = path.trim();

  if (!baseUrl) {
    return normalizedPath;
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (
    normalizedPath === baseUrl ||
    normalizedPath.startsWith(`${baseUrl}/`) ||
    normalizedPath.startsWith(`${baseUrl}?`)
  ) {
    return normalizedPath;
  }

  const nextPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${baseUrl.replace(/\/+$/, '')}${nextPath}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearStoredSession();
    }
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      message = parsed.message || raw;
    } catch {}
    throw new Error(message || `请求失败: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!persistenceConfig.apiBaseUrl) {
    throw new Error('未配置 VITE_API_BASE_URL，无法请求远端持久化接口');
  }

  const accessToken = getStoredAccessToken();
  const response = await fetch(buildRequestUrl(path), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return parseResponse<T>(response);
}
