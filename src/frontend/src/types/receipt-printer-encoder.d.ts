// @point-of-sale/receipt-printer-encoder không có sẵn file .d.ts — khai
// báo tối thiểu cho các method thực tế dùng trong lib/printer.ts, đối
// chiếu trực tiếp với source thật (dist/receipt-printer-encoder.mjs)
// thay vì đoán, vì package không có type để tsc tự kiểm tra giúp.
declare module "@point-of-sale/receipt-printer-encoder" {
  export interface ReceiptEncoderOptions {
    language?: "esc-pos" | "star-prnt" | "star-line";
    columns?: 32 | 35 | 42 | 44 | 48;
    codepageMapping?: string | Record<string, number>;
  }

  export interface TableColumn {
    width: number;
    align?: "left" | "center" | "right";
    marginRight?: number;
  }

  type TableCell = string | ((encoder: ReceiptPrinterEncoder) => void);

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptEncoderOptions);
    initialize(): this;
    codepage(value: string): this;
    text(value: string): this;
    newline(value?: number): this;
    line(value: string): this;
    bold(value: boolean): this;
    underline(value: boolean): this;
    align(value: "left" | "center" | "right"): this;
    rule(options?: { style?: "single" | "double"; width?: number }): this;
    table(columns: TableColumn[], data: TableCell[][]): this;
    qrcode(
      value: string,
      model?: number,
      size?: number,
      errorlevel?: "l" | "m" | "q" | "h",
    ): this;
    cut(value?: "full" | "partial"): this;
    encode(): Uint8Array;
  }
}
