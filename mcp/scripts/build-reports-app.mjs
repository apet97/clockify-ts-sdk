import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const mcpDirectory = dirname(scriptDirectory);
const sourceDirectory = join(mcpDirectory, "src", "apps", "report-app");
const compiledSourceDirectory = join(mcpDirectory, "dist", "apps", "report-app");
const outputDirectory = join(mcpDirectory, "dist", "apps");
const { buildReportsAppHtml } = await import(
    pathToFileURL(join(compiledSourceDirectory, "html.js")).href
);

const [template, styles, browserBuild] = await Promise.all([
    readFile(join(sourceDirectory, "template.html"), "utf8"),
    readFile(join(sourceDirectory, "widget.css"), "utf8"),
    build({
        entryPoints: [join(sourceDirectory, "widget.ts")],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2022",
        write: false,
        legalComments: "none",
        minify: true,
    }),
]);

const script = browserBuild.outputFiles[0]?.text;
if (script === undefined) {
    throw new Error("Reports App browser build did not produce JavaScript output.");
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
    join(outputDirectory, "reports-dashboard.html"),
    buildReportsAppHtml({ template, styles, script }),
    "utf8",
);
