import { NextResponse } from "next/server";
import { cloneHeadersLatin1Safe } from "@/lib/fetch-latin1-safe";
import { httpReasonPhraseForStatus, latin1CookieWrite } from "@/lib/http/byte-string-http";

/**
 * Escudo de saída (Edge / middleware / rotas): garante que **cabeçalhos** e `statusText`
 * nunca levem caracteres fora de Latin-1 (ByteString / Chromium). O corpo não é reescrito
 * (JSON com Unicode no body continua válido).
 *
 * Reconstrói a resposta para forçar `statusText` canónico ASCII e cabeçalhos via
 * `cloneHeadersLatin1Safe`. Copia cookies já anexados ao `NextResponse` de origem.
 */
export function nextResponseWithByteStringSafeWire(source: NextResponse): NextResponse {
  const status = source.status;
  const headers = cloneHeadersLatin1Safe(source.headers);
  const out = new NextResponse(source.body, {
    status,
    statusText: httpReasonPhraseForStatus(status),
    headers,
  });

  for (const c of source.cookies.getAll()) {
    const w = latin1CookieWrite({
      name: c.name,
      value: c.value,
      options: {},
    });
    out.cookies.set(w.name, w.value, w.options);
  }

  return out;
}
