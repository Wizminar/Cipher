import { analyze } from "./engine/index.js";
import { crackTimes, formatCount } from "./engine/crack.js";
import { checkBreach } from "./breach.js";
import { passphrase, randomPassword } from "./generator.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const pw = $("pw");
const wrap = $("pwWrap");
const mirror = $("mirror");
const results = $("results");

let revealed = true;
let lastKeys = new Set();
let current = null;

/* ======================= audit ======================= */

const guessable = (p) => p.pattern !== "bruteforce";
const pieceKey = (p) => `${p.i}:${p.j}:${p.pattern}:${p.token}`;
const mask = (s) => "•".repeat([...s].length);

function fit(len) {
  // Martian Mono's width axis condenses the password as it grows.
  const stretch = Math.max(75, Math.min(112.5, 112.5 - (len - 10) * 2));
  wrap.style.setProperty("--stretch", `${stretch}%`);
}

function renderMirror(result) {
  mirror.replaceChildren();
  const keys = new Set();
  result.pieces.forEach((p, idx) => {
    const span = el("span", guessable(p) ? "seg mark" : "seg", revealed ? p.token : mask(p.token));
    span.dataset.idx = idx;
    const key = pieceKey(p);
    keys.add(key);
    if (guessable(p) && !lastKeys.has(key)) span.classList.add("new");
    mirror.append(span);
  });
  mirror.append("​"); // keeps the line height when the text ends in a space
  lastKeys = keys;
}

function renderSummary(r) {
  $("bits").textContent = Math.round(r.bits);
  const verdict = $("verdict");
  verdict.textContent = r.verdict.label;
  verdict.dataset.v = r.verdict.id;

  const line = $("scoreLine");
  line.replaceChildren();
  const overrate = r.naiveBits - r.bits;
  line.append("A cracking tool would need about ", el("strong", null, `${r.guessesDisplay} guesses`), ". ");
  if (overrate >= 4) {
    line.append(
      "The textbook formula gives it ",
      el("strong", null, `${Math.round(r.naiveBits)} bits`),
      `, overrating it by a factor of ${formatCount(2 ** overrate)}.`,
    );
  } else {
    line.append("No patterns found, so the textbook formula is about right for this one.");
  }

  const pct = (b) => `${Math.min(b, 128) / 1.28}%`;
  $("naiveBar").style.width = pct(r.naiveBits);
  $("realBar").style.width = pct(r.bits);
  $("naiveVal").textContent = Math.round(r.naiveBits);
  $("realVal").textContent = Math.round(r.bits);
}

function renderPieces(r) {
  const list = $("pieces");
  list.replaceChildren();
  r.pieces.forEach((p, idx) => {
    const li = el("li", "piece-row");
    li.dataset.idx = idx;
    const tok = el("span", "tok");
    tok.append(el("span", guessable(p) ? "mark" : "plain", revealed ? p.token : mask(p.token)));
    const desc = revealed ? p.description : p.pattern === "bruteforce" ? p.description : p.label;
    li.append(tok, el("span", "desc", desc), el("span", "g", `${formatCount(p.guesses)} guesses`));
    li.addEventListener("pointerenter", () => setActive(idx, true));
    li.addEventListener("pointerleave", () => setActive(idx, false));
    list.append(li);
  });
}

function setActive(idx, on) {
  mirror.querySelector(`[data-idx="${idx}"]`)?.classList.toggle("active", on);
  $("pieces").querySelector(`[data-idx="${idx}"]`)?.classList.toggle("active", on);
}

function renderCrack(r) {
  const body = $("crackRows");
  body.replaceChildren();
  for (const s of r.crack) {
    const tr = el("tr");
    tr.dataset.fast = String(s.seconds < 86400);
    const name = el("td", "name", s.name);
    name.append(el("span", "detail", s.detail));
    tr.append(name, el("td", "time", s.display));
    body.append(tr);
  }
}

function renderAdvice(r) {
  const ul = $("advice");
  ul.replaceChildren(...r.suggestions.map((t) => el("li", null, t)));
  $("adviceBlock").hidden = r.suggestions.length === 0;
}

function update() {
  // Passwords are one line: drop pasted newlines.
  if (/[\r\n]/.test(pw.value)) pw.value = pw.value.replace(/[\r\n]+/g, "");
  const value = pw.value;
  fit([...value].length);

  if (!value) {
    current = null;
    mirror.replaceChildren();
    lastKeys = new Set();
    results.dataset.empty = "true";
    resetBreach();
    return;
  }

  current = analyze(value);
  results.dataset.empty = "false";
  renderMirror(current);
  renderSummary(current);
  renderPieces(current);
  renderCrack(current);
  renderAdvice(current);
  resetBreach();
}

pw.addEventListener("input", update);
pw.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    runBreach();
  }
});

$("reveal").addEventListener("click", (e) => {
  revealed = !revealed;
  e.currentTarget.textContent = revealed ? "Hide" : "Show";
  e.currentTarget.setAttribute("aria-pressed", String(revealed));
  if (current) {
    renderMirror(current);
    renderPieces(current);
  }
});

$("clear").addEventListener("click", () => {
  pw.value = "";
  update();
  pw.focus();
});

document.querySelectorAll(".sample").forEach((b) =>
  b.addEventListener("click", () => {
    pw.value = b.dataset.sample;
    update();
    pw.focus();
    runBreach(); // examples are public, so checking them right away is safe
  }),
);

/* ======================= breach ======================= */
// Checks run only when asked. Checking every version of the password as it is
// typed would send a run of related prefixes that together give it away.

let breachSeq = 0; // bumped whenever a result in flight becomes stale

function setBreachStatus(state, text) {
  const s = $("breachStatus");
  s.dataset.state = state;
  s.textContent = text;
}

function resetBreach() {
  breachSeq++;
  mirror.classList.remove("breached");
  $("wire").hidden = true;
  $("breachBtn").disabled = false;
  setBreachStatus("idle", "Not checked yet.");
}

async function runBreach() {
  const value = pw.value;
  if (!value) return;
  const seq = ++breachSeq;
  $("breachBtn").disabled = true;
  setBreachStatus("pending", "Checking…");
  try {
    const r = await checkBreach(value);
    if (seq !== breachSeq) return;
    renderWire(r);
    if (r.count > 0) {
      mirror.classList.add("breached");
      setBreachStatus(
        "found",
        `Found in known breaches ${r.count.toLocaleString("en-US")} ${r.count === 1 ? "time" : "times"}. Attackers try these first, so don't use it anywhere.`,
      );
    } else {
      setBreachStatus("clear", "Not found in any known breach. Good, but that's not the same as strong: check the score above.");
    }
  } catch (err) {
    if (seq !== breachSeq) return;
    $("wire").hidden = true;
    const offline = err instanceof TypeError;
    setBreachStatus("error", offline ? "Couldn't reach the breach service. Check your connection and try again." : err.message);
  } finally {
    if (seq === breachSeq) $("breachBtn").disabled = false;
  }
}

function renderWire(r) {
  $("wPrefix").textContent = r.prefix;
  $("wSuffix").textContent = r.suffix;
  $("wSent").textContent = r.prefix;
  $("wBack").textContent = `${r.candidates.toLocaleString("en-US")} real, plus decoys`;
  $("wMatch").textContent = r.count > 0 ? `${r.suffix.slice(0, 8)}… matched` : "no match";
  $("wire").hidden = false;
}

$("breachBtn").addEventListener("click", runBreach);

/* ======================= generator ======================= */

let genMode = "phrase";
let genValue = "";

async function generate() {
  try {
    const r = genMode === "phrase"
      ? await passphrase({ words: +$("words").value, separator: $("sep").value, capitalize: $("caps").checked })
      : randomPassword({
        length: +$("len").value,
        sets: [...document.querySelectorAll('input[name="set"]:checked')].map((c) => c.value),
      });
    genValue = r.value;
    $("genOut").textContent = r.value;
    const fast = crackTimes(2 ** r.bits).at(-1);
    $("genBits").textContent = `${r.bits.toFixed(1)} bits. Even from a stolen fast-hash database: ${fast.display}.`;
  } catch (err) {
    genValue = "";
    $("genOut").textContent = "";
    $("genBits").textContent = err.message;
  }
}

function selectTab(mode) {
  genMode = mode;
  for (const [m, tab, panel] of [["phrase", "tab-phrase", "panel-phrase"], ["random", "tab-random", "panel-random"]]) {
    const on = m === mode;
    $(tab).setAttribute("aria-selected", String(on));
    $(tab).tabIndex = on ? 0 : -1;
    $(panel).hidden = !on;
  }
  generate();
}

$("tab-phrase").addEventListener("click", () => selectTab("phrase"));
$("tab-random").addEventListener("click", () => selectTab("random"));
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const next = genMode === "phrase" ? "random" : "phrase";
  selectTab(next);
  $(`tab-${next}`).focus();
});

$("words").addEventListener("input", (e) => { $("wordsOut").textContent = e.target.value; generate(); });
$("len").addEventListener("input", (e) => { $("lenOut").textContent = e.target.value; generate(); });
for (const id of ["sep", "caps"]) $(id).addEventListener("change", generate);
document.querySelectorAll('input[name="set"]').forEach((c) => c.addEventListener("change", generate));
$("regen").addEventListener("click", generate);

$("copy").addEventListener("click", async (e) => {
  if (!genValue) return;
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(genValue);
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Copy blocked by browser";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

$("useGen").addEventListener("click", () => {
  if (!genValue) return;
  pw.value = genValue;
  update();
  document.querySelector(".audit").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  pw.focus({ preventScroll: true });
});

/* ======================= theme & offline ======================= */

$("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("cipher-theme", root.dataset.theme); } catch {}
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

generate();
if (pw.value) update();
