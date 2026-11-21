import { describe, it, expect, vi } from "vitest";
import { sha1Hex, parseRange, checkBreach } from "../js/breach.js";
import { randomInt, passphrase, randomPassword, SETS } from "../js/generator.js";

describe("breach check", () => {
  it("hashes with SHA-1 in uppercase hex", async () => {
    expect(await sha1Hex("password")).toBe("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
  });

  it("drops padding entries with a count of 0", () => {
    const map = parseRange("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\n");
    expect(map.size).toBe(1);
    expect(map.get("1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9545824);
  });

  it("sends only the 5-character prefix and matches the suffix locally", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => "1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\r\n0000000000000000000000000000000000A:3\r\n",
    }));
    const r = await checkBreach("password", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(url).not.toContain("1E4C9B93");
    expect(init.headers["Add-Padding"]).toBe("true");
    expect(r).toMatchObject({ prefix: "5BAA6", count: 42, candidates: 2 });
  });

  it("ignores malformed lines in the response", () => {
    const map = parseRange("not-a-hash:5\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:abc\n<script>:1\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:7");
    expect([...map]).toEqual([["1E4C9B93F3F0682250B6CF8331B7EE68FD8", 7]]);
  });

  it("reports 0 when the suffix is not in the range", async () => {
    const fetchImpl = async () => ({ ok: true, text: async () => "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:7" });
    expect((await checkBreach("a-unique-test-string-zq", { fetchImpl })).count).toBe(0);
  });

  it("surfaces service errors", async () => {
    const fetchImpl = async () => ({ ok: false, status: 503 });
    await expect(checkBreach("another-test-string-xy", { fetchImpl })).rejects.toThrow(/503/);
  });
});

describe("generator", () => {
  it("returns integers in range", () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it("rejects out-of-range values instead of biasing them", () => {
    // max = 3 * 2^30: anything >= 3 * 2^30 must be redrawn.
    const values = [0xffffffff, 5];
    const rng = { getRandomValues: (buf) => ((buf[0] = values.shift()), buf) };
    expect(randomInt(3 * 2 ** 30, rng)).toBe(5);
  });

  it("is roughly uniform", () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) counts[randomInt(6)]++;
    counts.forEach((c) => expect(Math.abs(c - 10000)).toBeLessThan(600));
  });

  it("builds passphrases from the EFF list", async () => {
    const { value, bits } = await passphrase({ words: 6, separator: " " });
    expect(value.split(" ")).toHaveLength(6);
    expect(bits).toBeCloseTo(6 * Math.log2(7776));
    const cap = await passphrase({ words: 3, capitalize: true });
    cap.value.split("-").forEach((w) => expect(w[0]).toBe(w[0].toUpperCase()));
  });

  it("includes every chosen character type", () => {
    for (let i = 0; i < 50; i++) {
      const { value } = randomPassword({ length: 8 });
      expect(value).toHaveLength(8);
      for (const set of Object.values(SETS)) expect([...value].some((c) => set.includes(c))).toBe(true);
    }
    expect(() => randomPassword({ sets: [] })).toThrow();
  });
});
