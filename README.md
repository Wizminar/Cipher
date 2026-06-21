# Cipher
[Try Cipher (opens in a new tab via Ctrl+Click)](https://cipher.mohitupawar.com/)
# Password Auditor

A single-page tool that measures password strength in **bits of entropy** and checks a password against real-world breaches — **without the password ever leaving the browser**.

**Live demo:** [add your URL]

## Two ideas this tool is built on

### 1. Entropy — why length beats complexity

Password strength isn't about "having a symbol." It's about how many guesses an attacker needs on average, which is measured in **bits of entropy**:

```
entropy (bits) = length × log2(size of character pool)
```

The character pool grows by category used: lowercase (+26), uppercase (+26), digits (+10), symbols (+~33). But notice that **length multiplies** the whole thing while adding a category only grows the base inside a logarithm. That's the math behind the famous result that a long passphrase like `correct horse battery staple` is far stronger than a short scramble like `P@ss1!` — even though the second "looks" more complex.

The tool shows entropy live as you type, with an estimated offline crack time (assuming ~10¹¹ guesses/second, a realistic rate for fast-hash GPU attacks).

### 2. k-anonymity — checking a secret without revealing it

The breach check answers "has this exact password appeared in a known breach?" — but sending a password to a server to ask that would itself be a security disaster. The **k-anonymity** model solves it:

1. The password is **SHA-1 hashed in the browser**.
2. Only the **first 5 characters** of that hash are sent to the Have I Been Pwned range API.
3. The API returns **every** breached hash suffix sharing those 5 characters (hundreds of them).
4. The match is checked **locally**, in the page.

The server never learns which password — or even which full hash — was being checked. It only ever sees a 5-character prefix shared by many hashes. This is a genuinely elegant privacy-preserving pattern, and it's the same one the real HIBP integration uses.

## How it works

Plain HTML + CSS + JavaScript, single file, no build step, no dependencies. SHA-1 hashing uses the browser's built-in Web Crypto API (`crypto.subtle`).

> **Note:** the breach check requires a secure context. It works when the page is hosted over HTTPS or run on `localhost`. Opening the raw file with `file://` may disable `crypto.subtle` in some browsers — the entropy meter still works, the breach button will tell you if it can't run.

## Honest limitations

- **SHA-1 is used only because that's the HIBP range API's format** — not as a password storage scheme. (Storing passwords with plain SHA-1 would be a vulnerability; this is a lookup, not storage.)
- Entropy assumes a random password. A dictionary word with predictable substitutions has *less* effective entropy than the formula suggests, because real attackers guess patterns first, not brute force.
- Crack-time is an estimate for one assumed attack rate; real timelines vary with hardware and the defender's hashing choices.

## Author

Built as part of my move from web development into security — the second in a small suite of browser-based security tools. Understanding *why* a password is weak (and how to check it safely) is more useful than a green/red meter that won't tell you its reasoning.
