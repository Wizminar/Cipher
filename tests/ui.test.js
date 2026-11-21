// @vitest-environment happy-dom
// End-to-end tests of the page: real index.html, real main.js, mocked network.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));

const fetchMock = vi.fn();
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 20));

function type(value) {
  const pw = $("pw");
  pw.value = value;
  pw.dispatchEvent(new Event("input", { bubbles: true }));
}

function rangeResponse(lines) {
  return { ok: true, status: 200, text: async () => lines.join("\r\n") };
}

beforeAll(async () => {
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
  await import("../js/main.js");
});

beforeEach(() => {
  fetchMock.mockReset();
  type("");
});

describe("auditing", () => {
  it("shows results only once something is typed", () => {
    expect($("results").dataset.empty).toBe("true");
    type("dragon1998");
    expect($("results").dataset.empty).toBe("false");
    expect(Number($("bits").textContent)).toBeGreaterThan(0);
  });

  it("marks up the guessable pieces", () => {
    type("P@ssw0rd2024!");
    const marks = [...$("mirror").querySelectorAll(".mark")].map((m) => m.textContent);
    expect(marks).toEqual(["P@ssw0rd", "2024"]);
    expect($("pieces").children).toHaveLength(3);
    expect($("verdict").textContent).toBe("Very weak");
    expect($("crackRows").children).toHaveLength(4);
  });

  it("keeps the mirror text identical to the field so the caret lines up", () => {
    for (const v of ["abc def", "x7#Kp9!vQm2z", "correct horse battery staple", "trailing space "]) {
      type(v);
      expect($("mirror").textContent.replace(/​/g, "")).toBe(v);
    }
  });

  it("limits input to the length the engine analyses", () => {
    expect($("pw").getAttribute("maxlength")).toBe("128");
  });

  it("strips pasted newlines", () => {
    type("pass\nword");
    expect($("pw").value).toBe("password");
  });

  it("renders hostile input as text, never as markup", () => {
    type('<img src=x onerror="window.__pwned=1">');
    expect(document.querySelector("img")).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect($("mirror").textContent).toContain("<img");
  });

  it("hides the password everywhere when Hide is pressed", () => {
    type("P@ssw0rd2024!");
    $("reveal").click();
    expect($("mirror").textContent).not.toContain("ssw0rd");
    expect($("pieces").textContent).not.toContain("ssw0rd");
    expect($("pieces").textContent).not.toContain('"password"');
    expect($("mirror").textContent.replace(/​/g, "")).toBe("•".repeat(13));
    $("reveal").click();
    expect($("mirror").textContent).toContain("P@ssw0rd");
  });

  it("clears everything", () => {
    type("hello");
    $("clear").click();
    expect($("pw").value).toBe("");
    expect($("results").dataset.empty).toBe("true");
  });
});

describe("breach check privacy", () => {
  it("never contacts the network while typing", async () => {
    let v = "";
    for (const ch of "correct-horse-battery") {
      v += ch;
      type(v);
    }
    await new Promise((r) => setTimeout(r, 800)); // longer than any debounce
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the 5-character prefix, only when asked", async () => {
    fetchMock.mockResolvedValue(rangeResponse(["0000000000000000000000000000000000A:3"]));
    type("a-password-nobody-uses-91");
    $("breachBtn").click();
    await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
    expect(init.headers["Add-Padding"]).toBe("true");
    expect(init.credentials).toBe("omit");
    expect(new URL(url).pathname).toMatch(/^\/range\/[0-9A-F]{5}$/); // nothing but the prefix
    expect($("breachStatus").dataset.state).toBe("clear");
    expect($("wSent").textContent).toHaveLength(5);
  });

  it("flags a breached password and strikes it through", async () => {
    // SHA-1("P@ssw0rd2024!") = DF78DED6A44A632CB7EA8217DC1AB478808982C5 (checked with shasum)
    fetchMock.mockResolvedValue(rangeResponse(["ED6A44A632CB7EA8217DC1AB478808982C5:521"]));
    type("P@ssw0rd2024!");
    $("pw").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.pwnedpasswords.com/range/DF78D");
    expect($("breachStatus").dataset.state).toBe("found");
    expect($("breachStatus").textContent).toContain("521 times");
    expect($("mirror").classList.contains("breached")).toBe(true);
  });

  it("drops a result that arrives after the password changed", async () => {
    let resolve;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    type("slow-check-password-77");
    $("breachBtn").click();
    await flush();
    type("slow-check-password-778");
    resolve(rangeResponse(["0000000000000000000000000000000000A:3"]));
    await flush();
    expect($("breachStatus").dataset.state).toBe("idle");
    expect($("wire").hidden).toBe(true);
    expect($("breachBtn").disabled).toBe(false);
  });

  it("explains a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    type("offline-check-password-5");
    $("breachBtn").click();
    await flush();
    expect($("breachStatus").dataset.state).toBe("error");
    expect($("breachStatus").textContent).toMatch(/connection/);
  });
});

describe("generator", () => {
  it("fills in a passphrase on load and can audit it", async () => {
    await flush();
    const phrase = $("genOut").textContent;
    expect(phrase.split("-")).toHaveLength(6);
    $("useGen").click();
    expect($("pw").value).toBe(phrase);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches to random characters", () => {
    $("tab-random").click();
    expect($("panel-random").hidden).toBe(false);
    expect($("genOut").textContent).toHaveLength(20);
    expect($("tab-random").getAttribute("aria-selected")).toBe("true");
  });

  it("reports an impossible choice instead of failing silently", () => {
    $("tab-random").click();
    document.querySelectorAll('input[name="set"]').forEach((c) => {
      c.checked = false;
      c.dispatchEvent(new Event("change"));
    });
    expect($("genOut").textContent).toBe("");
    expect($("genBits").textContent).toMatch(/at least one/);
    document.querySelectorAll('input[name="set"]').forEach((c) => (c.checked = true));
  });
});
