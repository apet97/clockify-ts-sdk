#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanMarkdownRepository } from "./lib/markdown-integrity.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootIndex = process.argv.indexOf("--root");
const formatIndex = process.argv.indexOf("--format");
const rootEqualsArg = process.argv.find((argument) => argument.startsWith("--root="));
const formatEqualsArg = process.argv.find((argument) => argument.startsWith("--format="));
const root = rootEqualsArg
    ? path.resolve(rootEqualsArg.slice("--root=".length))
    : rootIndex === -1
      ? repoRoot
      : path.resolve(process.argv[rootIndex + 1] ?? "");
const format = formatEqualsArg
    ? formatEqualsArg.slice("--format=".length)
    : formatIndex === -1
      ? "text"
      : process.argv[formatIndex + 1];

function usageError(message) {
    console.error(`doc integrity scanner usage error: ${message}`);
    console.error("usage: node scripts/check-doc-links.mjs [--format=text|json] [--root PATH]");
    process.exitCode = 2;
}

if (!new Set(["text", "json"]).has(format)) usageError(`unsupported format ${JSON.stringify(format)}`);
if (process.exitCode === 2) process.exit();

try {
    const result = scanMarkdownRepository({ root });
    const output = {
        schemaVersion: result.schemaVersion,
        filesScanned: result.filesScanned,
        linksChecked: result.linksChecked,
        fragmentsChecked: result.fragmentsChecked,
        sectionReferencesChecked: result.sectionReferencesChecked,
        findings: result.findings,
    };

    if (format === "json") {
        console.log(JSON.stringify(output, null, 2));
    } else {
        console.log(`markdown files scanned : ${output.filesScanned}`);
        console.log(`links checked         : ${output.linksChecked}`);
        console.log(`fragments checked     : ${output.fragmentsChecked}`);
        console.log(`section refs checked  : ${output.sectionReferencesChecked}`);
        console.log(`findings               : ${output.findings.length}`);
        if (output.findings.length > 0) {
            console.log("");
            for (const issue of output.findings) {
                console.log(`  ${issue.kind}  ${issue.file}:${issue.line}  ->  ${issue.ref ?? issue.target ?? "(unknown)"}`);
                if (issue.message) console.log(`    ${issue.message}`);
            }
            console.log("");
            console.log("doc integrity: FINDINGS (see above)");
        } else {
            console.log("doc integrity: clean");
        }
    }
    process.exitCode = output.findings.length > 0 ? 1 : 0;
} catch (error) {
    console.error(`doc integrity scanner failed: ${error.message}`);
    process.exitCode = 2;
}
