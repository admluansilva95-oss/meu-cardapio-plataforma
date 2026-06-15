/**
 * Lê o corpo de uma `Response` de APIs do próprio app (Next) de forma resiliente:
 * evita `response.json()` cego quando o servidor devolve `text/plain`, HTML ou texto cru.
 */

function normalizarUmaLinha(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function mensagemErroTextoPlanoOuHtml(status: number, snippet: string): string {
  const one = normalizarUmaLinha(snippet, 320);
  if (/content-type not acceptable|requested path is invalid/i.test(one)) {
    return (
      "O servidor recusou o formato do pedido ou o caminho da API. " +
      "Recarregue a página com atualização forçada (Ctrl+F5 / Cmd+Shift+R). " +
      "Se usar variáveis de ambiente, confirme que a URL do Supabase é só a base do projeto."
    );
  }
  if (one.length > 0) {
    return `O servidor respondeu: «${one}»${one.length >= 320 ? "…" : ""} (código ${status}).`;
  }
  return `O servidor respondeu com erro (${status}). Tente novamente.`;
}

function extrairMensagemDeObjetoJson(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  if (typeof o.error_description === "string" && o.error_description.trim()) {
    return o.error_description.trim();
  }
  if (o.error && typeof o.error === "object") {
    const nested = o.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
  }
  return null;
}

export type ParseAppApiJsonResult<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false;
      userMessage: string;
      status: number;
      technical?: string;
      /** Quando o servidor devolve 4xx/5xx com corpo JSON válido (ex.: 409 + `code: conflict`). */
      errorBody?: T;
    };

/**
 * Consome o corpo da resposta **uma vez** (`text()`), decide se é JSON e devolve dados ou mensagem em português.
 * Use após `fetch` / `fetchAppApiResilient` para rotas `/api/*` que devolvem JSON em caso de sucesso.
 */
export async function parseAppApiJsonResponse<T = unknown>(res: Response): Promise<ParseAppApiJsonResult<T>> {
  const status = res.status;
  const contentType = res.headers.get("content-type") ?? "";

  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return {
      ok: false,
      userMessage: "Não foi possível ler a resposta do servidor. Verifique a ligação e tente novamente.",
      status,
      technical: e instanceof Error ? e.message : String(e),
    };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    if (status >= 200 && status < 300) {
      return { ok: true, data: {} as T, status };
    }
    return {
      ok: false,
      userMessage: `O servidor devolveu uma resposta vazia com código ${status}. Tente novamente.`,
      status,
    };
  }

  const ct = contentType.toLowerCase();
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const declaresPlain =
    ct.includes("text/plain") && !ct.includes("json");
  const declaresHtml = ct.includes("text/html");

  if ((declaresPlain || declaresHtml) && !looksLikeJson) {
    return {
      ok: false,
      userMessage: mensagemErroTextoPlanoOuHtml(status, trimmed),
      status,
      technical: trimmed.slice(0, 800),
    };
  }

  if (!looksLikeJson && status >= 400) {
    return {
      ok: false,
      userMessage: mensagemErroTextoPlanoOuHtml(status, trimmed),
      status,
      technical: trimmed.slice(0, 800),
    };
  }

  try {
    const data = JSON.parse(trimmed) as T;
    if (status >= 200 && status < 300) {
      return { ok: true, data, status };
    }
    const fromObj = extrairMensagemDeObjetoJson(data);
    return {
      ok: false,
      userMessage: fromObj ?? `O pedido foi recusado (código ${status}).`,
      status,
      technical: trimmed.slice(0, 800),
      errorBody: data,
    };
  } catch {
    return {
      ok: false,
      userMessage:
        "A resposta do servidor não é JSON válido (por exemplo página HTML ou proxy a meio). " +
        "Atualize a página ou tente mais tarde.",
      status,
      technical: trimmed.slice(0, 800),
    };
  }
}
