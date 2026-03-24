import type { SecurityConfig, UserContext } from '../types/models';

export const mockUserContext: UserContext = {
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

export function buildWatermarkText(user: UserContext, config: SecurityConfig): string {
  return config.watermarkTemplate
    .replace('{userName}', user.userName)
    .replace('{userId}', user.userId);
}
