import path from "node:path";

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ARTIFACT = /^clockify115-mcp-(.+)\.(mcpb|spdx\.json)$/;
const NESTED_ARCHIVE = /\.(?:7z|bz2|gz|mcpb|rar|tar|tgz|xz|zip)$/i;
const PRIVATE_KEY = /\.(?:key|p12|pfx|pem)$/i;

export function artifactPaths(root, version) {
    if (typeof root !== "string" || root.length === 0 || !SEMVER.test(version)) {
        throw new TypeError("artifact root and clean semantic version are required");
    }
    const base = path.join(root, "mcp", `clockify115-mcp-${version}`);
    return {
        bundle: `${base}.mcpb`,
        sbom: `${base}.spdx.json`,
        receipt: `${base}.build.json`,
    };
}

export function findStaleArtifacts(entries, version) {
    const expected = new Set([
        `clockify115-mcp-${version}.mcpb`,
        `clockify115-mcp-${version}.spdx.json`,
    ]);
    return entries
        .filter((entry) => ARTIFACT.test(entry) && !expected.has(entry))
        .sort((left, right) => left.localeCompare(right));
}

function unsafeEntryReason(entry) {
    if (typeof entry !== "string" || entry.length === 0 || entry.includes("\0")) return "invalid name";
    if (entry.includes("\\")) return "backslash path";
    if (entry.startsWith("/") || /^[A-Za-z]:\//.test(entry)) return "absolute path";

    const trimmed = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    const segments = trimmed.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
        return "path traversal";
    }

    const lowerSegments = segments.map((segment) => segment.toLowerCase());
    const basename = lowerSegments.at(-1) ?? "";
    if (lowerSegments.some((segment) => segment === ".env" || segment.startsWith(".env."))) {
        return "environment file";
    }
    if (lowerSegments.some((segment) => segment === ".npmrc" || segment === "npmrc")) {
        return "npm credentials";
    }
    if (lowerSegments.some((segment) => [".github", ".gitlab", ".circleci"].includes(segment))) {
        return "repository metadata";
    }
    if (lowerSegments.some((segment) => ["test", "tests", "__tests__"].includes(segment))) {
        return "tests";
    }
    const sourceIndex = lowerSegments.indexOf("src");
    if (sourceIndex >= 0 && !lowerSegments.slice(0, sourceIndex).includes("dist")) return "source";
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename)) return "tests";
    if (/\.(?:ts|tsx)$/.test(basename) && !basename.endsWith(".d.ts")) return "source";
    if (basename.endsWith(".map")) return "source map";
    if (basename.endsWith(".log")) return "log";
    if (
        basename === "package-lock.json" ||
        basename === ".package-lock.json" ||
        basename === "npm-shrinkwrap.json" ||
        basename === "pnpm-lock.yaml" ||
        basename === "yarn.lock" ||
        basename.endsWith(".lock")
    ) {
        return "lockfile";
    }
    if (PRIVATE_KEY.test(basename) || basename === "id_rsa" || basename === "id_ed25519") {
        return "private key";
    }
    if (NESTED_ARCHIVE.test(basename)) return "nested archive";

    const allowedRoot = new Set(["manifest.json", "package.json", "readme.md", "license"]);
    if (
        !allowedRoot.has(trimmed.toLowerCase()) &&
        trimmed !== "dist" &&
        !trimmed.startsWith("dist/") &&
        trimmed !== "node_modules" &&
        !trimmed.startsWith("node_modules/")
    ) {
        return "outside allowlist";
    }
    return undefined;
}

export function validateArchiveEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error("MCPB archive entry list must be non-empty");
    }
    const seen = new Set();
    for (const entry of entries) {
        const reason = unsafeEntryReason(entry);
        if (reason !== undefined) throw new Error(`Unsafe MCPB archive entry (${reason}): ${entry}`);
        if (seen.has(entry)) throw new Error(`Duplicate MCPB archive entry: ${entry}`);
        seen.add(entry);
    }
}

export function zipInfoLineIsSymlink(line) {
    return typeof line === "string" && line.trimStart().startsWith("l");
}

const SERVER_ENV_ALLOWLIST = ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TZ", "SystemRoot"];
const BLANK_CLOCKIFY_ENV = [
    "CLOCKIFY_API_KEY",
    "CLOCKIFY_ADDON_TOKEN",
    "CLOCKIFY_WORKSPACE_ID",
    "CLOCKIFY_BASE_URL",
    "CLOCKIFY_LIVE_WORKSPACE_CONFIRM",
];

export function createMinimalServerEnvironment(hostEnvironment = {}) {
    const environment = {};
    for (const name of SERVER_ENV_ALLOWLIST) {
        const value = hostEnvironment[name];
        if (typeof value === "string") environment[name] = value;
    }
    for (const name of BLANK_CLOCKIFY_ENV) environment[name] = "";
    return environment;
}

const COMPLETE_PEM_PRIVATE_KEY =
    /-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/;
const NPMRC_AUTH_ASSIGNMENT =
    /(?:^|\r?\n)\s*(?:(?:\/\/[^\s=]+\/?:)?_(?:authToken|auth|password))\s*=\s*[^\s#;]+/i;
const NPM_ENV_ASSIGNMENT =
    /(?:^|[\r\n{,])\s*["']?(?:NPM_TOKEN|NODE_AUTH_TOKEN|NPM_AUTH_TOKEN|npmAuthToken|npmAuthIdent)["']?\s*[:=]\s*["']?[^\s,"'};]+/i;

export function validateArchiveFileContents(files) {
    if (!Array.isArray(files)) throw new TypeError("MCPB archive files must be an array");
    for (const file of files) {
        if (
            file == null ||
            typeof file !== "object" ||
            typeof file.relative !== "string" ||
            !(Buffer.isBuffer(file.content) || typeof file.content === "string")
        ) {
            throw new TypeError("MCPB archive file content is invalid");
        }
        const content = Buffer.isBuffer(file.content) ? file.content.toString("utf8") : file.content;
        if (COMPLETE_PEM_PRIVATE_KEY.test(content)) {
            throw new Error(`MCPB archive contains a complete private key in ${file.relative}`);
        }
        if (NPMRC_AUTH_ASSIGNMENT.test(content) || NPM_ENV_ASSIGNMENT.test(content)) {
            throw new Error(`MCPB archive contains an npm credential assignment in ${file.relative}`);
        }
    }
}

function hasTemporaryPath(document) {
    const serialized = JSON.stringify(document);
    return (
        /(?:^|["'\s])\/(?:private\/)?tmp\//i.test(serialized) ||
        /\/(?:private\/)?var\/folders\//i.test(serialized) ||
        /clockify115-mcpb-(?:smoke-)?[A-Za-z0-9_-]+/i.test(serialized)
    );
}

export function validateSpdxDocument(document, version) {
    if (
        document == null ||
        typeof document !== "object" ||
        document.spdxVersion !== "SPDX-2.3" ||
        document.SPDXID !== "SPDXRef-DOCUMENT" ||
        document.name !== `clockify115-mcp@${version}` ||
        typeof document.documentNamespace !== "string" ||
        !URL.canParse(document.documentNamespace) ||
        document.dataLicense !== "CC0-1.0" ||
        document.creationInfo == null ||
        typeof document.creationInfo !== "object" ||
        typeof document.creationInfo.created !== "string" ||
        !Number.isFinite(Date.parse(document.creationInfo.created)) ||
        !Array.isArray(document.creationInfo.creators) ||
        document.creationInfo.creators.length === 0 ||
        document.creationInfo.creators.some(
            (creator) => typeof creator !== "string" || creator.length === 0,
        ) ||
        !Array.isArray(document.packages) ||
        document.packages.length === 0 ||
        document.packages.some(
            (pkg) =>
                pkg == null ||
                typeof pkg !== "object" ||
                typeof pkg.name !== "string" ||
                pkg.name.length === 0 ||
                typeof pkg.SPDXID !== "string" ||
                !pkg.SPDXID.startsWith("SPDXRef-"),
        )
    ) {
        throw new Error("SPDX 2.3 document metadata is invalid");
    }
    if (hasTemporaryPath(document)) throw new Error("SPDX document contains a temporary path");
    const rootPackage = document.packages.find(
        (pkg) => pkg?.name === "clockify115-mcp" && pkg?.versionInfo === version,
    );
    if (rootPackage == null || typeof rootPackage.SPDXID !== "string") {
        throw new Error(`SPDX document is missing clockify115-mcp ${version}`);
    }
}

function validateArtifactMetadata(metadata, label) {
    if (
        metadata == null ||
        typeof metadata !== "object" ||
        typeof metadata.file !== "string" ||
        metadata.file.length === 0 ||
        !Number.isInteger(metadata.bytes) ||
        metadata.bytes <= 0 ||
        typeof metadata.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(metadata.sha256)
    ) {
        throw new Error(`MCPB build receipt ${label} metadata is invalid`);
    }
}

export function createBuildReceipt(version, artifacts) {
    if (!SEMVER.test(version)) throw new TypeError("clean semantic version is required");
    validateArtifactMetadata(artifacts?.mcpb, "mcpb");
    validateArtifactMetadata(artifacts?.spdx, "spdx");
    return {
        schemaVersion: 1,
        package: "clockify115-mcp",
        version,
        artifacts: {
            mcpb: { ...artifacts.mcpb },
            spdx: { ...artifacts.spdx },
        },
    };
}

export function validateBuildReceipt(receipt, version, actualArtifacts) {
    if (
        receipt == null ||
        typeof receipt !== "object" ||
        receipt.schemaVersion !== 1 ||
        receipt.package !== "clockify115-mcp" ||
        receipt.version !== version
    ) {
        throw new Error("MCPB build receipt identity is invalid");
    }
    validateArtifactMetadata(receipt.artifacts?.mcpb, "mcpb");
    validateArtifactMetadata(receipt.artifacts?.spdx, "spdx");
    validateArtifactMetadata(actualArtifacts?.mcpb, "mcpb");
    validateArtifactMetadata(actualArtifacts?.spdx, "spdx");
    for (const kind of ["mcpb", "spdx"]) {
        for (const field of ["file", "bytes", "sha256"]) {
            if (receipt.artifacts[kind][field] !== actualArtifacts[kind][field]) {
                throw new Error(`MCPB build receipt ${kind} ${field} does not match the artifact`);
            }
        }
    }
    const deterministic = createBuildReceipt(version, actualArtifacts);
    if (JSON.stringify(receipt) !== JSON.stringify(deterministic)) {
        throw new Error("MCPB build receipt is not the deterministic receipt for these artifacts");
    }
}

export function validateProtocolSurface({ actualTools, expectedTools, resourceCount, promptCount }) {
    if (!Array.isArray(actualTools) || !Array.isArray(expectedTools)) {
        throw new Error("MCP tool names must be arrays");
    }
    const actual = [...actualTools].sort((left, right) => left.localeCompare(right));
    const expected = [...expectedTools].sort((left, right) => left.localeCompare(right));
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
        throw new Error("Extracted MCPB tool names do not match the committed manifest");
    }
    if (resourceCount !== 6) throw new Error(`Extracted MCPB must expose 6 resources, got ${resourceCount}`);
    if (promptCount !== 2) throw new Error(`Extracted MCPB must expose 2 prompts, got ${promptCount}`);
}
