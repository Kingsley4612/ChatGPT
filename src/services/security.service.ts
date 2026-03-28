import { isRemotePersistenceEnabled } from '../config/persistence';
import { requestJson } from './http.service';
import {
  clearStoredSession,
  getStoredAccessToken,
  getStoredUserRaw,
  persistSession,
} from './session-storage.service';

import type { SecurityConfig, UserContext } from '../types/models';

const HASH_CONFIG = {
  iterations: 120000,
  length: 32,
  digest: 'SHA-256',
} as const;

interface LoginPayload {
  account: string;
  password: string;
  org: string;
}

interface RemoteLoginResponse {
  accessToken: string;
  user: UserContext;
}

interface DemoCredential {
  account: string;
  salt: string;
  passwordHash: string;
  fallbackPassword: string;
  profile: Pick<UserContext, 'userName' | 'department' | 'roleCodes' | 'capabilities'>;
}

const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    account: 'kingsley',
    salt: 'analysis-center-demo-v1',
    passwordHash: '5JCdYv5fJOOOfrKH55ymV8IOkuyfAH9NOqE5dnCEqso=',
    fallbackPassword: 'kingsley',
    profile: {
      userName: 'kingsley',
      department: '风控部',
      roleCodes: ['analyst'],
      capabilities: {
        canCopy: true,
        canSaveView: true,
        canSaveWorkbook: true,
      },
    },
  },
];

export const defaultUserContext: UserContext = {
  userId: 'u-10001',
  userName: '张三',
  department: '风控部',
  roleCodes: ['analyst'],
  capabilities: {
    canCopy: true,
    canSaveView: true,
    canSaveWorkbook: true,
  },
};

export const mockSecurityConfig: SecurityConfig = {
  disableExport: true,
  enableWatermark: true,
  enableMasking: true,
  allowCopy: true,
  watermarkTemplate: '内部数据 | {userName} | {userId}',
};

export function getCurrentUser(): UserContext {
  if (isRemotePersistenceEnabled() && !getAccessToken()) {
    return {
      ...defaultUserContext,
      userId: '',
      userName: '未登录用户',
    };
  }

  const raw = getStoredUserRaw();
  return raw
    ? (JSON.parse(raw) as UserContext)
    : {
        ...defaultUserContext,
        userId: '',
        userName: '未登录用户',
      };
}

export function hasActiveSession(): boolean {
  if (isRemotePersistenceEnabled()) {
    return getAccessToken().length > 0 && getCurrentUser().userId.length > 0;
  }
  return getCurrentUser().userId.length > 0;
}

export function clearSession(): void {
  clearStoredSession();
}

function getWebCrypto(): Crypto | null {
  if (typeof globalThis === 'undefined' || !('crypto' in globalThis)) {
    return null;
  }
  return globalThis.crypto ?? null;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const webCrypto = getWebCrypto();
  const subtle = webCrypto?.subtle;
  if (!subtle) {
    throw new Error('当前环境不支持 Web Crypto');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: HASH_CONFIG.iterations,
      hash: HASH_CONFIG.digest,
    },
    keyMaterial,
    HASH_CONFIG.length * 8,
  );
  const bytes = new Uint8Array(bits);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function login(payload: LoginPayload): Promise<UserContext> {
  if (!payload.account || !payload.password || !payload.org) {
    throw new Error('账号/密码/组织不能为空');
  }

  if (isRemotePersistenceEnabled()) {
    const response = await requestJson<RemoteLoginResponse>('/api/auth/login', {
      method: 'POST',
      body: payload,
    });
    persistSession(response.user, response.accessToken);
    return response.user;
  }

  const normalizedAccount = payload.account.trim().toLowerCase();
  const matchedUser = DEMO_CREDENTIALS.find((item) => item.account === normalizedAccount);

  if (!matchedUser) {
    throw new Error('账号或密码错误');
  }

  let passwordPassed = false;
  try {
    const incomingHash = await hashPassword(payload.password, matchedUser.salt);
    passwordPassed = incomingHash === matchedUser.passwordHash;
  } catch {
    // Demo fallback for browsers/contexts where Web Crypto is unavailable.
    passwordPassed = payload.password === matchedUser.fallbackPassword;
  }

  if (!passwordPassed) {
    throw new Error('账号或密码错误');
  }

  const user: UserContext = {
    userId: matchedUser.account,
    userName: matchedUser.profile.userName,
    department: payload.org.trim() || matchedUser.profile.department,
    roleCodes: matchedUser.profile.roleCodes,
    capabilities: matchedUser.profile.capabilities,
  };
  localStorage.setItem('analysis.current.user', JSON.stringify(user));
  return user;
}

export async function logout(): Promise<void> {
  if (isRemotePersistenceEnabled()) {
    try {
      await requestJson<void>('/api/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Swallow remote logout failures so local session is still cleared.
    }
  }
  clearSession();
}

export function getAccessToken(): string {
  return getStoredAccessToken();
}

export function buildWatermarkText(user: UserContext, config: SecurityConfig): string {
  return config.watermarkTemplate
    .replace('{userName}', user.userName)
    .replace('{userId}', user.userId);
}
