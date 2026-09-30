// CustomerTable — bảng khách hàng thật (group theo SĐT), khác với
// BranchTable (group theo chi nhánh). Nguồn: AnalyticsResponse.customers.top.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface CustomerTableRow {
  phone: string;
  name: string;
  orderCount: number;
  totalSpent: number;
}

export interface CustomerTableProps {
  data: CustomerTableRow[];
  testId?: string;
}

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CustomerTable({ data, testId }: CustomerTableProps) {
  if (data.length === 0) {
    return (
      <div
        data-ocid={testId ?? "customer_table.empty_state"}
        className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        Chưa có dữ liệu khách hàng.
      </div>
    );
  }

  return (
    <div data-ocid={testId ?? "customer_table"} className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Khách hàng</TableHead>
            <TableHead>Số điện thoại</TableHead>
            <TableHead className="text-right">Số đơn</TableHead>
            <TableHead className="text-right">Tổng chi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={row.phone} data-ocid={`customer_table.row.${i + 1}`}>
              <TableCell className="font-medium text-foreground">
                {row.name || "Khách vãng lai"}
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {row.phone}
              </TableCell>
              <TableCell className="text-right font-mono">
                {row.orderCount}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatVnd(row.totalSpent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
