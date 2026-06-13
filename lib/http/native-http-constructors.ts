/**
 * Referências aos construtores HTTP **nativos** do runtime, capturados antes de qualquer
 * monkey-patch em `installClientByteStringGuard`. `cloneHeadersLatin1Safe` e afins usam
 * estes símbolos para evitar recursão infinita quando `globalThis.Headers` é substituído.
 */

let captured = false;

export let NativeHeaders: typeof Headers | undefined;
export let NativeRequest: typeof Request | undefined;
export let NativeFormData: typeof FormData | undefined;
export let NativeFetch: typeof fetch | undefined;

/**
 * Idempotente — seguro chamar no servidor (só grava referências; não altera globals).
 */
export function ensureNativeHttpConstructorsCaptured(): void {
  if (captured) return;
  captured = true;
  if (typeof globalThis.Headers !== "undefined") NativeHeaders = globalThis.Headers;
  if (typeof globalThis.Request !== "undefined") NativeRequest = globalThis.Request;
  if (typeof globalThis.FormData !== "undefined") NativeFormData = globalThis.FormData;
  if (typeof globalThis.fetch === "function") NativeFetch = globalThis.fetch.bind(globalThis) as typeof fetch;
}

export function getNativeHeaders(): typeof Headers {
  ensureNativeHttpConstructorsCaptured();
  return NativeHeaders ?? globalThis.Headers;
}

export function getNativeRequest(): typeof Request {
  ensureNativeHttpConstructorsCaptured();
  return NativeRequest ?? globalThis.Request;
}

export function getNativeFormData(): typeof FormData {
  ensureNativeHttpConstructorsCaptured();
  return NativeFormData ?? globalThis.FormData;
}

/** Captura imediata ao carregar o módulo — deve ser o primeiro import do bootstrap do cliente. */
ensureNativeHttpConstructorsCaptured();
