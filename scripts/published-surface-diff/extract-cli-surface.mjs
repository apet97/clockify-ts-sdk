// P1 CLI surface extractor. Points at a package root's own compiled
// `dist/index.js` (exports `buildProgram`) and `dist/commands/leaf-command.js`
// (exports `collectClassifiedLeaves`) -- the same primitives
// scripts/lib/operation-parity-cli.mjs and scripts/check-cli-contract.mjs
// already use against TypeScript source via tsx, repointed at compiled JS so
// the identical extraction works against BOTH the local candidate build and
// the unpacked published tarball (which ships dist/ only, no src/, no tsx
// dependency needed either way).
//
// collectClassifiedLeaves() only enumerates leafCommand()-registered domain
// leaves, matching scripts/lib/operation-parity-cli.mjs's own documented
// scope boundary: Commander's auto-generated `--version`/`help`
// pseudo-commands are NOT included. That is a deliberate, narrower surface
// than docs/cli-commands.json's 66-command count (64 domain leaves + those
// 2 built-ins) -- see the contract's `purpose`.
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

/**
 * @param {string} packageRoot absolute path to the package root
 * @returns {Promise<{ version: string, commands: string[] }>} `commands` is
 *   the sorted list of leaf command paths ("projects list", "entries delete").
 */
export async function extractCliSurface(packageRoot) {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

    const indexPath = path.join(packageRoot, "dist", "index.js");
    const leafPath = path.join(packageRoot, "dist", "commands", "leaf-command.js");

    const { buildProgram } = await import(pathToFileURL(indexPath).href);
    const { collectClassifiedLeaves } = await import(pathToFileURL(leafPath).href);

    const leaves = collectClassifiedLeaves(buildProgram());
    const commands = leaves.map((leaf) => leaf.path.join(" ")).sort();

    return { version: pkg.version, commands };
}
