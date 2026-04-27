/**
 * Pure helper — extract clickable suggestion phrases từ assistant text.
 *
 * LLM thường gợi ý từ khoá thay thế trong dấu nháy đôi:
 *   `... thử "quán nhậu", "hải sản gần tôi" hoặc "quán có bia tươi" ...`
 *
 * Extract qua regex `/"([^"]+)"/g` rồi filter theo:
 *  - Length 2-40 chars (loại quote rỗng + câu dài)
 *  - Không số thuần (loại "100k", giá tiền)
 *  - Dedupe case-insensitive
 *
 * Cap 5 để tránh tag overflow nếu LLM viết list dài.
 */

const MIN_LEN = 2;
const MAX_LEN = 40;
const MAX_TAGS = 5;
// Match cả " " (straight) và " " (curly) quotes. LLM hay xuất curly trong VI.
const QUOTE_PATTERN = /["“]([^"”]+)["”]/g;

export function extractSuggestions(text: string): string[] {
  if (!text || text.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(QUOTE_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (raw.length < MIN_LEN || raw.length > MAX_LEN) continue;
    if (/^\d[\d.,k\s]*$/i.test(raw)) continue; // loại số/giá thuần
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
