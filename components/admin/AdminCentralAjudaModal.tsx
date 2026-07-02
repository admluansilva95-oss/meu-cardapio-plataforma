"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, MessageCircle, X } from "lucide-react";
import { buildSuporteWhatsappHref } from "@/lib/suporte/contato";

const FAQ_ITENS = [
  {
    id: "receber-pedidos",
    pergunta: "Como recebo pedidos da vitrine?",
    resposta:
      "Quando o cliente finaliza no cardápio público, o pedido entra na coluna Pendente do painel. Avance na esteira conforme prepara e entrega; nas etapas finais abrimos o WhatsApp do cliente com a mensagem pronta.",
  },
  {
    id: "pausar-cardapio",
    pergunta: "Como pauso o cardápio quando estiver fechado?",
    resposta:
      "Em Painel de configuração, use a opção de vitrine fechada e ajuste horários de funcionamento. Você também pode personalizar a mensagem exibida aos clientes enquanto o estabelecimento estiver indisponível.",
  },
  {
    id: "plano-pagamento",
    pergunta: "Como altero meu plano ou forma de pagamento?",
    resposta:
      "Abra Gerenciar assinatura no painel para ir ao portal Stripe. Lá você atualiza cartão, troca de Essencial para Premium ou consulta faturas. Após o pagamento, o status é sincronizado automaticamente.",
  },
] as const;

export type AdminCentralAjudaModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AdminCentralAjudaModal({ open, onClose }: AdminCentralAjudaModalProps) {
  const [abertoId, setAbertoId] = useState<string | null>(FAQ_ITENS[0]?.id ?? null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const suporteHref = buildSuporteWhatsappHref();

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="central-ajuda-titulo"
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-[0_24px_80px_-32px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Suporte
            </p>
            <h2 id="central-ajuda-titulo" className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">
              Central de Ajuda
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600">
              Respostas rápidas sobre operação do painel e atendimento aos clientes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Fechar Central de Ajuda"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-2">
            {FAQ_ITENS.map((item) => {
              const expandido = abertoId === item.id;
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/40"
                >
                  <button
                    type="button"
                    id={`faq-trigger-${item.id}`}
                    aria-expanded={expandido}
                    aria-controls={`faq-panel-${item.id}`}
                    onClick={() => setAbertoId((cur) => (cur === item.id ? null : item.id))}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-zinc-900 transition hover:bg-white/80"
                  >
                    <span>{item.pergunta}</span>
                    <ChevronDown
                      className={[
                        "h-4 w-4 shrink-0 text-zinc-500 transition-transform",
                        expandido ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden
                    />
                  </button>
                  {expandido ? (
                    <div
                      id={`faq-panel-${item.id}`}
                      role="region"
                      aria-labelledby={`faq-trigger-${item.id}`}
                      className="border-t border-zinc-200/70 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-600"
                    >
                      {item.resposta}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-zinc-100 px-5 py-4 sm:px-6">
          <a
            href={suporteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Chamar no WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
