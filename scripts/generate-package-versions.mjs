import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const [pkg, output] of [
    ["wrapper", "wrapper/generated/version.ts"],
    ["cli", "cli/src/generated/version.ts"],
    ["mcp", "mcp/src/generated/version.ts"],
]) {
    const manifest = JSON.parse(await readFile(path.join(root, pkg, "package.json"), "utf8"));
    const target = path.join(root, output);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
        target,
        `// Generated from ${pkg}/package.json. Do not edit.\nexport const PACKAGE_VERSION = ${JSON.stringify(manifest.version)} as const;\n`,
    );
}
