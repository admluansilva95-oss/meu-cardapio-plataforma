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

/** Telefone do cliente (mascarado ou não) após normalização BR para WhatsApp. */
export function telefoneWhatsappClienteValidoParaWa(telefoneRaw: string): boolean {
  const d = normalizarDigitosWhatsappBr(telefoneRaw);
  return d.length >= 12 && d.length <= 15 && /^\d+$/.test(d);
}

/**
 * URL absoluta para abrir conversa no WhatsApp (só ASCII na query).
 * Usa `URL`/`searchParams` para não corromper o `text` (evita abrir URL errada / site local).
 */
export function buildWhatsappSendHref(
  telefone: string,
  message: string,
  opts?: BuildWhatsappSendHrefOptions,
): string {
  const d = normalizarDigitosWhatsappBr(telefone);
  const plain = expandLatin1UserText(message);
  const host = opts?.host ?? "api";
  if (host === "wa") {
    const u = new URL(`https://wa.me/${d}`);
    u.searchParams.set("text", plain);
    return u.toString();
  }
  const u = new URL("https://api.whatsapp.com/send");
  u.searchParams.set("phone", d);
  u.searchParams.set("text", plain);
  return u.toString();
}
