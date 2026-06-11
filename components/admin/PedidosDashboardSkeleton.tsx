function SkeletonPulse({ className }: { className?: string }) {
  return <div className={["animate-pulse rounded-xl bg-[#e2e2e7]", className ?? ""].join(" ")} />;
}

function KpiSkeletonRow({ compact }: { compact?: boolean }) {
  const grid = compact
    ? "grid grid-cols-1 gap-3"
    : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
  return (
    <div className={compact ? "" : "mb-6"}>
      <div className={grid}>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.1)] sm:p-5"
          >
            <SkeletonPulse className="h-3 w-24 rounded-md" />
            <SkeletonPulse className="mt-4 h-9 w-36 rounded-lg" />
            <SkeletonPulse className="mt-3 h-3 w-full max-w-[11rem] rounded-md opacity-80" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <section className="flex min-h-[min(70vh,520px)] flex-col rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)]">
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)] lg:gap-8 lg:items-start">
      <div className="order-2 min-w-0 space-y-4 lg:order-1">{grid}</div>
      <aside className="order-1 w-full space-y-4 lg:sticky lg:top-6 lg:order-2 lg:min-w-0 lg:self-start">
        <div className="rounded-2xl border border-zinc-100/80 bg-white/90 p-1 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.08)] backdrop-blur-sm">
          <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Resumo financeiro
          </p>
          <div className="p-3 pt-1">
            <KpiSkeletonRow compact />
          </div>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.08)] sm:p-5">
          <SkeletonPulse className="h-3 w-28 rounded-md" />
          <SkeletonPulse className="mt-3 h-4 w-48 rounded-md" />
          <div className="mt-4 space-y-2">
            <SkeletonPulse className="h-12 w-full rounded-xl" />
            <SkeletonPulse className="h-12 w-full rounded-xl opacity-90" />
            <SkeletonPulse className="h-12 w-full rounded-xl opacity-80" />
          </div>
        </div>
      </aside>
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
