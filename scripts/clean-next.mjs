/**
 * Remove `.next` so the next `next dev` / `next build` does a full rebuild.
 * Fixes stale webpack chunks (e.g. "Cannot find module './948.js'") after hot reload on Windows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../", import.meta.url)));
const nextDir = path.join(root, ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("Removed .next");
} catch (e) {
  if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
    console.log(".next already absent");
  } else {
    throw e;
  }
}
