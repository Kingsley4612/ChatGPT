import { isRemotePersistenceEnabled } from '../config/persistence';
import type { AuditEvent } from '../types/models';
import { readJson, writeJson } from './browser-storage.service';
import { requestJson } from './http.service';

interface AuditRepository {
  log(event: AuditEvent): Promise<void>;
  list(): Promise<AuditEvent[]>;
}

class LocalAuditRepository implements AuditRepository {
  private readonly key = 'analysis.audit.events';

  async log(event: AuditEvent): Promise<void> {
    const existing = await this.list();
    existing.unshift(event);
    writeJson(this.key, existing.slice(0, 500));
    console.info('[AUDIT]', event);
  }

  async list(): Promise<AuditEvent[]> {
    return readJson<AuditEvent[]>(this.key, []);
  }
}

class RemoteAuditRepository implements AuditRepository {
  async log(event: AuditEvent): Promise<void> {
    await requestJson<void>('/api/audit/events', {
      method: 'POST',
      body: event,
    });
  }

  async list(): Promise<AuditEvent[]> {
    return requestJson<AuditEvent[]>('/api/audit/events');
  }
}

class AuditService {
  private readonly repository: AuditRepository = isRemotePersistenceEnabled()
    ? new RemoteAuditRepository()
    : new LocalAuditRepository();

  log(event: AuditEvent): Promise<void> {
    return this.repository.log(event);
  }

  list(): Promise<AuditEvent[]> {
    return this.repository.list();
  }
}

export const auditService = new AuditService();
