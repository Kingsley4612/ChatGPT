import type { SecurityConfig, UserContext } from '../types/models';

const USER_KEY = 'analysis.current.user';

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

export function login(payload: { account: string; password: string; org: string }): UserContext {
  if (!payload.account || !payload.password || !payload.org) {
    throw new Error('账号/密码/组织不能为空');
  }
  const user: UserContext = {
    userId: payload.account,
    userName: payload.account,
    department: payload.org,
    roleCodes: ['analyst'],
    capabilities: {
      canCopy: true,
      canSaveView: true,
      canSaveWorkbook: true,
    },
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
