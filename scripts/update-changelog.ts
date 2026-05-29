import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultChangelog = `# Changelog

All notable changes to this project will be documented in this file.
`;
const minimumChangelogCommitTitleLength = 10;

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
 * Read and validate the module version from module.json content.
 *
 * @param moduleJsonText Raw module.json content.
 * @returns Module version.
 */
function readModuleVersionFromText(moduleJsonText: string): string {
  const moduleJson = JSON.parse(moduleJsonText) as { version?: unknown };

  if (typeof moduleJson.version !== "string" || moduleJson.version.length === 0) {
    throw new Error("src/module.json is missing a valid version string.");
  }

  return moduleJson.version;
}

/**
 * Read the current module version from src/module.json.
 *
 * @returns Current module version.
 */
function readCurrentModuleVersion(): string {
  return readModuleVersionFromText(readFileSync(resolve("src/module.json"), "utf8"));
}

/**
 * Resolve the current git branch name.
 *
 * @returns Current branch name.
 */
function readCurrentBranchName(): string {
  const branchName = run("git", ["branch", "--show-current"]);
  if (branchName.length === 0) {
    throw new Error("Could not determine the current branch name.");
  }

  return branchName;
}

/**
 * Resolve the merge base between HEAD and the main branch.
 *
 * @returns Merge-base commit SHA.
 */
function resolveMainMergeBase(): string {
  try {
    return run("git", ["merge-base", "HEAD", "origin/main"]);
  } catch {
    return run("git", ["merge-base", "HEAD", "main"]);
  }
}

/**
 * Read commit titles from this branch since it branched from main.
 *
 * @param mergeBase Merge-base commit SHA.
 * @returns Commit subject lines.
 */
function readBranchCommitTitles(mergeBase: string): string[] {
  const commitTitles = run("git", ["log", "--reverse", "--format=%s", `${mergeBase}..HEAD`])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return normalizeCommitTitles(commitTitles);
}

/**
 * Remove commit titles that are too short to be meaningful changelog entries.
 *
 * @param commitTitles Raw commit title lines.
 * @returns Changelog-worthy commit titles.
 */
export function normalizeCommitTitles(commitTitles: string[]): string[] {
  return commitTitles.filter((commitTitle) => commitTitle.length >= minimumChangelogCommitTitleLength);
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
 * Insert a release block above existing release blocks.
 *
 * @param changelog Existing changelog content.
 * @param version Module version.
 * @param title Release title.
 * @param commitTitles Commit titles to include as bullet points.
 * @returns Updated changelog content.
 */
export function insertVersionEntry(changelog: string, version: string, title: string, commitTitles: string[]): string {
  if (hasChangelogVersion(changelog, version)) {
    throw new Error(`CHANGELOG.md already contains an entry for version ${version}.`);
  }

  if (commitTitles.length === 0) {
    throw new Error("No branch commits were found to include in the changelog.");
  }

  const changelogContent = changelog.trim().length === 0 ? defaultChangelog.trimEnd() : changelog.trimEnd();
  const bulletLines = commitTitles.map((commitTitle) => `- ${commitTitle}`);
  const versionBlock = `\n\n## [${version}] - ${title}\n\n${bulletLines.join("\n")}\n`;
  const firstVersionHeading = /^## \[[^\]]+\]/mu.exec(changelogContent);

  if (firstVersionHeading?.index !== undefined) {
    const beforeVersions = changelogContent.slice(0, firstVersionHeading.index).trimEnd();
    const existingVersions = changelogContent.slice(firstVersionHeading.index).trimStart();

    return `${beforeVersions}${versionBlock}\n${existingVersions}`;
  }

  return `${changelogContent}${versionBlock}`;
}

/**
 * Generate CHANGELOG.md entry for the current branch.
 */
function main(): void {
  const version = readCurrentModuleVersion();
  const branchName = readCurrentBranchName();
  const mergeBase = resolveMainMergeBase();
  const commitTitles = readBranchCommitTitles(mergeBase);
  const changelogPath = resolve("CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  const updatedChangelog = insertVersionEntry(changelog, version, branchName, commitTitles);

  writeFileSync(changelogPath, updatedChangelog, "utf8");
  console.log(`Added CHANGELOG.md entry for ${version}.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main();
}
