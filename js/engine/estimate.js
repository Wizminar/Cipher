// Finds the cheapest way an attacker could guess a password: split it into
// pieces (dictionary words, keyboard walks, dates, random runs...) so that the
// total number of guesses is as small as possible.
//
// The search is the same idea as Dropbox's zxcvbn: for a sequence of k pieces,
//   guesses = k! * product(piece guesses) + D^(k-1)
// where k! covers the order the pieces could come in and D^(k-1) stops the
// optimiser from splitting a password into many tiny cheap pieces.
import { factorial, poolSize, log2 } from "./math.js";
import {
  dictionaryMatches, spatialMatches, sequenceMatches,
  repeatMatches, dateMatches,
} from "./matchers.js";

const MIN_GUESSES_BEFORE_GROWING_SEQUENCE = 10000;
const MIN_SUBMATCH_GUESSES_SINGLE_CHAR = 10;
const MIN_SUBMATCH_GUESSES_MULTI_CHAR = 50;
const MAX_LENGTH = 128; // longer input is truncated so the search stays fast

function bruteforce(password, i, j) {
  const token = password.slice(i, j + 1);
  return {
    pattern: "bruteforce", i, j, token, label: "random characters",
    guesses: Math.max(poolSize(token) ** token.length, token.length === 1 ? MIN_SUBMATCH_GUESSES_SINGLE_CHAR : 1),
  };
}

function findMatches(password) {
  return [
    ...dictionaryMatches(password),
    ...spatialMatches(password),
    ...sequenceMatches(password),
    ...repeatMatches(password, estimate),
    ...dateMatches(password),
  ];
}

function floorGuesses(match, password) {
  // A piece that is the whole password needs no floor.
  if (match.token.length === password.length) return match.guesses;
  const floor = match.token.length === 1 ? MIN_SUBMATCH_GUESSES_SINGLE_CHAR : MIN_SUBMATCH_GUESSES_MULTI_CHAR;
  return Math.max(match.guesses, floor);
}

export function estimate(input) {
  const password = String(input ?? "").slice(0, MAX_LENGTH);
  const n = password.length;
  if (n === 0) return { password, guesses: 1, bits: 0, sequence: [] };

  const byEnd = Array.from({ length: n }, () => []);
  for (const m of findMatches(password)) byEnd[m.j].push({ ...m, guesses: floorGuesses(m, password) });

  // best[k] maps "number of pieces" -> { g, pi, m } for the prefix ending at k.
  const best = Array.from({ length: n }, () => new Map());

  const update = (m, l) => {
    const k = m.j;
    let pi = m.guesses;
    if (l > 1) pi *= best[m.i - 1].get(l - 1).pi;
    const g = factorial(l) * pi + MIN_GUESSES_BEFORE_GROWING_SEQUENCE ** (l - 1);
    for (const [cl, entry] of best[k]) {
      if (cl <= l && entry.g <= g) return;
    }
    best[k].set(l, { g, pi, m });
  };

  for (let k = 0; k < n; k++) {
    for (const m of byEnd[k]) {
      if (m.i > 0) for (const l of best[m.i - 1].keys()) update(m, l + 1);
      else update(m, 1);
    }
    // Random runs ending at k, never directly after another random run.
    for (let i = 0; i <= k; i++) {
      const bf = bruteforce(password, i, k);
      if (i === 0) update(bf, 1);
      else for (const [l, entry] of best[i - 1]) if (entry.m.pattern !== "bruteforce") update(bf, l + 1);
    }
  }

  // Unwind the cheapest path from the end.
  let bestL = null;
  let guesses = Infinity;
  for (const [l, entry] of best[n - 1]) {
    if (entry.g < guesses) {
      guesses = entry.g;
      bestL = l;
    }
  }
  const sequence = [];
  let k = n - 1;
  let l = bestL;
  while (k >= 0) {
    const m = best[k].get(l).m;
    sequence.unshift(m);
    k = m.i - 1;
    l--;
  }

  return { password, guesses, bits: log2(guesses), sequence };
}

/** The textbook formula: length × log2(pool). Assumes every character is random. */
export function naiveBits(password) {
  if (!password) return 0;
  return password.length * log2(poolSize(password));
}
