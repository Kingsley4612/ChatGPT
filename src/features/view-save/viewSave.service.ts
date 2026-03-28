import { isRemotePersistenceEnabled } from '../../config/persistence';
import type { ViewConfig } from '../../types/models';
import { readJson, writeJson } from '../../services/browser-storage.service';
import { requestJson } from '../../services/http.service';

interface ViewRepository {
  listByUser(userId: string): Promise<ViewConfig[]>;
  save(view: ViewConfig): Promise<ViewConfig>;
  rename(viewId: string, name: string): Promise<void>;
  remove(viewId: string): Promise<void>;
}

class LocalViewRepository implements ViewRepository {
  private readonly key = 'analysis.views';

  private list(): ViewConfig[] {
    return readJson<ViewConfig[]>(this.key, []);
  }

  async listByUser(userId: string): Promise<ViewConfig[]> {
    return this.list().filter((v) => v.ownerUserId === userId);
  }

  async save(view: ViewConfig): Promise<ViewConfig> {
    const list = this.list();
    const idx = list.findIndex((v) => v.viewId === view.viewId);
    if (idx >= 0) {
      list[idx] = view;
    } else {
      list.unshift(view);
    }
    writeJson(this.key, list);
    return view;
  }

  async rename(viewId: string, name: string): Promise<void> {
    writeJson(this.key, this.list().map((v) => (v.viewId === viewId ? { ...v, name } : v)));
  }

  async remove(viewId: string): Promise<void> {
    writeJson(this.key, this.list().filter((v) => v.viewId !== viewId));
  }
}

class RemoteViewRepository implements ViewRepository {
  async listByUser(userId: string): Promise<ViewConfig[]> {
    return requestJson<ViewConfig[]>(`/api/views?ownerUserId=${encodeURIComponent(userId)}`);
  }

  async save(view: ViewConfig): Promise<ViewConfig> {
    return requestJson<ViewConfig>('/api/views', {
      method: 'POST',
      body: view,
    });
  }

  async rename(viewId: string, name: string): Promise<void> {
    await requestJson<void>(`/api/views/${encodeURIComponent(viewId)}`, {
      method: 'PATCH',
      body: { name },
    });
  }

  async remove(viewId: string): Promise<void> {
    await requestJson<void>(`/api/views/${encodeURIComponent(viewId)}`, {
      method: 'DELETE',
    });
  }
}

class ViewSaveService {
  private readonly repository: ViewRepository = isRemotePersistenceEnabled()
    ? new RemoteViewRepository()
    : new LocalViewRepository();

  listByUser(userId: string): Promise<ViewConfig[]> {
    return this.repository.listByUser(userId);
  }

  save(view: ViewConfig): Promise<ViewConfig> {
    return this.repository.save(view);
  }

  rename(viewId: string, name: string): Promise<void> {
    return this.repository.rename(viewId, name);
  }

  remove(viewId: string): Promise<void> {
    return this.repository.remove(viewId);
  }
}

export const viewSaveService = new ViewSaveService();
