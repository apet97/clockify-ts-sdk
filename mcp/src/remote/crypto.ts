import { Buffer } from "node:buffer";
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KEYRING_BYTES = 64 * 1024;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface SealedValue {
    keyId: string;
    iv: Buffer;
    ciphertext: Buffer;
    tag: Buffer;
}

interface KeyringDocument {
    version: 1;
    activeKeyId: string;
    keys: Record<string, string>;
}

export class AesGcmKeyring {
    private constructor(
        private readonly activeKeyId: string,
        private readonly keys: ReadonlyMap<string, Buffer>,
    ) {}

    static fromDocument(value: unknown): AesGcmKeyring {
        const document = parseKeyringDocument(value);
        const keys = new Map<string, Buffer>();
        for (const [keyId, encoded] of Object.entries(document.keys)) {
            requireKeyId(keyId);
            const key = decodeBase64Key(encoded, keyId);
            keys.set(keyId, key);
        }
        requireKeyId(document.activeKeyId);
        if (!keys.has(document.activeKeyId)) {
            throw new Error("active key id is absent from the keyring");
        }
        return new AesGcmKeyring(document.activeKeyId, keys);
    }

    get activeId(): string {
        return this.activeKeyId;
    }

    get keyIds(): readonly string[] {
        return [...this.keys.keys()].sort();
    }

    has(keyId: string): boolean {
        return this.keys.has(keyId);
    }

    seal(plaintext: string, associatedData: string): SealedValue {
        const key = this.requireKey(this.activeKeyId);
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv("aes-256-gcm", key, iv, {
            authTagLength: TAG_BYTES,
        });
        cipher.setAAD(Buffer.from(associatedData, "utf8"));
        const ciphertext = Buffer.concat([
            cipher.update(plaintext, "utf8"),
            cipher.final(),
        ]);
        return {
            keyId: this.activeKeyId,
            iv,
            ciphertext,
            tag: cipher.getAuthTag(),
        };
    }

    open(value: SealedValue, associatedData: string): string {
        if (value.iv.byteLength !== IV_BYTES || value.tag.byteLength !== TAG_BYTES) {
            throw new Error("encrypted value has invalid AES-GCM parameters");
        }
        const decipher = createDecipheriv(
            "aes-256-gcm",
            this.requireKey(value.keyId),
            value.iv,
            { authTagLength: TAG_BYTES },
        );
        decipher.setAAD(Buffer.from(associatedData, "utf8"));
        decipher.setAuthTag(value.tag);
        return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString(
            "utf8",
        );
    }

    reseal(value: SealedValue, associatedData: string): SealedValue {
        return this.seal(this.open(value, associatedData), associatedData);
    }

    private requireKey(keyId: string): Buffer {
        const key = this.keys.get(keyId);
        if (!key) throw new Error(`encrypted value references unknown key id ${keyId}`);
        return key;
    }
}

export async function loadKeyringFile(path: string): Promise<AesGcmKeyring> {
    const file = await readMode600File(path, "keyring", MAX_KEYRING_BYTES);
    let parsed: unknown;
    try {
        parsed = JSON.parse(file.toString("utf8")) as unknown;
    } catch {
        throw new Error("keyring file is not valid JSON");
    }
    return AesGcmKeyring.fromDocument(parsed);
}

export async function readMode600File(
    path: string,
    label: string,
    maxBytes: number,
): Promise<Buffer> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const stats = await handle.stat();
        if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
            throw new Error(`${label} must be a regular file with mode 0600`);
        }
        if (stats.size > maxBytes) {
            throw new Error(`${label} file exceeds its size limit`);
        }
        const file = await handle.readFile();
        if (file.byteLength > maxBytes) {
            throw new Error(`${label} file exceeds its size limit`);
        }
        return file;
    } finally {
        await handle.close();
    }
}

export async function readMode600Secret(
    path: string,
    label: string,
    maxBytes = 8 * 1024,
): Promise<string> {
    const file = await readMode600File(path, label, maxBytes);
    const value = file.toString("utf8").replace(/\r?\n$/u, "");
    if (!value || value.includes("\n") || value.includes("\r")) {
        throw new Error(`${label} must contain exactly one non-empty line`);
    }
    return value;
}

export function sha256(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
}

export function credentialAssociatedData(input: {
    credentialId: string;
    principalId: string;
    workspaceId: string;
    revision: bigint;
    region: string;
    subdomain?: string;
}): string {
    return encodeAssociatedData("clockify-mcp/credential/v1", [
        input.credentialId,
        input.principalId,
        input.workspaceId,
        input.revision.toString(),
        input.region,
        input.subdomain ?? "",
    ]);
}

export function confirmationAssociatedData(input: {
    tokenHash: string;
    principalId: string;
    oauthClientId: string;
    credentialId: string;
    credentialRevision: bigint;
    toolName: string;
    risk: string;
    businessArgsHash: string;
    workspaceId: string;
    previewHash: string;
    previewBytes: number;
    expiresAt: string;
}): string {
    return encodeAssociatedData("clockify-mcp/confirmation/v1", [
        input.tokenHash,
        input.principalId,
        input.oauthClientId,
        input.credentialId,
        input.credentialRevision.toString(),
        input.toolName,
        input.risk,
        input.businessArgsHash,
        input.workspaceId,
        input.previewHash,
        input.previewBytes.toString(),
        input.expiresAt,
    ]);
}

function encodeAssociatedData(domain: string, parts: readonly string[]): string {
    return [domain, ...parts.map((part) => `${Buffer.byteLength(part, "utf8")}:${part}`)].join(
        "\0",
    );
}

function parseKeyringDocument(value: unknown): KeyringDocument {
    if (!isRecord(value) || value.version !== 1) {
        throw new Error("keyring document must use version 1");
    }
    if (typeof value.activeKeyId !== "string" || !isStringRecord(value.keys)) {
        throw new Error("keyring document requires activeKeyId and keys");
    }
    if (Object.keys(value.keys).length === 0) {
        throw new Error("keyring must contain at least one key");
    }
    return {
        version: 1,
        activeKeyId: value.activeKeyId,
        keys: value.keys,
    };
}

function decodeBase64Key(encoded: string, keyId: string): Buffer {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error(`key ${keyId} is not canonical base64`);
    }
    const key = Buffer.from(encoded, "base64");
    if (key.byteLength !== KEY_BYTES || key.toString("base64") !== encoded) {
        throw new Error(`key ${keyId} must decode to exactly 32 bytes`);
    }
    return key;
}

function requireKeyId(keyId: string): void {
    if (!KEY_ID_PATTERN.test(keyId)) {
        throw new Error("key ids must be 1-64 safe ASCII characters");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return (
        isRecord(value) &&
        Object.values(value).every((entry) => typeof entry === "string")
    );
}
