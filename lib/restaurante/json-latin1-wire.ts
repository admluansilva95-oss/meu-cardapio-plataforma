/**
 * Reexporta sanitização de wire a partir de `@/lib/utils/sanitize-strings`.
 * Mantido para não quebrar imports existentes (`fetch-latin1-safe`, painel, vitrine).
 */
export {
  latin1SafeString,
  sanitizeUserFreeText,
  expandLatin1UserText,
  jsonStringifyLatin1Wire,
  deepSanitizeStringsForWire,
  sanitizeForWire,
  stripInvisibleFormatting,
  normalizeLatin1StoragePath,
} from "@/lib/utils/sanitize-strings";
