# Cipher

[![CI](https://github.com/Wizminar/Cipher/actions/workflows/ci.yml/badge.svg)](https://github.com/Wizminar/Cipher/actions/workflows/ci.yml)
![No dependencies at runtime](https://img.shields.io/badge/runtime%20dependencies-0-1D1B2F)
![License: MIT](https://img.shields.io/badge/license-MIT-1D1B2F)

**See how a password would actually be cracked.** Cipher reads a password the way cracking tools do (leaked-password lists, dictionary words, symbol swaps, keyboard walks, dates, repeats), estimates the real number of guesses, and checks it against 900M+ breached passwords, all without the password leaving the browser.

**Live:** https://cipher.mohitupawar.com

| | Textbook formula | Cipher's estimate |
|---|---|---|
| `P@ssw0rd2024!` | 85 bits, "strong" | **27 bits**, guessed in ~100 million tries |
| `1qaz2wsx` | 41 bits | **9 bits**, on every cracking list |
| `correct horse battery staple` | 165 bits | **91 bits**, genuinely strong |

## What it does

- **Pattern-aware strength estimation.** A from-scratch engine in the spirit of Dropbox's zxcvbn. Matchers find dictionary words (plain, reversed, l33t-substituted, with capitalisation variants), QWERTY keyboard walks, character sequences, repeated chunks, years and dates. A dynamic-programming search then finds the cheapest way to split the password into those pieces.
- **"How an attacker reads it."** The password is marked up live: every guessable piece is highlighted, with what it is and how many guesses it costs.
- **Crack time under four threat models.** Rate-limited login, unthrottled login, stolen bcrypt database and stolen fast-hash database, because the website's storage choices matter as much as the password.
- **Private breach check (k-anonymity).** SHA-1 in the browser, with only a 5-character prefix sent to the Have I Been Pwned range API. Response padding is on, matching happens locally, and the page shows exactly what was sent and what came back. It runs only when you ask (see the threat model for why).
- **Generator.** Diceware-style passphrases from the EFF large wordlist, or random characters, using `crypto.getRandomValues` with rejection sampling so there's no modulo bias.
- **Works offline** as an installable PWA (the strength meter and generator need no network).

## How the estimate works

Every matcher returns candidate pieces with a guess count:

| Pattern | Guesses |
|---|---|
| Dictionary word | rank in list × capitalisation variants × l33t variants (× 2 if reversed) |
| Keyboard walk | Σ over lengths and turns of C(i−1, j−1) × keys × avg-degree^j, × shift variants |
| Sequence (`abc`, `9753`) | base × length (base 4 for obvious starts, 10 digits, 26 letters, × 2 descending) |
| Repeat (`abcabc`) | guesses for the base × repeat count |
| Year / date | years from 2026 (min 20), × 365 for full dates |
| Anything else | pool size ^ length (brute force) |

The optimal split of a password into *k* pieces minimises

```
guesses = k! × Π(piece guesses) + 10000^(k−1)
```

`k!` accounts for piece ordering, and the additive term stops the optimiser from favouring many tiny cheap pieces. Bits = log₂(guesses).

## Architecture

```
index.html            page shell, no inline scripts or styles
css/style.css         design tokens, light + dark themes
js/
  main.js             UI controller (rendering, debounced breach checks, generator)
  breach.js           SHA-1 via Web Crypto, HIBP range API, padding, caching
  generator.js        CSPRNG + rejection sampling, EFF passphrases
  engine/
    matchers.js       dictionary / l33t / spatial / sequence / repeat / date matchers
    estimate.js       minimum-guess DP search + naive entropy
    keyboard.js       slanted QWERTY adjacency graph
    crack.js          threat models, duration and count formatting
    index.js          analyze(): verdicts, descriptions, advice
  data/               word lists as ES modules (generated)
scripts/build-data.mjs  builds js/data from scripts/raw
scripts/build.mjs       copies the public files into dist/
scripts/serve-prod.mjs  serves dist/ with the netlify.toml headers, for testing the CSP
tests/                Vitest suites: engine, breach + generator, UI (happy-dom), security
sw.js                 offline cache (never caches the breach API)
netlify.toml          security headers
```

No framework, no bundler, no runtime dependencies. Vitest and happy-dom are the only dev dependencies.

## Security and threat model

- **What leaves the browser:** a 5-hex-character SHA-1 prefix, sent to `api.pwnedpasswords.com` without cookies or a referrer, and only when the user presses *Check breaches* or Enter. About a million passwords share any given prefix, and the `Add-Padding` header hides the true size of the response.
- **What doesn't:** the password, its full hash, and the match result. There's no analytics, no backend, and no third-party CDN: fonts are self-hosted, so loading the page tells no one else you visited.
- **Why there's no "check as you type":** an earlier version did this, and it broke k-anonymity. Each pause sent the prefix for a slightly longer string (`d`, `dr`, `dra`…). Anyone watching could try each possible next character, keep the one whose hash matched the next prefix, and rebuild the password one character at a time. Checks are now explicit, and a test fails if typing ever triggers a request.
- **Headers** (in `netlify.toml`): a strict Content Security Policy (`default-src 'none'`, everything else `'self'`, `connect-src` adds only HIBP, `frame-ancestors 'none'`), HSTS, `Referrer-Policy: no-referrer`, a locked-down `Permissions-Policy`, COOP/CORP and `nosniff`. There are no inline scripts or styles, which is why the theme bootstrap lives in its own file.
- **Deployment** publishes only `dist/` (built by `npm run build`), so tests, scripts and package files are never served.
- **Responses are validated:** malformed lines from the API are ignored, and results that come back after the password changed are discarded.
- **Input handling:** the password field is a `textarea` overlaid on a rendered mirror, so password managers don't offer to save the audited value. All rendering uses `textContent`, never `innerHTML`.
- **SHA-1** is used only because the HIBP API requires it. It's a lookup key, not password storage.

## What the tests cover

- **Engine:** every matcher, the minimum-guess search, the naive formula, edge cases (128-character worst cases under 250 ms, emoji and non-Latin text, empty input), and that verdicts rise with strength.
- **Breach + generator:** SHA-1 output, that only the prefix is sent with padding on, malformed-response handling, rejection sampling (including a rigged RNG), uniformity, and EFF passphrases.
- **UI** (real `index.html` + `main.js` in happy-dom): rendering, caret alignment, hide mode leaking nothing, hostile input rendered as text, no network while typing, stale results dropped, offline errors.
- **Security:** the CSP has no `unsafe-*`, the page has no inline code and loads nothing cross-origin, there's no `innerHTML`/`eval`, only `breach.js` makes requests, the offline cache lists every file and skips cross-origin requests, and `dist/` contains only public files.

## Limitations

- The lists are modest: ~10k common passwords, ~9.5k English words and ~4.9k mostly Western first names. Real attackers have far bigger lists and personal context, so scores are an upper bound.
- Attack rates are round numbers for realistic setups, not benchmarks.

## Run locally

```bash
npm install
npm test                          # 69 tests: engine, breach, generator, UI, security
npm run dev                       # serves on http://localhost:5173
npm run build && node scripts/serve-prod.mjs   # dist/ with the real production headers
```

The breach check needs a secure context (HTTPS or `localhost`).

## Credits

Approach inspired by [zxcvbn](https://github.com/dropbox/zxcvbn) (Wheeler, USENIX Security 2016). Word lists: [SecLists](https://github.com/danielmiessler/SecLists), [google-10000-english](https://github.com/first20hours/google-10000-english), [EFF large wordlist](https://www.eff.org/dice). Breach data: [Have I Been Pwned](https://haveibeenpwned.com/Passwords).

Built by [Mohit Pawar](https://mohitupawar.com/).
