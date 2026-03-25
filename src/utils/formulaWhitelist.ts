export const FORMULA_WHITELIST = [
  'SUM',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT',
  'IF',
  'ROUND',
  'CONCAT',
  'LEFT',
  'RIGHT',
  'TODAY',
  'YEAR',
  'MONTH',
  'DAY',
] as const;

export function isFormulaAllowed(formula: string): boolean {
  const normalized = formula.trim().toUpperCase();
  if (!normalized.startsWith('=')) return true;
  const fn = normalized.slice(1).split('(')[0];
  return (FORMULA_WHITELIST as readonly string[]).includes(fn);
}
