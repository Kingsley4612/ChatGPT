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
 * 一期先封装 Univer Adapter 接口，当前用 lightweight 实现保证 demo 可运行。
 * 后续替换为 @univerjs/* 实例化逻辑，不影响页面层。
 */
export class UniverAdapter {
  private state: UniverGridState;

  constructor(options: CreateWorkbookOptions) {
    this.state = {
      hiddenColumns: [],
      columnWidths: Object.fromEntries(options.fields.map((f) => [f.fieldName, 140])),
      freeze: { row: 1, col: 1 },
      activeSheet: options.sheets[0] ?? 'Sheet1',
    };
  }

  getState(): UniverGridState {
    return this.state;
  }

  toggleColumn(fieldName: string): void {
    this.state.hiddenColumns = this.state.hiddenColumns.includes(fieldName)
      ? this.state.hiddenColumns.filter((x) => x !== fieldName)
      : [...this.state.hiddenColumns, fieldName];
  }

  setColumnWidth(fieldName: string, width: number): void {
    this.state.columnWidths[fieldName] = width;
  }

  setFreeze(row: number, col: number): void {
    this.state.freeze = { row, col };
  }

  setActiveSheet(sheetName: string): void {
    this.state.activeSheet = sheetName;
  }

  validateFormula(formula: string): boolean {
    return isFormulaAllowed(formula);
  }
}
