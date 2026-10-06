// Tiêu đề nhóm trường trong form khuyến mại (Thông tin, Thời gian áp dụng…).
export function FormHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="-mb-1 border-b border-border pb-1.5 text-sm font-semibold text-foreground">
      {children}
    </p>
  );
}
