// Copies only the files the site needs into dist/ for deployment.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = ["index.html", "manifest.webmanifest", "sw.js", "css", "js", "assets"];

const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const entry of PUBLIC) cpSync(join(root, entry), join(dist, entry), { recursive: true });
console.log(`Built dist/ with: ${PUBLIC.join(", ")}`);
