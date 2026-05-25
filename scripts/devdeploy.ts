import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const moduleId = "pocket-foundry";
const distRoot = resolve(projectRoot, "dist", moduleId);
const deployTarget = String.raw`F:\Repos\Local\FoundryStuff\Foundry\FoundryVTT-WindowsPortable-14.361\Data\modules\pocket-foundry`;

if (!existsSync(distRoot)) {
  throw new Error("Dist addon output is missing. Run npm run build before deploying.");
}

rmSync(deployTarget, { recursive: true, force: true });
mkdirSync(deployTarget, { recursive: true });
cpSync(distRoot, deployTarget, { recursive: true });
console.log(`Deployed ${moduleId} to ${deployTarget}`);
