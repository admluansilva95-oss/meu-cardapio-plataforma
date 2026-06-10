import { expandLatin1UserText } from "@/lib/restaurante/json-latin1-wire";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

/**
 * URL só com ASCII (api.whatsapp.com) para abrir conversa com o número informado.
 * Evita edge cases de `wa.me` em alguns webviews.
 */
export function buildWhatsappSendHref(telefone: string, message: string): string {
  let d = digitsOnly(telefone);
  if (d.length === 11 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  if (d.length === 10 && !d.startsWith("55")) {
    d = `55${d}`;
  }
  const text = encodeURIComponent(expandLatin1UserText(message));
  return `https://api.whatsapp.com/send?phone=${d}&text=${text}`;
}
