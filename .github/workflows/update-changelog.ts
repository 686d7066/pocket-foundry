import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { compareSemVer } from "./check-module-version.ts";

type VersionChange = {
  currentVersion: string;
  previousVersion: string | null;
};

type MainOptions = {
  checkOnly: boolean;
};

const defaultChangelog = `# Changelog

All notable changes to this project will be documented in this file.
`;

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
 * Read the module version from the working tree.
 *
 * @returns Current module version.
 */
function readCurrentModuleVersion(): string {
  return readModuleVersionFromText(readFileSync(resolve("src/module.json"), "utf8"));
}

/**
 * Read the module version from a git ref.
 *
 * @param ref Git ref or SHA to read.
 * @returns Version at the ref, or null if the ref has no module.json.
 */
function readModuleVersionAtRef(ref: string): string | null {
  try {
    return readModuleVersionFromText(run("git", ["show", `${ref}:src/module.json`]));
  } catch {
    return null;
  }
}

/**
 * Read the message to convert into a changelog entry.
 *
 * @returns Commit or pull request title text.
 */
function readChangelogMessage(): string {
  return process.env.CHANGELOG_COMMIT_MESSAGE ?? run("git", ["log", "-1", "--format=%B"]);
}

/**
 * Determine the current and previous module versions for a push.
 *
 * @param previousRef Ref before the push.
 * @returns Current and previous module versions.
 */
function getVersionChange(previousRef: string): VersionChange {
  return {
    currentVersion: readCurrentModuleVersion(),
    previousVersion: previousRef.length === 0 ? null : readModuleVersionAtRef(previousRef)
  };
}

/**
 * Extract changelog bullet lines from a squash commit message or pull request text.
 *
 * @param commitMessage Full commit message.
 * @returns Changelog bullet lines.
 */
export function parseChangelogItems(commitMessage: string): string[] {
  const lines = commitMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return ["- Update module"];
  }

  const bulletLines = lines.filter((line) => line.startsWith("- "));
  if (bulletLines.length > 0) return bulletLines;

  return [`- ${lines[0]?.replace(/\s+\(#\d+\)$/, "") ?? "Update module"}`];
}

/**
 * Insert a released version block into a changelog.
 *
 * @param changelog Existing changelog content.
 * @param version Released version.
 * @param date Release date in YYYY-MM-DD format.
 * @param items Changelog bullet lines.
 * @returns Updated changelog content and whether it changed.
 */
export function insertVersionEntry(
  changelog: string,
  version: string,
  date: string,
  items: string[]
): { changed: boolean; content: string } {
  if (new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\]`, "mu").test(changelog)) {
    return { changed: false, content: changelog };
  }

  const changelogContent = changelog.trim().length === 0 ? defaultChangelog.trimEnd() : changelog.trimEnd();
  const versionBlock = `\n\n## [${version}] - ${date}\n\n${items.join("\n")}\n`;

  return {
    changed: true,
    content: `${changelogContent}${versionBlock}`
  };
}

/**
 * Write an output for GitHub Actions.
 *
 * @param name Output name.
 * @param value Output value.
 */
function writeOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
    return;
  }

  console.log(`${name}=${value}`);
}

/**
 * Update CHANGELOG.md when the module version increased.
 *
 * @param previousRef Ref before the push.
 * @param changelogPath Path to CHANGELOG.md.
 * @param options Runtime options.
 */
function main(previousRef: string, changelogPath = "CHANGELOG.md", options: MainOptions = { checkOnly: false }): void {
  const { currentVersion, previousVersion } = getVersionChange(previousRef);

  writeOutput("version", currentVersion);

  if (previousVersion !== null) {
    const versionComparison = compareSemVer(currentVersion, previousVersion);

    if (versionComparison < 0) {
      throw new Error(`Module version moved backwards from ${previousVersion} to ${currentVersion}.`);
    }

    if (versionComparison === 0) {
      writeOutput("should_release", "false");
      writeOutput("changelog_changed", "false");
      console.log(`Module version ${currentVersion} is unchanged. Skipping changelog update and release.`);
      return;
    }
  }

  const commitMessage = readChangelogMessage();
  const items = parseChangelogItems(commitMessage);
  const changelogAbsolutePath = resolve(changelogPath);
  const changelog = existsSync(changelogAbsolutePath) ? readFileSync(changelogAbsolutePath, "utf8") : defaultChangelog;
  const date = new Date().toISOString().slice(0, 10);
  const update = insertVersionEntry(changelog, currentVersion, date, items);

  if (update.changed && !options.checkOnly) {
    writeFileSync(changelogAbsolutePath, update.content, "utf8");
  }

  writeOutput("should_release", "true");
  writeOutput("changelog_changed", update.changed && !options.checkOnly ? "true" : "false");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main(process.argv[2] ?? "", "CHANGELOG.md", { checkOnly: process.argv.includes("--check-only") });
}
