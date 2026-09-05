import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const mcpDirectory = dirname(scriptDirectory);
const sourceDirectory = join(mcpDirectory, "src", "apps", "report-app");
const outputDirectory = join(mcpDirectory, "dist", "apps");

const [template, styles, browserBuild, htmlBuild] = await Promise.all([
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
    build({
        entryPoints: [join(sourceDirectory, "html.ts")],
        bundle: true,
        format: "esm",
        platform: "node",
        target: "es2022",
        write: false,
        legalComments: "none",
    }),
]);

const script = browserBuild.outputFiles[0]?.text;
if (script === undefined) {
    throw new Error("Reports App browser build did not produce JavaScript output.");
}

const htmlModule = htmlBuild.outputFiles[0]?.text;
if (htmlModule === undefined) {
    throw new Error("Reports App HTML helper build did not produce JavaScript output.");
}
const { buildReportsAppHtml } = await import(
    `data:text/javascript,${encodeURIComponent(htmlModule)}`,
);

// The TypeScript build used to emit a server-side helper under this directory.
// Remove only those legacy files so a standalone build:app cannot leave stale
// Node artifacts without deleting the server-side App modules emitted beside
// them.
await Promise.all([
    rm(join(outputDirectory, "report-app", "html.js"), { force: true }),
    rm(join(outputDirectory, "report-app", "html.d.ts"), { force: true }),
]);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
    join(outputDirectory, "reports-dashboard.html"),
    buildReportsAppHtml({ template, styles, script }),
    "utf8",
);
