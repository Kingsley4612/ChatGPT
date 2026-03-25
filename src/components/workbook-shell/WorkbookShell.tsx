import { useMemo, useState } from 'react';
import type { DatasetField } from '../../types/models';

interface Props {
  fields: DatasetField[];
  rows: Record<string, unknown>[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  freeze: { row: number; col: number };
  selectedCells: Set<string>;
  onSelectRange: (startRow: number, endRow: number, startField: string, endField: string, append: boolean) => void;
  onSort: (fieldName: string, order: 'asc' | 'desc') => void;
  onFilter: (fieldName: string, value: string) => void;
  filterValues: Record<string, string>;
  onEditCell: (rowIndex: number, fieldName: string, value: string) => void;
}

export function WorkbookShell({
  fields,
  rows,
  hiddenColumns,
  columnWidths,
  freeze,
  selectedCells,
  onSelectRange,
  onSort,
  onFilter,
  filterValues,
  onEditCell,
}: Props) {
  const [orderMap, setOrderMap] = useState<Record<string, 'asc' | 'desc'>>({});
  const [editing, setEditing] = useState<{ row: number; field: string } | null>(null);
  const [dragStart, setDragStart] = useState<{ row: number; field: string; append: boolean } | null>(null);
  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenColumns.includes(f.fieldName)),
    [fields, hiddenColumns],
  );

  return (
    <div className="card" style={{ overflow: 'auto', marginTop: 8, maxHeight: 500, padding: 0 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', userSelect: 'none' }}>
        <thead>
          <tr>
            {visibleFields.map((field, index) => (
              <th
                key={field.fieldName}
                style={{
                  border: '1px solid #eee',
                  minWidth: columnWidths[field.fieldName] ?? 120,
                  width: columnWidths[field.fieldName] ?? 120,
                  position: freeze.row >= 1 ? 'sticky' : 'static',
                  top: 0,
                  zIndex: 3,
                  background: '#eff6ff',
                  left: freeze.col >= 1 && index === 0 ? 0 : undefined,
                }}
              >
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{field.title}</span>
                  {field.sortable && (
                    <button
                      onClick={() => {
                        const next = orderMap[field.fieldName] === 'asc' ? 'desc' : 'asc';
                        setOrderMap((s) => ({ ...s, [field.fieldName]: next }));
                        onSort(field.fieldName, next);
                      }}
                    >
                      {orderMap[field.fieldName] === 'asc' ? '↑' : '↓'}
                    </button>
                  )}
                </div>
                {field.filterable && (
                  <input
                    placeholder="筛选"
                    value={filterValues[field.fieldName] ?? ''}
                    style={{ width: '94%' }}
                    onChange={(e) => onFilter(field.fieldName, e.target.value)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody onMouseUp={() => setDragStart(null)}>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {visibleFields.map((field, colIndex) => {
                const key = `${idx}:${field.fieldName}`;
                const selected = selectedCells.has(key);
                const isEditing = editing?.row === idx && editing.field === field.fieldName;
                return (
                  <td
                    key={field.fieldName}
                    onMouseDown={(e) => {
                      const append = e.ctrlKey || e.metaKey;
                      setDragStart({ row: idx, field: field.fieldName, append });
                      onSelectRange(idx, idx, field.fieldName, field.fieldName, append);
                    }}
                    onMouseEnter={() => {
                      if (!dragStart) return;
                      onSelectRange(dragStart.row, idx, dragStart.field, field.fieldName, dragStart.append);
                    }}
                    onDoubleClick={() => setEditing({ row: idx, field: field.fieldName })}
                    style={{
                      border: '1px solid #f0f0f0',
                      padding: 4,
                      cursor: 'cell',
                      background: selected ? '#dbeafe' : 'white',
                      position: freeze.col >= 1 && colIndex === 0 ? 'sticky' : 'static',
                      left: freeze.col >= 1 && colIndex === 0 ? 0 : undefined,
                      zIndex: freeze.col >= 1 && colIndex === 0 ? 2 : 1,
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        defaultValue={String(row[field.fieldName] ?? '')}
                        onBlur={(e) => {
                          onEditCell(idx, field.fieldName, e.target.value);
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onEditCell(idx, field.fieldName, (e.target as HTMLInputElement).value);
                            setEditing(null);
                          }
                        }}
                      />
                    ) : (
                      String(row[field.fieldName] ?? '')
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
