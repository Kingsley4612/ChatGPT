import type { DatasetMeta, DatasetPageRequest, DatasetPageResponse } from '../types/models';

const DATASET_ID = 'risk_orders';
const TOTAL_ROWS = 1_000_000;

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

class DatasetService {
  async listDatasets(): Promise<DatasetMeta[]> {
    return [datasetMeta];
  }

  async getDatasetMeta(datasetId: string): Promise<DatasetMeta> {
    if (datasetId !== DATASET_ID) {
      throw new Error(`dataset ${datasetId} not found`);
    }
    return datasetMeta;
  }

  async getDatasetPage(req: DatasetPageRequest): Promise<DatasetPageResponse> {
    if (req.datasetId !== DATASET_ID) {
      throw new Error(`dataset ${req.datasetId} not found`);
    }
    const start = req.page * req.pageSize;
    const end = Math.min(start + req.pageSize, TOTAL_ROWS);
    let rows = Array.from({ length: end - start }, (_, i) => generateRow(start + i));

    if (req.keyword) {
      rows = rows.filter((row) => JSON.stringify(row).includes(req.keyword ?? ''));
    }
    if (req.filters) {
      Object.entries(req.filters).forEach(([k, v]) => {
        rows = rows.filter((r) => String(r[k]) === String(v));
      });
    }
    if (req.sortBy) {
      rows = rows.sort((a, b) => {
        const av = a[req.sortBy!];
        const bv = b[req.sortBy!];
        if (av === bv) return 0;
        const cmp = String(av).localeCompare(String(bv), 'zh-Hans-CN', { numeric: true });
        return req.sortOrder === 'desc' ? -cmp : cmp;
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 120));

    return {
      datasetId: req.datasetId,
      page: req.page,
      pageSize: req.pageSize,
      totalRows: TOTAL_ROWS,
      rows,
      hasMore: end < TOTAL_ROWS,
    };
  }
}

export const datasetService = new DatasetService();
