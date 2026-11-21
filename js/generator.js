// Password and passphrase generation using the browser's CSPRNG.
// Random indexes use rejection sampling so no word or character is favoured.

/** Uniform random integer in [0, max). */
export function randomInt(max, rng = globalThis.crypto) {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError("max must be an integer in (0, 2^32]");
  const limit = Math.floor(2 ** 32 / max) * max; // largest multiple of max below 2^32
  const buf = new Uint32Array(1);
  let x;
  do {
    rng.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

let effWords = null;
async function loadWords() {
  if (!effWords) effWords = (await import("./data/eff.js")).default.split(" ");
  return effWords;
}

export const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};

/**
 * Diceware-style passphrase from the EFF large wordlist (7,776 words,
 * log2(7776) ≈ 12.9 bits per word).
 */
export async function passphrase({ words = 5, separator = "-", capitalize = false } = {}) {
  const list = await loadWords();
  const picked = Array.from({ length: words }, () => {
    const w = list[randomInt(list.length)];
    return capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });
  return { value: picked.join(separator), bits: words * Math.log2(list.length) };
}

/** Random characters, guaranteed to include at least one from each chosen set. */
export function randomPassword({ length = 20, sets = ["lower", "upper", "digits", "symbols"] } = {}) {
  const chosen = sets.filter((s) => SETS[s]);
  if (!chosen.length) throw new Error("Choose at least one character type.");
  if (length < chosen.length) throw new Error(`Length must be at least ${chosen.length} for the types chosen.`);
  const pool = chosen.map((s) => SETS[s]).join("");
  let value;
  do {
    value = Array.from({ length }, () => pool[randomInt(pool.length)]).join("");
  } while (!chosen.every((s) => [...value].some((c) => SETS[s].includes(c))));
  return { value, bits: length * Math.log2(pool.length) };
}
