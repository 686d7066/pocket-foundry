import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Read and validate the module id from a module.json file.
 *
 * @param moduleJsonPath Absolute or relative path to module.json.
 * @returns Module id string from module.json.
 */
function readModuleId(moduleJsonPath: string): string {
  const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf8")) as {
    id?: unknown;
  };

  if (typeof moduleJson.id !== "string" || moduleJson.id.length === 0) {
    throw new Error("src/module.json is missing a valid id string.");
  }

  return moduleJson.id;
}

const moduleJsonPath = process.argv[2] ? resolve(process.argv[2]) : resolve("src/module.json");
console.log(readModuleId(moduleJsonPath));
