import type { ViewConfig } from '../../types/models';

class ViewSaveService {
  private readonly key = 'analysis.views';

  list(): ViewConfig[] {
    const raw = localStorage.getItem(this.key);
    return raw ? (JSON.parse(raw) as ViewConfig[]) : [];
  }

  save(view: ViewConfig): ViewConfig {
    const list = this.list();
    const idx = list.findIndex((v) => v.viewId === view.viewId);
    if (idx >= 0) {
      list[idx] = view;
    } else {
      list.unshift(view);
    }
    localStorage.setItem(this.key, JSON.stringify(list));
    return view;
  }

  rename(viewId: string, name: string): void {
    const list = this.list().map((v) => (v.viewId === viewId ? { ...v, name } : v));
    localStorage.setItem(this.key, JSON.stringify(list));
  }

  remove(viewId: string): void {
    const list = this.list().filter((v) => v.viewId !== viewId);
    localStorage.setItem(this.key, JSON.stringify(list));
  }
}

export const viewSaveService = new ViewSaveService();
