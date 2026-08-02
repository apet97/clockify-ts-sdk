#!/usr/bin/env node
// find-doc-integrity: reports markdown cross-references that do not resolve.
//
// Two classes of defect, neither covered elsewhere in this repo:
//   1. a relative link [text](./path) whose target file does not exist
//   2. a "see §N" reference to a numbered section that the file lacks
//
// scripts/check-doc-index.mjs already validates links, but ONLY inside
// docs/README.md. This covers every other markdown file.
//
// Exit 0 = clean. Exit 1 = findings. Exit 2 = the scan itself failed.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const EXCLUDED = [
    "node_modules",
    ".git",
    "dist",
    "output",
    "docs/api",
    "wrapper/src",
    ".claude",
];

function isExcluded(rel) {
    return EXCLUDED.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

function collectMarkdown(dir) {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(root, abs);
        if (isExcluded(rel)) continue;
        if (entry.isDirectory()) found.push(...collectMarkdown(abs));
        else if (entry.name.endsWith(".md")) found.push(rel);
    }
    return found;
}

// A link into generated typedoc output is not broken, just unbuilt.
function isGeneratedApiTarget(relTarget) {
    return relTarget === "docs/api" || relTarget.startsWith("docs/api/");
}

const findings = [];
let linkCount = 0;
let anchorCount = 0;

const files = collectMarkdown(root).sort();

for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), "utf8");

    // 1. relative links: [text](./x) or [text](../x), optional #anchor
    for (const match of text.matchAll(/\]\((\.[^)#\s]*)(?:#[^)]*)?\)/g)) {
        linkCount += 1;
        const target = path.resolve(path.dirname(path.join(root, file)), match[1]);
        const relTarget = path.relative(root, target);
        if (isGeneratedApiTarget(relTarget)) continue;
        if (!fs.existsSync(target)) {
            findings.push({ kind: "broken-link", file, ref: match[1] });
        }
    }

    // 2. "see §N" must match a heading that starts with that number
    for (const match of text.matchAll(/see §(\d+[a-z]?)/gi)) {
        anchorCount += 1;
        const section = match[1];
        const heading = new RegExp(`^##+ ${section.replace(".", "\\.")}\\.`, "m");
        if (!heading.test(text)) {
            findings.push({ kind: "unresolved-section", file, ref: `§${section}` });
        }
    }
}

console.log(`markdown files scanned : ${files.length}`);
console.log(`relative links checked : ${linkCount}`);
console.log(`section refs checked   : ${anchorCount}`);
console.log(`findings               : ${findings.length}`);

if (findings.length > 0) {
    console.log("");
    for (const f of findings) console.log(`  ${f.kind}  ${f.file}  ->  ${f.ref}`);
    console.log("");
    console.log("doc integrity: FINDINGS (see above)");
    process.exitCode = 1;
} else {
    console.log("doc integrity: clean");
}
