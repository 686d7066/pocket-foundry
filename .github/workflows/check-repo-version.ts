import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
 * Read and validate the package version from package.json content.
 *
 * @param packageJsonText Raw package.json content.
 * @returns Version string from package.json.
 */
export function readPackageVersionFromText(packageJsonText: string): string {
  const packageJson = JSON.parse(packageJsonText) as { version?: unknown };

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json is missing a valid version string.");
  }

  return packageJson.version;
}

/**
 * Determine whether a pull request changed at least one tracked repository file.
 *
 * @param baseSha Pull request base SHA.
 * @returns True when the repository diff contains any changed file.
 */
function hasRepositoryChanges(baseSha: string): boolean {
  return run("git", ["diff", "--name-only", baseSha.concat("...HEAD")]).length > 0;
}

/**
 * Read the current package.json version from the working tree.
 *
 * @returns Current package version.
 */
function readCurrentPackageVersion(): string {
  return readPackageVersionFromText(readFileSync(resolve("package.json"), "utf8"));
}

/**
 * Read the package.json version from a git ref.
 *
 * @param ref Git ref or SHA to read.
 * @returns Package version at the ref.
 */
function readPackageVersionAtRef(ref: string): string {
  return readPackageVersionFromText(run("git", ["show", ref.concat(":package.json")]));
}

/**
 * Determine whether the head package version is higher than the base version.
 *
 * @param headVersion Current package version.
 * @param baseVersion Base package version.
 * @returns True when headVersion is greater than baseVersion.
 */
export function isPackageVersionIncreased(headVersion: string, baseVersion: string): boolean {
  return compareSemVer(headVersion, baseVersion) > 0;
}

/**
 * Execute the repository version gate for the pull request.
 *
 * @param baseSha Pull request base SHA.
 */
function main(baseSha: string): void {
  if (!baseSha) {
    throw new Error("Missing pull request base SHA argument.");
  }

  if (!hasRepositoryChanges(baseSha)) {
    console.log("No repository changes. Skipping package version check.");
    return;
  }

  const baseVersion = readPackageVersionAtRef(baseSha);
  const headVersion = readCurrentPackageVersion();

  console.log(`Base package version: ${baseVersion}`);
  console.log(`Head package version: ${headVersion}`);

  if (!isPackageVersionIncreased(headVersion, baseVersion)) {
    throw new Error("package.json version must be increased for this PR.");
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main(process.argv[2] ?? "");
}
