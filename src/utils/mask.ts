import type { DatasetField } from '../types/models';

export function maskValue(value: unknown, field: DatasetField): unknown {
  if (!field.sensitive || value == null) return value;
  const text = String(value);
  if (text.length <= 2) return '**';
  return `${text.slice(0, 1)}***${text.slice(-1)}`;
}
