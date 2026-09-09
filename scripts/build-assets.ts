import { statSync } from "node:fs";
import { extname } from "node:path";

const RUNTIME_ASSET_EXTENSIONS = new Set([
  ".json", ".hbs", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".ogg", ".wav", ".mp4", ".webm", ".pdf"
]);

/** Allows runtime data, templates, and media through static copying; code and styles are compiled separately. */
export function isRuntimeAsset(path: string): boolean {
  return statSync(path).isDirectory() || RUNTIME_ASSET_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Normalizes generated text independently of the generator's checkout line endings. */
export function normalizeGeneratedLineEndings(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "\r\n");
}
