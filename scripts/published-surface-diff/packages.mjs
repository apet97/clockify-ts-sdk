// P1: the 3 packages this differ covers, and where each one's local
// candidate build lives. Kept as its own tiny module so run.mjs and its
// test can both import the same list without duplicating it.
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PACKAGES = [
    {
        id: "sdk",
        registrySpec: "clockify-sdk-ts-115@latest",
        candidateRoot: path.join(repoRoot, "wrapper"),
        extractorModule: "./extract-sdk-surface.mjs",
        extractorExport: "extractSdkSurface",
    },
    {
        id: "cli",
        registrySpec: "@apet97/clockify-cli-115@latest",
        candidateRoot: path.join(repoRoot, "cli"),
        extractorModule: "./extract-cli-surface.mjs",
        extractorExport: "extractCliSurface",
    },
    {
        id: "mcp",
        registrySpec: "@apet97/clockify-mcp-115@latest",
        candidateRoot: path.join(repoRoot, "mcp"),
        extractorModule: "./extract-mcp-surface.mjs",
        extractorExport: "extractMcpSurface",
    },
];
