import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
 * Parse version into numeric segments for strict ordering checks.
 *
 * @param version Semver-like version string.
 * @returns Numeric segments.
 */
function parseVersionSegments(version: string): number[] {
  const core = version.split("-", 1)[0];
  const segments = core.split(".").map((segment) => Number.parseInt(segment, 10));

  if (segments.length === 0 || segments.some((segment) => Number.isNaN(segment))) {
    throw new Error(`Invalid version format: ${version}`);
  }

  return segments;
}

/**
 * Compare two numeric version arrays.
 *
 * @param left Left version segments.
 * @param right Right version segments.
 * @returns Positive if left > right, zero if equal, negative if left < right.
 */
function compareVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

const baseSha = process.argv[2];
if (!baseSha) {
  throw new Error("Missing pull request base SHA argument.");
}

if (!hasModuleSourceChanges(baseSha)) {
  console.log("No module source changes under src/. Skipping version bump check.");
  process.exit(0);
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

  if (compareVersions(parseVersionSegments(headVersion), parseVersionSegments(baseVersion)) <= 0) {
    throw new Error("src/module.json version must be increased for this PR.");
  }
} finally {
  rmSync(tempDirectory, { force: true, recursive: true });
}
