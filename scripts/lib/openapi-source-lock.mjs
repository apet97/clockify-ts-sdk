// Pure, deterministic shape validation for the immutable OpenAPI source lock
// (docs/openapi-source-lock.schema.json). No filesystem access, no network
// access, no dependency on which real values H01-LOCK eventually supplies:
// this module only rejects malformed shapes. Whether a commit actually
// resolves, whether the source bytes/hash actually match what is hosted at
// that commit, and whether the composer reference is real is verified
// elsewhere (the networked lock verifier), never here.

const GITHUB_HTTPS_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(\.git)?$/;
const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/;

// Case-insensitive substring markers. Any of these appearing in a
// human-authored string field means the value was never really supplied.
const PLACEHOLDER_MARKERS = [
    "todo",
    "tbd",
    "changeme",
    "change-me",
    "placeholder",
    "replace_me",
    "replaceme",
    "xxxxxxxxxx",
    "fixme",
    "<",
    ">",
];

const REQUIRED_BASE_FIELDS = [
    "repositoryUrl",
    "commit",
    "sourcePath",
    "sourceBytes",
    "sourceSha256",
    "composerPath",
    "approvedBy",
    "approvedAt",
];

// composerPath is always required (it is what a verifier fetches). Exactly
// one of composerVersion (a declarative, unverifiable-by-hash pointer) or
// composerSha256 (a verifiable content hash) pins that path's identity.
const COMPOSER_PIN_FIELDS = ["composerVersion", "composerSha256"];

const ALLOWED_FIELDS = new Set([...REQUIRED_BASE_FIELDS, ...COMPOSER_PIN_FIELDS]);

function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function containsPlaceholder(value) {
    if (typeof value !== "string") return false;
    const lowered = value.toLowerCase();
    return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}

function isRepoRelativeSafePath(value) {
    if (!isNonEmptyString(value)) return false;
    if (/\s/.test(value)) return false;
    const normalized = value.replaceAll("\\", "/");
    if (normalized.startsWith("/")) return false; // POSIX absolute
    if (/^[A-Za-z]:/.test(normalized)) return false; // Windows drive-absolute
    if (normalized.startsWith("~")) return false;
    const segments = normalized.split("/");
    if (segments.some((segment) => segment === "" || segment === ".")) return false;
    if (segments.some((segment) => segment === "..")) return false;
    return true;
}

/**
 * Validate the shape of a candidate OpenAPI source lock object.
 * Returns an array of human-readable error strings; empty means the shape
 * is well-formed (not that its content has been verified against upstream).
 */
export function validateOpenApiSourceLockShape(candidate) {
    const errors = [];

    if (!isPlainObject(candidate)) {
        return ["lock must be a JSON object"];
    }

    for (const key of Object.keys(candidate)) {
        if (!ALLOWED_FIELDS.has(key)) errors.push(`unknown field: ${key}`);
    }

    for (const field of REQUIRED_BASE_FIELDS) {
        if (!(field in candidate)) errors.push(`missing required field: ${field}`);
    }

    if ("repositoryUrl" in candidate) {
        const value = candidate.repositoryUrl;
        if (!isNonEmptyString(value)) {
            errors.push("repositoryUrl: must be a non-empty string");
        } else if (containsPlaceholder(value)) {
            errors.push("repositoryUrl: placeholder value is not allowed");
        } else if (!GITHUB_HTTPS_URL_RE.test(value)) {
            errors.push(
                "repositoryUrl: must be an https://github.com/<owner>/<repo> URL, not a local path, non-HTTPS scheme, or non-GitHub host",
            );
        }
    }

    if ("commit" in candidate) {
        const value = candidate.commit;
        if (!isNonEmptyString(value)) {
            errors.push("commit: must be a non-empty string");
        } else if (containsPlaceholder(value)) {
            errors.push("commit: placeholder value is not allowed");
        } else if (!FULL_COMMIT_SHA_RE.test(value)) {
            errors.push(
                "commit: must be a full 40-character lowercase hex commit SHA, never a branch name (main), a tag, or a short SHA",
            );
        }
    }

    if ("sourcePath" in candidate) {
        const value = candidate.sourcePath;
        if (containsPlaceholder(value)) {
            errors.push("sourcePath: placeholder value is not allowed");
        } else if (!isRepoRelativeSafePath(value)) {
            errors.push(
                "sourcePath: must be a safe repository-relative path (no absolute path, no parent-directory traversal, no local filesystem path)",
            );
        }
    }

    if ("sourceBytes" in candidate) {
        const value = candidate.sourceBytes;
        if (!Number.isInteger(value) || value < 1) {
            errors.push("sourceBytes: must be a positive integer");
        }
    }

    if ("sourceSha256" in candidate) {
        const value = candidate.sourceSha256;
        if (!isNonEmptyString(value)) {
            errors.push("sourceSha256: must be a non-empty string");
        } else if (containsPlaceholder(value)) {
            errors.push("sourceSha256: placeholder value is not allowed");
        } else if (!HEX_SHA256_RE.test(value)) {
            errors.push("sourceSha256: must be a 64-character lowercase hex SHA-256 digest");
        }
    }

    if ("composerPath" in candidate) {
        const value = candidate.composerPath;
        if (containsPlaceholder(value)) {
            errors.push("composerPath: placeholder value is not allowed");
        } else if (!isRepoRelativeSafePath(value)) {
            errors.push(
                "composerPath: must be a safe repository-relative path (no absolute path, no parent-directory traversal, no local filesystem path)",
            );
        }
    }

    const hasComposerSha = "composerSha256" in candidate;
    const hasComposerVersion = "composerVersion" in candidate;

    if (hasComposerSha && hasComposerVersion) {
        errors.push("composer: supply either composerVersion or composerSha256, not both");
    } else if (!hasComposerSha && !hasComposerVersion) {
        errors.push("composer: must supply exactly one of composerVersion or composerSha256");
    }

    if (hasComposerSha) {
        const value = candidate.composerSha256;
        if (!isNonEmptyString(value) || containsPlaceholder(value) || !HEX_SHA256_RE.test(value)) {
            errors.push("composerSha256: must be a 64-character lowercase hex SHA-256 digest");
        }
    }

    if (hasComposerVersion) {
        const value = candidate.composerVersion;
        if (!isNonEmptyString(value) || containsPlaceholder(value)) {
            errors.push("composerVersion: must be a non-empty, non-placeholder string");
        }
    }

    if ("approvedBy" in candidate) {
        const value = candidate.approvedBy;
        if (!isNonEmptyString(value) || containsPlaceholder(value)) {
            errors.push("approvedBy: must be a non-empty, non-placeholder string");
        }
    }

    if ("approvedAt" in candidate) {
        const value = candidate.approvedAt;
        if (!isNonEmptyString(value) || containsPlaceholder(value) || Number.isNaN(Date.parse(value))) {
            errors.push("approvedAt: must be a parseable ISO-8601 date-time string");
        }
    }

    return errors;
}

export function isOpenApiSourceLockShapeValid(candidate) {
    return validateOpenApiSourceLockShape(candidate).length === 0;
}
