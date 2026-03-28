import { isRemotePersistenceEnabled } from '../config/persistence';
import type { WorkbookConfig } from '../types/models';
import { readJson, writeJson } from './browser-storage.service';
import { requestJson } from './http.service';

interface WorkbookRepository {
  listByUser(userId: string): Promise<WorkbookConfig[]>;
  getById(workbookId: string): Promise<WorkbookConfig | null>;
  save(workbook: WorkbookConfig): Promise<WorkbookConfig>;
  remove(workbookId: string): Promise<void>;
}

class LocalWorkbookRepository implements WorkbookRepository {
  private readonly key = 'analysis.workbooks';

  private list(): WorkbookConfig[] {
    return readJson<WorkbookConfig[]>(this.key, []);
  }

  async listByUser(userId: string): Promise<WorkbookConfig[]> {
    return this.list().filter((w) => w.ownerUserId === userId);
  }

  async getById(workbookId: string): Promise<WorkbookConfig | null> {
    return this.list().find((w) => w.workbookId === workbookId) ?? null;
  }

  async save(workbook: WorkbookConfig): Promise<WorkbookConfig> {
    const list = this.list();
    const idx = list.findIndex((w) => w.workbookId === workbook.workbookId);
    if (idx >= 0) {
      list[idx] = workbook;
    } else {
      list.unshift(workbook);
    }
    writeJson(this.key, list);
    return workbook;
  }

  async remove(workbookId: string): Promise<void> {
    writeJson(this.key, this.list().filter((x) => x.workbookId !== workbookId));
  }
}

class RemoteWorkbookRepository implements WorkbookRepository {
  async listByUser(userId: string): Promise<WorkbookConfig[]> {
    return requestJson<WorkbookConfig[]>(`/api/workbooks?ownerUserId=${encodeURIComponent(userId)}`);
  }

  async getById(workbookId: string): Promise<WorkbookConfig | null> {
    try {
      return await requestJson<WorkbookConfig>(`/api/workbooks/${encodeURIComponent(workbookId)}`);
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) return null;
      throw error;
    }
  }

  async save(workbook: WorkbookConfig): Promise<WorkbookConfig> {
    return requestJson<WorkbookConfig>('/api/workbooks', {
      method: 'POST',
      body: workbook,
    });
  }

  async remove(workbookId: string): Promise<void> {
    await requestJson<void>(`/api/workbooks/${encodeURIComponent(workbookId)}`, {
      method: 'DELETE',
    });
  }
}

class WorkbookService {
  private readonly repository: WorkbookRepository = isRemotePersistenceEnabled()
    ? new RemoteWorkbookRepository()
    : new LocalWorkbookRepository();

  listByUser(userId: string): Promise<WorkbookConfig[]> {
    return this.repository.listByUser(userId);
  }

  getById(workbookId: string): Promise<WorkbookConfig | null> {
    return this.repository.getById(workbookId);
  }

  save(workbook: WorkbookConfig): Promise<WorkbookConfig> {
    return this.repository.save(workbook);
  }

  remove(workbookId: string): Promise<void> {
    return this.repository.remove(workbookId);
  }
}

export const workbookService = new WorkbookService();
