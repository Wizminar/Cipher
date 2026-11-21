// Static checks that keep the security claims in the README true.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

const html = read("index.html");
const css = read("style.css");
const script = read("script.js");
const toml = read("netlify.toml");
const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)[1];
const directives = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

// script.js minus the generated word lists, split into its numbered sections.
const code = script.slice(0, script.indexOf("// <word-lists>"));
const sections = Object.fromEntries(
  [...code.matchAll(/\/\* =+\n\s+(\d+)\. ([^\n]+)\n\s+=+ \*\/([\s\S]*?)(?=\/\* =+\n|$)/g)].map((m) => [m[2].trim(), m[3]]),
);
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe("content security policy", () => {
  it("denies by default and never allows unsafe inline code", () => {
    expect(directives["default-src"]).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/);
    expect(directives["style-src"]).toEqual(["'self'"]);
  });

  it("allows only the site's own script plus the one hashed theme snippet", () => {
    expect(inlineScripts).toHaveLength(1);
    const hash = `'sha256-${createHash("sha256").update(inlineScripts[0]).digest("base64")}'`;
    expect(directives["script-src"]).toEqual(["'self'", hash]);
  });

  it("only lets the page talk to itself and the breach API", () => {
    expect(directives["connect-src"]).toEqual(["'self'", "https://api.pwnedpasswords.com"]);
    expect(directives["font-src"]).toEqual(["data:"]);
  });

  it("blocks framing, form posts and base hijacking", () => {
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["form-action"]).toEqual(["'none'"]);
    expect(directives["base-uri"]).toEqual(["'none'"]);
  });

  it("sends the other hardening headers", () => {
    for (const h of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) {
      expect(toml).toContain(h);
    }
    expect(toml).toContain('Referrer-Policy = "no-referrer"');
  });
});

describe("page markup works under that policy", () => {
  it("has no inline styles or event handlers", () => {
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son[a-z]+="/i);
  });

  it("is made of exactly three files: index.html, style.css and script.js", () => {
    const loads = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:"));
    expect(loads.sort()).toEqual(["script.js", "style.css"]);
    expect(css).not.toMatch(/url\(\s*(?!["']?data:)/);
  });

  it("opens external links without leaking the opener", () => {
    for (const [tag] of html.matchAll(/<a [^>]*href="https?:[^>]*>/g)) expect(tag).toContain('rel="noopener"');
  });
});

describe("application code", () => {
  it("is a plain script, so index.html works when opened from disk", () => {
    expect(code).not.toMatch(/^\s*(import|export)\s/m);
    expect(html).toMatch(/<script src="script\.js" defer><\/script>/);
    expect(html).not.toMatch(/type="module"/);
  });

  it("keeps everything private except window.Cipher", () => {
    expect(script.trimStart()).toMatch(/^\/\/[\s\S]*?\(function \(\) \{\n"use strict";/);
    expect(script.trimEnd().endsWith("})();")).toBe(true);
    expect([...script.matchAll(/globalThis\.(\w+)\s*=/g)].map((m) => m[1])).toEqual(["Cipher"]);
  });

  it("has all ten sections", () => {
    expect(Object.keys(sections)).toHaveLength(10);
  });

  it("never builds HTML from strings or evaluates code", () => {
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  });

  it("only makes network requests from the breach section", () => {
    const callers = Object.entries(sections).filter(([, body]) => /\bfetch(Impl)?\(/.test(body)).map(([name]) => name);
    expect(callers).toEqual(["Breach check"]);
  });

  it("does not log anything to the console", () => {
    expect(code).not.toMatch(/console\./);
  });

  it("does not check breaches automatically while typing", () => {
    const update = code.slice(code.indexOf("function update()"), code.indexOf('pw.addEventListener("input"'));
    expect(update).not.toMatch(/runBreach|checkBreach/);
    expect(code).not.toMatch(/setTimeout\([^)]*(runBreach|checkBreach)/);
  });

  it("stores nothing but the colour theme", () => {
    for (const src of [code, ...inlineScripts]) {
      for (const [, key] of src.matchAll(/localStorage\.(?:set|get)Item\("([^"]+)"/g)) expect(key).toBe("cipher-theme");
      expect(src).not.toMatch(/sessionStorage|indexedDB|document\.cookie/);
    }
  });
});

describe("deployment", () => {
  it("publishes only the three site files", () => {
    expect(toml).toMatch(/publish = "dist"/);
    execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "ignore" });
    expect(readdirSync(join(root, "dist")).sort()).toEqual(["index.html", "script.js", "style.css"]);
  });
});
