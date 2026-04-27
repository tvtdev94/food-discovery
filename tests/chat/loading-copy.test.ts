import { describe, it, expect } from "vitest";
import {
  TICKER_POOLS,
  pickTickerPhrase,
  CHECKLIST_STEPS,
  getChecklistState,
  FAKE_QUAN_NAMES,
  pickFakeQuanName,
} from "@/lib/chat/loading-copy";

const VI_DIACRITIC =
  /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

describe("TICKER_POOLS", () => {
  it("non-empty pool per phase (thinking, searching, composing)", () => {
    expect(TICKER_POOLS.thinking.length).toBeGreaterThan(0);
    expect(TICKER_POOLS.searching.length).toBeGreaterThan(0);
    expect(TICKER_POOLS.composing.length).toBeGreaterThan(0);
  });

  it("all phrases contain VI diacritics (sanity)", () => {
    [...TICKER_POOLS.thinking, ...TICKER_POOLS.searching, ...TICKER_POOLS.composing].forEach(
      (p) => expect(VI_DIACRITIC.test(p)).toBe(true),
    );
  });
});

describe("pickTickerPhrase", () => {
  it("deterministic at index 0", () => {
    expect(pickTickerPhrase("thinking", 0)).toBe(TICKER_POOLS.thinking[0]);
    expect(pickTickerPhrase("searching", 0)).toBe(TICKER_POOLS.searching[0]);
    expect(pickTickerPhrase("composing", 0)).toBe(TICKER_POOLS.composing[0]);
  });

  it("wraps modulo pool length", () => {
    const len = TICKER_POOLS.thinking.length;
    expect(pickTickerPhrase("thinking", len)).toBe(TICKER_POOLS.thinking[0]);
    expect(pickTickerPhrase("thinking", len + 1)).toBe(TICKER_POOLS.thinking[1]);
  });

  it("handles negative index gracefully", () => {
    const result = pickTickerPhrase("thinking", -1);
    expect(TICKER_POOLS.thinking).toContain(result);
  });

  it("returns empty string when phase=done", () => {
    expect(pickTickerPhrase("done", 0)).toBe("");
  });
});

describe("CHECKLIST_STEPS", () => {
  it("has exactly 2 steps (Lùng quán + Chọn quán)", () => {
    expect(CHECKLIST_STEPS).toHaveLength(2);
    expect(CHECKLIST_STEPS[0].key).toBe("search");
    expect(CHECKLIST_STEPS[1].key).toBe("compose");
  });

  it("each step has VI label + 3 emoji states", () => {
    CHECKLIST_STEPS.forEach((s) => {
      expect(s.label.length).toBeGreaterThan(0);
      expect(VI_DIACRITIC.test(s.label)).toBe(true);
      expect(s.emojiPending).toBeTruthy();
      expect(s.emojiActive).toBeTruthy();
      expect(s.emojiDone).toBeTruthy();
    });
  });
});

describe("getChecklistState — phase → state mapping (2-step)", () => {
  it("thinking: step 0 (Lùng quán) active, step 1 pending", () => {
    expect(getChecklistState("thinking", 0)).toBe("active");
    expect(getChecklistState("thinking", 1)).toBe("pending");
  });

  it("searching: same as thinking — step 0 active, step 1 pending", () => {
    expect(getChecklistState("searching", 0)).toBe("active");
    expect(getChecklistState("searching", 1)).toBe("pending");
  });

  it("composing: step 0 done, step 1 active", () => {
    expect(getChecklistState("composing", 0)).toBe("done");
    expect(getChecklistState("composing", 1)).toBe("active");
  });

  it("done: cả 2 done", () => {
    [0, 1].forEach((i) => expect(getChecklistState("done", i)).toBe("done"));
  });

  it("out-of-range stepIndex returns pending", () => {
    expect(getChecklistState("searching", -1)).toBe("pending");
    expect(getChecklistState("searching", 99)).toBe("pending");
  });
});

describe("FAKE_QUAN_NAMES", () => {
  it("has at least 5 names", () => {
    expect(FAKE_QUAN_NAMES.length).toBeGreaterThanOrEqual(5);
  });

  it("all names are VI strings with diacritics", () => {
    FAKE_QUAN_NAMES.forEach((n) => expect(VI_DIACRITIC.test(n)).toBe(true));
  });
});

describe("pickFakeQuanName", () => {
  it("deterministic at index 0", () => {
    expect(pickFakeQuanName(0)).toBe(FAKE_QUAN_NAMES[0]);
  });

  it("wraps modulo length", () => {
    const len = FAKE_QUAN_NAMES.length;
    expect(pickFakeQuanName(len)).toBe(FAKE_QUAN_NAMES[0]);
    expect(pickFakeQuanName(len + 1)).toBe(FAKE_QUAN_NAMES[1]);
  });

  it("handles negative index", () => {
    expect(FAKE_QUAN_NAMES).toContain(pickFakeQuanName(-1));
  });
});
