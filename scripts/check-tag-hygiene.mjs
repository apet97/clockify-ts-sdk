#!/usr/bin/env node
// Fail if any LOCAL git tag has the bare-semver shape `v<major>.<minor>.<patch>`.
// That is the shape `.github/workflows/release.yml` publishes on. Safe,
// publish-inert convention: wrapper-v*, cli-v*, mcp-v*.
//
// Remote tags are intentionally not checked here; audit them manually with:
//   git ls-remote --tags origin | grep -E 'refs/tags/v[0-9]+[.][0-9]+[.][0-9]+'
import { execFileSync } from "node:child_process";

const SAFE_PREFIXES = ["wrapper-v", "cli-v", "mcp-v"];
const BARE_SEMVER = /^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+.][0-9A-Za-z-]+)*$/;
const failures = [];

function fail(message) {
    failures.push(message);
}

let tags = [];
try {
    const output = execFileSync("git", ["tag", "--list"], { encoding: "utf8" });
    tags = output
        .split("\n")
        .map((tag) => tag.trim())
        .filter(Boolean);
} catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`tag-hygiene: could not list local tags: ${reason}`);
    process.exit(1);
}

for (const tag of tags) {
    if (BARE_SEMVER.test(tag)) {
        fail(
            `local tag ${tag} has the bare-semver shape that release.yml ` +
                `(on.push.tags: "v*.*.*") publishes on. Delete it ` +
                `(git tag -d ${tag}) and use a package-prefixed tag instead: ` +
                SAFE_PREFIXES.map((prefix) => `${prefix}<version>`).join(", ") +
                ".",
        );
    }
}

if (failures.length > 0) {
    console.error("tag-hygiene check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(
        "\nRemote tags are NOT checked here; audit them manually with:\n" +
            "  git ls-remote --tags origin | grep -E 'refs/tags/v[0-9]+[.][0-9]+[.][0-9]+'",
    );
    process.exit(1);
}

console.log(
    `tag-hygiene passed (${tags.length} local tag(s); no bare-semver publish-trigger shape). ` +
        "Remote tags unchecked; run the documented git ls-remote audit before release.",
);
