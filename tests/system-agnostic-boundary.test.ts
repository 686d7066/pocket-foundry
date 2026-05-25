import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

/**
 * AI AGENT CHANGE GUARD
 * Do not modify, weaken, bypass, or delete these boundary tests unless the
 * user has given explicit permission in the current conversation.
 * This file enforces the system-agnostic architecture contract.
 */

const SRC_ROOT = toPosixPath(fileURLToPath(new URL("../src", import.meta.url)));
const SYSTEMS_ROOT = `${SRC_ROOT}/systems`;
const SOURCE_EXTENSIONS = new Set([".ts", ".hbs", ".css"]);

const CONCRETE_SYSTEM_IDS = readdirSync(SYSTEMS_ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

const ALLOWED_SYSTEM_REGISTRATION_FILES = new Set<string>([
  `${SYSTEMS_ROOT}/character-sheet-adapters.generated.ts`
]);

test("files outside concrete system folders do not import concrete system implementation files", () => {
  // Do not relax or remove this assertion without explicit permission.
  const violations: string[] = [];

  for (const filePath of collectFiles(SRC_ROOT, file => extname(file) === ".ts")) {
    if (isConcreteSystemFile(filePath)) continue;
    if (ALLOWED_SYSTEM_REGISTRATION_FILES.has(filePath)) continue;

    const source = readFileSync(filePath, "utf8");
    const specifiers = getImportSpecifiers(source);
    for (const specifier of specifiers) {
      const resolvedImport = resolveImportPath(filePath, specifier);
      if (!resolvedImport) continue;

      const targetSystemId = getConcreteSystemIdForPath(resolvedImport);
      if (!targetSystemId) continue;

      violations.push(`${formatRelativePath(filePath)} imports '${specifier}' -> ${formatRelativePath(resolvedImport)} (${targetSystemId})`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    [
      "System boundary violation: non-system code imported concrete system implementation.",
      ...violations
    ].join("\n")
  );
});

test("files outside concrete system folders do not hard-code concrete system ids", () => {
  // Do not relax or remove this assertion without explicit permission.
  const violations: string[] = [];

  for (const filePath of collectFiles(SRC_ROOT, file => SOURCE_EXTENSIONS.has(extname(file)))) {
    if (isConcreteSystemFile(filePath)) continue;
    if (ALLOWED_SYSTEM_REGISTRATION_FILES.has(filePath)) continue;

    const source = readFileSync(filePath, "utf8");
    for (const systemId of CONCRETE_SYSTEM_IDS) {
      const escapedSystemId = escapeRegExp(systemId);
      const systemPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapedSystemId}([^A-Za-z0-9_]|$)`, "gmi");

      for (const match of source.matchAll(systemPattern)) {
        const matchIndex = match.index ?? 0;
        const lineNumber = getLineNumber(source, matchIndex);
        violations.push(`${formatRelativePath(filePath)}:${lineNumber} contains concrete system id '${systemId}'`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    [
      "System boundary violation: non-system code hard-coded a concrete system id.",
      ...violations
    ].join("\n")
  );
});

function collectFiles(rootDir: string, include: (filePath: string) => boolean): string[] {
  const files: string[] = [];
  const pending: string[] = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) continue;

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const absolutePath = `${currentDir}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (include(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort();
}

function getImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticImportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/gm;
  const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/gm;

  for (const match of source.matchAll(staticImportPattern)) {
    specifiers.push(match[1] ?? "");
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1] ?? "");
  }

  return specifiers;
}

function resolveImportPath(importerPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return posix.normalize(posix.join(posix.dirname(importerPath), specifier));
}

function getConcreteSystemIdForPath(filePath: string): string | null {
  for (const systemId of CONCRETE_SYSTEM_IDS) {
    if (filePath.startsWith(`${SYSTEMS_ROOT}/${systemId}/`)) {
      return systemId;
    }
  }
  return null;
}

function isConcreteSystemFile(filePath: string): boolean {
  return getConcreteSystemIdForPath(filePath) !== null;
}

function getLineNumber(text: string, characterIndex: number): number {
  return text.slice(0, characterIndex).split("\n").length;
}

function formatRelativePath(absolutePath: string): string {
  const prefix = `${SRC_ROOT}/`;
  if (!absolutePath.startsWith(prefix)) return absolutePath;
  return `src/${absolutePath.slice(prefix.length)}`;
}

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

