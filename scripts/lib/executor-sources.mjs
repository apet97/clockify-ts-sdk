// Shared "who might execute this file" text sources: Makefile, root
// package.json, and every .github/workflows/*.yml(aml). Extracted from
// scripts/check-test-wiring.mjs (its original single consumer) so
// scripts/check-gate-reachability.mjs can reuse the exact same executor
// surface for `node scripts/check-*.mjs` invocations instead of building a
// second Makefile/workflow scanner -- the union matters for both: a
// Makefile-only scan wrongly reports a workflow-run or npm-script-run file
// as an orphan.
import fs from "node:fs";
import path from "node:path";

/** Read Makefile + package.json + every workflow file as {source, text} pairs, relative to `root`. */
export function collectExecutorSources(root) {
    const executors = [];
    const read = (relative) => {
        const absolute = path.join(root, relative);
        if (fs.existsSync(absolute)) executors.push({ source: relative, text: fs.readFileSync(absolute, "utf8") });
    };
    read("Makefile");
    read("package.json");
    const workflowDir = path.join(root, ".github", "workflows");
    if (fs.existsSync(workflowDir)) {
        for (const name of fs.readdirSync(workflowDir).sort()) {
            if (name.endsWith(".yml") || name.endsWith(".yaml")) read(path.posix.join(".github/workflows", name));
        }
    }
    return executors;
}
