import type { PropsWithChildren } from 'react';
import type { SecurityConfig, UserContext } from '../../types/models';

interface Props extends PropsWithChildren {
  user: UserContext;
  security: SecurityConfig;
}

export function SecurityGuard({ user, security, children }: Props) {
  const copyEnabled = user.capabilities.canCopy && security.allowCopy;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 8 }}>
        <span>导出: {security.disableExport ? '已禁用' : '允许'}</span>
        <span>复制: {copyEnabled ? '允许' : '禁用'}</span>
        <span>脱敏: {security.enableMasking ? '开启' : '关闭'}</span>
      </div>
      {children}
    </div>
  );
}
