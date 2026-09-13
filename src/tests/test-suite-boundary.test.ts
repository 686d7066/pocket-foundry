import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "vitest";

test("global tests and fixtures do not reference concrete system implementations or identifiers", () => {
  const systemIds = readdirSync(new URL("../systems/", import.meta.url), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name.toLowerCase());
  const root = fileURLToPath(new URL(".", import.meta.url));
  const violations: string[] = [];
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" }).filter(name => name.endsWith(".ts"))) {
    const source = ts.createSourceFile(file, readFileSync(resolve(root, file), "utf8"), ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const value = node.text.toLowerCase();
        for (const id of systemIds) {
          if (!value.includes(id)) continue;
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          violations.push(`${file}:${line + 1} references ${id}`);
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  }
  assert.deepEqual(violations, []);
});
