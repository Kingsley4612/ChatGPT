import type { AuditEvent } from '../types/models';

class AuditService {
  private readonly key = 'analysis.audit.events';

  log(event: AuditEvent): void {
    const existing = this.list();
    existing.unshift(event);
    localStorage.setItem(this.key, JSON.stringify(existing.slice(0, 500)));
    console.info('[AUDIT]', event);
  }

  list(): AuditEvent[] {
    const raw = localStorage.getItem(this.key);
    return raw ? (JSON.parse(raw) as AuditEvent[]) : [];
  }
}

export const auditService = new AuditService();
