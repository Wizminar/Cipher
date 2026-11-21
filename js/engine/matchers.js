// Each matcher finds substrings an attacker would guess with a cheap strategy
// and attaches an estimate of how many guesses that strategy needs.
import passwordsRaw from "../data/passwords.js";
import englishRaw from "../data/english.js";
import namesRaw from "../data/names.js";
import { nCk } from "./math.js";
import { direction, isShifted, STARTING_POSITIONS, AVERAGE_DEGREE } from "./keyboard.js";

export const REFERENCE_YEAR = 2026;
const MIN_YEAR_SPACE = 20;
const MAX_DICT_TOKEN = 24;

function ranked(raw, fixedRank) {
  const map = new Map();
  raw.split(" ").forEach((w, i) => map.set(w, fixedRank ?? i + 1));
  return map;
}

const DICTIONARIES = [
  { name: "passwords", label: "common password", ranks: ranked(passwordsRaw) },
  { name: "english", label: "English word", ranks: ranked(englishRaw) },
  // The names list is alphabetical, not ranked, so every name gets the same rank.
  { name: "names", label: "first name", ranks: ranked(namesRaw, 2000) },
];

const L33T = {
  a: ["4", "@"], b: ["8"], c: ["(", "{", "[", "<"], e: ["3"], g: ["6", "9"],
  i: ["1", "!", "|"], l: ["1", "|", "7"], o: ["0"], s: ["$", "5"],
  t: ["+", "7"], x: ["%"], z: ["2"],
};
const UNL33T = {};
for (const [letter, subs] of Object.entries(L33T)) {
  for (const s of subs) (UNL33T[s] ??= []).push(letter);
}

/* ---------------- dictionary (plain, reversed, l33t) ---------------- */

function uppercaseVariations(token) {
  if (token === token.toLowerCase()) return 1;
  if (/^[A-Z][^A-Z]+$/.test(token) || /^[^A-Z]+[A-Z]$/.test(token) || /^[^a-z]+$/.test(token)) return 2;
  const upper = [...token].filter((c) => /[A-Z]/.test(c)).length;
  const lower = [...token].filter((c) => /[a-z]/.test(c)).length;
  let v = 0;
  for (let i = 1; i <= Math.min(upper, lower); i++) v += nCk(upper + lower, i);
  return v;
}

function l33tVariations(token, subs) {
  let v = 1;
  const lower = token.toLowerCase();
  for (const [sub, letter] of Object.entries(subs)) {
    const S = [...lower].filter((c) => c === sub).length;
    const U = [...lower].filter((c) => c === letter).length;
    if (S === 0 || U === 0) v *= 2;
    else {
      let p = 0;
      for (let i = 1; i <= Math.min(S, U); i++) p += nCk(S + U, i);
      v *= p;
    }
  }
  return v;
}

/** All ways to read l33t characters in `s` as letters (capped to stay cheap). */
function unl33tCandidates(s, cap = 32) {
  let results = [{ word: "", subs: {} }];
  for (const ch of s) {
    const options = UNL33T[ch];
    if (!options) {
      results.forEach((r) => (r.word += ch));
      continue;
    }
    const next = [];
    for (const r of results) {
      for (const letter of options) {
        if (r.subs[ch] && r.subs[ch] !== letter) continue; // one meaning per symbol
        next.push({ word: r.word + letter, subs: { ...r.subs, [ch]: letter } });
      }
    }
    results = next.slice(0, cap);
  }
  return results.filter((r) => Object.keys(r.subs).length > 0);
}

export function dictionaryMatches(password) {
  const matches = [];
  const lower = password.toLowerCase();
  const n = password.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < Math.min(n, i + MAX_DICT_TOKEN); j++) {
      const token = password.slice(i, j + 1);
      const word = lower.slice(i, j + 1);
      const reversedWord = [...word].reverse().join("");
      // Needs at least one real letter, so "@17" is not read as "all".
      const hasL33t = /[a-z]/.test(word) && [...word].some((c) => UNL33T[c]);

      for (const dict of DICTIONARIES) {
        const rank = dict.ranks.get(word);
        if (rank) {
          matches.push({
            pattern: "dictionary", i, j, token, word, rank, dictionary: dict.name,
            label: dict.label, guesses: Math.max(rank * uppercaseVariations(token), 1),
          });
        }
        const rrank = word.length > 3 && reversedWord !== word ? dict.ranks.get(reversedWord) : 0;
        if (rrank) {
          matches.push({
            pattern: "dictionary", i, j, token, word: reversedWord, rank: rrank, reversed: true,
            dictionary: dict.name, label: `${dict.label}, reversed`,
            guesses: rrank * uppercaseVariations(token) * 2,
          });
        }
        if (hasL33t) {
          for (const cand of unl33tCandidates(word)) {
            const lrank = dict.ranks.get(cand.word);
            if (!lrank || cand.word.length < 3) continue;
            matches.push({
              pattern: "dictionary", i, j, token, word: cand.word, rank: lrank, l33t: cand.subs,
              dictionary: dict.name, label: `${dict.label}, with symbol swaps`,
              guesses: lrank * uppercaseVariations(token) * l33tVariations(word, cand.subs),
            });
          }
        }
      }
    }
  }
  return matches;
}

/* ---------------- keyboard walks ---------------- */

export function spatialMatches(password) {
  const matches = [];
  const n = password.length;
  let i = 0;
  while (i < n - 1) {
    let j = i;
    let lastDir = null;
    let turns = 0;
    let shiftedCount = isShifted(password[i]) ? 1 : 0;
    while (j < n - 1) {
      const d = direction(password[j], password[j + 1]);
      if (d < 0) break;
      if (d !== lastDir) {
        turns++;
        lastDir = d;
      }
      j++;
      if (isShifted(password[j])) shiftedCount++;
    }
    if (j - i + 1 >= 3) {
      const token = password.slice(i, j + 1);
      matches.push({
        pattern: "spatial", i, j, token, turns, shiftedCount,
        label: "keyboard walk",
        guesses: spatialGuesses(token.length, turns, shiftedCount),
      });
    }
    i = j > i ? j + 1 : i + 1;
  }
  return matches;
}

function spatialGuesses(L, t, S) {
  let g = 0;
  for (let i = 2; i <= L; i++) {
    for (let j = 1; j <= Math.min(t, i - 1); j++) {
      g += nCk(i - 1, j - 1) * STARTING_POSITIONS * AVERAGE_DEGREE ** j;
    }
  }
  const U = L - S;
  if (S > 0 && U === 0) g *= 2;
  else if (S > 0) {
    let v = 0;
    for (let k = 1; k <= Math.min(S, U); k++) v += nCk(S + U, k);
    g *= v;
  }
  return g;
}

/* ---------------- sequences (abcd, 9876, ACEG) ---------------- */

const charClass = (c) => (/[a-z]/.test(c) ? "lower" : /[A-Z]/.test(c) ? "upper" : /\d/.test(c) ? "digit" : null);

export function sequenceMatches(password) {
  const matches = [];
  const n = password.length;
  let i = 0;
  while (i < n - 2) {
    const cls = charClass(password[i]);
    const delta = password.charCodeAt(i + 1) - password.charCodeAt(i);
    if (!cls || charClass(password[i + 1]) !== cls || delta === 0 || Math.abs(delta) > 5) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n - 1 && charClass(password[j + 1]) === cls && password.charCodeAt(j + 1) - password.charCodeAt(j) === delta) j++;
    if (j - i + 1 >= 3) {
      const token = password.slice(i, j + 1);
      const first = token[0];
      let base = /[aAzZ019]/.test(first) ? 4 : cls === "digit" ? 10 : 26;
      if (delta < 0) base *= 2;
      matches.push({
        pattern: "sequence", i, j, token, delta, label: delta > 0 ? "sequence" : "reverse sequence",
        guesses: base * token.length,
      });
      i = j;
    } else i++;
  }
  return matches;
}

/* ---------------- repeats (aaaa, abcabc) ---------------- */

export function repeatMatches(password, estimate) {
  const matches = [];
  const greedy = /(.+)\1+/g;
  let m;
  while ((m = greedy.exec(password))) {
    const token = m[0];
    // The shortest unit that repeats to form the token ("abab" -> "ab").
    const base = /^(.+?)\1+$/.exec(token)[1];
    const repeatCount = token.length / base.length;
    const baseGuesses = estimate(base).guesses;
    matches.push({
      pattern: "repeat", i: m.index, j: m.index + token.length - 1, token, base, repeatCount,
      label: `"${base}" repeated ×${repeatCount}`, guesses: baseGuesses * repeatCount,
    });
  }
  return matches;
}

/* ---------------- years and dates ---------------- */

const yearSpace = (y) => Math.max(Math.abs(REFERENCE_YEAR - y), MIN_YEAR_SPACE);

function plausibleDate(d, m, y) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return y >= 1900 && y <= 2099;
}
const expandYear = (y) => (y >= 100 ? y : y > 50 ? 1900 + y : 2000 + y);

export function dateMatches(password) {
  const matches = [];
  const yearRe = /19\d\d|20\d\d/g;
  let m;
  while ((m = yearRe.exec(password))) {
    const year = +m[0];
    matches.push({
      pattern: "date", i: m.index, j: m.index + 3, token: m[0], year,
      label: "year", guesses: yearSpace(year),
    });
  }

  // With separators: 12/04/1998, 1998-04-12, 4.12.98
  const sepRe = /(\d{1,4})([\s/\\_.-])(\d{1,2})\2(\d{1,4})/g;
  while ((m = sepRe.exec(password))) {
    const [a, , b, c] = [+m[1], m[2], +m[3], +m[4]];
    const candidates = [
      [a, b, c], [b, a, c], // d-m-y, m-d-y
      [c, b, a], // y-m-d
    ];
    const hit = candidates.find(([d, mo, y]) => plausibleDate(d, mo, expandYear(y)));
    if (hit) {
      const year = expandYear(hit[2]);
      matches.push({
        pattern: "date", i: m.index, j: m.index + m[0].length - 1, token: m[0], year,
        label: "date", guesses: 365 * yearSpace(year) * 4,
      });
    }
  }

  // Without separators: 120498, 04121998, 19980412
  const digitRuns = /\d{4,8}/g;
  while ((m = digitRuns.exec(password))) {
    const s = m[0];
    for (let len = 4; len <= Math.min(8, s.length); len++) {
      for (let start = 0; start + len <= s.length; start++) {
        const t = s.slice(start, start + len);
        if (/^(19|20)\d\d$/.test(t)) continue; // a plain year is covered above
        if (readsAsDate(t)) {
          const year = readsAsDate(t);
          matches.push({
            pattern: "date", i: m.index + start, j: m.index + start + len - 1, token: t, year,
            label: "date", guesses: 365 * yearSpace(year),
          });
        }
      }
    }
  }
  return matches;
}

function readsAsDate(t) {
  const splits = {
    4: [[1, 2], [2, 3]],
    5: [[1, 3], [2, 3]],
    6: [[1, 2], [2, 4], [4, 5]],
    7: [[1, 3], [2, 3], [4, 5], [4, 6]],
    8: [[2, 4], [4, 6]],
  }[t.length];
  for (const [k, l] of splits || []) {
    const parts = [+t.slice(0, k), +t.slice(k, l), +t.slice(l)];
    // Year last (dmy / mdy) or year first (ymd).
    for (const [y, rest] of [[parts[2], [parts[0], parts[1]]], [parts[0], [parts[2], parts[1]]]]) {
      const year = expandYear(y);
      const [p, q] = rest;
      if (plausibleDate(p, q, year) || plausibleDate(q, p, year)) return year;
    }
  }
  return 0;
}
