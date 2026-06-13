/**
 * ID por chamada HTTP no browser (correlação com logs do servidor).
 */
export function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
