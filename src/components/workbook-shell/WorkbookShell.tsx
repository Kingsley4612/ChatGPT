import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import DataEditor, {
  CompactSelection,
  type DataEditorRef,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from '@glideapps/glide-data-grid';
import { getColumnLabel } from '../../services/dataset.service';
import type { DatasetField } from '../../types/models';

interface Props {
  fields: DatasetField[];
  sourceRows: Record<string, unknown>[];
  displayRows: Record<string, unknown>[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  freeze: { row: number; col: number };
  gridSelection: GridSelection;
  cellColors: Record<string, string>;
  rowOffset: number;
  scrollTarget: { col: number; row: number; token: number } | null;
  isFormulaReferenceMode: boolean;
  onGridSelectionChange: (selection: GridSelection) => void;
  onGridPointerDown: () => void;
  onSelectCell: (columnIndex: number, rowIndex: number) => void;
  onFormulaReferencePicked: (columnIndex: number, rowIndex: number) => void;
  onEditCell: (rowIndex: number, fieldName: string, value: string) => void;
  onRenameColumn: (fieldName: string, title: string) => void;
  onResizeColumn: (fieldName: string, width: number) => void;
}

interface HeaderEditorState {
  fieldName: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CellEditorState extends HeaderEditorState {
  rowIndex: number;
}

interface TextSelectionRange {
  start: number;
  end: number;
}

interface GridRange {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GROUP_HEADER_HEIGHT = 30;
const ROW_HEIGHT = 34;
const HEADER_ROW_INDEX = 0;
const ROW_MARKER_WIDTH = 44;

function focusInputToEnd(input: HTMLInputElement | null) {
  if (!input) return;
  const length = input.value.length;
  input.focus();
  input.setSelectionRange(length, length);
}

function buildCompactSelection(indexes: number[]): CompactSelection {
  return indexes.reduce((selection, index) => selection.add(index), CompactSelection.empty());
}

function clipRangeToLocal(range: GridRange, rowStart: number, rowCount: number): GridRange | null {
  const clippedStart = Math.max(range.y, rowStart);
  const clippedEnd = Math.min(range.y + range.height, rowStart + rowCount);

  if (clippedStart >= clippedEnd) return null;

  return {
    ...range,
    y: clippedStart - rowStart,
    height: clippedEnd - clippedStart,
  };
}

function translateRange(range: GridRange, rowOffset: number): GridRange {
  return {
    ...range,
    y: range.y + rowOffset,
  };
}

function mapSelectionToLocal(selection: GridSelection, rowStart: number, rowCount: number): GridSelection {
  const rows = buildCompactSelection(
    selection.rows.toArray().filter((rowIndex) => rowIndex >= rowStart && rowIndex < rowStart + rowCount).map((rowIndex) => rowIndex - rowStart),
  );

  if (!selection.current) {
    return {
      columns: selection.columns,
      rows,
    };
  }

  const [columnIndex, rowIndex] = selection.current.cell;
  if (rowIndex < rowStart || rowIndex >= rowStart + rowCount) {
    return {
      columns: selection.columns,
      rows,
    };
  }

  const currentRange = clipRangeToLocal(selection.current.range, rowStart, rowCount);
  if (!currentRange) {
    return {
      columns: selection.columns,
      rows,
    };
  }

  return {
    columns: selection.columns,
    rows,
    current: {
      cell: [columnIndex, rowIndex - rowStart],
      range: currentRange,
      rangeStack: selection.current.rangeStack
        .map((range) => clipRangeToLocal(range, rowStart, rowCount))
        .filter((range): range is GridRange => range !== null),
    },
  };
}

function mapSelectionToGlobal(selection: GridSelection, rowOffset: number): GridSelection {
  const rows = buildCompactSelection(selection.rows.toArray().map((rowIndex) => rowIndex + rowOffset));

  if (!selection.current) {
    return {
      columns: selection.columns,
      rows,
    };
  }

  return {
    columns: selection.columns,
    rows,
    current: {
      cell: [selection.current.cell[0], selection.current.cell[1] + rowOffset],
      range: translateRange(selection.current.range, rowOffset),
      rangeStack: selection.current.rangeStack.map((range) => translateRange(range, rowOffset)),
    },
  };
}

function insertReferenceAtSelection(value: string, reference: string, selection: TextSelectionRange): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const nextValue = `${value.slice(0, start)}${reference}${value.slice(end)}`;

  return {
    value: nextValue,
    caret: start + reference.length,
  };
}

function computeHorizontalScrollOffset(
  columnWidths: number[],
  firstVisibleColumnIndex: number,
  tx: number,
  frozenColumns: number,
): number {
  let offset = 0;

  for (let index = frozenColumns; index < firstVisibleColumnIndex; index += 1) {
    offset += columnWidths[index] ?? 0;
  }

  return Math.max(0, offset - tx);
}

export function WorkbookShell({
  fields,
  sourceRows,
  displayRows,
  hiddenColumns,
  columnWidths,
  freeze,
  gridSelection,
  cellColors,
  rowOffset: _rowOffset,
  scrollTarget,
  isFormulaReferenceMode,
  onGridSelectionChange,
  onGridPointerDown,
  onSelectCell,
  onFormulaReferencePicked,
  onEditCell,
  onRenameColumn,
  onResizeColumn,
}: Props) {
  const frozenGridRef = useRef<DataEditorRef>(null);
  const mainGridRef = useRef<DataEditorRef>(null);
  const [headerEditor, setHeaderEditor] = useState<HeaderEditorState | null>(null);
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const cellInputSelectionRef = useRef<TextSelectionRange>({ start: 0, end: 0 });
  const pendingCellReferencePickRef = useRef(false);

  const visibleFields = useMemo(
    () => fields.filter((field) => !hiddenColumns.includes(field.fieldName)),
    [fields, hiddenColumns],
  );

  const headerRow = useMemo(
    () => Object.fromEntries(visibleFields.map((field) => [field.fieldName, field.title])),
    [visibleFields],
  );

  const visibleSourceRows = useMemo(
    () => [headerRow, ...sourceRows],
    [headerRow, sourceRows],
  );

  const visibleDisplayRows = useMemo(
    () => [headerRow, ...displayRows],
    [displayRows, headerRow],
  );

  const columns = useMemo<GridColumn[]>(
    () =>
      visibleFields.map((field, index) => ({
        id: field.fieldName,
        title: '',
        group: getColumnLabel(index),
        width: columnWidths[field.fieldName] ?? 140,
      })),
    [columnWidths, visibleFields],
  );

  const columnPixelWidths = useMemo(
    () => visibleFields.map((field) => columnWidths[field.fieldName] ?? 140),
    [columnWidths, visibleFields],
  );

  const gridHeight = typeof window === 'undefined'
    ? 640
    : Math.max(520, Math.min(760, window.innerHeight - 250));
  const frozenColumnCount = freeze.col >= 1 ? 1 : 0;
  const frozenRowCount = freeze.row >= 1 && visibleDisplayRows.length > 0 ? 1 : 0;
  const hasFrozenRows = frozenRowCount > 0;
  const mainRowStart = frozenRowCount;
  const mainRowCount = Math.max(visibleDisplayRows.length - frozenRowCount, 0);
  const frozenPaneHeight = GROUP_HEADER_HEIGHT + (ROW_HEIGHT * frozenRowCount);
  const mainGridHeight = hasFrozenRows ? Math.max(0, gridHeight - frozenPaneHeight) : gridHeight;
  const isCellFormulaReferenceMode = Boolean(cellEditor && cellEditor.value.trim().startsWith('='));
  const activeFormulaReferenceMode = isCellFormulaReferenceMode ? 'cell' : isFormulaReferenceMode ? 'bar' : 'none';

  const updateCellInputSelection = (input: HTMLInputElement | null = cellInputRef.current) => {
    if (!input) return;

    const fallback = input.value.length;
    cellInputSelectionRef.current = {
      start: input.selectionStart ?? fallback,
      end: input.selectionEnd ?? fallback,
    };
  };

  useEffect(() => {
    if (!headerEditor) return;
    const frameId = requestAnimationFrame(() => {
      focusInputToEnd(headerInputRef.current);
    });
    return () => cancelAnimationFrame(frameId);
  }, [headerEditor]);

  useEffect(() => {
    if (!cellEditor) return;
    const frameId = requestAnimationFrame(() => {
      focusInputToEnd(cellInputRef.current);
      updateCellInputSelection();
    });
    return () => cancelAnimationFrame(frameId);
  }, [cellEditor]);

  useEffect(() => {
    if (!scrollTarget) return;

    if (scrollTarget.row < frozenRowCount) {
      frozenGridRef.current?.scrollTo(scrollTarget.col, scrollTarget.row, 'both', 40, 40);
      return;
    }

    mainGridRef.current?.scrollTo(scrollTarget.col, scrollTarget.row - frozenRowCount, 'both', 40, 40);
  }, [frozenRowCount, scrollTarget]);

  const commitHeaderRename = () => {
    if (!headerEditor) return;

    const nextTitle = headerEditor.value.trim();
    const fieldName = headerEditor.fieldName;
    setHeaderEditor(null);
    onRenameColumn(fieldName, nextTitle);
  };

  const commitCellEdit = () => {
    if (!cellEditor) return;
    if (pendingCellReferencePickRef.current) {
      pendingCellReferencePickRef.current = false;
      return;
    }

    const { fieldName, rowIndex, value } = cellEditor;
    setCellEditor(null);
    onEditCell(rowIndex, fieldName, value);
  };

  const getCellContent = ([columnIndex, rowIndex]: Item, rowStart = 0): GridCell => {
    const actualRowIndex = rowIndex + rowStart;
    const field = visibleFields[columnIndex];
    const rawValue = field ? visibleSourceRows[actualRowIndex]?.[field.fieldName] : '';
    const displayValue = field ? visibleDisplayRows[actualRowIndex]?.[field.fieldName] : '';
    const cellColor = field ? cellColors[`${actualRowIndex}:${field.fieldName}`] : undefined;
    const isHeaderRow = actualRowIndex === HEADER_ROW_INDEX;

    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      readonly: false,
      data: rawValue == null ? '' : String(rawValue),
      displayData: displayValue == null ? '' : String(displayValue),
      themeOverride: isHeaderRow
        ? {
            bgCell: cellColor ?? '#f8fafc',
            textDark: '#0f172a',
            horizontalBorderColor: '#cbd5e1',
          }
        : cellColor
          ? {
              bgCell: cellColor,
            }
          : undefined,
    };
  };

  const focusCellEditorAtCaret = (caret: number) => {
    requestAnimationFrame(() => {
      const input = cellInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(caret, caret);
      cellInputSelectionRef.current = { start: caret, end: caret };
    });
  };

  const insertReferenceIntoCellEditor = (columnIndex: number, rowIndex: number) => {
    const reference = `${getColumnLabel(columnIndex)}${rowIndex + 1}`;
    let nextCaret = 0;

    setCellEditor((prev) => {
      if (!prev) return prev;
      const inserted = insertReferenceAtSelection(prev.value, reference, cellInputSelectionRef.current);
      nextCaret = inserted.caret;
      return {
        ...prev,
        value: inserted.value,
      };
    });

    focusCellEditorAtCaret(nextCaret);
  };

  const openHeaderEditor = (editorRef: RefObject<DataEditorRef>, columnIndex: number, localRowIndex: number, rowStart: number) => {
    const field = visibleFields[columnIndex];
    if (!field) return;

    const bounds = editorRef.current?.getBounds(columnIndex, localRowIndex);
    if (!bounds) return;

    setCellEditor(null);
    onSelectCell(columnIndex, rowStart + localRowIndex);
    setHeaderEditor({
      fieldName: field.fieldName,
      value: field.title,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  };

  const openCellEditor = (editorRef: RefObject<DataEditorRef>, columnIndex: number, localRowIndex: number, rowStart: number) => {
    const actualRowIndex = localRowIndex + rowStart;
    if (actualRowIndex === HEADER_ROW_INDEX) {
      openHeaderEditor(editorRef, columnIndex, localRowIndex, rowStart);
      return;
    }

    const field = visibleFields[columnIndex];
    if (!field) return;

    const bounds = editorRef.current?.getBounds(columnIndex, localRowIndex);
    if (!bounds) return;

    setHeaderEditor(null);
    onSelectCell(columnIndex, actualRowIndex);
    setCellEditor({
      fieldName: field.fieldName,
      rowIndex: actualRowIndex,
      value: visibleSourceRows[actualRowIndex]?.[field.fieldName] == null ? '' : String(visibleSourceRows[actualRowIndex]?.[field.fieldName]),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  };

  const handleCellInteraction = (
    editorRef: RefObject<DataEditorRef>,
    columnIndex: number,
    localRowIndex: number,
    rowStart: number,
    interaction: 'click' | 'activate',
  ) => {
    if (columnIndex < 0 || localRowIndex < 0) return;

    const rowIndex = localRowIndex + rowStart;
    setHeaderEditor(null);

    if (activeFormulaReferenceMode === 'cell') {
      onSelectCell(columnIndex, rowIndex);
      insertReferenceIntoCellEditor(columnIndex, rowIndex);
      return;
    }

    if (activeFormulaReferenceMode === 'bar') {
      onSelectCell(columnIndex, rowIndex);
      onFormulaReferencePicked(columnIndex, rowIndex);
      return;
    }

    if (interaction === 'click') {
      onSelectCell(columnIndex, rowIndex);
      return;
    }

    openCellEditor(editorRef, columnIndex, localRowIndex, rowStart);
  };

  const handleVisibleRegionChanged = (firstVisibleColumnIndex: number, tx: number) => {
    setScrollX(computeHorizontalScrollOffset(columnPixelWidths, firstVisibleColumnIndex, tx, frozenColumnCount));
  };

  const renderEditor = ({
    editorRef,
    rowStart,
    rowCount,
    height,
    showGroups,
    rowMarkerStartIndex,
    className,
  }: {
    editorRef: RefObject<DataEditorRef>;
    rowStart: number;
    rowCount: number;
    height: number;
    showGroups: boolean;
    rowMarkerStartIndex: number;
    className?: string;
  }) => {
    const localSelection = mapSelectionToLocal(gridSelection, rowStart, rowCount);

    return (
      <DataEditor
        ref={editorRef}
        className={className}
        columns={columns}
        rows={rowCount}
        getCellContent={(item) => getCellContent(item, rowStart)}
        gridSelection={localSelection}
        onGridSelectionChange={(selection) => onGridSelectionChange(mapSelectionToGlobal(selection, rowStart))}
        onVisibleRegionChanged={(range, tx) => handleVisibleRegionChanged(range.x, tx)}
        onCellClicked={([columnIndex, rowIndex]) => {
          handleCellInteraction(editorRef, columnIndex, rowIndex, rowStart, 'click');
        }}
        onCellActivated={([columnIndex, rowIndex]) => {
          handleCellInteraction(editorRef, columnIndex, rowIndex, rowStart, 'activate');
        }}
        onColumnResize={(column, newSize) => {
          const fieldName = typeof column.id === 'string' ? column.id : String(column.title);
          onResizeColumn(fieldName, newSize);
        }}
        cellActivationBehavior="double-click"
        groupHeaderHeight={showGroups ? GROUP_HEADER_HEIGHT : 0}
        headerHeight={0}
        rowHeight={ROW_HEIGHT}
        freezeColumns={frozenColumnCount}
        rowMarkers={{ kind: 'clickable-number', startIndex: rowMarkerStartIndex, width: ROW_MARKER_WIDTH }}
        rowSelect="multi"
        columnSelect="multi"
        rangeSelect="multi-rect"
        smoothScrollX
        smoothScrollY
        scrollOffsetX={scrollX}
        width="100%"
        height={height}
      />
    );
  };

  return (
    <div
      className="card workbook-grid-shell"
      style={{ overflow: 'hidden', marginTop: 8, padding: 0 }}
      onMouseDownCapture={() => {
        if (activeFormulaReferenceMode === 'cell') {
          pendingCellReferencePickRef.current = true;
          return;
        }

        if (activeFormulaReferenceMode === 'bar') {
          onGridPointerDown();
        }
      }}
    >
      {hasFrozenRows
        ? (
            <>
              {renderEditor({
                editorRef: frozenGridRef,
                rowStart: 0,
                rowCount: frozenRowCount,
                height: mainRowCount > 0 ? frozenPaneHeight : gridHeight,
                showGroups: true,
                rowMarkerStartIndex: 1,
                className: 'workbook-grid-pane workbook-grid-pane--frozen',
              })}
              {mainRowCount > 0
                ? renderEditor({
                    editorRef: mainGridRef,
                    rowStart: mainRowStart,
                    rowCount: mainRowCount,
                    height: mainGridHeight,
                    showGroups: false,
                    rowMarkerStartIndex: mainRowStart + 1,
                    className: 'workbook-grid-pane workbook-grid-pane--main',
                  })
                : null}
            </>
          )
        : renderEditor({
            editorRef: mainGridRef,
            rowStart: 0,
            rowCount: visibleDisplayRows.length,
            height: gridHeight,
            showGroups: true,
            rowMarkerStartIndex: 1,
            className: 'workbook-grid-pane workbook-grid-pane--main',
          })}
      {typeof document !== 'undefined' && headerEditor
        ? createPortal(
            <input
              ref={headerInputRef}
              className="workbook-header-editor"
              style={{
                left: headerEditor.x,
                top: headerEditor.y,
                width: headerEditor.width,
                height: headerEditor.height,
              }}
              value={headerEditor.value}
              onChange={(event) =>
                setHeaderEditor((prev) => (prev ? { ...prev, value: event.target.value } : prev))
              }
              onBlur={commitHeaderRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitHeaderRename();
                }
                if (event.key === 'Escape') {
                  setHeaderEditor(null);
                }
              }}
            />,
            document.body,
          )
        : null}
      {typeof document !== 'undefined' && cellEditor
        ? createPortal(
            <input
              ref={cellInputRef}
              className="workbook-header-editor workbook-cell-editor"
              style={{
                left: cellEditor.x,
                top: cellEditor.y,
                width: cellEditor.width,
                height: cellEditor.height,
              }}
              value={cellEditor.value}
              onChange={(event) => {
                setCellEditor((prev) => (prev ? { ...prev, value: event.target.value } : prev));
                updateCellInputSelection(event.currentTarget);
              }}
              onFocus={() => updateCellInputSelection()}
              onSelect={() => updateCellInputSelection()}
              onClick={() => updateCellInputSelection()}
              onKeyUp={() => updateCellInputSelection()}
              onBlur={commitCellEdit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitCellEdit();
                }
                if (event.key === 'Escape') {
                  setCellEditor(null);
                }
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
