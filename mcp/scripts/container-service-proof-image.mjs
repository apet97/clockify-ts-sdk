const RUNTIME_PACKAGES = {
    "@apet97/clockify-mcp-115": ["mcp/package.json", "mcp"],
    "clockify-sdk-ts-115": ["wrapper/package.json", "wrapper"],
    "@modelcontextprotocol/node": [
        "node_modules/@modelcontextprotocol/node/package.json",
        "node_modules/@modelcontextprotocol/node",
    ],
    "@modelcontextprotocol/server": [
        "node_modules/@modelcontextprotocol/server/package.json",
        "node_modules/@modelcontextprotocol/server",
    ],
    jose: ["node_modules/jose/package.json", "node_modules/jose"],
    pg: ["node_modules/pg/package.json", "node_modules/pg"],
    zod: ["node_modules/zod/package.json", "node_modules/zod"],
};

const EXPECTED_ENTRYPOINT = ["node", "/srv/clockify-mcp/mcp/dist/http-main.js"];

/** Require a registry/path reference bound to one exact manifest digest. */
export function requireDigestImageReference(value, label) {
    if (typeof value !== "string" || !/^[^\s@]+@sha256:[0-9a-f]{64}$/u.test(value)) {
        throw new Error(`${label} must be an image reference qualified by one sha256 digest`);
    }
    return value;
}

export async function verifyRemoteImage(options) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(options.imageId)) {
        throw new Error("remote candidate image id is not immutable");
    }
    const inspected = JSON.parse(
        await options.run("docker", ["image", "inspect", options.imageId], {
            timeoutMs: 15_000,
        }),
    );
    const image = inspected[0];
    if (image?.Id !== options.imageId) {
        throw new Error("remote image inspect did not resolve the candidate id exactly");
    }
    const config = image.Config;
    if (config?.User !== "node") {
        throw new Error(`remote image must run as node, found ${JSON.stringify(config?.User)}`);
    }
    if (JSON.stringify(config?.Entrypoint) !== JSON.stringify(EXPECTED_ENTRYPOINT)) {
        throw new Error("remote image entrypoint is not clockify115-mcp-http");
    }
    if (
        config?.Labels?.["org.opencontainers.image.revision"] !== options.expectedRevision ||
        config?.Labels?.["org.opencontainers.image.version"] !== options.expectedVersion
    ) {
        throw new Error("remote image OCI revision/version labels are incorrect");
    }

    const paths = Object.fromEntries(
        Object.entries(RUNTIME_PACKAGES).map(([name, [path]]) => [name, path]),
    );
    const script = `
        const fs = require("node:fs");
        const paths = ${JSON.stringify(paths)};
        console.log(JSON.stringify(Object.fromEntries(
            Object.entries(paths).map(([name, path]) => [
                name,
                JSON.parse(fs.readFileSync("/srv/clockify-mcp/" + path, "utf8")).version,
            ]),
        )));
        for (const forbidden of [
            "node_modules/@modelcontextprotocol/sdk/package.json",
            "node_modules/@modelcontextprotocol/ext-apps/package.json",
        ]) {
            if (fs.existsSync("/srv/clockify-mcp/" + forbidden)) {
                throw new Error("App-only MCP dependency entered the runtime image: " + forbidden);
            }
        }
    `;
    const actual = JSON.parse(
        await options.run(
            "docker",
            [
                "run",
                "--rm",
                "--name",
                options.containerName,
                "--label",
                options.label,
                "--network",
                "none",
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--entrypoint",
                "node",
                options.imageId,
                "-e",
                script,
            ],
            { containerName: options.containerName, timeoutMs: 2 * 60_000 },
        ),
    );
    for (const [name, [, lockPath]] of Object.entries(RUNTIME_PACKAGES)) {
        const expected = options.packageLock.packages?.[lockPath]?.version;
        if (!expected || actual[name] !== expected) {
            throw new Error(
                `${name} runtime version ${JSON.stringify(actual[name])} does not match lockfile ${JSON.stringify(expected)}`,
            );
        }
    }
}
