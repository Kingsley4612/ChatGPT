import type { DatasetField } from '../../types/models';
import { isFormulaAllowed } from '../../utils/formulaWhitelist';

export interface UniverGridState {
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  freeze: { row: number; col: number };
  activeSheet: string;
}

export interface CreateWorkbookOptions {
  fields: DatasetField[];
  sheets: string[];
}

/**
 * Univer 适配层（MVP）：提供与页面解耦的数据结构与能力。
 * 当前实现是轻量状态变换器；可在后续替换为 @univerjs/* 实例而不改页面调用。
 */
export class UniverAdapter {
  readonly initialState: UniverGridState;

  constructor(options: CreateWorkbookOptions) {
    this.initialState = {
      hiddenColumns: [],
      columnWidths: Object.fromEntries(options.fields.map((f) => [f.fieldName, 140])),
      freeze: { row: 0, col: 0 },
      activeSheet: options.sheets[0] ?? 'Sheet1',
    };
  }

  toggleColumn(state: UniverGridState, fieldName: string): UniverGridState {
    return {
      ...state,
      hiddenColumns: state.hiddenColumns.includes(fieldName)
        ? state.hiddenColumns.filter((x) => x !== fieldName)
        : [...state.hiddenColumns, fieldName],
    };
  }

  setColumnWidth(state: UniverGridState, fieldName: string, width: number): UniverGridState {
    return {
      ...state,
      columnWidths: {
        ...state.columnWidths,
        [fieldName]: Math.max(80, Math.min(360, width)),
      },
    };
  }

  setFreeze(state: UniverGridState, row: number, col: number): UniverGridState {
    return {
      ...state,
      freeze: { row, col },
    };
  }

  setActiveSheet(state: UniverGridState, sheetName: string): UniverGridState {
    return {
      ...state,
      activeSheet: sheetName,
    };
  }

  validateFormula(formula: string): boolean {
    return isFormulaAllowed(formula);
  }
}
