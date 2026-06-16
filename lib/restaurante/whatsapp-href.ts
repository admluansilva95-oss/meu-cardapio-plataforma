import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

export type WhatsappSendHrefHost = "api" | "wa";

export type BuildWhatsappSendHrefOptions = {
  /**
   * `api` (padrão): api.whatsapp.com/send — bom para vitrine / webviews.
   * `wa`: wa.me — costuma abrir de forma mais estável a partir de separador preparado (about:blank) no painel.
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
 * URL só com ASCII para abrir conversa com o número informado.
 * Por padrão usa api.whatsapp.com (vitrine); use `{ host: "wa" }` no painel após `about:blank` + await.
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
