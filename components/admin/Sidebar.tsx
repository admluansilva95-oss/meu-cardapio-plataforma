"use client";

import type { Restaurante } from "../../types";

export type AdminNavId = "pratos" | "preview" | "ajustes";

export interface SidebarNavItem {
  id: AdminNavId;
  label: string;
  description?: string;
}

const DEFAULT_ITEMS: SidebarNavItem[] = [
  { id: "pratos", label: "Cardápio", description: "Pratos deste restaurante" },
  { id: "preview", label: "WhatsApp", description: "Prévia do pedido" },
  { id: "ajustes", label: "Ajustes", description: "Dados do tenant" },
];

export interface SidebarProps {
  restaurante: Restaurante;
  items?: SidebarNavItem[];
  activeId: AdminNavId;
  onNavigate: (id: AdminNavId) => void;
}

export function Sidebar({
  restaurante,
  items = DEFAULT_ITEMS,
  activeId,
  onNavigate,
}: SidebarProps) {
  const accent = restaurante.cor_tema || "#0f766e";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="border-b border-slate-100 px-5 py-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 text-sm font-semibold text-slate-600 shadow-sm"
            style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent)` }}
          >
            {restaurante.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={restaurante.logo}
                alt={restaurante.nome}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden>{restaurante.nome.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {restaurante.nome}
            </p>
            <p className="truncate text-xs text-slate-500">/{restaurante.slug}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Painel administrativo">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={[
                "group flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition",
                active
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
              style={
                active
                  ? {
                      backgroundImage: `linear-gradient(135deg, ${accent}, #0f172a)`,
                    }
                  : undefined
              }
            >
              <span className="text-sm font-medium">{item.label}</span>
              {item.description ? (
                <span
                  className={[
                    "mt-0.5 text-xs",
                    active ? "text-white/80" : "text-slate-400 group-hover:text-slate-500",
                  ].join(" ")}
                >
                  {item.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
        Multitenant · painel admin
      </div>
    </aside>
  );
}
