export function PedidosEmptyState() {
  return (
    <div className="flex min-h-[min(520px,calc(100vh-12rem))] flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.08] bg-white px-6 py-16 text-center shadow-[0_8px_30px_-16px_rgba(0,0,0,0.08)]">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f5f5f7] text-[#86868b] ring-1 ring-black/[0.04]"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664M6.75 7.5h-.75A2.25 2.25 0 0 0 3.75 9.75v7.5A2.25 2.25 0 0 0 6 19.5h2.25m9-13.5H18a2.25 2.25 0 0 1 2.25 2.25v7.5A2.25 2.25 0 0 1 18 19.5h-2.25"
          />
        </svg>
      </div>
      <h2 className="mt-8 text-lg font-semibold tracking-tight text-[#1d1d1f]">Tudo tranquilo por aqui!</h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#6e6e73]">
        Nenhum pedido pendente no momento.
      </p>
    </div>
  );
}
