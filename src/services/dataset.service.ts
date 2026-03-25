import type { DatasetMeta, DatasetPageRequest, DatasetPageResponse } from '../types/models';

const DATASET_ID = 'risk_orders';
const TOTAL_ROWS = 1_000_000;
const IMPORT_KEY = 'analysis.imported.rows';

const fields = [
  { fieldName: 'orderId', title: '订单号', type: 'string', sortable: true, filterable: true, sensitive: false },
  { fieldName: 'customerName', title: '客户名', type: 'string', sortable: true, filterable: true, sensitive: true },
  { fieldName: 'amount', title: '金额', type: 'number', sortable: true, filterable: true, sensitive: false },
  { fieldName: 'region', title: '区域', type: 'string', sortable: true, filterable: true, sensitive: false },
  { fieldName: 'createdAt', title: '创建时间', type: 'date', sortable: true, filterable: true, sensitive: false },
] as const;

const datasetMeta: DatasetMeta = {
  datasetId: DATASET_ID,
  name: '风控订单明细',
  totalRows: TOTAL_ROWS,
  fields: fields.map((f) => ({ ...f })),
  updatedAt: new Date().toISOString(),
};

const regions = ['华北', '华东', '华南', '西南', '东北'];

function generateRow(index: number): Record<string, unknown> {
  return {
    orderId: `OD${String(index + 1).padStart(8, '0')}`,
    customerName: `客户${index % 5000}`,
    amount: (index % 10000) + Math.round(Math.random() * 1000),
    region: regions[index % regions.length],
    createdAt: new Date(Date.now() - index * 86400000).toISOString().slice(0, 10),
  };
}

function getImportedRows(): Record<string, unknown>[] {
  const raw = localStorage.getItem(IMPORT_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
}

function saveImportedRows(rows: Record<string, unknown>[]): void {
  localStorage.setItem(IMPORT_KEY, JSON.stringify(rows));
}

class DatasetService {
  async listDatasets(): Promise<DatasetMeta[]> {
    return [
      {
        ...datasetMeta,
        totalRows: getImportedRows().length || datasetMeta.totalRows,
      },
    ];
  }

  async getDatasetMeta(datasetId: string): Promise<DatasetMeta> {
    if (datasetId !== DATASET_ID) {
      throw new Error(`dataset ${datasetId} not found`);
    }
    return {
      ...datasetMeta,
      totalRows: getImportedRows().length || datasetMeta.totalRows,
      updatedAt: new Date().toISOString(),
    };
  }

  async importCsv(csvText: string): Promise<{ imported: number }> {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error('CSV 至少包含表头和一行数据');
    }

    const headers = lines[0].split(',').map((x) => x.trim());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',');
      const row: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] ?? '').trim();
      });
      return row;
    });

    saveImportedRows(rows);
    return { imported: rows.length };
  }

  async clearImportedRows(): Promise<void> {
    localStorage.removeItem(IMPORT_KEY);
  }

  async getDatasetPage(req: DatasetPageRequest): Promise<DatasetPageResponse> {
    if (req.datasetId !== DATASET_ID) {
      throw new Error(`dataset ${req.datasetId} not found`);
    }

    const imported = getImportedRows();
    let rows: Record<string, unknown>[];
    let totalRows: number;

    if (imported.length) {
      rows = imported;
      totalRows = imported.length;
    } else {
      const startBase = req.page * req.pageSize;
      const endBase = Math.min(startBase + req.pageSize, TOTAL_ROWS);
      rows = Array.from({ length: endBase - startBase }, (_, i) => generateRow(startBase + i));
      totalRows = TOTAL_ROWS;
    }

    if (req.keyword) {
      rows = rows.filter((row) => JSON.stringify(row).includes(req.keyword ?? ''));
    }
    if (req.filters) {
      Object.entries(req.filters).forEach(([k, v]) => {
        if (v !== '') {
          rows = rows.filter((r) => String(r[k]).toLowerCase().includes(String(v).toLowerCase()));
        }
      });
    }
    if (req.sortBy) {
      rows = [...rows].sort((a, b) => {
        const av = a[req.sortBy!];
        const bv = b[req.sortBy!];
        if (av === bv) return 0;
        const cmp = String(av).localeCompare(String(bv), 'zh-Hans-CN', { numeric: true });
        return req.sortOrder === 'desc' ? -cmp : cmp;
      });
    }

    if (imported.length) {
      totalRows = rows.length;
    }
    const start = req.page * req.pageSize;
    const end = imported.length ? Math.min(start + req.pageSize, totalRows) : Math.min(rows.length, req.pageSize);
    const pageRows = imported.length ? rows.slice(start, end) : rows.slice(0, end);

    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      datasetId: req.datasetId,
      page: req.page,
      pageSize: req.pageSize,
      totalRows,
      rows: pageRows,
      hasMore: end < totalRows,
    };
  }
}

export const datasetService = new DatasetService();
