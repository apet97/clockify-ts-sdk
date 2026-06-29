import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const script = path.join(root, "scripts/generate-product-surface.mjs");
const catalogPath = path.join(root, "../GOCLMCP/docs/tool-catalog.json");
const warningNeedle =
    "absent; packages.goMcp.detectedToolCount/detectedCategoryCounts were echoed from docs/product-surface.json and NOT verified";

function runCheck() {
    return new Promise((resolve) => {
        execFile("node", [script, "--check"], { cwd: root }, (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
        });
    });
}

test("product-surface --check warns loudly only when the GOCLMCP catalog is absent", async () => {
    const catalogPresent = fs.existsSync(catalogPath);
    const { code, stdout, stderr } = await runCheck();
    assert.equal(code, 0, `expected --check to exit 0 (no drift), got code ${code}: ${stderr}`);
    assert.match(stdout, /product surface is current/);
    if (catalogPresent) {
        assert.ok(
            !stderr.includes(warningNeedle),
            `GOCLMCP catalog is present, so no goMcp-unverified WARNING must be emitted, but stderr was: ${stderr}`,
        );
    } else {
        assert.ok(
            stderr.includes(warningNeedle),
            `GOCLMCP catalog is absent, so the goMcp-unverified WARNING must be emitted, but stderr was: ${stderr}`,
        );
    }
});
