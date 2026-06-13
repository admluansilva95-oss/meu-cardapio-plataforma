import { latin1SafeString, sanitizeUserFreeText } from "@/lib/utils/sanitize-strings";
import { sanitizeBlobForWire } from "@/lib/fetch-latin1-safe";

/**
 * `FormData` com `append` explícito seguro para wire (Latin-1 / ByteString).
 * No cliente, `FormData.prototype.append` também é instrumentado — use isto quando
 * quiser deixar a intenção óbvia no código.
 */
export function createWireSafeFormData(): FormData {
  return new FormData();
}

/** Mesma lógica do patch global de `FormData.prototype.append` (filename + chaves). */
export function appendWireSafe(
  fd: FormData,
  name: string,
  value: string | Blob,
  filename?: string,
): void {
  const key = latin1SafeString(String(name));
  if (filename !== undefined && typeof filename === "string") {
    fd.append(key, value as Blob, sanitizeUserFreeText(filename));
    return;
  }
  if (typeof value === "string") {
    fd.append(key, sanitizeUserFreeText(value));
    return;
  }
  if (typeof File !== "undefined" && value instanceof File) {
    const f = sanitizeBlobForWire(value);
    if (f instanceof File) {
      fd.append(key, f, f.name);
    } else {
      fd.append(key, f);
    }
    return;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    fd.append(key, sanitizeBlobForWire(value));
    return;
  }
  fd.append(key, value as Blob);
}
