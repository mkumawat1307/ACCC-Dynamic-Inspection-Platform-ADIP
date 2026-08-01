declare module "xlsx" {
  export interface CellAddress {
    r: number;
    c: number;
  }
  export interface Range {
    s: CellAddress;
    e: CellAddress;
  }
  export interface WorkSheet {
    [key: string]: unknown;
  }
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }
  export const utils: {
    aoa_to_sheet(data: (string | number)[][]): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name: string): void;
    sheet_to_json<T = Record<string, unknown>>(ws: WorkSheet, opts?: unknown): T[];
    encode_range(range: Range): string;
    encode_cell(cell: CellAddress): string;
  };
  export function write(wb: WorkBook, opts: { type: "base64"; bookType: "xlsx" }): string;
  export function read(data: unknown, opts: { type: "buffer" }): WorkBook;
}
