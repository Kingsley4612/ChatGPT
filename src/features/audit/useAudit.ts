import { auditService } from '../../services/audit.service';
import type { AuditAction } from '../../types/models';
import { mockUserContext } from '../../services/security.service';

export function useAudit(datasetId?: string, workbookId?: string) {
  function emit(action: AuditAction, payload: Record<string, unknown> = {}): void {
    auditService.log({
      action,
      userId: mockUserContext.userId,
      datasetId,
      workbookId,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  return { emit };
}
