/**
 * Log em uma linha JSON (grep-friendly em Vercel / Docker).
 * Não inclua dados sensíveis (tokens, PII completo).
 */
export function logStructured(
  level: "error" | "warn" | "info",
  tag: string,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    tag,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
