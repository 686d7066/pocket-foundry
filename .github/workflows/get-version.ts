import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read and validate the module version from a module.json file.
 *
 * @param moduleJsonPath Absolute or relative path to module.json.
 * @returns Version string from module.json.
 */
function readModuleVersion(moduleJsonPath: string): string {
  const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf8")) as {
    version?: unknown;
  };

  if (typeof moduleJson.version !== "string" || moduleJson.version.length === 0) {
    throw new Error("src/module.json is missing a valid version string.");
  }

  return moduleJson.version;
}

const moduleJsonPath = process.argv[2] ? resolve(process.argv[2]) : resolve("src/module.json");
console.log(readModuleVersion(moduleJsonPath));
