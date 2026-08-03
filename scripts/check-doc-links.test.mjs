import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { scanMarkdownRepository } from "./lib/markdown-integrity.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/check-doc-links.mjs");

async function withFixture(files, callback, { links = [], committedClaudePaths } = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), "markdown-integrity-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "markdown-integrity-outside-"));
    try {
        for (const [relativePath, content] of Object.entries(files)) {
            const absolute = path.join(root, relativePath);
            await mkdir(path.dirname(absolute), { recursive: true });
            if (content !== null) await writeFile(absolute, content);
        }
        for (const link of links) {
            const absolute = path.join(root, link.path);
            await mkdir(path.dirname(absolute), { recursive: true });
            await symlink(link.target === "__OUTSIDE__" ? outside : link.target, absolute);
        }
        return await callback(root, { outside, committedClaudePaths });
    } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
    }
}

function scan(root, options = {}) {
    return scanMarkdownRepository({ root, ...options });
}

function assertClean(result) {
    assert.deepEqual(result.findings, []);
    assert.ok(result.filesScanned > 0);
    assert.ok(result.linksChecked >= 0);
}

function kinds(result) {
    return result.findings.map((finding) => finding.kind);
}

test("checks bare relative links", async () => {
    await withFixture({ "index.md": "[target](target.md)\n", "target.md": "# Target\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("checks dotted relative links and existing directories", async () => {
    await withFixture({ "docs/index.md": "[root](../README.md) [dir](../docs/)\n", "README.md": "# Root\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("checks inline titles", async () => {
    await withFixture({ "index.md": '[target](target.md "a title")\n', "target.md": "# Target\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("checks angle-bracket destinations", async () => {
    await withFixture({ "index.md": "[target](<target file.md>)\n", "target file.md": "# Target\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("decodes percent-encoded spaces", async () => {
    await withFixture({ "index.md": "[target](target%20file.md)\n", "target file.md": "# Target\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("handles escaped and nested parentheses in destinations", async () => {
    await withFixture(
        {
            "index.md": "[escaped](./escaped \\(file\\).md) [nested](./nested/(inner).md)\n",
            "escaped (file).md": "# Escaped\n",
            "nested/(inner).md": "# Nested\n",
        },
        (root) => assertClean(scan(root)),
    );
});

test("resolves full, collapsed, and shortcut references with normalized labels", async () => {
    await withFixture(
        {
            "index.md": "[full][MY  REF] [collapsed][] [shortcut]\n\n[my ref]: ./full.md\n[collapsed]: ./collapsed.md\n[shortcut]: ./shortcut.md\n",
            "full.md": "# Full\n",
            "collapsed.md": "# Collapsed\n",
            "shortcut.md": "# Shortcut\n",
        },
        (root) => {
            const result = scan(root);
            assertClean(result);
            assert.equal(result.linksChecked, 3);
        },
    );
});

test("collects ATX and Setext heading slugs", async () => {
    await withFixture(
        { "index.md": "# ATX Heading\n\nSetext Heading\n===============\n\n[one](#atx-heading) [two](#setext-heading)\n" },
        (root) => {
            const result = scan(root);
            assertClean(result);
            assert.equal(result.fragmentsChecked, 2);
        },
    );
});

test("uses github slugger suffixes for duplicate and colliding headings", async () => {
    await withFixture(
        { "index.md": "# Duplicate\n# duplicate\n# Punctuation!\n# Punctuation\n[second](#duplicate-1) [fourth](#punctuation-1)\n" },
        (root) => assertClean(scan(root)),
    );
});

test("checks same-file and cross-file fragments", async () => {
    await withFixture(
        {
            "index.md": "[same](#local-heading) [cross](target.md#cross-heading)\n# Local Heading\n",
            "target.md": "# Cross Heading\n",
        },
        (root) => assertClean(scan(root)),
    );
});

test("separates query strings from fragments", async () => {
    await withFixture({ "index.md": "[target](target.md?mode=full#target-heading)\n", "target.md": "# Target Heading\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("checks image destinations", async () => {
    await withFixture({ "index.md": "![image](image.png)\n", "image.png": "image\n" }, (root) => {
        const result = scan(root);
        assertClean(result);
        assert.equal(result.linksChecked, 1);
    });
});

test("ignores inline code and fenced code with a longer valid closing fence", async () => {
    await withFixture(
        { "index.md": "`[inline](missing.md)`\n\n````md\n[code](missing.md)\n`````\n" },
        (root) => {
            const result = scan(root);
            assertClean(result);
            assert.equal(result.linksChecked, 0);
        },
    );
});

test("HTML href policy is explicit: raw HTML links are ignored", async () => {
    await withFixture({ "index.md": '<a href="missing.md">raw HTML link</a>\n' }, (root) => {
        const result = scan(root);
        assertClean(result);
        assert.equal(result.linksChecked, 0);
    });
});

test("reports a missing same-file fragment", async () => {
    await withFixture({ "index.md": "[missing](#not-here)\n# Present\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("broken-fragment"));
    });
});

test("reports a missing cross-file fragment", async () => {
    await withFixture({ "index.md": "[missing](target.md#not-here)\n", "target.md": "# Present\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("broken-fragment"));
    });
});

test("reports exact path-case drift", async () => {
    await withFixture({ "index.md": "[target](target.md)\n", "Target.md": "# Target\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("path-case"));
    });
});

test("reports repository escapes", async () => {
    await withFixture({ "index.md": "[outside](../outside.md)\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("repository-escape"));
    });
});

test("reports absolute repository paths", async () => {
    await withFixture({ "index.md": "[absolute](/outside.md)\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("absolute-path"));
    });
});

test("reports a symlink that escapes the repository", async () => {
    await withFixture({ "index.md": "[outside](outside.md)\n" }, async (root, context) => {
        await writeFile(path.join(context.outside, "outside.md"), "# Outside\n");
        await symlink(path.join(context.outside, "outside.md"), path.join(root, "outside.md"));
        const result = scan(root);
        assert.ok(kinds(result).includes("symlink-escape"));
    });
});

test("reports a dangling symlink as a controlled finding", async () => {
    await withFixture({ "index.md": "[missing](missing.md)\n" }, async (root) => {
        await symlink("no-such-target.md", path.join(root, "missing.md"));
        const result = scan(root);
        assert.ok(kinds(result).includes("dangling-symlink"));
    });
});

test("allows generated TypeDoc API targets even when unbuilt", async () => {
    await withFixture({ "index.md": "[api](docs/api/missing.html#missing)\n" }, (root) => {
        assertClean(scan(root));
    });
});

test("scans committed Claude skills but excludes untracked Claude state", async () => {
    await withFixture(
        {
            "index.md": "# Root\n",
            ".claude/skills/SKILL.md": "[missing](missing.md)\n",
            ".claude/local.md": "[ignored](missing.md)\n",
        },
        (root, { committedClaudePaths }) => {
            const result = scan(root, { committedClaudePaths: committedClaudePaths ?? [".claude/skills/SKILL.md"] });
            assert.equal(result.filesScanned, 2);
            assert.ok(result.findings.some((finding) => finding.file === ".claude/skills/SKILL.md"));
            assert.ok(!result.findings.some((finding) => finding.file === ".claude/local.md"));
        },
        { committedClaudePaths: [".claude/skills/SKILL.md"] },
    );
});

test("resolves valid section references and reports unresolved ones", async () => {
    await withFixture({ "index.md": "## 3. Valid\nThis is fine: see §3.\nThis is not: see §9.\n" }, (root) => {
        const result = scan(root);
        assert.equal(result.sectionReferencesChecked, 2);
        assert.ok(kinds(result).includes("unresolved-section"));
    });
});

test("reports a missing directory target", async () => {
    await withFixture({ "index.md": "[missing](missing-dir/)\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("broken-link"));
    });
});

test("skips external destinations", async () => {
    await withFixture({ "index.md": "[https](https://example.com/missing#fragment) [mail](mailto:test@example.com)\n" }, (root) => {
        const result = scan(root);
        assertClean(result);
        assert.equal(result.linksChecked, 2);
        assert.equal(result.fragmentsChecked, 0);
    });
});

test("reports malformed percent-encoding as a finding", async () => {
    await withFixture({ "index.md": "[bad](target%ZZ.md)\n" }, (root) => {
        const result = scan(root);
        assert.ok(kinds(result).includes("broken-link"));
    });
});

test("scanner failures are thrown for a missing root", async () => {
    assert.throws(() => scan(path.join(os.tmpdir(), "markdown-integrity-no-such-root")), /ENOENT|no such file/i);
});

test("CLI returns scanner exit code 2", async () => {
    const missingRoot = path.join(os.tmpdir(), "markdown-integrity-cli-no-such-root");
    const result = await new Promise((resolve) => {
        execFile("node", [script, "--root", missingRoot, "--format=json"], (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
        });
    });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /scanner failed/);
});

test("CLI root resolution is independent of the current working directory", async () => {
    const result = await new Promise((resolve) => {
        execFile("node", [script, "--format=json"], { cwd: path.join(repoRoot, "docs") }, (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
        });
    });
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.ok(output.filesScanned > 0);
    assert.ok(output.linksChecked > 0);
});
