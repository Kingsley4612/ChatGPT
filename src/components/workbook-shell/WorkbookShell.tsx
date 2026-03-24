import { useMemo, useState } from 'react';
import type { DatasetField } from '../../types/models';

interface Props {
  fields: DatasetField[];
  rows: Record<string, unknown>[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  freeze: { row: number; col: number };
  selectedCells: Set<string>;
  onSelectCell: (rowIndex: number, fieldName: string, multi: boolean) => void;
  onSort: (fieldName: string, order: 'asc' | 'desc') => void;
  onFilter: (fieldName: string, value: string) => void;
  onColumnWidthChange: (fieldName: string, width: number) => void;
}

export function WorkbookShell({
  fields,
  rows,
  hiddenColumns,
  columnWidths,
  freeze,
  selectedCells,
  onSelectCell,
  onSort,
  onFilter,
  onColumnWidthChange,
}: Props) {
  const [orderMap, setOrderMap] = useState<Record<string, 'asc' | 'desc'>>({});
  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenColumns.includes(f.fieldName)),
    [fields, hiddenColumns],
  );

  return (
    <div style={{ overflow: 'auto', border: '1px solid #ddd', marginTop: 8, maxHeight: 500 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
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
                  background: '#fafafa',
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
                    style={{ width: '94%' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onFilter(field.fieldName, (e.target as HTMLInputElement).value);
                    }}
                  />
                )}
                <input
                  type="range"
                  min={80}
                  max={360}
                  value={columnWidths[field.fieldName] ?? 140}
                  onChange={(e) => onColumnWidthChange(field.fieldName, Number(e.target.value))}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {visibleFields.map((field, colIndex) => {
                const key = `${idx}:${field.fieldName}`;
                const selected = selectedCells.has(key);
                return (
                  <td
                    key={field.fieldName}
                    onClick={(e) => onSelectCell(idx, field.fieldName, e.ctrlKey || e.metaKey)}
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
                    {String(row[field.fieldName] ?? '')}
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
