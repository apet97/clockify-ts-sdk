import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { root } from "./paths.mjs";

export async function write(outDir, relativePath, text) {
    await writeFileWithDir(path.join(outDir, relativePath), text);
}

export async function writeReceipt(absolute, receipt) {
    await writeFileWithDir(absolute, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function writeFileWithDir(absolute, text) {
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text.endsWith("\n") ? text : `${text}\n`);
}

export async function compareTrees(left, right) {
    if (!existsSync(right)) return [`missing ${path.relative(root, right)}`];

    const leftFiles = await listFiles(left);
    const rightFiles = await listFiles(right);
    const all = [...new Set([...leftFiles, ...rightFiles])].sort();
    const diff = [];

    for (const file of all) {
        if (!leftFiles.includes(file)) {
            diff.push(`extra file ${file}`);
            continue;
        }
        if (!rightFiles.includes(file)) {
            diff.push(`missing file ${file}`);
            continue;
        }

        const leftText = await readFile(path.join(left, file), "utf8");
        const rightText = await readFile(path.join(right, file), "utf8");
        if (leftText !== rightText) diff.push(`changed ${file}`);
    }

    return diff;
}

async function listFiles(dir) {
    const files = [];

    async function walk(current) {
        for (const entry of await readdir(current)) {
            const absolute = path.join(current, entry);
            const info = await stat(absolute);
            if (info.isDirectory()) {
                await walk(absolute);
            } else if (info.isFile()) {
                files.push(path.relative(dir, absolute).replace(/\\/g, "/"));
            }
        }
    }

    await walk(dir);
    return files;
}
