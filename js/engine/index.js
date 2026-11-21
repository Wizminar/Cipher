import { estimate, naiveBits } from "./estimate.js";
import { crackTimes, formatCount } from "./crack.js";

const VERDICTS = [
  { max: 28, id: "very-weak", label: "Very weak" },
  { max: 40, id: "weak", label: "Weak" },
  { max: 60, id: "fair", label: "Fair" },
  { max: 80, id: "strong", label: "Strong" },
  { max: Infinity, id: "very-strong", label: "Very strong" },
];

export const verdictFor = (bits) => VERDICTS.find((v) => bits < v.max);

/** One-line explanation of how an attacker would guess a piece. */
export function describe(piece) {
  switch (piece.pattern) {
    case "dictionary": {
      const rankNote = piece.dictionary === "names" ? "" : `, #${piece.rank.toLocaleString("en-US")} on the list`;
      return piece.token.toLowerCase() === piece.word
        ? `${piece.label}${rankNote}`
        : `"${piece.word}": ${piece.label}${rankNote}`;
    }
    case "spatial":
      return `${piece.label}, ${piece.turns} ${piece.turns === 1 ? "direction" : "directions"}`;
    case "sequence":
      return piece.label;
    case "repeat":
      return piece.label;
    case "date":
      return piece.label === "year" ? "recent year" : `date in ${piece.year}`;
    default:
      return `${piece.token.length} random ${piece.token.length === 1 ? "character" : "characters"}`;
  }
}

function suggestions(result, bits) {
  const tips = [];
  const patterns = new Set(result.sequence.map((p) => p.pattern));
  const dict = result.sequence.filter((p) => p.pattern === "dictionary");
  if (dict.some((p) => p.dictionary === "passwords" && p.token.length === result.password.length)) {
    tips.push("This exact password is on lists attackers try first. Pick something else entirely.");
  }
  if (dict.some((p) => p.l33t)) tips.push("Swapping letters for symbols (a → @, o → 0) is one of the first tricks cracking tools try.");
  if (dict.some((p) => p.reversed)) tips.push("Reversed words are checked almost as quickly as normal ones.");
  if (patterns.has("spatial")) tips.push("Keyboard patterns like qwerty or 1qaz are in every cracking wordlist.");
  if (patterns.has("date")) tips.push("Years and dates narrow the search a lot, especially ones tied to you.");
  if (patterns.has("sequence")) tips.push("Runs like abc or 123 add almost nothing.");
  if (patterns.has("repeat")) tips.push("Repeating a chunk only multiplies the guesses by a small number.");
  if (/^[A-Z][^A-Z]*$/.test(result.password) && dict.length) tips.push("A capital first letter is the first thing attackers try.");
  if (bits < 60) tips.push("Add length. Four or five random words beat any amount of symbol swapping.");
  return tips.slice(0, 3);
}

export function analyze(password) {
  const result = estimate(password);
  const bits = result.bits;
  return {
    password: result.password,
    guesses: result.guesses,
    guessesDisplay: formatCount(result.guesses),
    bits,
    naiveBits: naiveBits(result.password),
    verdict: verdictFor(bits),
    pieces: result.sequence.map((p) => ({ ...p, description: describe(p) })),
    crack: crackTimes(result.guesses),
    suggestions: suggestions(result, bits),
  };
}

export { estimate, naiveBits };
