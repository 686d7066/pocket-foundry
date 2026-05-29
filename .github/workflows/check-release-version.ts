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
 * Read and validate the module version from module.json content.
 *
 * @param moduleJsonText Raw module.json content.
 * @returns Module version.
 */
function readModuleVersionFromText(moduleJsonText: string): string {
  const moduleJson = JSON.parse(moduleJsonText) as { version?: unknown };

  if (typeof moduleJson.version !== "string" || moduleJson.version.length === 0) {
    throw new Error("module.json is missing a valid version string.");
  }

  return moduleJson.version;
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
 * Read the module version from a git ref.
 *
 * @param ref Git ref or SHA to read.
 * @returns Module version at the ref.
 */
function readModuleVersionAtRef(ref: string): string {
  return readModuleVersionFromText(run("git", ["show", `${ref}:src/module.json`]));
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
 * Execute the release version gate for a push to main.
 *
 * @param previousRef Ref before the push.
 */
function main(previousRef: string): void {
  if (!previousRef) {
    throw new Error("Missing previous push SHA argument.");
  }

  const currentVersion = readCurrentModuleVersion();
  const previousVersion = readModuleVersionAtRef(previousRef);
  const versionComparison = compareSemVer(currentVersion, previousVersion);

  writeOutput("version", currentVersion);

  if (versionComparison < 0) {
    throw new Error(`Module version moved backwards from ${previousVersion} to ${currentVersion}.`);
  }

  if (versionComparison === 0) {
    writeOutput("should_release", "false");
    console.log(`Module version ${currentVersion} is unchanged. Skipping module release.`);
    return;
  }

  writeOutput("should_release", "true");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main(process.argv[2] ?? "");
}
