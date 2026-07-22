import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
    ]);
    await writeContract(root, moduleFloor);
    assert.equal(run("git", ["init", "--quiet"], root).status, 0);
    commit(root, "baseline");
    return root;
}

function check(root) {
    return run(
        process.execPath,
        ["scripts/check-mutation-score.mjs", "--package", "wrapper"],
        root,
    );
}

test("a committed mutation-floor decrease is rejected against its first parent", async () => {
    const root = await createFixture(90);
    try {
        await writeContract(root, 80);
        commit(root, "lower floor");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /floor 80% is BELOW.*first-parent floor 90%/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an uncommitted mutation-floor decrease is rejected against HEAD", async () => {
    const root = await createFixture(90);
    try {
        await writeContract(root, 80);

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /floor 80% is BELOW.*HEAD floor 90%/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

for (const [label, floor] of [
    ["unchanged", 90],
    ["raised", 95],
]) {
    test(`a committed ${label} mutation floor passes the first-parent ratchet`, async () => {
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
        assert.match(result.stdout, /ratchet baseline: contract-introduction bootstrap/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an invalid first-parent contract fails closed", async () => {
    const root = await createFixture(90);
    try {
        await writeFile(path.join(root, "docs/mutation-score-contract.json"), "{ invalid json\n");
        commit(root, "invalid contract");
        await writeContract(root, 90);
        commit(root, "repair contract");

        const result = check(root);
        assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stderr, /first-parent contract is invalid JSON/i);
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
        assert.match(result.stderr, /shallow.*first parent|first parent.*shallow/i);
    } finally {
        await Promise.all([
            rm(source, { recursive: true, force: true }),
            rm(cloneParent, { recursive: true, force: true }),
        ]);
    }
});
