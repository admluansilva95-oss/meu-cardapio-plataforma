/**
 * Log em uma linha JSON (grep-friendly em Vercel / Docker).
 * Em produção, aplica redação superficial em chaves e strings (senhas, Bearer, chaves Stripe).
 * Mesmo assim, evite enviar PII ou corpos de requisição em `fields`.
 */

function sanitizeScalarString(s: string): string {
  let out = s;
  if (/sk_(live|test)_[^\s"'<>]+/i.test(out)) {
    out = out.replace(/sk_(live|test)_[^\s"'<>]+/gi, "[REDACTED_STRIPE]");
  }
  if (/Bearer\s+[^\s]+/i.test(out)) {
    out = out.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]");
  }
  return out;
}

const SENSITIVE_KEY =
  /^(password|senha|secret|token|accesstoken|refreshtoken|authorization|cookie|setcookie|paymentmethod|cardnumber|cvc|cvv|pan|service_role|stripe_secret)$/i;

function deepSanitizeForProduction(input: unknown): unknown {
  if (process.env.NODE_ENV !== "production") return input;
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return sanitizeScalarString(input);
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(deepSanitizeForProduction);
  const obj = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const flat = k.replace(/[-_]/g, "").toLowerCase();
    if (SENSITIVE_KEY.test(k) || SENSITIVE_KEY.test(flat) || flat.endsWith("password") || flat.endsWith("token")) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = deepSanitizeForProduction(v);
    }
  }
  return out;
}

export function logStructured(
  level: "error" | "warn" | "info",
  tag: string,
  fields: Record<string, unknown>,
): void {
  const safeFields =
    process.env.NODE_ENV === "production"
      ? (deepSanitizeForProduction(fields) as Record<string, unknown>)
      : fields;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    tag,
    ...safeFields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
