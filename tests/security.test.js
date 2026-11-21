// Static checks that keep the security claims in the README true.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });

const html = read("index.html");
const toml = read("netlify.toml");
const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)[1];
const directives = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
const appJs = walk("js").filter((f) => !f.startsWith("js/data/"));

describe("content security policy", () => {
  it("denies by default and allows nothing inline", () => {
    expect(directives["default-src"]).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/);
    expect(directives["script-src"]).toEqual(["'self'"]);
    expect(directives["style-src"]).toEqual(["'self'"]);
  });

  it("only lets the page talk to itself and the breach API", () => {
    expect(directives["connect-src"]).toEqual(["'self'", "https://api.pwnedpasswords.com"]);
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
  it("has no inline scripts, styles or event handlers", () => {
    for (const [, attrs, content] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(attrs).toMatch(/src="/);
      expect(content.trim()).toBe("");
    }
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son[a-z]+="/i);
  });

  it("loads every script, stylesheet and font from its own origin", () => {
    const loads = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(loads.length).toBeGreaterThan(3);
    for (const url of loads) expect(url).not.toMatch(/^(https?:)?\/\//);
    expect(read("css/style.css")).not.toMatch(/url\((["']?)(https?:)?\/\//);
  });

  it("opens external links without leaking the opener", () => {
    for (const [tag] of html.matchAll(/<a [^>]*href="https?:[^>]*>/g)) expect(tag).toContain('rel="noopener"');
  });
});

describe("application code", () => {
  it("never builds HTML from strings or evaluates code", () => {
    for (const f of [...appJs, "sw.js"]) {
      expect(read(f), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
    }
  });

  it("only makes network requests from the breach module", () => {
    const callers = appJs.filter((f) => /\bfetch(Impl)?\(/.test(read(f)));
    expect(callers).toEqual(["js/breach.js"]);
  });

  it("does not log anything to the console", () => {
    for (const f of appJs) expect(read(f), f).not.toMatch(/console\./);
  });

  it("does not check breaches automatically while typing", () => {
    const main = read("js/main.js");
    const update = main.slice(main.indexOf("function update()"), main.indexOf('pw.addEventListener("input"'));
    expect(update).not.toMatch(/runBreach|checkBreach/);
    expect(main).not.toMatch(/setTimeout\([^)]*(runBreach|checkBreach)/);
  });

  it("stores nothing but the colour theme", () => {
    for (const f of appJs) {
      for (const [, key] of read(f).matchAll(/localStorage\.setItem\("([^"]+)"/g)) expect(key).toBe("cipher-theme");
      expect(read(f)).not.toMatch(/sessionStorage|indexedDB|document\.cookie/);
    }
  });
});

describe("offline cache", () => {
  const sw = read("sw.js");
  const shell = [...sw.matchAll(/"([^"]+\.(?:html|css|js|webmanifest|svg|woff2))"/g)].map((m) => m[1]);

  it("lists only files that exist", () => {
    for (const f of shell) expect(existsSync(join(root, f)), f).toBe(true);
  });

  it("includes every file the app loads", () => {
    const needed = [...walk("js"), ...walk("css"), ...walk("assets/fonts").filter((f) => f.endsWith(".woff2"))];
    for (const f of needed) expect(shell, f).toContain(f);
  });

  it("never caches cross-origin requests such as the breach API", () => {
    expect(sw).toMatch(/url\.origin !== location\.origin\) return/);
  });
});

describe("deployment", () => {
  it("publishes only the app, not tests, scripts or package files", () => {
    expect(toml).toMatch(/publish = "dist"/);
    execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "ignore" });
    const files = walk("dist").map((f) => relative("dist", f));
    expect(files).toContain("index.html");
    expect(files).toContain("js/main.js");
    for (const f of files) expect(f).not.toMatch(/^(tests|scripts|node_modules|\.github)\/|package(-lock)?\.json|netlify\.toml/);
  });
});
