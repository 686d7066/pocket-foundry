import { readFileSync } from "node:fs";

const moduleJsonPath = new URL("../../src/module.json", import.meta.url);
const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf8"));

if (typeof moduleJson.version !== "string" || moduleJson.version.length === 0) {
  throw new Error("src/module.json is missing a valid version string.");
}

console.log(moduleJson.version);
