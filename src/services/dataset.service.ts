import Papa, { type ParseStepResult, type Parser } from 'papaparse';
import * as XLSX from 'xlsx';
import type { DatasetField, DatasetMeta, DatasetPageRequest, DatasetPageResponse, FieldType } from '../types/models';

export const SAMPLE_DATASET_ID = 'risk_orders';
export const BLANK_DATASET_ID = 'blank_workbook';
export const DEFAULT_BLANK_ROW_COUNT = 10;
export const DEFAULT_BLANK_COLUMN_COUNT = 20;

const TOTAL_ROWS = 1_000_000;

const sampleFields = [
  { fieldName: 'orderId', title: '订单号', type: 'string', sortable: true, filterable: true, sensitive: false },
  { fieldName: 'customerName', title: '客户名', type: 'string', sortable: true, filterable: true, sensitive: true },
  { fieldName: 'amount', title: '金额', type: 'number', sortable: true, filterable: true, sensitive: false },
  { fieldName: 'region', title: '区域', type: 'string', sortable: true, filterable: true, sensitive: false },
  { fieldName: 'createdAt', title: '创建时间', type: 'date', sortable: true, filterable: true, sensitive: false },
] as const satisfies readonly DatasetField[];

const sampleDatasetMeta: DatasetMeta = {
  datasetId: SAMPLE_DATASET_ID,
  name: '风控订单明细',
  totalRows: TOTAL_ROWS,
  fields: sampleFields.map((field) => ({ ...field })),
  updatedAt: new Date().toISOString(),
};

const regions = ['华北', '华东', '华南', '西南', '东北'];

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function fuzzyMatch(text: unknown, query: string): boolean {
  const source = normalizeSearchValue(text);
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) return true;
  if (source.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (let index = 0; index < source.length && queryIndex < normalizedQuery.length; index += 1) {
    if (source[index] === normalizedQuery[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === normalizedQuery.length;
}

function fuzzyMatchTokens(text: unknown, query: string): boolean {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => fuzzyMatch(text, token));
}

function generateRow(index: number): Record<string, unknown> {
  return {
    orderId: `OD${String(index + 1).padStart(8, '0')}`,
    customerName: `客户${index % 5000}`,
    amount: (index % 10000) + Math.round(Math.random() * 1000),
    region: regions[index % regions.length],
    createdAt: new Date(Date.now() - index * 86400000).toISOString().slice(0, 10),
  };
}

function trimTrailingEmptyCells(cells: string[]): string[] {
  let lastNonEmptyIndex = cells.length - 1;

  while (lastNonEmptyIndex >= 0 && !String(cells[lastNonEmptyIndex] ?? '').trim()) {
    lastNonEmptyIndex -= 1;
  }

  return lastNonEmptyIndex >= 0 ? cells.slice(0, lastNonEmptyIndex + 1) : [];
}

function normalizeMatrix(matrix: string[][]): string[][] {
  const normalizedRows = matrix
    .map((row) => trimTrailingEmptyCells(row.map((cell) => String(cell ?? ''))))
    .filter((row) => row.length > 0);

  const columnCount = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0);
  return normalizedRows.map((row) => (row.length === columnCount ? row : [...row, ...Array(columnCount - row.length).fill('')]));
}

function parseCsv(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const rows: string[][] = [];
    let parserError: Error | null = null;

    Papa.parse<string[]>(file, {
      worker: true,
      skipEmptyLines: 'greedy',
      step: (results: ParseStepResult<string[]>, parser: Parser) => {
        if (results.errors.length) {
          parserError = new Error(results.errors[0]?.message ?? 'CSV 解析失败');
          parser.abort();
          return;
        }

        const nextRow = trimTrailingEmptyCells((results.data ?? []).map((cell) => String(cell ?? '')));
        if (nextRow.length) {
          rows.push(nextRow);
        }
      },
      complete: () => {
        if (parserError) {
          reject(parserError);
          return;
        }

        const normalized = normalizeMatrix(rows);
        if (!normalized.length) {
          reject(new Error('CSV 文件为空或无法识别'));
          return;
        }

        resolve(normalized);
      },
      error: (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    });
  });
}

async function parseSpreadsheet(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    dense: true,
    raw: false,
    cellText: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('文件中没有可读取的工作表');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  }) as string[][];

  const normalized = normalizeMatrix(matrix);
  if (!normalized.length) {
    throw new Error('文件中没有可读取的数据');
  }

  return normalized;
}

function isSpreadsheetFile(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName);
}

function matrixToDataset(matrix: string[][]): { imported: number; fields: DatasetField[]; rows: Record<string, unknown>[] } {
  if (matrix.length < 2) {
    throw new Error('文件至少包含表头和一行数据');
  }

  const columnCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = Array.from({ length: columnCount }, (_, index) => matrix[0]?.[index] ?? '');
  const bodyRows = matrix.slice(1);
  const usedFieldNames = new Set<string>();
  const uniqueFieldNames = headers.map((header, index) => {
    const baseName = sanitizeFieldName(header, index);
    let nextFieldName = baseName;
    let suffix = 1;
    while (usedFieldNames.has(nextFieldName)) {
      suffix += 1;
      nextFieldName = `${baseName}_${suffix}`;
    }
    usedFieldNames.add(nextFieldName);
    return nextFieldName;
  });

  const rows = bodyRows.map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[uniqueFieldNames[index] ?? sanitizeFieldName(header, index)] = cells[index] ?? '';
    });
    return row;
  });

  const fields = headers.map((header, index) => {
    const fieldName = uniqueFieldNames[index] ?? sanitizeFieldName(header, index);
    return {
      fieldName,
      title: header || `列${index + 1}`,
      type: inferFieldType(rows.map((row) => String(row[fieldName] ?? ''))),
      sortable: true,
      filterable: true,
      sensitive: false,
    } satisfies DatasetField;
  });

  return { imported: rows.length, fields, rows };
}

function inferFieldType(values: string[]): FieldType {
  const nonEmptyValues = values.map((value) => value.trim()).filter(Boolean);
  if (!nonEmptyValues.length) return 'string';
  if (nonEmptyValues.every((value) => /^(true|false)$/i.test(value))) return 'boolean';
  if (nonEmptyValues.every((value) => !Number.isNaN(Number(value)))) return 'number';
  if (nonEmptyValues.every((value) => !Number.isNaN(Date.parse(value)))) return 'date';
  return 'string';
}

function sanitizeFieldName(input: string, index: number): string {
  const normalized = input
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `column_${index + 1}`;
}

export function getColumnLabel(index: number): string {
  let current = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return label;
}

export function createBlankFields(count = DEFAULT_BLANK_COLUMN_COUNT): DatasetField[] {
  return Array.from({ length: count }, (_, index) => {
    const label = getColumnLabel(index);
    return {
      fieldName: `col_${label}`,
      title: '',
      type: 'string',
      sortable: true,
      filterable: true,
      sensitive: false,
    } satisfies DatasetField;
  });
}

export function createBlankRows(
  rowCount = DEFAULT_BLANK_ROW_COUNT,
  fields: DatasetField[] = createBlankFields(),
): Record<string, unknown>[] {
  return Array.from({ length: rowCount }, () =>
    Object.fromEntries(fields.map((field) => [field.fieldName, ''])),
  );
}

const blankDatasetMeta: DatasetMeta = {
  datasetId: BLANK_DATASET_ID,
  name: '空白工作簿',
  totalRows: DEFAULT_BLANK_ROW_COUNT,
  fields: createBlankFields(),
  updatedAt: new Date().toISOString(),
};

class DatasetService {
  async listDatasets(): Promise<DatasetMeta[]> {
    return [
      {
        ...sampleDatasetMeta,
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  async getDatasetMeta(datasetId: string): Promise<DatasetMeta> {
    if (datasetId === BLANK_DATASET_ID) {
      return {
        ...blankDatasetMeta,
        updatedAt: new Date().toISOString(),
      };
    }

    if (datasetId !== SAMPLE_DATASET_ID) {
      throw new Error(`dataset ${datasetId} not found`);
    }

    return {
      ...sampleDatasetMeta,
      updatedAt: new Date().toISOString(),
    };
  }

  async importCsv(file: File): Promise<{ imported: number; fields: DatasetField[]; rows: Record<string, unknown>[] }> {
    const matrix = isSpreadsheetFile(file.name) ? await parseSpreadsheet(file) : await parseCsv(file);
    return matrixToDataset(matrix);
  }

  async clearImportedRows(): Promise<void> {
    localStorage.removeItem('analysis.imported.rows');
    localStorage.removeItem('analysis.imported.fields');
  }

  async getDatasetPage(req: DatasetPageRequest): Promise<DatasetPageResponse> {
    if (req.datasetId === BLANK_DATASET_ID) {
      const fields = blankDatasetMeta.fields;
      const rows = createBlankRows(DEFAULT_BLANK_ROW_COUNT, fields);
      return {
        datasetId: req.datasetId,
        page: req.page,
        pageSize: req.pageSize,
        totalRows: rows.length,
        rows,
        hasMore: false,
      };
    }

    if (req.datasetId !== SAMPLE_DATASET_ID) {
      throw new Error(`dataset ${req.datasetId} not found`);
    }

    let rows: Record<string, unknown>[] = [];
    const startBase = req.page * req.pageSize;
    const endBase = Math.min(startBase + req.pageSize, TOTAL_ROWS);
    rows = Array.from({ length: endBase - startBase }, (_, index) => generateRow(startBase + index));

    if (req.keyword) {
      const keyword = req.keyword;
      rows = rows.filter((row) => fuzzyMatchTokens(Object.values(row).join(' '), keyword));
    }
    if (req.filters) {
      Object.entries(req.filters).forEach(([fieldName, value]) => {
        if (value !== '') {
          rows = rows.filter((row) => fuzzyMatchTokens(row[fieldName], String(value)));
        }
      });
    }
    if (req.sortBy) {
      rows = [...rows].sort((left, right) => {
        const compareResult = String(left[req.sortBy!] ?? '').localeCompare(String(right[req.sortBy!] ?? ''), 'zh-Hans-CN', {
          numeric: true,
        });
        return req.sortOrder === 'desc' ? -compareResult : compareResult;
      });
    }

    const end = Math.min(rows.length, req.pageSize);

    await new Promise((resolve) => setTimeout(resolve, 80));

    return {
      datasetId: req.datasetId,
      page: req.page,
      pageSize: req.pageSize,
      totalRows: TOTAL_ROWS,
      rows: rows.slice(0, end),
      hasMore: startBase + end < TOTAL_ROWS,
    };
  }
}

export const datasetService = new DatasetService();
