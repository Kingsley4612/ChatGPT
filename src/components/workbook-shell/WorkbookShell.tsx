import { useMemo, useState } from 'react';
import type { DatasetField } from '../../types/models';

interface Props {
  fields: DatasetField[];
  rows: Record<string, unknown>[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  onSort: (fieldName: string, order: 'asc' | 'desc') => void;
  onFilter: (fieldName: string, value: string) => void;
}

export function WorkbookShell({ fields, rows, hiddenColumns, columnWidths, onSort, onFilter }: Props) {
  const [orderMap, setOrderMap] = useState<Record<string, 'asc' | 'desc'>>({});
  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenColumns.includes(f.fieldName)),
    [fields, hiddenColumns],
  );

  return (
    <div style={{ overflow: 'auto', border: '1px solid #ddd', marginTop: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {visibleFields.map((field) => (
              <th key={field.fieldName} style={{ border: '1px solid #eee', minWidth: columnWidths[field.fieldName] ?? 120 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span>{field.title}</span>
                  {field.sortable && (
                    <button
                      onClick={() => {
                        const next = orderMap[field.fieldName] === 'asc' ? 'desc' : 'asc';
                        setOrderMap((s) => ({ ...s, [field.fieldName]: next }));
                        onSort(field.fieldName, next);
                      }}
                    >
                      排序
                    </button>
                  )}
                </div>
                {field.filterable && (
                  <input
                    placeholder="筛选"
                    style={{ width: '90%' }}
                    onBlur={(e) => onFilter(field.fieldName, e.target.value)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {visibleFields.map((field) => (
                <td key={field.fieldName} style={{ border: '1px solid #f0f0f0', padding: 4 }}>
                  {String(row[field.fieldName] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
