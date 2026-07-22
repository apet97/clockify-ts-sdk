#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    existsSync,
    lstatSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
    artifactPaths,
    createMinimalServerEnvironment,
    findStaleArtifacts,
    validateArchiveEntries,
    validateArchiveFileContents,
    validateBuildReceipt,
    validateProtocolSurface,
    validateSpdxDocument,
    zipInfoLineIsSymlink,
} from "./mcpb-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = path.join(root, "mcp");
const version = JSON.parse(readFileSync(path.join(mcpDir, "package.json"), "utf8")).version;
const artifacts = artifactPaths(root, version);

function fail(message) {
    throw new Error(message);
}

function sha256(file) {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function commandText(command, args) {
    return execFileSync(command, args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
    });
}

function walkFiles(directory, relative = "") {
    const files = [];
    for (const name of readdirSync(directory)) {
        const childRelative = relative ? `${relative}/${name}` : name;
        const absolute = path.join(directory, name);
        const stat = lstatSync(absolute);
        if (stat.isSymbolicLink()) fail("extracted MCPB contains a symbolic link");
        if (stat.isDirectory()) files.push(...walkFiles(absolute, childRelative));
        else if (stat.isFile()) files.push({ relative: childRelative, absolute });
        else fail("extracted MCPB contains an unsupported filesystem entry");
    }
    return files;
}

function scanCredentials(files) {
    const secrets = [
        process.env.CLOCKIFY_API_KEY,
        process.env.CLOCKIFY_ADDON_TOKEN,
        process.env.CLOCKIFY_WORKSPACE_ID,
        process.env.CLOCKIFY_LIVE_WORKSPACE_CONFIRM,
        process.env.NPM_TOKEN,
        process.env.NODE_AUTH_TOKEN,
        process.env.GH_TOKEN,
        process.env.GITHUB_TOKEN,
    ].filter((value) => typeof value === "string" && value.length >= 4);
    for (const file of files) {
        const bytes = readFileSync(file.absolute);
        for (const secret of secrets) {
            if (bytes.includes(Buffer.from(secret))) {
                fail(`extracted MCPB contains a current credential value in ${file.relative}`);
            }
        }
    }
}

async function withTimeout(label, operation, milliseconds = 20_000) {
    let timer;
    try {
        return await Promise.race([
            operation,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function listAll(fetchPage, key) {
    const values = [];
    let cursor;
    do {
        const page = await fetchPage(cursor);
        if (!Array.isArray(page?.[key])) fail(`MCP ${key}/list returned an invalid response`);
        values.push(...page[key]);
        cursor = page.nextCursor;
    } while (typeof cursor === "string" && cursor.length > 0);
    return values;
}

async function probeExtractedServer(extractRoot) {
    const entry = path.join(extractRoot, "dist", "index.js");
    if (!existsSync(entry)) fail("extracted MCPB is missing dist/index.js");

    const env = createMinimalServerEnvironment(process.env);
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        cwd: extractRoot,
        env,
        stderr: "pipe",
    });
    const client = new Client({ name: "clockify115-mcpb-smoke", version: "0.0.0" });
    try {
        await withTimeout("MCP initialize", client.connect(transport));
        const tools = await withTimeout(
            "MCP tools/list",
            listAll((cursor) => client.listTools(cursor ? { cursor } : undefined), "tools"),
        );
        const resources = await withTimeout(
            "MCP resources/list",
            listAll((cursor) => client.listResources(cursor ? { cursor } : undefined), "resources"),
        );
        const prompts = await withTimeout(
            "MCP prompts/list",
            listAll((cursor) => client.listPrompts(cursor ? { cursor } : undefined), "prompts"),
        );
        return {
            toolNames: tools.map((tool) => tool.name),
            resourceCount: resources.length,
            promptCount: prompts.length,
        };
    } finally {
        await withTimeout("MCP close", client.close(), 5_000).catch(() => {
            throw new Error("extracted MCPB server did not close cleanly");
        });
    }
}

let extractRoot;
try {
    if (!existsSync(artifacts.bundle) || !existsSync(artifacts.sbom) || !existsSync(artifacts.receipt)) {
        fail("exact MCPB, SPDX, and build-receipt files must exist before smoke");
    }
    const stale = findStaleArtifacts(readdirSync(mcpDir), version);
    if (stale.length > 0) fail(`stale MCPB artifacts are present (${stale.length})`);

    commandText("unzip", ["-t", artifacts.bundle]);
    const entries = commandText("zipinfo", ["-1", artifacts.bundle])
        .split(/\r?\n/)
        .filter(Boolean);
    validateArchiveEntries(entries);
    const modeLines = commandText("zipinfo", ["-l", artifacts.bundle]).split(/\r?\n/);
    if (modeLines.some(zipInfoLineIsSymlink)) fail("MCPB archive contains a symbolic link");

    extractRoot = mkdtempSync(path.join(tmpdir(), "clockify115-mcpb-smoke-"));
    execFileSync("unzip", ["-qq", artifacts.bundle, "-d", extractRoot], {
        cwd: root,
        stdio: "ignore",
    });
    const extractedFiles = walkFiles(extractRoot);
    validateArchiveEntries(extractedFiles.map((file) => file.relative));
    validateArchiveFileContents(
        extractedFiles.map((file) => ({ relative: file.relative, content: readFileSync(file.absolute) })),
    );
    scanCredentials(extractedFiles);

    const manifest = JSON.parse(readFileSync(path.join(extractRoot, "manifest.json"), "utf8"));
    const packageManifest = JSON.parse(
        readFileSync(path.join(extractRoot, "package.json"), "utf8"),
    );
    if (manifest.version !== version || packageManifest.version !== version) {
        fail("MCPB filename, manifest, and package versions do not agree");
    }
    if (path.basename(artifacts.bundle) !== `clockify115-mcp-${version}.mcpb`) {
        fail("MCPB filename does not match the package version");
    }

    const spdx = JSON.parse(readFileSync(artifacts.sbom, "utf8"));
    validateSpdxDocument(spdx, version);
    const actualArtifacts = {
        mcpb: {
            file: path.basename(artifacts.bundle),
            bytes: lstatSync(artifacts.bundle).size,
            sha256: sha256(artifacts.bundle),
        },
        spdx: {
            file: path.basename(artifacts.sbom),
            bytes: lstatSync(artifacts.sbom).size,
            sha256: sha256(artifacts.sbom),
        },
    };
    const receipt = JSON.parse(readFileSync(artifacts.receipt, "utf8"));
    validateBuildReceipt(receipt, version, actualArtifacts);
    const surface = await probeExtractedServer(extractRoot);
    const toolManifest = JSON.parse(
        readFileSync(path.join(root, "docs", "mcp-tool-manifest.json"), "utf8"),
    );
    const expectedTools = toolManifest.tools.map((tool) => tool.name);
    if (expectedTools.length !== 141) fail("committed MCP manifest must contain 141 tools");
    validateProtocolSurface({
        actualTools: surface.toolNames,
        expectedTools,
        resourceCount: surface.resourceCount,
        promptCount: surface.promptCount,
    });

    console.log(
        JSON.stringify({
            ok: true,
            version,
            artifacts: actualArtifacts,
            surface: { tools: expectedTools.length, resources: 6, prompts: 2 },
        }),
    );
} catch (error) {
    console.error(`mcpb-smoke: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    if (extractRoot !== undefined) rmSync(extractRoot, { recursive: true, force: true });
}
