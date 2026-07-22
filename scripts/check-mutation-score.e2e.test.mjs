import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd) {
    return spawnSync(command, args, {
        cwd,
        encoding: "utf8",
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    });
}

function contract(moduleFloor) {
    return {
        schemaVersion: 1,
        purpose: "isolated mutation ratchet fixture",
        ratchet: "monotonic-up",
        packages: [
            {
                id: "wrapper",
                report: "wrapper/reports/mutation/mutation.json",
                globalFloor: 80,
                moduleFloors: { "wrapper/example.ts": moduleFloor },
            },
            {
                id: "mcp",
                report: "mcp/reports/mutation/mutation.json",
                globalFloor: 80,
                moduleFloors: { "mcp/example.ts": 80 },
            },
            {
                id: "cli",
                report: "cli/reports/mutation/mutation.json",
                globalFloor: 0,
                globalCalibrationPending: true,
                moduleFloors: { "cli/example.ts": 0 },
                calibrationPending: ["cli/example.ts"],
            },
        ],
        wiring: {
            makeTarget: "mutation",
            checker: "scripts/check-mutation-score.mjs",
            qualityGate: "make mutation",
            inventoryId: "mutation",
            auditId: "mutation",
        },
    };
}

async function writeContract(root, moduleFloor) {
    await writeFile(
        path.join(root, "docs/mutation-score-contract.json"),
        `${JSON.stringify(contract(moduleFloor), null, 2)}\n`,
    );
}

async function readJson(root, relativePath) {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function writeJson(root, relativePath, value) {
    await writeFile(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function commit(root, message) {
    assert.equal(run("git", ["add", "."], root).status, 0);
    const result = run(
        "git",
        [
            "-c",
            "user.name=Mutation Ratchet Test",
            "-c",
            "user.email=mutation-ratchet@example.invalid",
            "commit",
            "-m",
            message,
        ],
        root,
    );
    assert.equal(result.status, 0, result.stderr);
}

async function createFixture(moduleFloor = 90) {
    const root = await mkdtemp(path.join(tmpdir(), "clockify-mutation-ratchet-"));
    await Promise.all([
        mkdir(path.join(root, "docs"), { recursive: true }),
        mkdir(path.join(root, "scripts/lib"), { recursive: true }),
        mkdir(path.join(root, "wrapper/reports/mutation"), { recursive: true }),
        mkdir(path.join(root, "mcp/reports/mutation"), { recursive: true }),
        mkdir(path.join(root, "cli/reports/mutation"), { recursive: true }),
    ]);
    await Promise.all([
        cp(
            path.join(repoRoot, "scripts/check-mutation-score.mjs"),
            path.join(root, "scripts/check-mutation-score.mjs"),
        ),
        cp(
            path.join(repoRoot, "scripts/lib/mutation-score.mjs"),
            path.join(root, "scripts/lib/mutation-score.mjs"),
        ),
        cp(
            path.join(repoRoot, "scripts/lib/mutation-score-contract.mjs"),
            path.join(root, "scripts/lib/mutation-score-contract.mjs"),
        ),
        writeFile(path.join(root, "wrapper/example.ts"), "export const example = true;\n"),
        writeFile(
            path.join(root, "wrapper/stryker.conf.json"),
            `${JSON.stringify({ mutate: ["wrapper/example.ts"] }, null, 2)}\n`,
        ),
        writeFile(
            path.join(root, "wrapper/reports/mutation/mutation.json"),
            `${JSON.stringify({
                schemaVersion: "2",
                files: {
                    "wrapper/example.ts": { mutants: [{ status: "Killed" }] },
                },
            })}\n`,
        ),
        writeFile(path.join(root, "mcp/example.ts"), "export const example = true;\n"),
        writeFile(
            path.join(root, "mcp/stryker.conf.json"),
            `${JSON.stringify({ mutate: ["mcp/example.ts"] }, null, 2)}\n`,
        ),
        writeFile(
            path.join(root, "mcp/reports/mutation/mutation.json"),
            `${JSON.stringify({
                schemaVersion: "2",
                files: {
                    "mcp/example.ts": { mutants: [{ status: "Killed" }] },
                },
            })}\n`,
        ),
        writeFile(path.join(root, "cli/example.ts"), "export const example = true;\n"),
        writeFile(
            path.join(root, "cli/stryker.conf.json"),
            `${JSON.stringify({ mutate: ["cli/example.ts"] }, null, 2)}\n`,
        ),
    ]);
    await writeContract(root, moduleFloor);
    assert.equal(run("git", ["init", "--quiet"], root).status, 0);
    commit(root, "baseline");
    return root;
}

function check(root, packageId = "wrapper") {
    return run(
        process.execPath,
        ["scripts/check-mutation-score.mjs", "--package", packageId],
        root,
    );
}

test("duplicate, substituted, reordered, and unknown mutation package IDs fail closed", async () => {
    const root = await createFixture(90);
    try {
        for (const [name, mutate] of [
            ["duplicate", (value) => (value.packages[2].id = "mcp")],
            ["substituted", (value) => (value.packages[2].id = "unknown")],
            ["reordered", (value) => value.packages.reverse()],
        ]) {
            const value = await readJson(root, "docs/mutation-score-contract.json");
            mutate(value);
            await writeJson(root, "docs/mutation-score-contract.json", value);
            const result = check(root);
            assert.notEqual(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
            assert.match(result.stderr, /packages.*ordered package ids wrapper, mcp, cli/i);
            await writeContract(root, 90);
        }

        const unknown = check(root, "unknown");
        assert.notEqual(unknown.status, 0, `${unknown.stdout}${unknown.stderr}`);
        assert.match(unknown.stderr, /argv\.--package: unknown package id unknown/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a committed mutation-floor decrease is rejected against historical maxima", async () => {
    const root = await createFixture(90);
    try {
        await writeContract(root, 80);
        commit(root, "lower floor");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /floor 80% is BELOW.*historical maximum floor 90%/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a lower committed floor remains rejected after a later unchanged commit", async () => {
    const root = await createFixture(90);
    try {
        await writeContract(root, 80);
        commit(root, "lower floor without proof");
        await writeFile(path.join(root, "later.txt"), "later unchanged commit\n");
        commit(root, "later unchanged commit");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /wrapper\/example\.ts.*historical.*90%/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a committed paired governed-source and floor deletion is rejected", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        wrapper.moduleFloors["wrapper/sibling.ts"] = 80;
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        await writeFile(path.join(root, "wrapper/sibling.ts"), "export const sibling = true;\n");
        await writeJson(root, "wrapper/stryker.conf.json", {
            mutate: ["wrapper/example.ts", "wrapper/sibling.ts"],
        });
        await writeJson(root, "wrapper/reports/mutation/mutation.json", {
            schemaVersion: "2",
            files: {
                "wrapper/example.ts": { mutants: [{ status: "Killed" }] },
                "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] },
            },
        });
        commit(root, "govern two modules");

        delete wrapper.moduleFloors["wrapper/example.ts"];
        await rm(path.join(root, "wrapper/example.ts"));
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        await writeJson(root, "wrapper/stryker.conf.json", {
            mutate: ["wrapper/sibling.ts"],
        });
        await writeJson(root, "wrapper/reports/mutation/mutation.json", {
            schemaVersion: "2",
            files: {
                "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] },
            },
        });
        commit(root, "drop governed module");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            result.stderr,
            /wrapper\.moduleFloors\.wrapper\/example\.ts.*missing a historically governed floor/i,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a historical governed-floor deletion remains rejected after reintroduction", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        wrapper.moduleFloors["wrapper/sibling.ts"] = 80;
        await writeFile(path.join(root, "wrapper/sibling.ts"), "export const sibling = true;\n");
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        await writeJson(root, "wrapper/stryker.conf.json", {
            mutate: ["wrapper/example.ts", "wrapper/sibling.ts"],
        });
        await writeJson(root, "wrapper/reports/mutation/mutation.json", {
            schemaVersion: "2",
            files: {
                "wrapper/example.ts": { mutants: [{ status: "Killed" }] },
                "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] },
            },
        });
        commit(root, "govern two modules");

        delete wrapper.moduleFloors["wrapper/example.ts"];
        await rm(path.join(root, "wrapper/example.ts"));
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        await writeJson(root, "wrapper/stryker.conf.json", {
            mutate: ["wrapper/sibling.ts"],
        });
        await writeJson(root, "wrapper/reports/mutation/mutation.json", {
            schemaVersion: "2",
            files: { "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] } },
        });
        commit(root, "delete governed floor");

        wrapper.moduleFloors["wrapper/example.ts"] = 90;
        await writeFile(path.join(root, "wrapper/example.ts"), "export const example = true;\n");
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        await writeJson(root, "wrapper/stryker.conf.json", {
            mutate: ["wrapper/example.ts", "wrapper/sibling.ts"],
        });
        await writeJson(root, "wrapper/reports/mutation/mutation.json", {
            schemaVersion: "2",
            files: {
                "wrapper/example.ts": { mutants: [{ status: "Killed" }] },
                "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] },
            },
        });
        commit(root, "reintroduce governed floor");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            result.stderr,
            /wrapper\.moduleFloors\.wrapper\/example\.ts.*missing a historically governed floor/i,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an uncommitted mutation-floor decrease is rejected against historical maxima", async () => {
    const root = await createFixture(90);
    try {
        await writeContract(root, 80);

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /floor 80% is BELOW.*historical maximum floor 90%/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

for (const [label, floor] of [
    ["unchanged", 90],
    ["raised", 95],
]) {
    test(`a committed ${label} mutation floor passes the full-history ratchet`, async () => {
        const root = await createFixture(90);
        try {
            await writeContract(root, floor);
            await writeFile(path.join(root, `${label}.txt`), `${label}\n`);
            commit(root, `${label} floor`);

            const result = check(root);
            assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
            assert.match(result.stdout, /mutation score check passed/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
}

test("unknown governed packages are rejected even when their report and source exist", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        wrapper.moduleFloors["wrapper/sibling.ts"] = 80;
        contractValue.packages.push({
            id: "future",
            report: "future/reports/mutation/mutation.json",
            globalFloor: 80,
            moduleFloors: { "future/example.ts": 80 },
        });
        await Promise.all([
            mkdir(path.join(root, "future/reports/mutation"), { recursive: true }),
            writeFile(path.join(root, "wrapper/sibling.ts"), "export const sibling = true;\n"),
        ]);
        await Promise.all([
            writeJson(root, "docs/mutation-score-contract.json", contractValue),
            writeJson(root, "wrapper/stryker.conf.json", {
                mutate: ["wrapper/example.ts", "wrapper/sibling.ts"],
            }),
            writeJson(root, "wrapper/reports/mutation/mutation.json", {
                schemaVersion: "2",
                files: {
                    "wrapper/example.ts": { mutants: [{ status: "Killed" }] },
                    "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] },
                },
            }),
            writeFile(path.join(root, "future/example.ts"), "export const future = true;\n"),
            writeJson(root, "future/stryker.conf.json", { mutate: ["future/example.ts"] }),
            writeJson(root, "future/reports/mutation/mutation.json", {
                schemaVersion: "2",
                files: { "future/example.ts": { mutants: [{ status: "Killed" }] } },
            }),
        ]);
        commit(root, "add governed package and module");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /packages.*ordered package ids wrapper, mcp, cli/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("historical maxima permit legitimate module additions and floor raises", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        wrapper.moduleFloors["wrapper/example.ts"] = 95;
        wrapper.moduleFloors["wrapper/sibling.ts"] = 80;
        await writeFile(path.join(root, "wrapper/sibling.ts"), "export const sibling = true;\n");
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        await writeJson(root, "wrapper/stryker.conf.json", {
            mutate: ["wrapper/example.ts", "wrapper/sibling.ts"],
        });
        await writeJson(root, "wrapper/reports/mutation/mutation.json", {
            schemaVersion: "2",
            files: {
                "wrapper/example.ts": { mutants: [{ status: "Killed" }] },
                "wrapper/sibling.ts": { mutants: [{ status: "Killed" }] },
            },
        });
        commit(root, "add module and raise floor");

        wrapper.moduleFloors["wrapper/sibling.ts"] = 85;
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        commit(root, "raise added module floor");
        await writeFile(path.join(root, "later.txt"), "later unchanged commit\n");
        commit(root, "later unchanged commit");

        const result = check(root);
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stdout, /mutation score check passed/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a committed historically governed-package deletion is rejected", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        contractValue.packages.push({
            id: "future",
            report: "future/reports/mutation/mutation.json",
            globalFloor: 80,
            moduleFloors: { "future/example.ts": 80 },
        });
        await mkdir(path.join(root, "future/reports/mutation"), { recursive: true });
        await Promise.all([
            writeJson(root, "docs/mutation-score-contract.json", contractValue),
            writeFile(path.join(root, "future/example.ts"), "export const future = true;\n"),
            writeJson(root, "future/stryker.conf.json", { mutate: ["future/example.ts"] }),
            writeJson(root, "future/reports/mutation/mutation.json", {
                schemaVersion: "2",
                files: { "future/example.ts": { mutants: [{ status: "Killed" }] } },
            }),
        ]);
        commit(root, "govern future package");

        contractValue.packages = contractValue.packages.filter((entry) => entry.id !== "future");
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        commit(root, "drop governed package");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /packages\.future.*missing a historically governed package/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a targeted wrapper check still rejects a historical MCP floor decrease", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const mcp = contractValue.packages.find((entry) => entry.id === "mcp");
        mcp.moduleFloors["mcp/example.ts"] = 79;
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        commit(root, "lower non-target floor");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            result.stderr,
            /mcp\.moduleFloors\.mcp\/example\.ts.*79%.*historical maximum floor 80%/i,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a non-shallow root commit is the explicit mutation-ratchet bootstrap", async () => {
    const root = await createFixture(80);
    try {
        const result = check(root);
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stdout, /mutation score check passed/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the first contract introduction with no earlier first-parent history is a bootstrap", async () => {
    const root = await createFixture(80);
    try {
        const orphan = run(
            "git",
            ["checkout", "--quiet", "--orphan", "contract-introduction"],
            root,
        );
        assert.equal(orphan.status, 0, orphan.stderr);
        await rm(path.join(root, "docs/mutation-score-contract.json"));
        commit(root, "pre-contract root");
        await writeContract(root, 80);
        commit(root, "introduce contract");

        const result = check(root);
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stdout, /ratchet history: 1 complete first-parent contract revision/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the repository's complete legacy contract history satisfies the immutable ratchet", async () => {
    const cloneParent = await mkdtemp(path.join(tmpdir(), "clockify-mutation-real-history-"));
    const root = path.join(cloneParent, "repo");
    try {
        const clone = run("git", ["clone", "--quiet", "--shared", repoRoot, root], cloneParent);
        assert.equal(clone.status, 0, clone.stderr);
        await Promise.all([
            cp(
                path.join(repoRoot, "scripts/check-mutation-score.mjs"),
                path.join(root, "scripts/check-mutation-score.mjs"),
            ),
            cp(
                path.join(repoRoot, "docs/mutation-score-contract.json"),
                path.join(root, "docs/mutation-score-contract.json"),
            ),
            cp(
                path.join(repoRoot, "scripts/lib/mutation-score-contract.mjs"),
                path.join(root, "scripts/lib/mutation-score-contract.mjs"),
            ),
        ]);

        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        await mkdir(path.dirname(path.join(root, wrapper.report)), { recursive: true });
        await writeJson(root, wrapper.report, {
            schemaVersion: "2",
            files: Object.fromEntries(
                Object.keys(wrapper.moduleFloors).map((filePath) => [
                    filePath,
                    { mutants: [{ status: "Killed" }] },
                ]),
            ),
        });

        const result = check(root);
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            result.stdout,
            /ratchet history: \d+ complete first-parent contract revisions?/,
        );
    } finally {
        await rm(cloneParent, { recursive: true, force: true });
    }
});

test("an invalid historical contract fails closed", async () => {
    const root = await createFixture(90);
    try {
        await writeFile(path.join(root, "docs/mutation-score-contract.json"), "{ invalid json\n");
        commit(root, "invalid contract");
        await writeContract(root, 90);
        commit(root, "repair contract");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /historical contract at [0-9a-f]{40} is invalid JSON/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an invalid historical floor cannot silently disable comparison", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        wrapper.moduleFloors["wrapper/example.ts"] = "not-a-floor";
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        commit(root, "invalid predecessor floor");
        await writeContract(root, 90);
        commit(root, "repair floor");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            result.stderr,
            /ratchet\.history\.[0-9a-f]{40}\.wrapper\.moduleFloors\.wrapper\/example\.ts.*integer/i,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an empty historical floor set cannot silently disable comparison", async () => {
    const root = await createFixture(90);
    try {
        const contractValue = await readJson(root, "docs/mutation-score-contract.json");
        const wrapper = contractValue.packages.find((entry) => entry.id === "wrapper");
        wrapper.moduleFloors = {};
        await writeJson(root, "docs/mutation-score-contract.json", contractValue);
        commit(root, "empty predecessor floors");
        await writeContract(root, 90);
        commit(root, "restore floors");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            result.stderr,
            /ratchet\.history\.[0-9a-f]{40}\.wrapper\.moduleFloors.*at least one governed floor/i,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a shallow HEAD without its parent fails closed instead of becoming a bootstrap", async () => {
    const source = await createFixture(90);
    const cloneParent = await mkdtemp(path.join(tmpdir(), "clockify-mutation-shallow-"));
    const shallow = path.join(cloneParent, "repo");
    try {
        await writeContract(source, 90);
        await writeFile(path.join(source, "second.txt"), "second\n");
        commit(source, "second commit");
        const clone = run(
            "git",
            ["clone", "--quiet", "--depth=1", `file://${source}`, shallow],
            cloneParent,
        );
        assert.equal(clone.status, 0, clone.stderr);

        const result = check(shallow);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /complete first-parent.*shallow|shallow.*historical maxima/i);
    } finally {
        await Promise.all([
            rm(source, { recursive: true, force: true }),
            rm(cloneParent, { recursive: true, force: true }),
        ]);
    }
});

test("a depth-two shallow contract reintroduction cannot reset a historical floor", async () => {
    const source = await createFixture(90);
    const cloneParent = await mkdtemp(path.join(tmpdir(), "clockify-mutation-reintroduction-"));
    const shallow = path.join(cloneParent, "repo");
    try {
        await rm(path.join(source, "docs/mutation-score-contract.json"));
        commit(source, "delete contract");
        await writeFile(path.join(source, "unrelated.txt"), "unrelated\n");
        commit(source, "unrelated commit");
        await writeContract(source, 80);
        commit(source, "reintroduce lower contract");

        const clone = run(
            "git",
            ["clone", "--quiet", "--depth=2", `file://${source}`, shallow],
            cloneParent,
        );
        assert.equal(clone.status, 0, clone.stderr);

        const result = check(shallow);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /complete first-parent.*shallow|shallow.*historical maxima/i);
    } finally {
        await Promise.all([
            rm(source, { recursive: true, force: true }),
            rm(cloneParent, { recursive: true, force: true }),
        ]);
    }
});
