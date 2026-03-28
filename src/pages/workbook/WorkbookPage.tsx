import { useEffect, useMemo, useRef, useState } from 'react';
import { CompactSelection, type GridSelection } from '@glideapps/glide-data-grid';
import { isRemotePersistenceEnabled } from '../../config/persistence';
import { WorkbookShell } from '../../components/workbook-shell/WorkbookShell';
import { Toolbar } from '../../components/toolbar/Toolbar';
import { SecurityGuard } from '../../components/security-guard/SecurityGuard';
import { Watermark } from '../../components/watermark/Watermark';
import { useDataset } from '../../features/dataset/useDataset';
import { useSecurity } from '../../features/security/useSecurity';
import { buildWatermarkText } from '../../services/security.service';
import { evaluateFormulaRows } from '../../services/formula.service';
import { maskValue } from '../../utils/mask';
import { UniverAdapter, type UniverGridState } from '../../adapters/univer/univerAdapter';
import { viewSaveService } from '../../features/view-save/viewSave.service';
import { workbookService } from '../../services/workbook.service';
import { useAudit } from '../../features/audit/useAudit';
import {
  BLANK_DATASET_ID,
  DEFAULT_BLANK_ROW_COUNT,
  createBlankFields,
  createBlankRows,
  datasetService,
  getColumnLabel,
} from '../../services/dataset.service';
import type { DatasetField, EditSessionOperation, WorkbookConfig } from '../../types/models';

interface Props {
  datasetId: string;
  workbookId?: string;
  onBack: () => void;
}

interface ActiveCellState {
  columnIndex: number;
  rowIndex: number;
  field: DatasetField;
  label: string;
  value: string;
}

interface FormulaEditTarget {
  rowIndex: number;
  fieldName: string;
  label: string;
  value: string;
}

interface TextSelectionRange {
  start: number;
  end: number;
}

const WORKSHEET_NAME = '工作表';
const LEGACY_ROW_TITLE_FIELD_NAME = '__rowTitle';
const PAGE_SIZE = 100;
const HEADER_ROW_INDEX = 0;
const DATA_ROW_OFFSET = 1;
const CELL_COLOR_OPTIONS = [
  { label: '黄', value: '#fde68a' },
  { label: '绿', value: '#bbf7d0' },
  { label: '蓝', value: '#bfdbfe' },
  { label: '粉', value: '#fbcfe8' },
  { label: '紫', value: '#ddd6fe' },
] as const;

function createEmptyGridSelection(): GridSelection {
  return {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  };
}

function createCellGridSelection(columnIndex: number, rowIndex: number): GridSelection {
  return {
    current: {
      cell: [columnIndex, rowIndex],
      range: { x: columnIndex, y: rowIndex, width: 1, height: 1 },
      rangeStack: [],
    },
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  };
}

function cloneFields(fields: DatasetField[]): DatasetField[] {
  return fields.map((field) => ({ ...field }));
}

function buildHeaderRow(fields: DatasetField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.fieldName, field.title]));
}

function isHeaderRowIndex(rowIndex: number): boolean {
  return rowIndex === HEADER_ROW_INDEX;
}

function toDataRowIndex(rowIndex: number): number {
  return rowIndex - DATA_ROW_OFFSET;
}

function toVisualRowIndex(rowIndex: number): number {
  return rowIndex + DATA_ROW_OFFSET;
}

function normalizeBlankWorkbookFields(fields: DatasetField[]): DatasetField[] {
  const isLegacyDefaultBlankSheet = fields.length > 0 && fields.every((field, index) => {
    const label = getColumnLabel(index);
    return field.fieldName === `col_${label}` && field.title.trim() === label;
  });

  if (!isLegacyDefaultBlankSheet) {
    return fields;
  }

  return fields.map((field) => ({ ...field, title: '' }));
}

function isSupportedField(fieldName: string): boolean {
  return fieldName !== LEGACY_ROW_TITLE_FIELD_NAME;
}

function sanitizeLegacyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const { [LEGACY_ROW_TITLE_FIELD_NAME]: _, ...rest } = row;
    return rest;
  });
}

function createGridState(fields: DatasetField[]): UniverGridState {
  return {
    hiddenColumns: [],
    columnWidths: Object.fromEntries(fields.map((field) => [field.fieldName, 140])),
    freeze: { row: 0, col: 0 },
    activeSheet: WORKSHEET_NAME,
  };
}

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

function uniqueFieldName(baseName: string, existingFieldNames: Set<string>): string {
  let nextName = baseName;
  let suffix = 1;
  while (existingFieldNames.has(nextName)) {
    suffix += 1;
    nextName = `${baseName}_${suffix}`;
  }
  existingFieldNames.add(nextName);
  return nextName;
}

function buildFieldFromTitle(title: string, existingFieldNames: Set<string>, fallbackIndex: number): DatasetField {
  const normalized = title.trim();
  const baseName = (normalized || `column_${fallbackIndex + 1}`)
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || `column_${fallbackIndex + 1}`;

  return {
    fieldName: uniqueFieldName(baseName, existingFieldNames),
    title: normalized,
    type: 'string',
    sortable: true,
    filterable: true,
    sensitive: false,
  };
}

function createEmptyRow(fields: DatasetField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.fieldName, '']));
}

function createFormulaEditTarget(cell: ActiveCellState | null): FormulaEditTarget | null {
  if (!cell) return null;

  return {
    rowIndex: cell.rowIndex,
    fieldName: cell.field.fieldName,
    label: cell.label,
    value: cell.value,
  };
}

function insertReferenceAtSelection(value: string, reference: string, selection: TextSelectionRange): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));

  return {
    value: `${value.slice(0, start)}${reference}${value.slice(end)}`,
    caret: start + reference.length,
  };
}

function insertItems<T>(items: T[], insertIndex: number, newItems: T[]): T[] {
  return [...items.slice(0, insertIndex), ...newItems, ...items.slice(insertIndex)];
}

function parseCellReference(value: string): { col: number; row: number } | null {
  const match = value.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  let columnIndex = 0;
  const label = match[1];
  for (let index = 0; index < label.length; index += 1) {
    columnIndex = columnIndex * 26 + (label.charCodeAt(index) - 64);
  }

  return {
    col: columnIndex - 1,
    row: Number(match[2]) - 1,
  };
}

function toEditableCellValue(row: Record<string, unknown> | undefined, fieldName: string): string {
  return row?.[fieldName] == null ? '' : String(row[fieldName]);
}

function deriveLegacyFields(
  savedSheet: WorkbookConfig['sheets'][number] | null | undefined,
  fallbackFields: DatasetField[],
): DatasetField[] {
  if (savedSheet?.sheetFields?.length) {
    return cloneFields(savedSheet.sheetFields).filter((field) => isSupportedField(field.fieldName));
  }

  if (savedSheet?.rowSnapshot?.length) {
    const existingFieldNames = new Set<string>();
    return Object.keys(savedSheet.rowSnapshot[0])
      .filter(isSupportedField)
      .map((fieldName, index) => buildFieldFromTitle(fieldName, existingFieldNames, index));
  }

  const baseFields = fallbackFields.filter(
    (field) => isSupportedField(field.fieldName) && !savedSheet?.removedColumns?.includes(field.fieldName),
  );
  const customFields = (savedSheet?.customColumns ?? []).filter(
    (field) => isSupportedField(field.fieldName) && !savedSheet?.removedColumns?.includes(field.fieldName),
  );
  return cloneFields([...baseFields, ...customFields]);
}

export function WorkbookPage(props: Props) {
  const { datasetId, onBack } = props;
  const initialWorkbookId = props.workbookId;
  const isBlankWorkbook = datasetId === BLANK_DATASET_ID;
  const remoteMode = isRemotePersistenceEnabled();

  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<string>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [workbookName, setWorkbookName] = useState(isBlankWorkbook ? '空白工作簿' : '临时工作簿');
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [sheetFields, setSheetFields] = useState<DatasetField[]>([]);
  const [gridSelection, setGridSelection] = useState<GridSelection>(() => createEmptyGridSelection());
  const [toast, setToast] = useState<string | null>(null);
  const [workingRows, setWorkingRows] = useState<Record<string, unknown>[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<Record<string, unknown>[] | null>(isBlankWorkbook ? [] : null);
  const [gridState, setGridState] = useState<UniverGridState | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(CELL_COLOR_OPTIONS[0].value);
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [initializedKey, setInitializedKey] = useState('');
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [remoteMutationCount, setRemoteMutationCount] = useState(0);
  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [nameBoxInput, setNameBoxInput] = useState('');
  const [formulaTarget, setFormulaTarget] = useState<FormulaEditTarget | null>(null);
  const [isFormulaEditing, setIsFormulaEditing] = useState(false);
  const [isFormulaDirty, setIsFormulaDirty] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ col: number; row: number; token: number } | null>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const formulaInputSelectionRef = useRef<TextSelectionRange>({ start: 0, end: 0 });
  const pendingFormulaReferencePickRef = useRef(false);
  const remoteMutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const { user, security } = useSecurity();
  const { emit } = useAudit(datasetId, workbookId ?? undefined);
  const { meta, page: pageData, loading, error } = useDataset(datasetId, {
    page,
    pageSize: PAGE_SIZE,
    keyword,
    sortBy,
    sortOrder,
    filters,
    editSessionId: editSessionId ?? undefined,
    reloadKey: refreshKey,
  });

  const adapterFields = sheetFields.length ? sheetFields : meta?.fields ?? [];
  const adapter = useMemo(() => {
    if (!adapterFields.length && !meta) return null;
    return new UniverAdapter({ fields: adapterFields, sheets: [WORKSHEET_NAME] });
  }, [adapterFields, meta]);

  useEffect(() => {
    setEditSessionId(null);
  }, [datasetId, initialWorkbookId]);

  useEffect(() => {
    if (!meta) return;

    const routeKey = `${datasetId}:${initialWorkbookId ?? 'new'}`;
    if (initializedKey === routeKey) return;

    let cancelled = false;

    void (async () => {
      const savedWorkbook = initialWorkbookId ? await workbookService.getById(initialWorkbookId) : null;
      const savedSheet = savedWorkbook?.sheets[0] ?? null;
      const shouldUseRemoteSession = remoteMode && !isBlankWorkbook && !savedSheet?.rowSnapshot;
      const remoteSession = shouldUseRemoteSession
        ? await datasetService.createEditSession(savedWorkbook?.datasetId ?? datasetId, savedWorkbook?.name)
        : null;

      if (cancelled) return;

      if (!savedWorkbook || !savedSheet) {
        const initialFields = isBlankWorkbook
          ? cloneFields(meta.fields.length ? meta.fields : createBlankFields())
          : cloneFields(meta.fields);
        setWorkbookId(null);
        setWorkbookName(isBlankWorkbook ? '空白工作簿' : '临时工作簿');
        setEditSessionId(remoteSession?.sessionId ?? null);
        setFilters({});
        setSortBy(undefined);
        setSortOrder('asc');
        setPage(0);
        setSheetFields(initialFields);
        setWorkingRows([]);
        setSnapshotRows(isBlankWorkbook ? createBlankRows(DEFAULT_BLANK_ROW_COUNT, initialFields) : null);
        setGridState(createGridState(initialFields));
        setCellColors({});
        setInitializedKey(routeKey);
        return;
      }

      const initialFields = isBlankWorkbook
        ? normalizeBlankWorkbookFields(deriveLegacyFields(savedSheet, meta.fields))
        : deriveLegacyFields(savedSheet, meta.fields);
      setWorkbookId(savedWorkbook.workbookId);
      setWorkbookName(savedWorkbook.name);
      setEditSessionId(remoteSession?.sessionId ?? null);
      setFilters(
        Object.fromEntries(
          Object.entries(savedSheet.viewConfig.filters).map(([fieldName, value]) => [fieldName, String(value ?? '')]),
        ),
      );
      setSortBy(savedSheet.viewConfig.sortBy);
      setSortOrder(savedSheet.viewConfig.sortOrder ?? 'asc');
      setPage(0);
      setSheetFields(initialFields);
      setWorkingRows([]);
      setSnapshotRows(
        savedSheet.rowSnapshot
          ? sanitizeLegacyRows(savedSheet.rowSnapshot)
          : isBlankWorkbook
            ? createBlankRows(DEFAULT_BLANK_ROW_COUNT, initialFields)
            : null,
      );
      setGridState({
        hiddenColumns: initialFields
          .map((field) => field.fieldName)
          .filter((fieldName) => !savedSheet.viewConfig.visibleColumns.includes(fieldName)),
        columnWidths: {
          ...createGridState(initialFields).columnWidths,
          ...savedSheet.viewConfig.columnWidths,
        },
        freeze: savedSheet.viewConfig.freeze,
        activeSheet: WORKSHEET_NAME,
      });
      setCellColors(savedSheet.cellColors ?? {});
      setInitializedKey(routeKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [datasetId, initialWorkbookId, initializedKey, isBlankWorkbook, meta, remoteMode]);

  const isSnapshotMode = snapshotRows !== null;
  const isRemoteSessionMode = remoteMode && !isSnapshotMode && Boolean(editSessionId);
  const currentPageRowKeys = pageData?.rowKeys ?? [];
  const currentPageRowIndexes = pageData?.rowIndexes ?? [];

  useEffect(() => {
    if (isSnapshotMode) return;
    setWorkingRows(sanitizeLegacyRows(pageData?.rows ?? []));
  }, [isSnapshotMode, pageData]);

  useEffect(() => {
    if (!isRemoteSessionMode || !meta) return;

    setSheetFields(cloneFields(meta.fields));
    setGridState((prev) => {
      const base = prev ?? createGridState(meta.fields);
      const nextColumnWidths = Object.fromEntries(meta.fields.map((field) => [field.fieldName, base.columnWidths[field.fieldName] ?? 140]));
      const nextHiddenColumns = base.hiddenColumns.filter((fieldName) => meta.fields.some((field) => field.fieldName === fieldName));

      return {
        ...base,
        hiddenColumns: nextHiddenColumns,
        columnWidths: nextColumnWidths,
      };
    });
  }, [isRemoteSessionMode, meta]);

  useEffect(() => {
    emit('open_dataset', { datasetId });
  }, [datasetId, emit]);

  useEffect(() => {
    setGridSelection(createEmptyGridSelection());
  }, [page, keyword, sortBy, sortOrder, JSON.stringify(filters), snapshotRows?.length, sheetFields.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const runRemoteMutation = async <T,>(
    task: () => Promise<T>,
    options: { reload?: boolean; successMessage?: string } = {},
  ): Promise<T> => {
    setRemoteMutationCount((count) => count + 1);
    const nextTask = remoteMutationQueueRef.current
      .catch(() => undefined)
      .then(task);

    remoteMutationQueueRef.current = nextTask
      .then(() => undefined)
      .catch(() => undefined);

    try {
      const result = await nextTask;
      if (options.reload) {
        setRefreshKey((current) => current + 1);
      }
      if (options.successMessage) {
        setToast(options.successMessage);
      }
      return result;
    } catch (error) {
      setToast(error instanceof Error ? error.message : '远端编辑操作失败');
      throw error;
    } finally {
      setRemoteMutationCount((count) => Math.max(0, count - 1));
    }
  };

  const flushRemoteMutations = async () => {
    await remoteMutationQueueRef.current;
  };

  const snapshotViewport = useMemo(() => {
    if (snapshotRows === null) return null;

    let rows = snapshotRows.map((row, index) => ({ row, sourceIndex: index }));

    if (keyword) {
      rows = rows.filter((item) => fuzzyMatchTokens(Object.values(item.row).join(' '), keyword));
    }

    Object.entries(filters).forEach(([fieldName, value]) => {
      if (!value) return;
      rows = rows.filter((item) => fuzzyMatchTokens(item.row[fieldName], value));
    });

    if (sortBy) {
      const collator = new Intl.Collator('zh-Hans-CN', { numeric: true });
      rows = [...rows].sort((left, right) => {
        const result = collator.compare(String(left.row[sortBy] ?? ''), String(right.row[sortBy] ?? ''));
        return sortOrder === 'desc' ? -result : result;
      });
    }

    const start = isSnapshotMode ? 0 : page * PAGE_SIZE;
    const pageRows = isSnapshotMode ? rows : rows.slice(start, start + PAGE_SIZE);
    return {
      rows: pageRows.map((item) => item.row),
      sourceIndexes: pageRows.map((item) => item.sourceIndex),
      totalRows: rows.length,
      hasMore: isSnapshotMode ? false : start + PAGE_SIZE < rows.length,
    };
  }, [filters, isSnapshotMode, keyword, page, snapshotRows, sortBy, sortOrder]);

  const activeRows = snapshotViewport?.rows ?? workingRows;
  const activeSourceIndexes = snapshotViewport?.sourceIndexes ?? [];
  const visibleFields = useMemo(
    () => sheetFields.filter((field) => !gridState?.hiddenColumns.includes(field.fieldName)),
    [gridState?.hiddenColumns, sheetFields],
  );

  const selectedRows = useMemo(() => new Set(gridSelection.rows.toArray()), [gridSelection.rows]);

  const selectedColumns = useMemo(
    () =>
      new Set(
        gridSelection.columns
          .toArray()
          .map((columnIndex) => visibleFields[columnIndex]?.fieldName)
          .filter((fieldName): fieldName is string => Boolean(fieldName)),
      ),
    [gridSelection.columns, visibleFields],
  );

  const selectedCells = useMemo(() => {
    const next = new Set<string>();
    const rectangles = gridSelection.current
      ? [gridSelection.current.range, ...gridSelection.current.rangeStack]
      : [];

    rectangles.forEach((range) => {
      for (let rowIndex = range.y; rowIndex < range.y + range.height; rowIndex += 1) {
        for (let columnIndex = range.x; columnIndex < range.x + range.width; columnIndex += 1) {
          const field = visibleFields[columnIndex];
          if (field) {
            next.add(`${rowIndex}:${field.fieldName}`);
          }
        }
      }
    });

    return next;
  }, [gridSelection.current, visibleFields]);

  const primarySelectedFieldName = useMemo(() => {
    const firstSelected = selectedColumns.values().next().value;
    if (firstSelected) return firstSelected;
    const activeColumnIndex = gridSelection.current?.cell[0];
    return activeColumnIndex == null ? null : (visibleFields[activeColumnIndex]?.fieldName ?? null);
  }, [gridSelection.current, selectedColumns, visibleFields]);

  const primarySelectedRowIndex = useMemo(() => {
    const firstSelected = selectedRows.values().next().value;
    if (typeof firstSelected === 'number') return firstSelected;
    return gridSelection.current?.cell[1] ?? null;
  }, [gridSelection.current, selectedRows]);

  const headerRow = useMemo(() => buildHeaderRow(sheetFields), [sheetFields]);
  const visibleRowCount = activeRows.length + DATA_ROW_OFFSET;

  const activeCell = useMemo<ActiveCellState | null>(() => {
    const currentCell = gridSelection.current?.cell;
    if (!currentCell) return null;

    const [columnIndex, rowIndex] = currentCell;
    const field = visibleFields[columnIndex];
    if (!field || rowIndex < 0 || rowIndex >= visibleRowCount) return null;

    return {
      columnIndex,
      rowIndex,
      field,
      label: `${getColumnLabel(columnIndex)}${rowIndex + 1}`,
      value: isHeaderRowIndex(rowIndex)
        ? String(headerRow[field.fieldName] ?? '')
        : toEditableCellValue(activeRows[toDataRowIndex(rowIndex)], field.fieldName),
    };
  }, [activeRows, gridSelection.current, headerRow, visibleFields, visibleRowCount]);

  const isFormulaReferenceMode = isFormulaEditing && formulaInput.trim().startsWith('=');

  const updateFormulaInputSelection = (input: HTMLInputElement | null = formulaInputRef.current) => {
    if (!input) return;

    const fallback = input.value.length;
    formulaInputSelectionRef.current = {
      start: input.selectionStart ?? fallback,
      end: input.selectionEnd ?? fallback,
    };
  };

  const focusFormulaInputAtCaret = (caret: number) => {
    requestAnimationFrame(() => {
      const input = formulaInputRef.current;
      if (!input) return;

      input.focus();
      input.setSelectionRange(caret, caret);
      formulaInputSelectionRef.current = {
        start: caret,
        end: caret,
      };
    });
  };

  useEffect(() => {
    if (isFormulaEditing) return;
    setFormulaInput(activeCell?.value ?? '');
    setNameBoxInput(activeCell?.label ?? '');
    setFormulaTarget(createFormulaEditTarget(activeCell));
    setIsFormulaDirty(false);
  }, [activeCell, isFormulaEditing]);

  const displayRows = useMemo(() => {
    return evaluateFormulaRows(activeRows, sheetFields);
  }, [activeRows, sheetFields]);

  const maskedRows = useMemo(() => {
    if (!meta || !displayRows.length) return displayRows;
    const metaFieldMap = new Map(meta.fields.map((field) => [field.fieldName, field]));

    return displayRows.map((row) => {
      const next = { ...row };
      sheetFields.forEach((field) => {
        const metaField = metaFieldMap.get(field.fieldName);
        if (metaField && security.enableMasking) {
          next[field.fieldName] = maskValue(next[field.fieldName], metaField);
        }
      });
      return next;
    });
  }, [displayRows, meta, security.enableMasking, sheetFields]);

  const visibleMaskedRows = useMemo(() => [headerRow, ...maskedRows], [headerRow, maskedRows]);

  const buildColorKey = (rowIndex: number, fieldName: string) => {
    if (isHeaderRowIndex(rowIndex)) {
      return `header:${fieldName}`;
    }

    const dataRowIndex = toDataRowIndex(rowIndex);
    const effectiveIndex = isSnapshotMode ? (activeSourceIndexes[dataRowIndex] ?? dataRowIndex) : dataRowIndex;
    return `${isSnapshotMode ? 'snapshot' : `page-${page}`}:${effectiveIndex}:${fieldName}`;
  };

  const visibleCellColors = useMemo(() => {
    const next: Record<string, string> = {};
    visibleFields.forEach((field) => {
      const headerColor = cellColors[buildColorKey(HEADER_ROW_INDEX, field.fieldName)];
      if (headerColor) {
        next[`${HEADER_ROW_INDEX}:${field.fieldName}`] = headerColor;
      }
    });
    activeRows.forEach((_, rowIndex) => {
      const visualRowIndex = toVisualRowIndex(rowIndex);
      visibleFields.forEach((field) => {
        const color = cellColors[buildColorKey(visualRowIndex, field.fieldName)];
        if (color) {
          next[`${visualRowIndex}:${field.fieldName}`] = color;
        }
      });
    });
    return next;
  }, [activeRows, cellColors, isSnapshotMode, page, visibleFields]);

  const summary = useMemo(() => {
    if (!visibleMaskedRows.length) return { sum: 0, avg: 0, count: 0 };
    const numericValues: number[] = [];

    selectedCells.forEach((key) => {
      const [rowIndexRaw, fieldName] = key.split(':');
      const row = visibleMaskedRows[Number(rowIndexRaw)];
      const value = Number(row?.[fieldName]);
      if (!Number.isNaN(value)) numericValues.push(value);
    });

    const values = numericValues.length
      ? numericValues
      : visibleMaskedRows
          .flatMap((row) => Object.values(row))
          .map((value) => Number(value))
          .filter((value) => !Number.isNaN(value));

    const sum = values.reduce((acc, current) => acc + current, 0);
    return { sum, avg: values.length ? sum / values.length : 0, count: values.length };
  }, [selectedCells, visibleMaskedRows]);

  const totalRows = snapshotViewport?.totalRows ?? pageData?.totalRows ?? meta?.totalRows ?? 0;
  const hasMore = snapshotViewport?.hasMore ?? pageData?.hasMore ?? false;

  if (error) return <div>加载失败: {error}</div>;
  if (!meta || !pageData || !adapter || !gridState) return <div>{loading ? '加载中...' : '暂无数据'}</div>;

  const updateGridState = (updater: (state: UniverGridState) => UniverGridState) => {
    setGridState((prev) => (prev ? updater(prev) : prev));
  };

  const clearSelections = () => {
    setGridSelection(createEmptyGridSelection());
  };

  const clearFormulaErrors = () => {
    setToast(null);
  };

  const saveResultDataset = async (name: string) => {
    if (!editSessionId) return null;
    setIsSavingResult(true);

    try {
      await flushRemoteMutations();
      return await datasetService.saveEditSession(editSessionId, name);
    } finally {
      setIsSavingResult(false);
    }
  };

  const saveWorkbook = async (name: string, nextWorkbookId: string) => {
    const nextDatasetId = isRemoteSessionMode
      ? (await saveResultDataset(`${name}-结果集`))?.datasetId ?? datasetId
      : datasetId;

    await workbookService.save({
      workbookId: nextWorkbookId,
      ownerUserId: user.userId,
      ownerOrg: user.department,
      name,
      datasetId: nextDatasetId,
      sheets: [
        {
          sheetId: 'sheet-1',
          name: WORKSHEET_NAME,
          viewConfig: {
            ownerUserId: user.userId,
            ownerOrg: user.department,
            filters,
            sortBy,
            sortOrder,
            visibleColumns: sheetFields.filter((field) => !gridState.hiddenColumns.includes(field.fieldName)).map((field) => field.fieldName),
            columnWidths: gridState.columnWidths,
            freeze: gridState.freeze,
            activeSheet: WORKSHEET_NAME,
          },
          sheetFields: cloneFields(sheetFields),
          rowSnapshot: sanitizeLegacyRows(snapshotRows ?? workingRows),
          cellColors,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return nextDatasetId;
  };

  const updateCellValue = (rowIndex: number, fieldName: string, value: string) => {
    clearFormulaErrors();

    if (isHeaderRowIndex(rowIndex)) {
      renameColumn(fieldName, value);
      return;
    }

    const dataRowIndex = toDataRowIndex(rowIndex);

    if (isRemoteSessionMode) {
      const rowKey = currentPageRowKeys[dataRowIndex];
      setWorkingRows((prev) => prev.map((row, index) => (index === dataRowIndex ? { ...row, [fieldName]: value } : row)));

      if (rowKey) {
        void runRemoteMutation(() =>
          datasetService.applyEditSessionOperations(editSessionId!, [
            {
              type: 'set_cell',
              rowKey,
              fieldName,
              value,
            },
          ]));
      }
      return;
    }

    if (isSnapshotMode) {
      const absoluteIndex = activeSourceIndexes[dataRowIndex] ?? dataRowIndex;
      setSnapshotRows((prev) =>
        prev
          ? prev.map((row, index) => (index === absoluteIndex ? { ...row, [fieldName]: value } : row))
          : prev,
      );
      return;
    }

    setWorkingRows((prev) => prev.map((row, index) => (index === dataRowIndex ? { ...row, [fieldName]: value } : row)));
  };

  const commitFormulaBarValue = () => {
    if (pendingFormulaReferencePickRef.current) {
      pendingFormulaReferencePickRef.current = false;
      return;
    }

    if (!formulaTarget) {
      setIsFormulaEditing(false);
      setIsFormulaDirty(false);
      return;
    }

    if (isFormulaDirty && formulaInput !== formulaTarget.value) {
      updateCellValue(formulaTarget.rowIndex, formulaTarget.fieldName, formulaInput);
    }

    setIsFormulaEditing(false);
    setIsFormulaDirty(false);
  };

  const cancelFormulaBarEdit = () => {
    setFormulaInput(formulaTarget?.value ?? activeCell?.value ?? '');
    setIsFormulaEditing(false);
    setIsFormulaDirty(false);
  };

  const handleFormulaReferencePicked = (columnIndex: number, rowIndex: number) => {
    if (!isFormulaReferenceMode) return;

    const reference = `${getColumnLabel(columnIndex)}${rowIndex + 1}`;
    const targetCell = formulaTarget ?? createFormulaEditTarget(activeCell);
    let nextCaret = 0;

    setFormulaTarget(targetCell);
    setFormulaInput((currentValue) => {
      const inserted = insertReferenceAtSelection(currentValue, reference, formulaInputSelectionRef.current);
      nextCaret = inserted.caret;
      return inserted.value;
    });
    setIsFormulaDirty(true);
    focusFormulaInputAtCaret(nextCaret);
  };

  const jumpToCell = (value: string) => {
    const parsed = parseCellReference(value);
    if (!parsed) {
      setNameBoxInput(activeCell?.label ?? '');
      setToast('请输入类似 A1、B12 的单元格地址');
      return;
    }

    if (parsed.col < 0 || parsed.col >= visibleFields.length || parsed.row < 0 || parsed.row >= visibleRowCount) {
      setNameBoxInput(activeCell?.label ?? '');
      setToast('目标单元格超出当前可见范围');
      return;
    }

    setGridSelection(createCellGridSelection(parsed.col, parsed.row));
    setScrollTarget({ col: parsed.col, row: parsed.row, token: Date.now() });
  };

  const resetToCurrentDataset = () => {
    if (remoteMode && !isBlankWorkbook) {
      void (async () => {
        const nextSession = await datasetService.createEditSession(datasetId, meta.name);
        setEditSessionId(nextSession.sessionId);
        setPage(0);
        setKeyword('');
        setSortBy(undefined);
        setSortOrder('asc');
        setFilters({});
        setCellColors({});
        clearSelections();
        setRefreshKey((current) => current + 1);
        setToast('已重新创建远端编辑会话');
      })();
      return;
    }

    const resetFields = cloneFields(meta.fields);
    setPage(0);
    setKeyword('');
    setSortBy(undefined);
    setSortOrder('asc');
    setFilters({});
    setSheetFields(resetFields);
    setGridState(createGridState(resetFields));
    setCellColors({});
    setWorkingRows([]);
    setSnapshotRows(isBlankWorkbook ? createBlankRows(DEFAULT_BLANK_ROW_COUNT, resetFields) : null);
    clearSelections();
    setToast(isBlankWorkbook ? '已恢复默认空白工作簿' : '已恢复系统示例数据');
  };

  const getSelectedDataRowIndexes = () => {
    const rowIndexes = selectedRows.size
      ? Array.from(selectedRows)
      : primarySelectedRowIndex != null
        ? [primarySelectedRowIndex]
        : [];

    return rowIndexes.filter((rowIndex) => rowIndex >= DATA_ROW_OFFSET).map(toDataRowIndex);
  };

  const insertRowsAt = (position: 'before' | 'after') => {
    const selectedRowIndexes = getSelectedDataRowIndexes();
    const count = Math.max(selectedRowIndexes.length, 1);
    const emptyRows = Array.from({ length: count }, () => createEmptyRow(sheetFields));

    if (isRemoteSessionMode) {
      const targetVisualIndex = selectedRowIndexes.length
        ? (position === 'before' ? Math.min(...selectedRowIndexes) - 1 : Math.max(...selectedRowIndexes))
        : primarySelectedRowIndex === HEADER_ROW_INDEX
          ? -1
          : (currentPageRowIndexes.length ? currentPageRowIndexes[currentPageRowIndexes.length - 1] : -1);
      const insertAfterRowIndex = targetVisualIndex < 0 ? null : (currentPageRowIndexes[targetVisualIndex] ?? targetVisualIndex);

      void runRemoteMutation(
        () =>
          datasetService.applyEditSessionOperations(editSessionId!, [
            {
              type: 'insert_rows',
              insertAfterRowIndex,
              rows: emptyRows,
            },
          ]),
        { reload: true, successMessage: `已插入 ${count} 行` },
      );
      return;
    }

    if (isSnapshotMode) {
      const insertIndex = selectedRowIndexes.length
        ? (() => {
            const baseIndexes = selectedRowIndexes.map((rowIndex) => activeSourceIndexes[rowIndex] ?? rowIndex);
            return position === 'before' ? Math.min(...baseIndexes) : Math.max(...baseIndexes) + 1;
          })()
        : primarySelectedRowIndex === HEADER_ROW_INDEX
          ? 0
          : (snapshotRows?.length ?? 0);
      setSnapshotRows((prev) => insertItems(prev ?? [], insertIndex, emptyRows));
    } else {
      const insertIndex = selectedRowIndexes.length
        ? (position === 'before' ? Math.min(...selectedRowIndexes) : Math.max(...selectedRowIndexes) + 1)
        : primarySelectedRowIndex === HEADER_ROW_INDEX
          ? 0
          : workingRows.length;
      setWorkingRows((prev) => insertItems(prev, insertIndex, emptyRows));
    }

    setCellColors({});
    setToast(`已插入 ${count} 行`);
  };

  const deleteSelectedRows = () => {
    const rowIndexesToDelete = getSelectedDataRowIndexes();

    if (!rowIndexesToDelete.length) {
      setToast('请先选择要删除的数据行');
      return;
    }

    if (isRemoteSessionMode) {
      const rowKeys = rowIndexesToDelete
        .map((rowIndex) => currentPageRowKeys[rowIndex])
        .filter((rowKey): rowKey is string => Boolean(rowKey));

      void runRemoteMutation(
        () =>
          datasetService.applyEditSessionOperations(editSessionId!, [
            {
              type: 'delete_rows',
              rowKeys,
            },
          ]),
        { reload: true, successMessage: `已删除 ${rowKeys.length} 行` },
      );
      clearSelections();
      return;
    }

    const rowIndexes = rowIndexesToDelete.sort((a, b) => b - a);
    if (isSnapshotMode) {
      const absoluteIndexes = new Set(rowIndexes.map((rowIndex) => activeSourceIndexes[rowIndex] ?? rowIndex));
      setSnapshotRows((prev) => (prev ? prev.filter((_, index) => !absoluteIndexes.has(index)) : prev));
    } else {
      const localIndexes = new Set(rowIndexes);
      setWorkingRows((prev) => prev.filter((_, index) => !localIndexes.has(index)));
    }

    setCellColors({});
    clearSelections();
    setToast(`已删除 ${rowIndexes.length} 行`);
  };

  const createInsertedColumns = (count: number, seedValue: string): DatasetField[] => {
    const requestedNames = seedValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const names = requestedNames.length === 1 && count > 1
      ? Array.from({ length: count }, (_, index) => `${requestedNames[0]}_${index + 1}`)
      : requestedNames;

    const fallbackNames = names.length ? names : Array.from({ length: count }, () => '');
    const existingFieldNames = new Set(sheetFields.map((field) => field.fieldName));

    return Array.from({ length: Math.max(count, fallbackNames.length) }, (_, index) =>
      buildFieldFromTitle(fallbackNames[index] ?? '', existingFieldNames, sheetFields.length + index),
    );
  };

  const insertColumnsAt = (position: 'before' | 'after') => {
    const selectedFieldNames = selectedColumns.size
      ? Array.from(selectedColumns)
      : primarySelectedFieldName
        ? [primarySelectedFieldName]
        : [];
    const count = Math.max(selectedFieldNames.length, 1);
    const input = prompt(
      '请输入列名，多个列名用英文逗号分隔；留空会插入空白列；如果只输入一个列名且已选多列，会自动按数量生成。',
      '',
    );
    if (input === null) return;

    const newFields = createInsertedColumns(count, input);
    const indexes = selectedFieldNames.map((fieldName) => sheetFields.findIndex((field) => field.fieldName === fieldName)).filter((index) => index >= 0);
    const insertIndex = indexes.length
      ? position === 'before'
        ? Math.min(...indexes)
        : Math.max(...indexes) + 1
      : sheetFields.length;

    if (isRemoteSessionMode) {
      const operations: EditSessionOperation[] = newFields.map((field, index) => ({
        type: 'insert_column',
        insertIndex: insertIndex + index,
        field,
      }));

      void runRemoteMutation(
        () => datasetService.applyEditSessionOperations(editSessionId!, operations),
        { reload: true, successMessage: `已插入 ${newFields.length} 列` },
      );
      return;
    }

    setSheetFields((prev) => insertItems(prev, insertIndex, newFields));
    setWorkingRows((prev) =>
      prev.map((row) => ({ ...row, ...Object.fromEntries(newFields.map((field) => [field.fieldName, ''])) })),
    );
    setSnapshotRows((prev) =>
      prev
        ? prev.map((row) => ({ ...row, ...Object.fromEntries(newFields.map((field) => [field.fieldName, ''])) }))
        : prev,
    );
    updateGridState((state) => ({
      ...state,
      columnWidths: {
        ...state.columnWidths,
        ...Object.fromEntries(newFields.map((field) => [field.fieldName, 140])),
      },
    }));
    setToast(`已插入 ${newFields.length} 列`);
  };

  const deleteSelectedColumns = () => {
    const fieldNames = selectedColumns.size
      ? Array.from(selectedColumns)
      : primarySelectedFieldName
        ? [primarySelectedFieldName]
        : [];
    if (!fieldNames.length) {
      setToast('请先选择要删除的列');
      return;
    }

    if (isRemoteSessionMode) {
      void runRemoteMutation(
        () =>
          datasetService.applyEditSessionOperations(editSessionId!, [
            {
              type: 'delete_columns',
              fieldNames,
            },
          ]),
        { reload: true, successMessage: `已删除 ${fieldNames.length} 列` },
      );
      clearSelections();
      return;
    }

    setSheetFields((prev) => prev.filter((field) => !fieldNames.includes(field.fieldName)));
    setWorkingRows((prev) => prev.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !fieldNames.includes(key)))));
    setSnapshotRows((prev) =>
      prev ? prev.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !fieldNames.includes(key)))) : prev,
    );
    updateGridState((state) => ({
      ...state,
      hiddenColumns: state.hiddenColumns.filter((fieldName) => !fieldNames.includes(fieldName)),
      columnWidths: Object.fromEntries(Object.entries(state.columnWidths).filter(([fieldName]) => !fieldNames.includes(fieldName))),
    }));
    setCellColors((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => !fieldNames.some((fieldName) => key.endsWith(`:${fieldName}`))),
      ),
    );
    clearSelections();
    setToast(`已删除 ${fieldNames.length} 列`);
  };

  const renameWorkbook = () => {
    const nextName = prompt('请输入工作簿名称', workbookName);
    if (!nextName?.trim()) return;
    setWorkbookName(nextName.trim());
    setToast(`工作簿名已改为“${nextName.trim()}”`);
  };

  const renameColumn = (fieldName: string, title: string) => {
    const nextTitle = title.trim();

    setSheetFields((prev) =>
      prev.map((field) =>
        field.fieldName === fieldName
          ? {
              ...field,
              title: nextTitle,
            }
          : field,
      ),
    );

    if (isRemoteSessionMode) {
      void runRemoteMutation(() =>
        datasetService.applyEditSessionOperations(editSessionId!, [
          {
            type: 'rename_column',
            fieldName,
            title: nextTitle,
          },
        ]));
    }

    setToast(nextTitle ? `列名已改为“${nextTitle}”` : '列名已清空');
  };

  const applyColorToSelection = (color: string | null) => {
    const targets = new Set<string>();

    if (selectedCells.size) {
      selectedCells.forEach((key) => {
        const [rowIndexRaw, fieldName] = key.split(':');
        targets.add(buildColorKey(Number(rowIndexRaw), fieldName));
      });
    } else if (selectedRows.size) {
      selectedRows.forEach((rowIndex) => {
        visibleFields.forEach((field) => targets.add(buildColorKey(rowIndex, field.fieldName)));
      });
    } else if (selectedColumns.size) {
      selectedColumns.forEach((fieldName) => {
        targets.add(buildColorKey(HEADER_ROW_INDEX, fieldName));
        activeRows.forEach((_, rowIndex) => targets.add(buildColorKey(toVisualRowIndex(rowIndex), fieldName)));
      });
    }

    if (!targets.size) {
      setToast('请先选择单元格、行或列');
      return;
    }

    setCellColors((prev) => {
      const next = { ...prev };
      targets.forEach((key) => {
        if (color) next[key] = color;
        else delete next[key];
      });
      return next;
    });
    setToast(color ? '已应用颜色标记' : '已清除颜色标记');
  };

  return (
    <Watermark enabled={security.enableWatermark} text={buildWatermarkText(user, security)}>
      <div className="page-shell workbook-page">
          <div className="page-heading">
          <div>
            <div className="eyebrow">Workbook</div>
            <h2 style={{ margin: 0, cursor: 'text' }} onDoubleClick={renameWorkbook}>{workbookName}</h2>
          </div>
          <button className="button-secondary" onClick={onBack}>返回</button>
        </div>
        <SecurityGuard user={user} security={security}>
          <Toolbar
            datasetName={meta.name}
            workbookName={workbookName}
            importing={isImporting}
            isFirstRowFrozen={gridState.freeze.row >= 1}
            isFirstColFrozen={gridState.freeze.col >= 1}
            onImportCsv={async (file) => {
              setIsImporting(true);
              setToast(`正在导入 ${file.name}...`);

              try {
                const result = await datasetService.importCsv(file);
                const importedFields = cloneFields(result.fields);
                setPage(0);
                setKeyword('');
                setSortBy(undefined);
                setSortOrder('asc');
                setFilters({});
                setEditSessionId(null);
                setSheetFields(importedFields);
                setWorkingRows([]);
                setSnapshotRows(result.rows);
                setGridState(createGridState(importedFields));
                setCellColors({});
                clearSelections();
                setToast(`已导入当前工作簿：${result.imported} 行，${result.fields.length} 列`);
              } catch (importError) {
                const message = importError instanceof Error ? importError.message : '导入失败';
                setToast(`导入失败：${message}`);
              } finally {
                setIsImporting(false);
              }
            }}
            onFreezeFirstRow={() => {
              const willFreeze = gridState.freeze.row === 0;
              updateGridState((state) => adapter.setFreeze(state, willFreeze ? 1 : 0, state.freeze.col));
              setToast(willFreeze ? '已冻结首行' : '已取消冻结首行');
            }}
            onFreezeFirstCol={() => {
              const willFreeze = gridState.freeze.col === 0;
              updateGridState((state) => adapter.setFreeze(state, state.freeze.row, willFreeze ? 1 : 0));
              setToast(willFreeze ? '已冻结首列' : '已取消冻结首列');
            }}
            onSearch={(value) => {
              setPage(0);
              setKeyword(value);
              emit('search', { keyword: value });
            }}
            onSaveView={async () => {
              if (!user.capabilities.canSaveView) return;
              const viewName = prompt('输入视图名称', `视图-${new Date().toLocaleString()}`);
              if (!viewName) return;
              await viewSaveService.save({
                viewId: crypto.randomUUID(),
                ownerUserId: user.userId,
                ownerOrg: user.department,
                name: viewName,
                datasetId,
                filters,
                sortBy,
                sortOrder,
                visibleColumns: sheetFields.filter((field) => !gridState.hiddenColumns.includes(field.fieldName)).map((field) => field.fieldName),
                columnWidths: gridState.columnWidths,
                freeze: gridState.freeze,
                activeSheet: WORKSHEET_NAME,
                createdAt: new Date().toISOString(),
              });
              emit('save_view', { viewName });
              setToast(`视图“${viewName}”保存成功`);
            }}
            onSaveWorkbook={async () => {
              if (!user.capabilities.canSaveWorkbook) return;
              const nextWorkbookId = workbookId ?? crypto.randomUUID();
              await saveWorkbook(workbookName, nextWorkbookId);
              setWorkbookId(nextWorkbookId);
              emit('save_workbook', { workbookName });
              setToast(`工作簿“${workbookName}”保存成功`);
            }}
            onSaveWorkbookAs={async () => {
              if (!user.capabilities.canSaveWorkbook) return;
              const name = prompt('另存为工作簿名称', `${workbookName}-副本`);
              if (!name) return;
              const nextWorkbookId = crypto.randomUUID();
              setWorkbookName(name);
              setWorkbookId(nextWorkbookId);
              await saveWorkbook(name, nextWorkbookId);
              setToast(`已另存为“${name}”`);
            }}
          />

          <div className="card action-cluster workbook-utility-bar" style={{ marginTop: 8 }}>
            <button onClick={renameWorkbook}>修改表名</button>
            <button onClick={() => setShowColumnManager((value) => !value)}>
              {showColumnManager ? '收起列管理' : '列管理'}
            </button>
            <button onClick={() => insertRowsAt('before')}>上方插入行</button>
            <button onClick={() => insertRowsAt('after')}>下方插入行</button>
            <button onClick={deleteSelectedRows}>删除选中行</button>
            <button onClick={() => insertColumnsAt('before')}>左侧插入列</button>
            <button onClick={() => insertColumnsAt('after')}>右侧插入列</button>
            <button onClick={deleteSelectedColumns}>删除选中列</button>
            <button onClick={resetToCurrentDataset}>{isBlankWorkbook ? '恢复默认空表' : '恢复示例数据'}</button>
            {isRemoteSessionMode ? (
              <button
                onClick={async () => {
                  const name = prompt('输入保存后的结果集名称', `${workbookName}-结果集`);
                  if (!name?.trim()) return;
                  const savedDataset = await saveResultDataset(name.trim());
                  if (savedDataset) {
                    setToast(`结果集“${savedDataset.name}”保存成功`);
                  }
                }}
                disabled={isSavingResult || remoteMutationCount > 0}
              >
                {isSavingResult ? '保存结果集中...' : '保存结果集'}
              </button>
            ) : null}
            <button
              onClick={async () => {
                if (!(user.capabilities.canCopy && security.allowCopy)) return;
                await navigator.clipboard.writeText(JSON.stringify(maskedRows.slice(0, 20)));
                emit('copy', { rowCount: Math.min(maskedRows.length, 20) });
                setToast('已复制前20行');
              }}
            >
              复制前20行
            </button>
          </div>

          {showColumnManager ? (
            <div className="card" style={{ marginTop: 8 }}>
              <div className="inline-actions" style={{ marginBottom: 8 }}>
                <strong>列管理</strong>
                <span className="muted">勾选展示，取消勾选隐藏。</span>
              </div>
              <div className="column-manager-grid">
                {sheetFields.map((field) => {
                  const visible = !gridState.hiddenColumns.includes(field.fieldName);
                  return (
                    <label key={field.fieldName} className={`column-manager-chip${visible ? ' is-visible' : ''}`}>
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => updateGridState((state) => adapter.toggleColumn(state, field.fieldName))}
                      />
                      <span>{field.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="card action-cluster workbook-utility-bar" style={{ marginTop: 8 }}>
            <div className="inline-actions">
              <span className="muted">颜色标记</span>
              {CELL_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className="color-chip"
                  style={{
                    background: option.value,
                    color: '#172033',
                    boxShadow: selectedColor === option.value ? 'inset 0 0 0 2px #172033' : 'none',
                  }}
                  onClick={() => {
                    setSelectedColor(option.value);
                    applyColorToSelection(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
              <button className="button-secondary" onClick={() => applyColorToSelection(null)}>清除标记</button>
            </div>
            <span className="muted">双击第 1 行单元格可直接改列名，双击任意单元格可直接编辑，以 `=` 开头会按公式计算。</span>
          </div>

          <div className="card action-cluster workbook-filter-bar" style={{ marginTop: 8, alignItems: 'center' }}>
            <strong>当前筛选：</strong>
            <span className="muted">输入支持模糊查询，例如 `hb` 可匹配 `华北`。</span>
            {Object.entries(filters)
              .filter(([, value]) => value)
              .map(([fieldName, value]) => (
                <span key={fieldName} style={{ background: '#e2e8f0', borderRadius: 12, padding: '2px 8px' }}>
                  {fieldName}: {value}
                  <button
                    style={{ marginLeft: 6, background: '#64748b', padding: '2px 6px' }}
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, [fieldName]: '' }));
                      setPage(0);
                      setToast(`已移除筛选 ${fieldName}`);
                    }}
                  >
                    x
                  </button>
                </span>
              ))}
            <button
              onClick={() => {
                setFilters({});
                setPage(0);
                setToast('已清空所有筛选');
              }}
            >
              清空筛选
            </button>
          </div>

          <div className="card workbook-formula-bar" style={{ marginTop: 8 }}>
            <input
              className="workbook-name-box"
              value={nameBoxInput}
              onChange={(event) => setNameBoxInput(event.target.value.toUpperCase())}
              onBlur={() => setNameBoxInput(activeCell?.label ?? '')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  jumpToCell(nameBoxInput);
                }
                if (event.key === 'Escape') {
                  setNameBoxInput(activeCell?.label ?? '');
                }
              }}
              placeholder="A1"
              aria-label="当前单元格地址"
            />
            <span className="workbook-fx-label">fx</span>
            <input
              className="workbook-formula-input"
              ref={formulaInputRef}
              value={formulaInput}
              onFocus={() => {
                if (!activeCell) return;
                setFormulaTarget(createFormulaEditTarget(activeCell));
                setFormulaInput(activeCell.value);
                setIsFormulaEditing(true);
                setIsFormulaDirty(false);
                updateFormulaInputSelection();
              }}
              onChange={(event) => {
                setFormulaInput(event.target.value);
                setIsFormulaDirty(true);
                updateFormulaInputSelection(event.currentTarget);
              }}
              onSelect={() => updateFormulaInputSelection()}
              onClick={() => updateFormulaInputSelection()}
              onKeyUp={() => updateFormulaInputSelection()}
              onBlur={commitFormulaBarValue}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitFormulaBarValue();
                }
                if (event.key === 'Escape') {
                  cancelFormulaBarEdit();
                }
              }}
              placeholder="编辑当前单元格内容，公式以 = 开头"
              aria-label="当前单元格内容"
              disabled={!activeCell}
            />
          </div>

          <WorkbookShell
            fields={sheetFields}
            sourceRows={activeRows}
            displayRows={maskedRows}
            hiddenColumns={gridState.hiddenColumns}
            columnWidths={gridState.columnWidths}
            freeze={gridState.freeze}
            gridSelection={gridSelection}
            cellColors={visibleCellColors}
            rowOffset={isSnapshotMode ? 0 : page * PAGE_SIZE}
            isFormulaReferenceMode={isFormulaReferenceMode}
            onGridSelectionChange={setGridSelection}
            onGridPointerDown={() => {
              if (isFormulaReferenceMode) {
                pendingFormulaReferencePickRef.current = true;
              }
            }}
            onSelectCell={(columnIndex, rowIndex) => setGridSelection(createCellGridSelection(columnIndex, rowIndex))}
            onFormulaReferencePicked={handleFormulaReferencePicked}
            onEditCell={updateCellValue}
            onRenameColumn={renameColumn}
            scrollTarget={scrollTarget}
            onResizeColumn={(fieldName, width) => {
              updateGridState((state) => adapter.setColumnWidth(state, fieldName, width));
            }}
          />

          <div className="card workbook-footer-bar" style={{ marginTop: 8 }}>
            <div className="inline-actions">
              <button disabled={page === 0} onClick={() => setPage((current) => Math.max(current - 1, 0))}>上一页</button>
              <button disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>下一页</button>
              <span>当前第 {page + 1} 页 / 总行数 {totalRows.toLocaleString()}</span>
            </div>
            <span className="muted">`Shift` 选择连续行列，`Ctrl/Cmd` 追加选择，选中列后可在左右两侧插入新列。</span>
          </div>

          <footer className="card" style={{ marginTop: 8 }}>
            状态栏汇总: SUM={summary.sum.toFixed(2)} | AVG={summary.avg.toFixed(2)} | COUNT={summary.count}
          </footer>
        </SecurityGuard>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </Watermark>
  );
}
