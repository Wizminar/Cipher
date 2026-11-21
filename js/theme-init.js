// Applies a saved colour theme before first paint (kept out of the HTML so the CSP can forbid inline scripts).
try {
  const t = localStorage.getItem("cipher-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch {}
