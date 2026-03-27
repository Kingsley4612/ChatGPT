import FormulaParser, {
  type FormulaCellAddress,
  type FormulaPosition,
  type FormulaRangeAddress,
} from 'fast-formula-parser';
import type { DatasetField } from '../types/models';

const FORMULA_SHEET_NAME = 'Sheet1';
const FORMULA_ERROR = '#ERROR!';
const FORMULA_SPILL_ERROR = '#SPILL!';
const FORMULA_CYCLE_ERROR = '#CYCLE!';

function isFormulaExpression(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('=');
}

function normalizeSourceCellValue(value: unknown): unknown {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function normalizeFormulaError(error: unknown): string {
  if (error instanceof Error) {
    const match = `${error.name} ${error.message}`.match(/#(?:DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|ERROR!)/);
    return match?.[0] ?? FORMULA_ERROR;
  }
  if (typeof error === 'string') {
    const match = error.match(/#(?:DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|ERROR!)/);
    return match?.[0] ?? FORMULA_ERROR;
  }
  return FORMULA_ERROR;
}

function unwrapFormulaResult(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (!value.length) return '';

  const [firstRow] = value;
  if (!Array.isArray(firstRow)) return value;
  if (value.length === 1 && firstRow.length === 1) {
    return unwrapFormulaResult(firstRow[0]);
  }

  return FORMULA_SPILL_ERROR;
}

function normalizeFormulaResult(value: unknown): unknown {
  const unwrapped = unwrapFormulaResult(value);

  if (unwrapped == null) return '';
  if (typeof unwrapped === 'number') {
    return Number.isFinite(unwrapped) ? unwrapped : '#NUM!';
  }
  if (typeof unwrapped === 'string' || typeof unwrapped === 'boolean') {
    return unwrapped;
  }
  if (unwrapped instanceof Date) {
    return unwrapped.toISOString();
  }
  return String(unwrapped);
}

function buildRawMatrix(rows: Record<string, unknown>[], fields: DatasetField[]): unknown[][] {
  return rows.map((row) => fields.map((field) => normalizeSourceCellValue(row[field.fieldName])));
}

function buildHeaderMatrixRow(fields: DatasetField[]): unknown[] {
  return fields.map((field) => field.title);
}

export function evaluateFormulaRows(
  rows: Record<string, unknown>[],
  fields: DatasetField[],
): Record<string, unknown>[] {
  if (!rows.length || !fields.length) return rows;

  const rawMatrix = [buildHeaderMatrixRow(fields), ...buildRawMatrix(rows, fields)];
  const hasFormula = rawMatrix.slice(1).some((row) => row.some((value) => isFormulaExpression(value)));
  if (!hasFormula) return rows;

  const parser = new FormulaParser({
    onCell: (ref: FormulaCellAddress) => getCellValue(ref.row - 1, ref.col - 1),
    onRange: (ref: FormulaRangeAddress) => getRangeValues(ref),
  });

  const cache = new Map<string, unknown>();
  const visiting = new Set<string>();

  function getCellValue(rowIndex: number, columnIndex: number): unknown {
    if (rowIndex < 0 || columnIndex < 0 || rowIndex >= rawMatrix.length || columnIndex >= fields.length) {
      return '';
    }

    const cacheKey = `${rowIndex}:${columnIndex}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    if (visiting.has(cacheKey)) {
      return FORMULA_CYCLE_ERROR;
    }

    const rawValue = rawMatrix[rowIndex][columnIndex];
    if (rowIndex === 0) {
      cache.set(cacheKey, rawValue);
      return rawValue;
    }

    if (!isFormulaExpression(rawValue)) {
      cache.set(cacheKey, rawValue);
      return rawValue;
    }

    const formulaBody = rawValue.trim().slice(1);
    if (!formulaBody) {
      cache.set(cacheKey, '');
      return '';
    }

    visiting.add(cacheKey);
    let result: unknown;

    try {
      const position: FormulaPosition = {
        row: rowIndex + 1,
        col: columnIndex + 1,
        sheet: FORMULA_SHEET_NAME,
      };
      result = parser.parse(formulaBody, position, true);
    } catch (error) {
      result = normalizeFormulaError(error);
    } finally {
      visiting.delete(cacheKey);
    }

    const normalized = normalizeFormulaResult(result);
    cache.set(cacheKey, normalized);
    return normalized;
  }

  function getRangeValues(ref: FormulaRangeAddress): unknown[][] {
    const values: unknown[][] = [];

    for (let row = ref.from.row; row <= ref.to.row; row += 1) {
      const rowValues: unknown[] = [];
      for (let col = ref.from.col; col <= ref.to.col; col += 1) {
        rowValues.push(getCellValue(row - 1, col - 1));
      }
      values.push(rowValues);
    }

    return values;
  }

  return rows.map((row, rowIndex) =>
    Object.fromEntries(
      fields.map((field, columnIndex) => [field.fieldName, getCellValue(rowIndex + 1, columnIndex) ?? row[field.fieldName]]),
    ),
  );
}
