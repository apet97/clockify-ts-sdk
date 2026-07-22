#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUniqueClaimInventoryDocument } from "./lib/unique-claim-inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.join(root, "docs/unique-claim-inventory.json");
const failures = validateUniqueClaimInventoryDocument({
    root,
    text: fs.readFileSync(inventoryPath, "utf8"),
});

if (failures.length) {
    console.error("Unique-claim inventory failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("Unique-claim inventory passed: 50 canonical claims (27 roadmap, 13 risk, 6 workflow, 4 readiness)");
