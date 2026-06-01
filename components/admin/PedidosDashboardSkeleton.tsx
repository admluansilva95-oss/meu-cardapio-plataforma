function SkeletonPulse({ className }: { className?: string }) {
  return <div className={["animate-pulse rounded-xl bg-[#e2e2e7]", className ?? ""].join(" ")} />;
}

function KpiSkeletonRow() {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.1)]"
        >
          <SkeletonPulse className="h-3 w-24 rounded-md" />
          <SkeletonPulse className="mt-4 h-9 w-36 rounded-lg" />
          <SkeletonPulse className="mt-3 h-3 w-full max-w-[11rem] rounded-md opacity-80" />
        </div>
      ))}
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)]">
      <div className="mb-4 rounded-xl bg-[#f5f5f7] px-3 py-3 ring-1 ring-black/[0.04]">
        <div className="flex items-center justify-between gap-2">
          <SkeletonPulse className="h-4 w-24" />
          <SkeletonPulse className="h-5 w-8 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <SkeletonPulse className="h-24 w-full" />
        <SkeletonPulse className="h-24 w-full" />
        <SkeletonPulse className="h-20 w-full opacity-80" />
      </div>
    </section>
  );
}

type PedidosDashboardSkeletonProps = {
  /** Full page (antes do restaurante carregar) ou só a área da esteira (refresh). */
  variant?: "full" | "embedded";
};

export function PedidosDashboardSkeleton({ variant = "full" }: PedidosDashboardSkeletonProps) {
  const grid = (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
      <ColumnSkeleton />
      <ColumnSkeleton />
      <ColumnSkeleton />
      <ColumnSkeleton />
    </div>
  );

  const embedded = (
    <div className="flex flex-col gap-5">
      <KpiSkeletonRow />
      {grid}
    </div>
  );

  if (variant === "embedded") {
    return embedded;
  }

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] font-sans antialiased">
      <aside className="hidden w-56 shrink-0 border-r border-black/[0.06] bg-[#fbfbfd] p-5 sm:block">
        <SkeletonPulse className="h-8 w-32 rounded-lg" />
        <div className="mt-8 space-y-3">
          <SkeletonPulse className="h-9 w-full rounded-lg" />
          <SkeletonPulse className="h-9 w-full rounded-lg opacity-70" />
          <SkeletonPulse className="h-9 w-full rounded-lg opacity-50" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-black/[0.06] bg-[#fbfbfd]/95 px-5 py-5 backdrop-blur-xl sm:px-8">
          <SkeletonPulse className="h-7 w-48 max-w-full" />
          <SkeletonPulse className="mt-3 h-4 w-64 max-w-full opacity-80" />
        </header>
        <div className="flex-1 overflow-auto px-4 py-6 sm:px-8">{embedded}</div>
      </div>
    </div>
  );
}
