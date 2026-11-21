// How long an attacker needs, depending on how the password is stored and attacked.
export const SCENARIOS = [
  {
    id: "online-throttled",
    name: "Online, rate-limited",
    detail: "Guessing at a login form that locks out after a few tries",
    rate: 100 / 3600,
  },
  {
    id: "online",
    name: "Online, no rate limit",
    detail: "A login endpoint with no lockout or throttling",
    rate: 10,
  },
  {
    id: "bcrypt",
    name: "Stolen database, bcrypt",
    detail: "Hashes leaked, stored with a slow hash (bcrypt cost 12), one GPU rig",
    rate: 1e4,
  },
  {
    id: "fast-hash",
    name: "Stolen database, fast hash",
    detail: "Hashes leaked, stored as unsalted MD5 or SHA-1, eight high-end GPUs",
    rate: 1e11,
  },
];

const UNITS = [
  ["second", 1],
  ["minute", 60],
  ["hour", 3600],
  ["day", 86400],
  ["month", 2629800],
  ["year", 31557600],
  ["century", 3155760000],
];

/** Human-readable duration, e.g. "3 hours", "less than a second", "centuries". */
export function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds > 1e6 * 3155760000) return "longer than the universe has existed";
  if (seconds < 1) return "instantly";
  let unit = UNITS[0];
  for (const u of UNITS) if (seconds >= u[1]) unit = u;
  const value = Math.round(seconds / unit[1]);
  if (unit[0] === "century") {
    return value >= 1000 ? `${formatCount(value * 100)} years` : `${value} ${value === 1 ? "century" : "centuries"}`;
  }
  return `${value} ${unit[0]}${value === 1 ? "" : "s"}`;
}

export function crackTimes(guesses) {
  return SCENARIOS.map((s) => ({ ...s, seconds: guesses / s.rate, display: formatDuration(guesses / s.rate) }));
}

/** Compact count: 1,204 / 3.2 million / 4.1 × 10^15 */
export function formatCount(n) {
  if (!Number.isFinite(n)) return "more than can be counted";
  if (n < 1e6) return Math.round(n).toLocaleString("en-US");
  const names = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"]];
  if (n < 1e15) {
    const [div, name] = names.find(([d]) => n >= d);
    return `${(n / div).toFixed(1).replace(/\.0$/, "")} ${name}`;
  }
  const exp = Math.floor(Math.log10(n));
  const sup = String(exp).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
  return `${(n / 10 ** exp).toFixed(1)} × 10${sup}`;
}
