// Copies only the three site files into dist/ for deployment.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = ["index.html", "style.css", "script.js"];

const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const file of PUBLIC) cpSync(join(root, file), join(dist, file));
console.log(`Built dist/ with: ${PUBLIC.join(", ")}`);
