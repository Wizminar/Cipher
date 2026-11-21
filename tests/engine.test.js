import { describe, it, expect } from "vitest";
import { analyze, estimate, naiveBits } from "../js/engine/index.js";
import { spatialMatches, sequenceMatches, dateMatches, dictionaryMatches } from "../js/engine/matchers.js";
import { direction } from "../js/engine/keyboard.js";
import { poolSize, nCk } from "../js/engine/math.js";
import { formatDuration, formatCount } from "../js/engine/crack.js";

const patterns = (pw) => estimate(pw).sequence.map((p) => p.pattern);

describe("naive entropy", () => {
  it("is length × log2(pool)", () => {
    expect(naiveBits("abc")).toBeCloseTo(3 * Math.log2(26));
    expect(naiveBits("aB3!")).toBeCloseTo(4 * Math.log2(95));
    expect(naiveBits("")).toBe(0);
  });

  it("counts each character category once", () => {
    expect(poolSize("aaaa")).toBe(26);
    expect(poolSize("aA")).toBe(52);
    expect(poolSize("a1")).toBe(36);
    expect(poolSize("a!")).toBe(59);
  });
});

describe("realistic estimate", () => {
  it("rates the most common passwords as almost free to guess", () => {
    expect(estimate("password").bits).toBeLessThan(2);
    expect(estimate("123456").bits).toBeLessThan(2);
    expect(estimate("qwerty").bits).toBeLessThan(5);
  });

  it("sees through symbol swaps", () => {
    const r = estimate("P@ssw0rd");
    expect(r.sequence).toHaveLength(1);
    expect(r.sequence[0]).toMatchObject({ pattern: "dictionary", word: "password" });
    expect(r.bits).toBeLessThan(15);
  });

  it("is far below the naive formula for a 'complex looking' password", () => {
    const r = analyze("P@ssw0rd2024!");
    expect(r.naiveBits).toBeGreaterThan(80);
    expect(r.bits).toBeLessThan(35);
    expect(r.verdict.id).toBe("very-weak");
  });

  it("matches the naive formula for truly random strings", () => {
    const pw = "x7#Kp9!vQm2z";
    expect(estimate(pw).bits).toBeCloseTo(naiveBits(pw), 0);
  });

  it("ranks a passphrase above a short scramble", () => {
    expect(estimate("correct horse battery staple").bits).toBeGreaterThan(estimate("Tr0ub4dor&3").bits);
    expect(estimate("correct horse battery staple").bits).toBeGreaterThan(estimate("P@ss1!").bits + 40);
  });

  it("never estimates more guesses than brute force over the pool", () => {
    for (const pw of ["hello world", "Summer2025!", "zxcvbnm", "aaaaaaaa", "Mohit@1707"]) {
      expect(estimate(pw).bits).toBeLessThanOrEqual(naiveBits(pw) + 1e-9);
    }
  });

  it("covers the whole password with contiguous pieces", () => {
    for (const pw of ["dragon1998", "abc123xyz!!", "iloveyou2", "Xk2#password"]) {
      const seq = estimate(pw).sequence;
      expect(seq.map((p) => p.token).join("")).toBe(pw);
      seq.forEach((p, idx) => idx && expect(p.i).toBe(seq[idx - 1].j + 1));
    }
  });

  it("gets weaker, never stronger, when a common suffix replaces random characters", () => {
    expect(estimate("dragon2024").bits).toBeLessThan(estimate("dragon8#Lq").bits);
  });

  it("handles empty and very long input", () => {
    expect(estimate("").bits).toBe(0);
    const long = "a".repeat(500);
    const t = performance.now();
    expect(estimate(long).bits).toBeLessThan(20);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("pattern matchers", () => {
  it("finds keyboard walks with turns", () => {
    expect(direction("q", "w")).toBeGreaterThanOrEqual(0);
    expect(direction("q", "p")).toBe(-1);
    const [walk] = spatialMatches("zxcvbn");
    expect(walk).toMatchObject({ token: "zxcvbn", turns: 1 });
    const [col] = spatialMatches("1qaz");
    expect(col.token).toBe("1qaz");
    expect(patterns("asdfghjkl;")).toEqual(["spatial"]);
  });

  it("finds ascending and descending sequences", () => {
    expect(sequenceMatches("abcdef")[0]).toMatchObject({ token: "abcdef", delta: 1 });
    expect(sequenceMatches("97531")[0]).toMatchObject({ token: "97531", delta: -2 });
    expect(sequenceMatches("abz")).toHaveLength(0);
  });

  it("finds repeated chunks", () => {
    const r = estimate("abcabcabc");
    expect(r.sequence[0]).toMatchObject({ pattern: "repeat", base: "abc", repeatCount: 3 });
  });

  it("finds years and dates", () => {
    expect(dateMatches("born1998").some((m) => m.token === "1998" && m.label === "year")).toBe(true);
    expect(dateMatches("12/04/1998").some((m) => m.label === "date" && m.year === 1998)).toBe(true);
    expect(dateMatches("04121998").some((m) => m.label === "date")).toBe(true);
  });

  it("charges more for unusual capitalisation", () => {
    const plain = dictionaryMatches("monkey").find((m) => m.word === "monkey");
    const first = dictionaryMatches("Monkey").find((m) => m.word === "monkey");
    const mixed = dictionaryMatches("mOnKeY").find((m) => m.word === "monkey");
    expect(first.guesses).toBe(plain.guesses * 2);
    expect(mixed.guesses).toBeGreaterThan(first.guesses);
  });

  it("finds reversed words", () => {
    expect(dictionaryMatches("drowssap").some((m) => m.reversed && m.word === "password")).toBe(true);
  });
});

describe("analysis output", () => {
  it("describes each piece and gives advice", () => {
    const r = analyze("P@ssw0rd2024!");
    expect(r.pieces[0].description).toMatch(/password/);
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.crack).toHaveLength(4);
    expect(r.crack[0].seconds).toBeGreaterThan(r.crack[3].seconds);
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(0.2)).toBe("instantly");
    expect(formatDuration(1)).toBe("1 second");
    expect(formatDuration(7200)).toBe("2 hours");
    expect(formatDuration(3155760000 * 3)).toBe("3 centuries");
    expect(formatDuration(Infinity)).toMatch(/universe/);
  });

  it("formats counts", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(3.2e6)).toBe("3.2 million");
    expect(formatCount(4.1e20)).toBe("4.1 × 10²⁰");
  });

  it("computes binomials", () => {
    expect(nCk(5, 2)).toBe(10);
    expect(nCk(3, 4)).toBe(0);
  });
});

describe("edge cases", () => {
  const random = (n, chars) => Array.from({ length: n }, (_, i) => chars[(i * 7919 + 13) % chars.length]).join("");

  it("stays fast on the longest, most pattern-heavy input", () => {
    for (const pw of [random(128, "abcXYZ019!@#$%^&*"), random(128, "4@3105$7!|1+"), "password".repeat(16), "1".repeat(128)]) {
      const t = performance.now();
      const r = estimate(pw);
      expect(performance.now() - t, pw.slice(0, 12)).toBeLessThan(250);
      expect(Number.isFinite(r.guesses)).toBe(true);
      expect(r.sequence.map((p) => p.token).join("")).toBe(pw);
    }
  });

  it("handles emoji and non-Latin text without breaking the pieces", () => {
    for (const pw of ["pass😀word🔥", "пароль123", "密码password", "ñandú2024"]) {
      const r = analyze(pw);
      expect(r.pieces.map((p) => p.token).join("")).toBe(pw);
      expect(r.bits).toBeGreaterThan(0);
    }
  });

  it("treats non-string input as empty", () => {
    expect(estimate(undefined).bits).toBe(0);
    expect(estimate(null).bits).toBe(0);
  });

  it("formats impossible counts safely", () => {
    expect(formatCount(Infinity)).not.toMatch(/NaN/);
    expect(formatCount(NaN)).not.toMatch(/NaN/);
  });

  it("verdicts rise with strength", () => {
    const order = ["password", "dragon1998", "Tr0ub4dor&3", "x7#Kp9!vQm2z", "correct horse battery staple"].map((p) => analyze(p).bits);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
