/**
 * PII-scrubbing utilities for observability pipeline.
 * Pure functions — no I/O, safe to import anywhere.
 */

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;

// Unicode ranges covering Vietnamese diacritics (precomposed form).
// Matches characters in Latin Extended Additional + Combining Diacritical Marks
// that are almost exclusively used in Vietnamese.
const VI_DIACRITIC_RE =
  /[àáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỷỹỵ]/gi;

type Lang = "vi" | "en" | "mixed" | "other";

/** Simple language heuristic: count VI diacritics vs ASCII letters. */
function detectLang(text: string): Lang {
  const viMatches = text.match(VI_DIACRITIC_RE);
  const asciiMatches = text.match(/[a-z]/gi);
  const viCount = viMatches?.length ?? 0;
  const asciiCount = asciiMatches?.length ?? 0;
  const total = viCount + asciiCount;

  if (total === 0) return "other";
  const viRatio = viCount / total;
  if (viRatio > 0.3) return "vi";
  if (asciiCount > 0) return "en";
  return "other";
}

/** Simple non-cryptographic hash (FNV-1a 32-bit) for bucketing — not security-sensitive. */
function fnv32a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface ScrubMessageResult {
  length: number;
  lang: Lang;
  hash: string;
}

/**
 * Replaces user message content with non-identifying metadata.
 * Never logs the raw text.
 */
export function scrubMessage(raw: string): ScrubMessageResult {
  return {
    length: raw.length,
    lang: detectLang(raw),
    hash: fnv32a(raw),
  };
}

export interface ScrubErrorResult {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Extracts safe error metadata — drops emails, truncates stack.
 */
export function scrubError(err: unknown): ScrubErrorResult {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message.replace(EMAIL_RE, "<email>"),
      stack: err.stack ? err.stack.slice(0, 1200).replace(EMAIL_RE, "<email>") : undefined,
    };
  }
  return {
    name: "UnknownError",
    message: String(err).replace(EMAIL_RE, "<email>").slice(0, 500),
  };
}
