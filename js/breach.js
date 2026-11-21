// Breach lookup against Have I Been Pwned's Pwned Passwords range API using
// k-anonymity: only the first 5 hex characters of the SHA-1 hash leave the page.
const API = "https://api.pwnedpasswords.com/range/";
const cache = new Map(); // prefix -> Promise<Map<suffix, count>>

export async function sha1Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Parses a range API response body. With padding on, the API adds fake
 * entries with a count of 0 so every response is a similar size; those are
 * dropped here.
 */
export function parseRange(body) {
  const map = new Map();
  for (const line of body.split("\n")) {
    const [suffix, count] = line.trim().split(":");
    if (!/^[0-9A-Fa-f]{35}$/.test(suffix ?? "") || !/^\d+$/.test(count ?? "")) continue;
    const n = parseInt(count, 10);
    if (n > 0) map.set(suffix.toUpperCase(), n);
  }
  return map;
}

async function fetchRange(prefix, { fetchImpl = fetch } = {}) {
  if (!cache.has(prefix)) {
    const request = fetchImpl(API + prefix, {
      headers: { "Add-Padding": "true" },
      referrerPolicy: "no-referrer",
      credentials: "omit",
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`The breach service answered with status ${res.status}.`);
        return res.text();
      })
      .then(parseRange);
    request.catch(() => cache.delete(prefix));
    cache.set(prefix, request);
  }
  return cache.get(prefix);
}

/**
 * @returns {Promise<{hash, prefix, suffix, candidates, count}>}
 *   candidates: how many real breached hashes share the prefix (the "k").
 *   count: how many times this password appears in breaches (0 if never).
 */
export async function checkBreach(password, options = {}) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Breach checks need a secure page (HTTPS or localhost). Open Cipher over HTTPS to use this.");
  }
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const range = await fetchRange(prefix, options);
  return { hash, prefix, suffix, candidates: range.size, count: range.get(suffix) ?? 0 };
}
