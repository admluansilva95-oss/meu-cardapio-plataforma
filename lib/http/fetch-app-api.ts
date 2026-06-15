import { clearBrowserAuthArtifacts } from "@/lib/auth/clear-client-auth-state";
import { notifyGlobalUnauthorized } from "@/lib/auth/global-unauthorized";
import { newClientRequestId } from "@/lib/http/client-request-id";
import { parseAppApiJsonResponse, type ParseAppApiJsonResult } from "@/lib/http/parse-app-api-json-response";
import { cloneHeadersLatin1Safe, latin1SafeFetch, sanitizeFetchInit } from "@/lib/fetch-latin1-safe";

export type { ParseAppApiJsonResult };
export { parseAppApiJsonResponse };

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 400 * 2 ** attempt);
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function isRetryableNetworkFailure(e: unknown): boolean {
  if (isAbortError(e)) return false;
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("ecconn") ||
    msg.includes("econnreset")
  );
}

function mergeRequestIdHeader(init: RequestInit): RequestInit {
  const merged = sanitizeFetchInit(init);
  const h = cloneHeadersLatin1Safe(merged.headers ?? undefined);
  if (!h.has("X-Request-ID")) {
    h.set("X-Request-ID", newClientRequestId());
  }
  return { ...merged, headers: h };
}

export type FetchAppApiInit = RequestInit & {
  /**
   * Só com `true`: 401/403 limpam cookies do dono e disparam `notifyGlobalUnauthorized`.
   * Por omissão `false` — evita deslogar por pings (`/api/build-info`, diagnostics), analytics
   * ou respostas transitórias enquanto a sessão ainda está a hidratar após reload.
   */
  appAuthCascade?: boolean;
};

/**
 * `fetch` para APIs **do próprio app** (mesma origem): cabeçalho `X-Request-ID`,
 * retry com backoff em 502/503/504 e falhas de rede transitórias.
 * Cascata global de sessão (401/403) só com `appAuthCascade: true` em rotas que o pedem.
 */
export async function fetchAppApiResilient(
  input: RequestInfo | URL,
  init?: FetchAppApiInit,
): Promise<Response> {
  const authCascade = Boolean(init?.appAuthCascade);
  const restInit: RequestInit | undefined =
    init == null
      ? undefined
      : (() => {
          const { appAuthCascade: _omit, ...r } = init;
          return Object.keys(r).length > 0 ? r : undefined;
        })();
  const wired = restInit == null ? undefined : mergeRequestIdHeader(restInit);
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await latin1SafeFetch(input, wired);
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      if (authCascade && (res.status === 401 || res.status === 403)) {
        clearBrowserAuthArtifacts();
        notifyGlobalUnauthorized(res.status === 401 ? 401 : 403);
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_ATTEMPTS - 1 && isRetryableNetworkFailure(e)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchAppApiResilient: falha desconhecida");
}

/**
 * `fetchAppApiResilient` + parsing seguro do corpo (não assume `application/json` nem usa `res.json()` cego).
 */
export async function fetchAppApiJson<T = unknown>(
  input: RequestInfo | URL,
  init?: FetchAppApiInit,
): Promise<ParseAppApiJsonResult<T>> {
  const res = await fetchAppApiResilient(input, init);
  return parseAppApiJsonResponse<T>(res);
}
