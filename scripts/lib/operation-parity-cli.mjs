// W1: CLI leaf -> client.<resource>.<method> call-site mapping for the
// operation-parity `cli` column, extracted so it is directly unit-testable
// (see generate-operation-parity.test.mjs) without staging this generator's
// full input set -- the same rationale as operation-parity-provenance.mjs
// and operation-parity-aliases.mjs.
//
// Derivation: spawn a real tsx-loaded introspection of cli/src/index.ts's
// Commander program tree (the same `--import tsx --input-type=module
// --eval` technique scripts/check-cli-contract.mjs's checkExamplesCoverage
// already uses for its own addHelpText check). Command.prototype.action is
// monkey-patched to capture each leaf's ORIGINAL handler function before
// Commander wraps it, then `fn.toString()` is regex-scanned for
// `client.<resource>.<method>` call sites -- a text scan, not an AST pass:
// every CLI leaf destructures the SDK client under the single, consistent
// name `client` (resolveContext's/resolveBaseContext's binding), so the
// dotted call sites are stable, greppable identifiers that match
// docs/operation-dispositions.json's `generated.clientPath` values exactly.
//
// Commander's own built-ins (`--version`, `help`) are NOT included --
// cli/src/commands/leaf-command.ts's collectClassifiedLeaves() only
// enumerates leafCommand()-registered domain leaves, never Commander's
// auto-generated pseudo-commands. docs/cli-commands.json's 66-command count
// includes those 2 built-ins on top of the 64 domain leaves this module
// sees; that is a different, broader count than operation-parity's CLI
// column needs (an operationId can never correspond to `--version`/`help`).
import { spawnSync } from "node:child_process";

const INTROSPECTION_SOURCE = [
    'import { Command } from "commander";',
    "const originalAction = Command.prototype.action;",
    "const handlers = new Map();",
    "Command.prototype.action = function (fn) {",
    "    handlers.set(this, fn);",
    "    return originalAction.call(this, fn);",
    "};",
    'const { buildProgram } = await import("./cli/src/index.ts");',
    'const { collectClassifiedLeaves } = await import("./cli/src/commands/leaf-command.ts");',
    "const leaves = collectClassifiedLeaves(buildProgram());",
    "const rows = leaves.map(({ command, path }) => {",
    "    const fn = handlers.get(command);",
    "    const source = fn ? fn.toString() : \"\";",
    "    const calls = [...new Set([...source.matchAll(/\\bclient\\.\\w+\\.\\w+/g)].map((m) => m[0]))];",
    '    return { path: path.join(" "), calls };',
    "});",
    "console.log(JSON.stringify(rows));",
].join("\n");

/**
 * Spawn the real CLI program (via tsx) and return `[{ path, calls }]` for
 * every leafCommand()-registered leaf: `path` is the leaf's full command
 * path ("tags list"), `calls` is the deduplicated list of
 * `client.<resource>.<method>` strings found in that leaf's own action
 * handler source. `spawnImpl` is injectable so tests never spawn a real
 * subprocess.
 */
export function scanCliLeafCallSites({ root, spawnImpl = spawnSync } = {}) {
    const result = spawnImpl(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", INTROSPECTION_SOURCE],
        { cwd: root, encoding: "utf8" },
    );
    if (result.status !== 0) {
        throw new Error(
            `scanCliLeafCallSites: introspection failed: ${(result.stderr ?? "").trim() || `exited ${result.status}`}`,
        );
    }
    return JSON.parse(result.stdout);
}

/**
 * Build a `client.<resource>.<method>` -> leaf-path map from a
 * scanCliLeafCallSites() result. Multiple leaves can call the same client
 * path (a delete leaf that archives-then-deletes also calls `.update`, for
 * example); the FIRST leaf in `rows` order wins, which in registration
 * order is the leaf whose own name matches the operation -- list/create/
 * get/update leaves register before delete leaves in every command group.
 */
export function cliLeafByClientPath(rows) {
    const byClientPath = new Map();
    for (const row of rows) {
        for (const call of row.calls) {
            if (!byClientPath.has(call)) byClientPath.set(call, row.path);
        }
    }
    return byClientPath;
}
