// BranchTable — bảng doanh thu theo chi nhánh (chuỗi Bún Bò Huế 65 có nhiều
// cửa hàng). Nguồn dữ liệu: AnalyticsResponse.byRestaurant, tên chi nhánh
// được AnalyticsDashboard.tsx đối chiếu với danh sách nhà hàng thật (canister
// getRestaurants) trước khi truyền vào đây — xem AnalyticsDashboard.tsx.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BranchTableRow {
  restaurantId: string;
  name: string;
  address?: string;
  orderCount: number;
  totalRevenue: number;
}

export interface BranchTableProps {
  data: BranchTableRow[];
  testId?: string;
}

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function BranchTable({ data, testId }: BranchTableProps) {
  if (data.length === 0) {
    return (
      <div
        data-ocid={testId ?? "branch_table.empty_state"}
        className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        Chưa có dữ liệu chi nhánh.
      </div>
    );
  }

  return (
    <div data-ocid={testId ?? "branch_table"} className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Chi nhánh</TableHead>
            <TableHead>Địa chỉ</TableHead>
            <TableHead className="text-right">Số đơn</TableHead>
            <TableHead className="text-right">Doanh thu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow
              key={row.restaurantId}
              data-ocid={`branch_table.row.${i + 1}`}
            >
              <TableCell className="font-medium text-foreground">
                {row.name}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.address || "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {row.orderCount}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatVnd(row.totalRevenue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
