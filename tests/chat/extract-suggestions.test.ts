import { describe, it, expect } from "vitest";
import { extractSuggestions } from "@/lib/chat/extract-suggestions";

describe("extractSuggestions", () => {
  it("extracts quoted phrases from VI message", () => {
    const text =
      'Bạn thử đổi từ khoá sang "quán nhậu", "hải sản gần tôi" hoặc "quán có bia tươi" để mình tìm lại nhé 🍻';
    expect(extractSuggestions(text)).toEqual([
      "quán nhậu",
      "hải sản gần tôi",
      "quán có bia tươi",
    ]);
  });

  it("returns [] when no quoted phrases", () => {
    expect(extractSuggestions("Khu này có nhiều quán phở ngon lắm")).toEqual([]);
  });

  it("returns [] for empty text", () => {
    expect(extractSuggestions("")).toEqual([]);
  });

  it("handles curly quotes (LLM hay xuất)", () => {
    const text = "Thử “bún chả” hoặc “bánh mì” nha";
    expect(extractSuggestions(text)).toEqual(["bún chả", "bánh mì"]);
  });

  it("dedupes case-insensitive", () => {
    const text = '"Phở" và "phở" và "PHỞ"';
    expect(extractSuggestions(text)).toEqual(["Phở"]);
  });

  it("filters out numeric-only phrases (giá tiền)", () => {
    const text = '"100k", "200,000" hoặc "phở bò"';
    expect(extractSuggestions(text)).toEqual(["phở bò"]);
  });

  it("filters phrases too short or too long", () => {
    const tooLong = "x".repeat(50);
    const text = `"a", "${tooLong}", "phở bò"`;
    expect(extractSuggestions(text)).toEqual(["phở bò"]);
  });

  it("caps at 5 tags max", () => {
    const text = '"a1", "a2", "a3", "a4", "a5", "a6", "a7"';
    const result = extractSuggestions(text);
    expect(result).toHaveLength(5);
  });

  it("trims whitespace inside quotes", () => {
    expect(extractSuggestions('"  hải sản  "')).toEqual(["hải sản"]);
  });

  it("handles mixed straight + curly quotes", () => {
    const text = '"phở bò" và “bún chả”';
    expect(extractSuggestions(text)).toEqual(["phở bò", "bún chả"]);
  });
});
