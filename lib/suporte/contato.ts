import { buildWhatsappSendHref } from "@/lib/restaurante/whatsapp-href";

const FALLBACK_SUPORTE_WHATSAPP = "5511999999999";

/** Dígitos E.164 (BR) do WhatsApp corporativo de suporte. */
export function getSuporteWhatsappDigits(): string {
  const raw = process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP?.trim() ?? FALLBACK_SUPORTE_WHATSAPP;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits : FALLBACK_SUPORTE_WHATSAPP;
}

export function buildSuporteWhatsappHref(mensagem?: string): string {
  const texto =
    mensagem?.trim() ||
    "Olá! Preciso de ajuda com o painel Meu Cardápio.";
  return buildWhatsappSendHref(getSuporteWhatsappDigits(), texto);
}
