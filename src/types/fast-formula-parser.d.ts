declare module 'fast-formula-parser' {
  export interface FormulaPosition {
    row: number;
    col: number;
    sheet?: string;
  }

  export interface FormulaCellAddress {
    row: number;
    col: number;
    sheet?: string;
  }

  export interface FormulaRangeAddress {
    from: {
      row: number;
      col: number;
    };
    to: {
      row: number;
      col: number;
    };
    sheet?: string;
  }

  export interface FormulaParserConfig {
    onCell?: (ref: FormulaCellAddress) => unknown;
    onRange?: (ref: FormulaRangeAddress) => unknown[][];
    onVariable?: (name: string, sheetName?: string) => unknown;
    functions?: Record<string, (...args: unknown[]) => unknown>;
    functionsNeedContext?: Record<string, (...args: unknown[]) => unknown>;
  }

  export default class FormulaParser {
    constructor(config?: FormulaParserConfig);
    parse(inputText: string, position: FormulaPosition, allowReturnArray?: boolean): unknown;
  }
}
