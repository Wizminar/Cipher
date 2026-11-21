// Serves dist/ with the exact headers from netlify.toml, to test the CSP locally.
// Usage: npm run build && node scripts/serve-prod.mjs [port]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const toml = readFileSync(join(root, "netlify.toml"), "utf8");
const block = toml.slice(toml.indexOf('for = "/*"'), toml.indexOf("[[headers]]", toml.indexOf('for = "/*"')));
const headers = Object.fromEntries([...block.matchAll(/^\s+([\w-]+) = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
delete headers["Strict-Transport-Security"]; // meaningless over http://localhost
const csp = headers["Content-Security-Policy"];
headers["Content-Security-Policy"] = csp.replace("; upgrade-insecure-requests", "");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, path);
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404, headers).end("Not found");
  res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(+process.argv[2] || 4173, () => console.log(`Serving dist/ with production headers on http://localhost:${+process.argv[2] || 4173}`));
