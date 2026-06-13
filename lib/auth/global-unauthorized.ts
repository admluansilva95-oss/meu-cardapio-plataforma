type Handler = (status: 401 | 403) => void | Promise<void>;

let handler: Handler | null = null;

/** Registado pelo painel admin (uma vez por montagem). */
export function setGlobalUnauthorizedHandler(next: Handler | null): void {
  handler = next;
}

export function notifyGlobalUnauthorized(status: 401 | 403): void {
  const h = handler;
  if (!h) return;
  try {
    void Promise.resolve(h(status));
  } catch {
    /* ignore */
  }
}
