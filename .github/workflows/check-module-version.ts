import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type PreReleaseIdentifier = number | string;

type ParsedSemVer = {
  core: number[];
  prerelease: PreReleaseIdentifier[];
};

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
 * Determine whether the pull request changed module source files.
 *
 * @param baseSha Pull request base SHA.
 * @returns True when at least one source file under src/ (except src/module.json) changed.
 */
function hasModuleSourceChanges(baseSha: string): boolean {
  const changedFilesOutput = run("git", ["diff", "--name-only", `${baseSha}...HEAD`, "--", "src"]);
  const changedFiles = changedFilesOutput
    .split("\n")
    .map((filePath) => filePath.trim())
    .filter((filePath) => filePath.length > 0);

  return changedFiles.some((filePath) => filePath !== "src/module.json");
}

/**
 * Parse semver-like version into core and prerelease parts.
 *
 * Build metadata (`+...`) is ignored for ordering comparisons.
 *
 * @param version Version string.
 * @returns Parsed version parts.
 */
export function parseSemVer(version: string): ParsedSemVer {
  const buildSeparatorIndex = version.indexOf("+");
  const withoutBuild = buildSeparatorIndex >= 0 ? version.slice(0, buildSeparatorIndex) : version;
  const prereleaseSeparatorIndex = withoutBuild.indexOf("-");
  const corePart = prereleaseSeparatorIndex >= 0 ? withoutBuild.slice(0, prereleaseSeparatorIndex) : withoutBuild;
  const prereleasePart = prereleaseSeparatorIndex >= 0 ? withoutBuild.slice(prereleaseSeparatorIndex + 1) : "";
  const core = corePart.split(".").map((segment) => Number.parseInt(segment, 10));

  if (core.length === 0 || core.some((segment) => Number.isNaN(segment))) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const prerelease = prereleasePart.length === 0
    ? []
    : prereleasePart.split(".").map((identifier) => {
      const numeric = Number.parseInt(identifier, 10);
      if (Number.isNaN(numeric) || `${numeric}` !== identifier) {
        return identifier;
      }

      return numeric;
    });

  if (prerelease.some((identifier) => `${identifier}`.length === 0)) {
    throw new Error(`Invalid prerelease format: ${version}`);
  }

  return { core, prerelease };
}

/**
 * Compare two parsed prerelease identifier arrays.
 *
 * @param left Left prerelease identifiers.
 * @param right Right prerelease identifiers.
 * @returns Positive if left > right, zero if equal, negative if left < right.
 */
function comparePrerelease(left: PreReleaseIdentifier[], right: PreReleaseIdentifier[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];

    if (leftValue === undefined) return -1;
    if (rightValue === undefined) return 1;
    if (leftValue === rightValue) continue;

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return leftValue - rightValue;
    }

    if (typeof leftValue === "number") return -1;
    if (typeof rightValue === "number") return 1;

    return leftValue.localeCompare(rightValue);
  }

  return 0;
}

/**
 * Compare two parsed semver values.
 *
 * @param left Left parsed semver value.
 * @param right Right parsed semver value.
 * @returns Positive if left > right, zero if equal, negative if left < right.
 */
function compareParsedSemVer(left: ParsedSemVer, right: ParsedSemVer): number {
  const length = Math.max(left.core.length, right.core.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = left.core[index] ?? 0;
    const rightValue = right.core[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * Compare two semver-like values.
 *
 * @param left Left version string.
 * @param right Right version string.
 * @returns Positive if left > right, zero if equal, negative if left < right.
 */
export function compareSemVer(left: string, right: string): number {
  return compareParsedSemVer(parseSemVer(left), parseSemVer(right));
}

/**
 * Execute the module version gate for the pull request.
 *
 * @param baseSha Pull request base SHA.
 */
function main(baseSha: string): void {
  if (!baseSha) {
    throw new Error("Missing pull request base SHA argument.");
  }

  if (!hasModuleSourceChanges(baseSha)) {
    console.log("No module source changes under src/. Skipping version bump check.");
    return;
  }

  const scriptPath = ".github/workflows/get-version.ts";
  const headVersion = run("node", ["--experimental-strip-types", scriptPath]);

  const tempDirectory = mkdtempSync(join(tmpdir(), "pocket-foundry-base-"));
  const baseModuleJsonPath = join(tempDirectory, "module.json");

  try {
    const baseModuleJson = run("git", ["show", `${baseSha}:src/module.json`]);
    writeFileSync(baseModuleJsonPath, baseModuleJson, "utf8");

    const baseVersion = run("node", ["--experimental-strip-types", scriptPath, baseModuleJsonPath]);

    console.log(`Base version: ${baseVersion}`);
    console.log(`Head version: ${headVersion}`);

    if (compareSemVer(headVersion, baseVersion) <= 0) {
      throw new Error("src/module.json version must be increased for this PR.");
    }
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main(process.argv[2] ?? "");
}
