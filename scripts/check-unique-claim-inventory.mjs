#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUniqueClaimInventory } from "./lib/unique-claim-inventory.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
let failures;
try { failures = validateUniqueClaimInventory({ root, policy: readJson("docs/unique-claim-inventory.json").policy, inventory: readJson("docs/unique-claim-inventory.json") }); } catch (error) { failures = [`malformed JSON: ${error.message}`]; }
if (failures.length) { console.error("Unique-claim inventory failed:"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
console.log("Unique-claim inventory passed");
