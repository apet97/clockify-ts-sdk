import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import GithubSlugger from "github-slugger";
import MarkdownIt from "markdown-it";

export const MARKDOWN_INTEGRITY_SCHEMA_VERSION = 1;
export const GENERATED_API_PATH = "docs/api";
const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const markdown = new MarkdownIt({ html: true });
const EXCLUDED_PATHS = [
    ".git",
    "node_modules",
    "dist",
    "output",
    "coverage",
    ".stryker-tmp",
    ".remember",
    "docs/api",
    "wrapper/src",
];
const SECTION_REFERENCE_PATTERN = /(?:\bsee\s+|(?:,|and)\s*)§(\d+(?:\.\d+)*[a-z]?)\b/gi;

function normalizeRelativePath(relativePath) {
    return relativePath.split(path.sep).join("/");
}

function isWithinRoot(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * An entry without a `/` is a directory NAME excluded at any depth; an entry
 * with a `/` is a repo-root-relative path. Matching every entry root-anchored
 * would scan `wrapper/.stryker-tmp`, `cli/dist`, and every nested
 * `node_modules` -- build and tool output whose broken links are not this
 * repository's to fix, and which reds the gate on a developer machine while CI
 * (a clean checkout) stays green.
 */
function isExcluded(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    const segments = normalized.split("/");
    return EXCLUDED_PATHS.some((excluded) =>
        excluded.includes("/")
            ? normalized === excluded || normalized.startsWith(`${excluded}/`)
            : segments.includes(excluded),
    );
}

function isGeneratedApiTarget(relativePath) {
    const normalized = normalizeRelativePath(relativePath).replace(/\/$/, "");
    return normalized === GENERATED_API_PATH || normalized.startsWith(`${GENERATED_API_PATH}/`);
}

function attrsToObject(attrs) {
    return Object.fromEntries((attrs ?? []).map(([name, value]) => [name, value]));
}

function plainInlineText(token) {
    let text = "";
    for (const child of token.children ?? []) {
        if (child.type === "text" || child.type === "code_inline" || child.type === "softbreak") {
            text += child.content;
        } else if (child.type === "image") {
            text += attrsToObject(child.attrs).alt ?? child.content;
        }
    }
    return text.replace(/\s+/g, " ").trim();
}

function headingSectionNumber(headingText) {
    const match = headingText.match(/^(\d+(?:\.\d+)*[a-z]?)(?:\.)?\s/i);
    return match?.[1]?.toLowerCase() ?? null;
}

function lineOf(token) {
    return (token.map?.[0] ?? 0) + 1;
}

function parseDocument(relativePath, text) {
    const tokens = markdown.parse(text, {});
    const headings = [];
    const links = [];
    const sectionReferences = [];
    const slugger = new GithubSlugger();
    const baseSlugs = new GithubSlugger();

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type === "heading_open") {
            const inline = tokens[index + 1];
            const textValue = inline?.type === "inline" ? plainInlineText(inline) : "";
            const slug = slugger.slug(textValue);
            const baseSlug = baseSlugs.slug(textValue);
            headings.push({
                text: textValue,
                slug,
                baseSlug,
                section: headingSectionNumber(textValue),
                line: lineOf(inline?.type === "inline" ? inline : token),
            });
            continue;
        }

        if (token.type !== "inline") continue;

        for (const child of token.children ?? []) {
            if (child.type === "link_open") {
                const attrs = attrsToObject(child.attrs);
                links.push({
                    kind: "link",
                    href: attrs.href ?? "",
                    line: lineOf(token),
                });
            } else if (child.type === "image") {
                const attrs = attrsToObject(child.attrs);
                links.push({
                    kind: "image",
                    href: attrs.src ?? "",
                    line: lineOf(token),
                });
            } else if (child.type === "text") {
                for (const match of child.content.matchAll(SECTION_REFERENCE_PATTERN)) {
                    sectionReferences.push({
                        section: match[1].toLowerCase(),
                        line: lineOf(token),
                        ref: `§${match[1]}`,
                    });
                }
            }
        }
    }

    return { relativePath, text, headings, links, sectionReferences };
}

function getTrackedClaudeSkillPaths(root) {
    try {
        const output = execFileSync(
            "git",
            ["-C", root, "ls-tree", "-r", "--name-only", "HEAD", "--", ".claude/skills"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
        return output
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter((entry) => entry.startsWith(".claude/skills/") && entry.endsWith(".md"));
    } catch {
        return [];
    }
}

function collectMarkdownFiles(root, { committedClaudePaths } = {}) {
    const files = [];
    const walk = (relativeDirectory) => {
        const absoluteDirectory = path.join(root, relativeDirectory);
        for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
            const relative = normalizeRelativePath(path.posix.join(relativeDirectory, entry.name));
            if (isExcluded(relative) || relative === ".claude" || relative.startsWith(".claude/")) continue;
            const absolute = path.join(root, relative);
            if (entry.isDirectory()) walk(relative);
            else if (entry.isFile() && entry.name.endsWith(".md")) files.push(relative);
        }
    };

    walk("");
    for (const relative of committedClaudePaths ?? getTrackedClaudeSkillPaths(root)) {
        const normalized = normalizeRelativePath(relative);
        if (!normalized.startsWith(".claude/skills/") || !normalized.endsWith(".md")) continue;
        if (fs.existsSync(path.join(root, normalized))) files.push(normalized);
    }

    return [...new Set(files)].sort();
}

function splitDestination(rawHref) {
    const href = rawHref.replaceAll("\\", "/");
    const hashIndex = href.indexOf("#");
    const beforeFragment = hashIndex === -1 ? href : href.slice(0, hashIndex);
    const rawFragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
    const queryIndex = beforeFragment.indexOf("?");
    const rawPath = queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);

    try {
        return {
            path: decodeURIComponent(rawPath),
            fragment: decodeURIComponent(rawFragment),
        };
    } catch (error) {
        return { error: error.message };
    }
}

function isExternalDestination(href) {
    return href.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(href);
}

function inspectExactPath(root, candidate) {
    const relative = path.relative(root, candidate);
    const segments = relative.split(path.sep).filter((segment) => segment && segment !== ".");
    let current = root;

    for (const segment of segments) {
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (error) {
            if (error.code === "ENOENT" || error.code === "ENOTDIR") return { exists: false };
            throw error;
        }
        const exact = entries.find((entry) => entry.name === segment);
        if (!exact) {
            const caseInsensitive = entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());
            return caseInsensitive
                ? { exists: false, wrongCase: caseInsensitive.name }
                : { exists: false };
        }
        current = path.join(current, exact.name);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
            let realPath;
            try {
                realPath = fs.realpathSync(current);
            } catch (error) {
                if (error.code === "ENOENT") return { exists: false, danglingSymlink: true };
                throw error;
            }
            if (!isWithinRoot(root, realPath)) return { exists: false, symlinkEscape: realPath };
        }
    }

    return { exists: true, actualPath: current, stat: fs.statSync(current) };
}

function finding({ kind, relativePath, line, ref, message, target }) {
    return {
        kind,
        file: relativePath,
        line,
        ...(ref === undefined ? {} : { ref }),
        ...(target === undefined ? {} : { target }),
        ...(message === undefined ? {} : { message }),
    };
}

function normalizeFragment(fragment) {
    return fragment.replace(/^#/, "").trim().toLowerCase();
}

function documentHasFragment(document, fragment) {
    const normalized = normalizeFragment(fragment);
    return normalized.length === 0 || document.headings.some((heading) => heading.slug === normalized);
}

function isMarkdownPath(relativePath) {
    return /\.(?:md|markdown)$/i.test(relativePath);
}

function resolveLink({ root, source, link, getDocument }) {
    const href = link.href.trim();
    if (href.length === 0) return [];
    if (isExternalDestination(href)) return [];
    if (href.startsWith("/")) {
        return [finding({
            kind: "absolute-path",
            relativePath: source,
            line: link.line,
            ref: href,
            message: "absolute repository/site paths are not allowed; use a relative Markdown link",
        })];
    }

    const destination = splitDestination(href);
    if (destination.error) {
        return [finding({
            kind: "invalid-destination",
            relativePath: source,
            line: link.line,
            ref: href,
            message: destination.error,
        })];
    }

    const sourceAbsolute = path.join(root, source);
    const candidate = destination.path
        ? path.resolve(path.dirname(sourceAbsolute), destination.path)
        : sourceAbsolute;
    const relativeTarget = normalizeRelativePath(path.relative(root, candidate));
    if (!isWithinRoot(root, candidate)) {
        return [finding({
            kind: "repository-escape",
            relativePath: source,
            line: link.line,
            ref: href,
            target: relativeTarget,
            message: "relative link escapes the repository root",
        })];
    }
    if (isGeneratedApiTarget(relativeTarget)) return [];

    const inspected = inspectExactPath(root, candidate);
    if (inspected.wrongCase) {
        return [finding({
            kind: "path-case",
            relativePath: source,
            line: link.line,
            ref: href,
            target: relativeTarget,
            message: `path case does not match repository entry ${inspected.wrongCase}`,
        })];
    }
    if (inspected.symlinkEscape) {
        return [finding({
            kind: "symlink-escape",
            relativePath: source,
            line: link.line,
            ref: href,
            target: relativeTarget,
            message: `symlink resolves outside the repository: ${inspected.symlinkEscape}`,
        })];
    }
    if (inspected.danglingSymlink) {
        return [finding({
            kind: "dangling-symlink",
            relativePath: source,
            line: link.line,
            ref: href,
            target: relativeTarget,
            message: "link target contains a dangling symlink",
        })];
    }
    if (!inspected.exists) {
        return [finding({
            kind: "broken-link",
            relativePath: source,
            line: link.line,
            ref: href,
            target: relativeTarget,
            message: "link target does not exist",
        })];
    }

    if (destination.fragment && isMarkdownPath(relativeTarget)) {
        const targetDocument = getDocument(relativeTarget);
        if (!documentHasFragment(targetDocument, destination.fragment)) {
            return [finding({
                kind: "broken-fragment",
                relativePath: source,
                line: link.line,
                ref: href,
                target: relativeTarget,
                message: `fragment ${destination.fragment} does not resolve in ${relativeTarget}`,
            })];
        }
    }
    return [];
}

export function scanMarkdownRepository({ root, files, committedClaudePaths } = {}) {
    const resolvedRoot = path.resolve(root ?? MODULE_ROOT);
    if (!fs.statSync(resolvedRoot).isDirectory()) throw new Error(`root is not a directory: ${resolvedRoot}`);

    const availableFiles = collectMarkdownFiles(resolvedRoot, { committedClaudePaths });
    const selectedFiles = files
        ? files.map((file) => normalizeRelativePath(file)).filter((file) => file.endsWith(".md"))
        : availableFiles;
    const documents = new Map();
    const getDocument = (relativePath) => {
        const normalized = normalizeRelativePath(relativePath);
        if (documents.has(normalized)) return documents.get(normalized);
        const absolute = path.join(resolvedRoot, normalized);
        const text = fs.readFileSync(absolute, "utf8");
        const document = parseDocument(normalized, text);
        documents.set(normalized, document);
        return document;
    };

    const findings = [];
    let linksChecked = 0;
    let fragmentsChecked = 0;
    let sectionReferencesChecked = 0;

    for (const relativePath of selectedFiles.sort()) {
        const document = getDocument(relativePath);
        const sectionNumbers = new Set(document.headings.map((heading) => heading.section).filter(Boolean));
        for (const sectionReference of document.sectionReferences) {
            sectionReferencesChecked += 1;
            if (!sectionNumbers.has(sectionReference.section)) {
                findings.push(finding({
                    kind: "unresolved-section",
                    relativePath,
                    line: sectionReference.line,
                    ref: sectionReference.ref,
                    message: `section ${sectionReference.ref} does not have a matching numbered heading`,
                }));
            }
        }
        for (const link of document.links) {
            linksChecked += 1;
            if (link.href.includes("#") && !isExternalDestination(link.href)) fragmentsChecked += 1;
            findings.push(...resolveLink({
                root: resolvedRoot,
                source: relativePath,
                link,
                getDocument,
            }));
        }
    }

    return {
        schemaVersion: MARKDOWN_INTEGRITY_SCHEMA_VERSION,
        filesScanned: selectedFiles.length,
        linksChecked,
        fragmentsChecked,
        sectionReferencesChecked,
        findings,
        documents,
        availableFiles,
    };
}

export { collectMarkdownFiles, isGeneratedApiTarget, parseDocument, resolveLink };
