import type { WorkbookConfig } from '../types/models';

class WorkbookService {
  private readonly key = 'analysis.workbooks';

  list(): WorkbookConfig[] {
    const raw = localStorage.getItem(this.key);
    return raw ? (JSON.parse(raw) as WorkbookConfig[]) : [];
  }

  listByUser(userId: string): WorkbookConfig[] {
    return this.list().filter((w) => w.ownerUserId === userId);
  }

  getById(workbookId: string): WorkbookConfig | null {
    return this.list().find((w) => w.workbookId === workbookId) ?? null;
  }

  save(workbook: WorkbookConfig): WorkbookConfig {
    const list = this.list();
    const idx = list.findIndex((w) => w.workbookId === workbook.workbookId);
    if (idx >= 0) {
      list[idx] = workbook;
    } else {
      list.unshift(workbook);
    }
    localStorage.setItem(this.key, JSON.stringify(list));
    return workbook;
  }

  remove(workbookId: string): void {
    const list = this.list().filter((x) => x.workbookId !== workbookId);
    localStorage.setItem(this.key, JSON.stringify(list));
  }
}

export const workbookService = new WorkbookService();
