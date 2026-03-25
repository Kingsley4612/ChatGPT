export type FieldType = 'string' | 'number' | 'boolean' | 'date';

export interface DatasetField {
  fieldName: string;
  title: string;
  type: FieldType;
  sortable: boolean;
  filterable: boolean;
  sensitive: boolean;
  maskedPattern?: string;
}

export interface DatasetMeta {
  datasetId: string;
  name: string;
  totalRows: number;
  fields: DatasetField[];
  updatedAt: string;
}

export interface DatasetPageRequest {
  datasetId: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  keyword?: string;
  filters?: Record<string, string | number | boolean>;
}

export interface DatasetPageResponse {
  datasetId: string;
  page: number;
  pageSize: number;
  totalRows: number;
  rows: Record<string, unknown>[];
  hasMore: boolean;
}

export interface UserContext {
  userId: string;
  userName: string;
  department: string;
  roleCodes: string[];
  capabilities: {
    canCopy: boolean;
    canSaveView: boolean;
    canSaveWorkbook: boolean;
  };
}

export interface SecurityConfig {
  disableExport: boolean;
  enableWatermark: boolean;
  enableMasking: boolean;
  allowCopy: boolean;
  watermarkTemplate: string;
}

export type AuditAction =
  | 'open_dataset'
  | 'sort'
  | 'filter'
  | 'search'
  | 'copy'
  | 'save_view'
  | 'save_workbook';

export interface AuditEvent {
  action: AuditAction;
  userId: string;
  datasetId?: string;
  workbookId?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ViewConfig {
  viewId: string;
  ownerUserId: string;
  ownerOrg: string;
  name: string;
  datasetId: string;
  filters: Record<string, string | number | boolean>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  freeze: {
    row: number;
    col: number;
  };
  activeSheet: string;
  createdAt: string;
}

export interface WorkbookConfig {
  workbookId: string;
  ownerUserId: string;
  ownerOrg: string;
  name: string;
  datasetId: string;
  sheets: Array<{
    sheetId: string;
    name: string;
    viewConfig: Omit<ViewConfig, 'viewId' | 'name' | 'datasetId' | 'createdAt'>;
    formulaColumns: Array<{ fieldName: string; formula: string }>;
  }>;
  createdAt: string;
  updatedAt: string;
}
