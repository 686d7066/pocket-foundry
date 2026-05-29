import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compareSemVer } from "./check-module-version.ts";

/**
 * Run a command and return stdout as trimmed text.
 *
 * @param command Executable name.
 * @param args Command arguments.
 * @returns Trimmed stdout.
 */
function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

/**
 * Read and validate the module version from a module.json string.
 *
 * @param moduleJsonText Raw module.json content.
 * @returns Version string from module.json.
 */
function readModuleVersionFromText(moduleJsonText: string): string {
  const moduleJson = JSON.parse(moduleJsonText) as { version?: unknown };

  if (typeof moduleJson.version !== "string" || moduleJson.version.length === 0) {
    throw new Error("module.json is missing a valid version string.");
  }

  return moduleJson.version;
}

/**
 * Read the module version from a git ref.
 *
 * @param ref Git ref or SHA to read.
 * @returns Version at the ref.
 */
function readModuleVersionAtRef(ref: string): string {
  return readModuleVersionFromText(run("git", ["show", `${ref}:src/module.json`]));
}

/**
 * Read the current module version from the working tree.
 *
 * @returns Current module version.
 */
function readCurrentModuleVersion(): string {
  return readModuleVersionFromText(readFileSync(resolve("src/module.json"), "utf8"));
}

/**
 * Determine whether a changelog contains a release heading for a module version.
 *
 * @param changelog Changelog content.
 * @param version Module version.
 * @returns True when the changelog contains a version heading.
 */
export function hasChangelogVersion(changelog: string, version: string): boolean {
  return new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\]`, "mu").test(changelog);
}

/**
 * Append a message to the GitHub Actions step summary when available.
 *
 * @param message Markdown message.
 */
function writeStepSummary(message: string): void {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`, "utf8");
}

/**
 * Execute the pull request changelog gate.
 *
 * @param baseSha Pull request base SHA.
 */
function main(baseSha: string): void {
  if (!baseSha) {
    throw new Error("Missing pull request base SHA argument.");
  }

  const baseVersion = readModuleVersionAtRef(baseSha);
  const headVersion = readCurrentModuleVersion();

  if (compareSemVer(headVersion, baseVersion) <= 0) {
    console.log("Module version was not increased. Skipping changelog check.");
    return;
  }

  const changelog = readFileSync(resolve("CHANGELOG.md"), "utf8");
  if (hasChangelogVersion(changelog, headVersion)) {
    console.log(`CHANGELOG.md contains an entry for module version ${headVersion}.`);
    return;
  }

  const message = [
    "## Changelog Update Required",
    "",
    `Module version \`${headVersion}\` is required for this PR, but \`CHANGELOG.md\` does not mention it.`,
    "",
    "Run `npm run changelog`, review the generated entry, and push the result."
  ].join("\n");

  writeStepSummary(message);
  console.error(`::error title=Changelog update required::CHANGELOG.md must contain an entry for ${headVersion}. Run npm run changelog.`);
  throw new Error(`CHANGELOG.md must contain an entry for ${headVersion}.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main(process.argv[2] ?? "");
}
