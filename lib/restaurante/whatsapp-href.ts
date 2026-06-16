import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

export type WhatsappSendHrefHost = "api" | "wa";

export type BuildWhatsappSendHrefOptions = {
  /**
   * `api` (padrão): api.whatsapp.com/send — mesmo modelo da vitrine (checkout).
   * `wa`: wa.me (opcional).
   */
  host?: WhatsappSendHrefHost;
};

function normalizarDigitosWhatsappBr(dRaw: string): string {
  let d = digitsOnly(dRaw);
  if (d.length === 11 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  if (d.length === 10 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  return d;
}

/**
 * URL só com ASCII (api.whatsapp.com) para abrir conversa com o número informado.
 * Mesmo padrão usado no checkout do cardápio público (`app/[slug]/page.tsx`).
 */
export function buildWhatsappSendHref(
  telefone: string,
  message: string,
  opts?: BuildWhatsappSendHrefOptions,
): string {
  const d = normalizarDigitosWhatsappBr(telefone);
  const text = encodeURIComponent(expandLatin1UserText(message));
  const host = opts?.host ?? "api";
  if (host === "wa") {
    return `https://wa.me/${d}?text=${text}`;
  }
  return `https://api.whatsapp.com/send?phone=${d}&text=${text}`;
}
