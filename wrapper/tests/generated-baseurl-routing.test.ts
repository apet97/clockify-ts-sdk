import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatorTemplatePath = path.join(repoRoot, "scripts", "sdk-codegen", "emitter.mjs");
const generatedRequestPath = path.join(repoRoot, "wrapper", "src", "core", "request.ts");

describe("generated request runtime base-url routing", () => {
    it("keeps a single request-runtime emitter (no orphaned dead variant)", () => {
        const generator = readFileSync(generatorTemplatePath, "utf8");
        expect(generator).toContain("function requestRuntimeSourceWithTimeoutAndRetry() {");
        expect(generator).not.toContain("function requestRuntimeSource() {");
        expect(generator).toContain("requestRuntimeSourceWithTimeoutAndRetry()");
    });

    it("resolves per-operation baseUrl in both the emitter template and the generated runtime", () => {
        const generator = readFileSync(generatorTemplatePath, "utf8");
        const generatedRequest = readFileSync(generatedRequestPath, "utf8");

        for (const source of [generator, generatedRequest]) {
            expect(source).toContain("baseUrl?: string;");
            expect(source).toContain("operation.baseUrl");
            expect(source).toContain("?? operation.baseUrl ?? ClockifyApiEnvironment.Default;");
        }
    });
});
