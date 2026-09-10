import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { isRuntimeAsset, normalizeGeneratedLineEndings } from "../scripts/build-assets.ts";

test("static packaging preserves nested runtime assets and excludes source files", () => {
  const temporary = mkdtempSync(join(tmpdir(), "pocket-foundry-assets-"));
  try {
    const source = join(temporary, "src");
    const target = join(temporary, "dist");
    mkdirSync(join(source, "nested"), { recursive: true });
    for (const name of ["module.json", "sheet.hbs", "image.png", "font.woff2", "index.ts", "types.d.ts", "code.js", "code.js.map", "styles.css", "styles.scss", "README.md"]) {
      writeFileSync(join(source, "nested", name), "fixture");
    }
    cpSync(source, target, { recursive: true, filter: isRuntimeAsset });
    assert.deepEqual(readdirSync(join(target, "nested")).sort(), ["font.woff2", "image.png", "module.json", "sheet.hbs"]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("generated text uses CRLF for LF, CRLF, and mixed input without doubling carriage returns", () => {
  for (const source of ["a\nb\nc\n", "a\r\nb\r\nc\r\n", "a\r\nb\nc\r"]) {
    const result = normalizeGeneratedLineEndings(source);
    assert.equal(result, "a\r\nb\r\nc\r\n");
    assert.equal(normalizeGeneratedLineEndings(result), result);
  }
});
