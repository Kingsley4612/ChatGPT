import type { SecurityConfig, UserContext } from '../types/models';

const USER_KEY = 'analysis.current.user';
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
  const raw = localStorage.getItem(USER_KEY);
  return raw
    ? (JSON.parse(raw) as UserContext)
    : {
        ...defaultUserContext,
        userId: '',
        userName: '未登录用户',
      };
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
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function logout(): void {
  localStorage.removeItem(USER_KEY);
}

export function buildWatermarkText(user: UserContext, config: SecurityConfig): string {
  return config.watermarkTemplate
    .replace('{userName}', user.userName)
    .replace('{userId}', user.userId);
}
