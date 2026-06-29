import { ERROR_CLASSES, GENERATED_BANNER } from "./constants.mjs";
import { write, writeReceipt } from "./fs-utils.mjs";
import { indent, propertyAccess, toPascal } from "./naming.mjs";
import { bodyFields, fieldLine, requestFields, requestNonBodyFields, schemaToDeclaration, typeFromSchema } from "./schema.mjs";

let activeModel;

export async function generate(model, outDir, options = {}) {
    activeModel = model;
    await write(outDir, "environments.ts", `${GENERATED_BANNER}export const ClockifyApiEnvironment = {\n    Default: "https://api.clockify.me/api/v1",\n} as const;\n\nexport type ClockifyApiEnvironment = typeof ClockifyApiEnvironment.Default;\n`);
    await writeBaseClient(outDir);
    await writeCore(outDir);
    await writeAuth(outDir);
    await writeErrors(outDir);
    await writeTypes(model, outDir);
    await writeResources(model, outDir);
    await writeClient(model, outDir);
    await write(outDir, "exports.ts", `${GENERATED_BANNER}export * from "./core/exports.js";\n`);
    await write(outDir, "index.ts", `${GENERATED_BANNER}export * as ClockifyApi from "./api/index.js";\nexport type { BaseClientOptions, BaseRequestOptions } from "./BaseClient.js";\nexport { ClockifyApiClient } from "./Client.js";\nexport { ClockifyApiEnvironment } from "./environments.js";\nexport { ClockifyApiError, ClockifyApiTimeoutError } from "./errors/index.js";\nexport * from "./exports.js";\nexport * from "./errors/index.js";\n`);
    if (options.receiptPath && options.receipt) await writeReceipt(options.receiptPath, options.receipt);
}

async function writeBaseClient(outDir) {
    await write(outDir, "BaseClient.ts", `${GENERATED_BANNER}import { HeaderAuthProvider } from "./auth/HeaderAuthProvider.js";\nimport { mergeHeaders } from "./core/headers.js";\nimport * as core from "./core/index.js";\nimport type * as environments from "./environments.js";\n\nexport type AuthOption = false | core.AuthProvider["getAuthRequest"] | core.AuthProvider | HeaderAuthProvider.AuthOptions;\n\nexport type BaseClientCommonOptions = {\n    environment?: core.Supplier<environments.ClockifyApiEnvironment | string>;\n    baseUrl?: core.Supplier<string>;\n    headers?: Record<string, string | core.Supplier<string | null | undefined> | null | undefined>;\n    timeoutInSeconds?: number;\n    maxRetries?: number;\n    fetch?: typeof fetch;\n    logging?: core.logging.LogConfig | core.logging.Logger;\n    auth?: AuthOption;\n};\n\nexport type BaseClientOptions = BaseClientCommonOptions & HeaderAuthProvider.AuthOptions;\n\nexport interface BaseRequestOptions {\n    timeoutInSeconds?: number;\n    maxRetries?: number;\n    abortSignal?: AbortSignal;\n    addonToken?: string;\n    queryParams?: Record<string, unknown>;\n    headers?: Record<string, string | core.Supplier<string | null | undefined> | null | undefined>;\n}\n\nexport type NormalizedClientOptions<T extends BaseClientOptions = BaseClientOptions> = T & {\n    logging: core.logging.Logger;\n    authProvider?: core.AuthProvider;\n};\n\nexport type NormalizedClientOptionsWithAuth<T extends BaseClientOptions = BaseClientOptions> = NormalizedClientOptions<T> & {\n    authProvider: core.AuthProvider;\n};\n\nexport function normalizeClientOptions<T extends BaseClientOptions = BaseClientOptions>(options: T): NormalizedClientOptions<T> {\n    return {\n        ...options,\n        logging: core.logging.createLogger(options?.logging),\n        headers: mergeHeaders(options?.headers),\n    } as NormalizedClientOptions<T>;\n}\n\nexport function normalizeClientOptionsWithAuth<T extends BaseClientOptions = BaseClientOptions>(options: T): NormalizedClientOptionsWithAuth<T> {\n    const normalized = normalizeClientOptions(options) as NormalizedClientOptionsWithAuth<T>;\n    if (options.auth === false) {\n        normalized.authProvider = new core.NoOpAuthProvider();\n        return normalized;\n    }\n    if (options.auth != null) {\n        if (typeof options.auth === "function") {\n            normalized.authProvider = { getAuthRequest: options.auth };\n            return normalized;\n        }\n        if (core.isAuthProvider(options.auth)) {\n            normalized.authProvider = options.auth;\n            return normalized;\n        }\n        Object.assign(normalized, options.auth);\n    }\n    normalized.authProvider ??= new HeaderAuthProvider(normalized);\n    return normalized;\n}\n`);
}

async function writeCore(outDir) {
    await write(outDir, "core/fetcher/Headers.ts", `${GENERATED_BANNER}let HeadersCtor: typeof globalThis.Headers;\n\nif (typeof globalThis.Headers !== "undefined") {\n    HeadersCtor = globalThis.Headers;\n} else {\n    HeadersCtor = class Headers implements globalThis.Headers {\n        private readonly headers = new Map<string, string[]>();\n        constructor(init?: HeadersInit) {\n            if (init instanceof HeadersCtor) init.forEach((value, key) => this.append(key, value));\n            else if (Array.isArray(init)) for (const [key, value] of init) this.append(String(key), String(value));\n            else if (init) for (const [key, value] of Object.entries(init)) this.append(key, String(value));\n        }\n        append(name: string, value: string): void { const key = name.toLowerCase(); this.headers.set(key, [...(this.headers.get(key) ?? []), value]); }\n        delete(name: string): void { this.headers.delete(name.toLowerCase()); }\n        get(name: string): string | null { const values = this.headers.get(name.toLowerCase()); return values ? values.join(", ") : null; }\n        has(name: string): boolean { return this.headers.has(name.toLowerCase()); }\n        set(name: string, value: string): void { this.headers.set(name.toLowerCase(), [value]); }\n        forEach(callbackfn: (value: string, key: string, parent: Headers) => void, thisArg?: unknown): void { for (const [key, values] of this.headers) callbackfn.call(thisArg, values.join(", "), key, this as unknown as Headers); }\n        getSetCookie(): string[] { return this.headers.get("set-cookie") ?? []; }\n        *entries(): HeadersIterator<[string, string]> { for (const [key, values] of this.headers) yield [key, values.join(", ")]; }\n        *keys(): HeadersIterator<string> { yield* this.headers.keys(); }\n        *values(): HeadersIterator<string> { for (const values of this.headers.values()) yield values.join(", "); }\n        [Symbol.iterator](): HeadersIterator<[string, string]> { return this.entries(); }\n    } as typeof globalThis.Headers;\n}\n\nexport { HeadersCtor as Headers };\n`);
    await write(outDir, "core/fetcher/RawResponse.ts", `${GENERATED_BANNER}import { Headers } from "./Headers.js";\n\nexport type RawResponse = Omit<{\n    [K in keyof Response as Response[K] extends Function ? never : K]: Response[K];\n}, "ok" | "body" | "bodyUsed">;\n\nexport const abortRawResponse: RawResponse = { headers: new Headers(), redirected: false, status: 499, statusText: "Client Closed Request", type: "error", url: "" } as const;\nexport const unknownRawResponse: RawResponse = { headers: new Headers(), redirected: false, status: 0, statusText: "Unknown Error", type: "error", url: "" } as const;\n\nexport function toRawResponse(response: Response): RawResponse {\n    return { headers: response.headers, redirected: response.redirected, status: response.status, statusText: response.statusText, type: response.type, url: response.url };\n}\n\nexport interface WithRawResponse<T> {\n    readonly data: T;\n    readonly rawResponse: RawResponse;\n}\n`);
    await write(outDir, "core/fetcher/HttpResponsePromise.ts", `${GENERATED_BANNER}import type { WithRawResponse } from "./RawResponse.js";\n\nexport class HttpResponsePromise<T> extends Promise<T> {\n    private unwrappedPromise: Promise<T> | undefined;\n    private constructor(private readonly innerPromise: Promise<WithRawResponse<T>>) { super((resolve) => resolve(undefined as T)); }\n    public static fromPromise<T>(promise: Promise<WithRawResponse<T>>): HttpResponsePromise<T> { return new HttpResponsePromise<T>(promise); }\n    public static fromResult<T>(result: WithRawResponse<T>): HttpResponsePromise<T> { return new HttpResponsePromise<T>(Promise.resolve(result)); }\n    private unwrap(): Promise<T> { return (this.unwrappedPromise ??= this.innerPromise.then(({ data }) => data)); }\n    public override then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return this.unwrap().then(onfulfilled, onrejected); }\n    public override catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult> { return this.unwrap().catch(onrejected); }\n    public override finally(onfinally?: (() => void) | null): Promise<T> { return this.unwrap().finally(onfinally); }\n    public async withRawResponse(): Promise<WithRawResponse<T>> { return await this.innerPromise; }\n}\n`);
    await write(outDir, "core/fetcher/BinaryResponse.ts", `${GENERATED_BANNER}export type BinaryResponse = {\n    bodyUsed: Response["bodyUsed"];\n    stream: () => Response["body"];\n    arrayBuffer: () => ReturnType<Response["arrayBuffer"]>;\n    blob: () => ReturnType<Response["blob"]>;\n    bytes?(): Promise<Uint8Array>;\n};\n\nexport function getBinaryResponse(response: Response): BinaryResponse {\n    const binaryResponse: BinaryResponse = {\n        get bodyUsed() { return response.bodyUsed; },\n        stream: () => response.body,\n        arrayBuffer: response.arrayBuffer.bind(response),\n        blob: response.blob.bind(response),\n    };\n    if ("bytes" in response && typeof response.bytes === "function") binaryResponse.bytes = response.bytes.bind(response);\n    return binaryResponse;\n}\n`);
    await write(outDir, "core/fetcher/Supplier.ts", `${GENERATED_BANNER}export type Supplier<T> = T | Promise<T> | (() => T | Promise<T>);\nexport const Supplier = { get: async <T>(supplier: Supplier<T> | undefined): Promise<T | undefined> => typeof supplier === "function" ? await (supplier as () => T | Promise<T>)() : await supplier };\n`);
    await write(outDir, "core/headers.ts", `${GENERATED_BANNER}import { Supplier } from "./fetcher/Supplier.js";\n\nexport function mergeHeaders(...headersArray: (Record<string, unknown> | null | undefined)[]): Record<string, unknown> {\n    const result: Record<string, unknown> = {};\n    for (const [key, value] of headersArray.filter((headers) => headers != null).flatMap((headers) => Object.entries(headers!))) {\n        const insensitiveKey = key.toLowerCase();\n        if (value != null) result[insensitiveKey] = value;\n        else if (insensitiveKey in result) delete result[insensitiveKey];\n    }\n    return result;\n}\n\nexport function mergeOnlyDefinedHeaders(...headersArray: (Record<string, unknown> | null | undefined)[]): Record<string, unknown> {\n    const result: Record<string, unknown> = {};\n    for (const [key, value] of headersArray.filter((headers) => headers != null).flatMap((headers) => Object.entries(headers!))) {\n        if (value != null) result[key.toLowerCase()] = value;\n    }\n    return result;\n}\n\nexport async function resolveHeaders(headers: Record<string, unknown> | undefined): Promise<Record<string, string>> {\n    const resolved: Record<string, string> = {};\n    for (const [key, value] of Object.entries(headers ?? {})) {\n        const actual = await Supplier.get(value as never);\n        if (actual != null) resolved[key] = String(actual);\n    }\n    return resolved;\n}\n`);
    await write(outDir, "core/logging/index.ts", `${GENERATED_BANNER}export interface Logger { debug(message: string, ...args: unknown[]): void; info(message: string, ...args: unknown[]): void; warn(message: string, ...args: unknown[]): void; error(message: string, ...args: unknown[]): void; }\nexport type LogConfig = (Partial<Logger> & { level?: string; logger?: Partial<Logger> }) | boolean;\nconst noop = () => undefined;\nexport function createLogger(config?: LogConfig | Logger): Logger {\n    if (config && typeof config === "object") {\n        const source = "logger" in config && config.logger != null ? config.logger : config;\n        return { debug: source.debug ?? noop, info: source.info ?? noop, warn: source.warn ?? noop, error: source.error ?? noop };\n    }\n    return { debug: noop, info: noop, warn: noop, error: noop };\n}\n`);
    await write(outDir, "core/url/index.ts", `${GENERATED_BANNER}export function encodePathParam(value: string): string { return encodeURIComponent(value); }\nexport function join(base: string, pathname: string): string {\n    return base.replace(/\\/+$/, "") + "/" + pathname.replace(/^\\/+/, "");\n}\nexport function queryBuilder(): QueryBuilder { return new QueryBuilder(); }\nclass QueryBuilder {\n    private readonly params = new URLSearchParams();\n    addMany(values: Record<string, unknown>): this { for (const [key, value] of Object.entries(values)) this.add(key, value); return this; }\n    mergeAdditional(values?: Record<string, unknown>): this { if (values) this.addMany(values); return this; }\n    add(key: string, value: unknown): this {\n        if (value == null) return this;\n        if (Array.isArray(value)) {\n            for (const item of value) if (item != null) this.params.append(key, String(item));\n        } else {\n            this.params.set(key, String(value));\n        }\n        return this;\n    }\n    build(): string { return this.params.toString(); }\n}\n`);
    await write(outDir, "core/json.ts", `${GENERATED_BANNER}export function toJson(value: unknown, replacer?: Parameters<typeof JSON.stringify>[1], space?: Parameters<typeof JSON.stringify>[2]): string { return JSON.stringify(value, replacer, space); }\n`);
    await write(outDir, "core/index.ts", `${GENERATED_BANNER}export * from "./fetcher/Headers.js";\nexport * from "./fetcher/RawResponse.js";\nexport * from "./fetcher/HttpResponsePromise.js";\nexport * from "./fetcher/BinaryResponse.js";\nexport * from "./fetcher/Supplier.js";\nexport * from "./headers.js";\nexport * as logging from "./logging/index.js";\nexport * as url from "./url/index.js";\nexport * from "./request.js";\nexport type AuthRequest = { headers: Record<string, string> };\nexport interface AuthProvider { getAuthRequest(options?: { endpointMetadata?: EndpointMetadata }): Promise<AuthRequest>; }\nexport function isAuthProvider(value: unknown): value is AuthProvider { return value != null && typeof value === "object" && typeof (value as AuthProvider).getAuthRequest === "function"; }\nexport class NoOpAuthProvider implements AuthProvider { async getAuthRequest(): Promise<AuthRequest> { return { headers: {} }; } }\nexport interface EndpointMetadata { readonly method?: string; readonly path?: string; }\nexport const RUNTIME = { type: "node", version: process.versions.node } as const;\n`);
    await write(outDir, "core/exports.ts", `${GENERATED_BANNER}export * from "./index.js";\n`);
    await write(outDir, "core/request.ts", requestRuntimeSourceWithTimeoutAndRetry());
    await write(outDir, "core/fetcher/index.ts", `${GENERATED_BANNER}export * from "./Headers.js";\nexport * from "./RawResponse.js";\nexport * from "./HttpResponsePromise.js";\nexport * from "./BinaryResponse.js";\nexport * from "./Supplier.js";\n`);
    await write(outDir, "core/auth/index.ts", `${GENERATED_BANNER}export { NoOpAuthProvider } from "../index.js";\nexport type { AuthProvider, AuthRequest } from "../index.js";\n`);
    await write(outDir, "core/base64.ts", `${GENERATED_BANNER}export function encodeBase64(value: string): string { return Buffer.from(value).toString("base64"); }\n`);
    await write(outDir, "core/file/index.ts", `${GENERATED_BANNER}export type Uploadable = Blob | File | Buffer | Uint8Array | string;\n`);
    await write(outDir, "core/file/exports.ts", `${GENERATED_BANNER}export * from "./index.js";\n`);
    await write(outDir, "core/form-data-utils/index.ts", `${GENERATED_BANNER}export function newFormData(): FormData { return new FormData(); }\n`);
    await write(outDir, "core/runtime/index.ts", `${GENERATED_BANNER}export { RUNTIME } from "../index.js";\n`);
}

function requestRuntimeSourceWithTimeoutAndRetry() {
    return `${GENERATED_BANNER}${String.raw`import * as apiErrors from "../api/errors/index.js";
import { ClockifyApiError, ClockifyApiTimeoutError } from "../errors/index.js";
import { ClockifyApiEnvironment } from "../environments.js";
import { getBinaryResponse, type BinaryResponse } from "./fetcher/BinaryResponse.js";
import { toRawResponse, type RawResponse, type WithRawResponse } from "./fetcher/RawResponse.js";
import { Supplier } from "./fetcher/Supplier.js";
import { resolveHeaders } from "./headers.js";
import * as url from "./url/index.js";

export interface OperationSpec {
    method: string;
    path: string;
    baseUrl?: string;
    pathParams?: Record<string, unknown>;
    queryParams?: Record<string, unknown>;
    body?: unknown;
    contentType?: string;
    multipart?: boolean;
    responseType?: "json" | "binary" | "void";
}

export namespace PassthroughRequest { export type RequestOptions = RequestOptionsShape; }
export interface RequestOptionsShape {
    timeoutInSeconds?: number;
    maxRetries?: number;
    abortSignal?: AbortSignal;
    queryParams?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    addonToken?: string;
}

export async function request<T>(clientOptions: any, operation: OperationSpec, requestOptions?: RequestOptionsShape): Promise<WithRawResponse<T>> {
    const baseUrl = (await Supplier.get(clientOptions.baseUrl)) ?? (await Supplier.get(clientOptions.environment)) ?? operation.baseUrl ?? ClockifyApiEnvironment.Default;
    let pathname = operation.path.replace(/^\/+/, "");
    for (const [key, value] of Object.entries(operation.pathParams ?? {})) {
        pathname = pathname.replace(new RegExp("\\{" + key + "\\}", "g"), url.encodePathParam(String(value)));
    }
    const requestUrl = new URL(url.join(String(baseUrl), pathname));
    for (const [key, value] of Object.entries({ ...(operation.queryParams ?? {}), ...(requestOptions?.queryParams ?? {}) })) {
        if (value == null) continue;
        if (Array.isArray(value)) {
            for (const item of value) if (item != null) requestUrl.searchParams.append(key, String(item));
        } else {
            requestUrl.searchParams.set(key, String(value));
        }
    }

    const auth = await clientOptions.authProvider.getAuthRequest({ endpointMetadata: { method: operation.method, path: operation.path } });
    const optionHeaders = await resolveHeaders(clientOptions.headers);
    const requestHeaders = await resolveHeaders(requestOptions?.headers);
    const headers = new Headers({ ...auth.headers, ...optionHeaders, ...requestHeaders });
    const addonToken = requestOptions?.addonToken ?? (await Supplier.get(clientOptions.addonToken));
    if (addonToken != null && addonToken !== "") headers.set("X-Addon-Token", String(addonToken));

    const init: RequestInit = { method: operation.method, headers, signal: requestOptions?.abortSignal ?? null };
    if (operation.body !== undefined) {
        if (operation.multipart) {
            const form = new FormData();
            for (const [key, value] of Object.entries(operation.body as Record<string, unknown>)) {
                appendFormValue(form, key, value);
            }
            init.body = form;
        } else {
            headers.set("Content-Type", operation.contentType ?? "application/json");
            init.body = JSON.stringify(operation.body);
        }
    }

    const fetchFn = clientOptions.fetch ?? fetch;
    const maxRetries = normalizedRetries(requestOptions?.maxRetries ?? clientOptions.maxRetries ?? 2);
    const timeoutInSeconds = requestOptions?.timeoutInSeconds ?? clientOptions.timeoutInSeconds;
    for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
            response = await fetchWithTimeout(fetchFn, requestUrl, init, timeoutInSeconds);
        } catch (cause) {
            if (shouldRetryError(cause, operation.method, attempt, maxRetries)) {
                await delay(retryDelayMs(undefined, attempt));
                continue;
            }
            if (cause instanceof ClockifyApiTimeoutError) throw cause;
            throw new ClockifyApiError({ message: cause instanceof Error ? cause.message : "Request failed", cause });
        }

        const rawResponse = toRawResponse(response);
        if (!response.ok && shouldRetryResponse(response, operation.method, attempt, maxRetries)) {
            await delay(retryDelayMs(response, attempt));
            continue;
        }
        const data = await parseBody(response, operation.responseType);
        if (!response.ok) throw errorForResponse(response.status, data, rawResponse);
        return { data: data as T, rawResponse };
    }
}

async function parseBody(response: Response, responseType: OperationSpec["responseType"]): Promise<unknown> {
    if (responseType === "binary") return getBinaryResponse(response) satisfies BinaryResponse;
    if (responseType === "void" || response.status === 204) return undefined;
    const text = await response.text();
    if (text === "") return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
        try { return JSON.parse(text); } catch { return text; }
    }
    return text;
}

function errorForResponse(statusCode: number, body: unknown, rawResponse: RawResponse): ClockifyApiError {
    switch (statusCode) {
        case 400:
            return new apiErrors.BadRequestError(body, rawResponse);
        case 401:
            return new apiErrors.UnauthorizedError(body, rawResponse);
        case 403:
            return new apiErrors.ForbiddenError(body, rawResponse);
        case 404:
            return new apiErrors.NotFoundError(body, rawResponse);
        case 405:
            return new apiErrors.MethodNotAllowedError(body, rawResponse);
        default:
            return new ClockifyApiError({ statusCode, body, rawResponse });
    }
}

function appendFormValue(form: FormData, key: string, value: unknown): void {
    if (value == null) return;
    if (Array.isArray(value)) {
        for (const item of value) appendFormValue(form, key, item);
        return;
    }
    if (value instanceof Blob || typeof value === "string") {
        form.append(key, value);
        return;
    }
    if (value instanceof Uint8Array) {
        const bytes = new Uint8Array(value);
        form.append(key, new Blob([bytes.buffer as ArrayBuffer]));
        return;
    }
    form.append(key, String(value));
}

async function fetchWithTimeout(fetchFn: typeof fetch, input: Request | string | URL, init: RequestInit, timeoutInSeconds?: number): Promise<Response> {
    if (timeoutInSeconds == null || timeoutInSeconds <= 0) return await fetchFn(input, init);
    const controller = new AbortController();
    let timedOut = false;
    const upstreamSignal = init.signal;
    const onAbort = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal?.aborted) controller.abort(upstreamSignal.reason);
    else upstreamSignal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutInSeconds * 1000);
    try {
        return await fetchFn(input, { ...init, signal: controller.signal });
    } catch (cause) {
        if (timedOut) throw new ClockifyApiTimeoutError("Request timed out", { cause });
        throw cause;
    } finally {
        clearTimeout(timeout);
        upstreamSignal?.removeEventListener("abort", onAbort);
    }
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

function normalizedRetries(value: unknown): number {
    const retries = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 2;
    return Math.max(0, retries);
}

function shouldRetryResponse(response: Response, method: string, attempt: number, maxRetries: number): boolean {
    return attempt < maxRetries && RETRYABLE_METHODS.has(method) && RETRYABLE_STATUS_CODES.has(response.status);
}

function shouldRetryError(cause: unknown, method: string, attempt: number, maxRetries: number): boolean {
    if (cause instanceof ClockifyApiTimeoutError) return attempt < maxRetries && RETRYABLE_METHODS.has(method);
    if (cause instanceof DOMException && cause.name === "AbortError") return false;
    return attempt < maxRetries && RETRYABLE_METHODS.has(method);
}

const RETRY_MAX_DELAY_MS = 60_000;

function jitter(ms: number): number {
    const spread = ms * (1 + (Math.random() - 0.5) * 0.4);
    return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, spread));
}

function retryDelayMs(response: Response | undefined, attempt: number): number {
    const retryAfter = response?.headers.get("Retry-After");
    if (retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds)) return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, seconds * 1000));
        const dateMs = Date.parse(retryAfter);
        if (Number.isFinite(dateMs)) return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, dateMs - Date.now()));
    }
    const reset = response?.headers.get("X-RateLimit-Reset");
    if (reset) {
        const seconds = Number.parseInt(reset, 10);
        if (Number.isFinite(seconds)) return Math.min(RETRY_MAX_DELAY_MS, Math.max(0, seconds * 1000 - Date.now()));
    }
    return jitter(Math.min(RETRY_MAX_DELAY_MS, 1000 * 2 ** attempt));
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function makePassthroughRequest(input: Request | string | URL, init: RequestInit = {}, clientOptions: any, requestOptions?: RequestOptionsShape): Promise<Response> {
    const baseUrl = (await Supplier.get(clientOptions.baseUrl)) ?? ClockifyApiEnvironment.Default;
    const target = typeof input === "string" && !/^https?:\/\//.test(input) ? url.join(String(baseUrl), input) : input;
    const auth = clientOptions.getAuthHeaders ? { headers: await clientOptions.getAuthHeaders() } : { headers: {} };
    const headers = new Headers({ ...(auth.headers ?? {}), ...(await resolveHeaders(clientOptions.headers)), ...(init.headers as Record<string, string> | undefined), ...(await resolveHeaders(requestOptions?.headers)) });
    return await fetchWithTimeout(clientOptions.fetch ?? fetch, target, { ...init, headers, signal: requestOptions?.abortSignal ?? null }, requestOptions?.timeoutInSeconds ?? clientOptions.timeoutInSeconds);
}

export function pickDefined(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
    return out;
}

export function bodyFromRequest(source: Record<string, unknown>, keys: readonly string[]): unknown {
    if (!keys.includes("body") && Object.prototype.hasOwnProperty.call(source, "body")) return source.body;
    return pickDefined(source, keys);
}
`}`;
}

async function writeAuth(outDir) {
    await write(outDir, "auth/HeaderAuthProvider.ts", `${GENERATED_BANNER}import * as core from "../core/index.js";\nimport * as errors from "../errors/index.js";\n\nexport class HeaderAuthProvider implements core.AuthProvider {\n    constructor(private readonly options: HeaderAuthProvider.Options) {}\n    public static canCreate(options: Partial<HeaderAuthProvider.Options>): boolean { return options?.apiKey != null || options?.addonToken != null; }\n    public async getAuthRequest(): Promise<core.AuthRequest> {\n        const apiKey = await core.Supplier.get(this.options.apiKey);\n        if (apiKey != null && apiKey !== "") return { headers: { "X-Api-Key": String(apiKey) } };\n        const addonToken = await core.Supplier.get(this.options.addonToken);\n        if (addonToken != null && addonToken !== "") return { headers: { "X-Addon-Token": String(addonToken) } };\n        throw new errors.ClockifyApiError({ message: HeaderAuthProvider.AUTH_CONFIG_ERROR_MESSAGE });\n    }\n}\n\nexport namespace HeaderAuthProvider {\n    export const AUTH_SCHEME = "ApiKeyAuth" as const;\n    export const AUTH_CONFIG_ERROR_MESSAGE = "Please provide apiKey or addonToken when initializing the client" as const;\n    export type AuthOptions =\n        | { apiKey: core.Supplier<string>; addonToken?: never }\n        | { addonToken: core.Supplier<string>; apiKey?: never }\n        | { apiKey?: never; addonToken?: never };\n    export type Options = AuthOptions;\n    export function createInstance(options: Options): core.AuthProvider { return new HeaderAuthProvider(options); }\n}\n`);
    await write(outDir, "auth/index.ts", `${GENERATED_BANNER}export * from "./HeaderAuthProvider.js";\n`);
}

async function writeErrors(outDir) {
    await write(outDir, "errors/ClockifyApiError.ts", `${GENERATED_BANNER}import type * as core from "../core/index.js";\nimport { toJson } from "../core/json.js";\n\nexport class ClockifyApiError extends Error {\n    public readonly statusCode?: number | undefined;\n    public readonly body?: unknown;\n    public readonly rawResponse?: core.RawResponse | undefined;\n    public override readonly cause?: unknown;\n    constructor({ message, statusCode, body, rawResponse, cause }: { message?: string | undefined; statusCode?: number | undefined; body?: unknown; rawResponse?: core.RawResponse | undefined; cause?: unknown }) {\n        super(buildMessage({ message, statusCode, body }));\n        Object.setPrototypeOf(this, new.target.prototype);\n        this.name = this.constructor.name;\n        this.statusCode = statusCode;\n        this.body = body;\n        this.rawResponse = rawResponse;\n        if (cause != null) this.cause = cause;\n    }\n}\nfunction buildMessage({ message, statusCode, body }: { message?: string | undefined; statusCode?: number | undefined; body?: unknown }): string {\n    const lines: string[] = [];\n    if (message != null) lines.push(message);\n    if (statusCode != null) lines.push("Status code: " + statusCode);\n    if (body != null) lines.push("Body: " + toJson(body, undefined, 2));\n    return lines.join("\\n");\n}\n`);
    await write(outDir, "errors/ClockifyApiTimeoutError.ts", `${GENERATED_BANNER}export class ClockifyApiTimeoutError extends Error {\n    public override readonly cause?: unknown;\n    constructor(message: string, opts?: { cause?: unknown }) {\n        super(message);\n        Object.setPrototypeOf(this, new.target.prototype);\n        this.name = this.constructor.name;\n        if (opts?.cause != null) this.cause = opts.cause;\n    }\n}\n`);
    await write(outDir, "errors/index.ts", `${GENERATED_BANNER}export { ClockifyApiError } from "./ClockifyApiError.js";\nexport { ClockifyApiTimeoutError } from "./ClockifyApiTimeoutError.js";\n`);
    await write(outDir, "errors/handleNonStatusCodeError.ts", `${GENERATED_BANNER}import * as errors from "./index.js";\nexport function handleNonStatusCodeError(error: unknown): never { throw new errors.ClockifyApiError({ message: error instanceof Error ? error.message : "Unknown error", cause: error }); }\n`);
    for (const [name, statusCode] of ERROR_CLASSES) {
        await write(outDir, `api/errors/${name}.ts`, `${GENERATED_BANNER}import type * as core from "../../core/index.js";\nimport * as errors from "../../errors/index.js";\n\nexport class ${name} extends errors.ClockifyApiError {\n    constructor(body?: unknown, rawResponse?: core.RawResponse) {\n        super({ message: "${name}", statusCode: ${statusCode}, body, rawResponse });\n        Object.setPrototypeOf(this, new.target.prototype);\n        this.name = this.constructor.name;\n    }\n}\n`);
    }
    await write(outDir, "api/errors/index.ts", `${GENERATED_BANNER}${ERROR_CLASSES.map(([name]) => `export * from "./${name}.js";`).join("\n")}\n`);
}

async function writeTypes(model, outDir) {
    const typeNames = Object.keys(model.schemas).sort();
    const exported = [];
    for (const name of typeNames) {
        if (model.requestTypeNames.has(name)) continue;
        const schema = model.schemas[name];
        exported.push(name);
        await write(outDir, `api/types/${name}.ts`, `${GENERATED_BANNER}import type * as ClockifyApi from "../index.js";\n\n${schemaToDeclaration(name, schema, model)}\n`);
    }
    await write(outDir, "api/types/index.ts", `${GENERATED_BANNER}${exported.map((name) => `export * from "./${name}.js";`).join("\n")}\n`);
}

async function writeResources(model, outDir) {
    const operationsByResource = new Map();
    for (const operation of model.operations) {
        const list = operationsByResource.get(operation.resource) ?? [];
        list.push(operation);
        operationsByResource.set(operation.resource, list);
    }

    const resourceIndex = [];
    for (const resource of model.resources) {
        const operations = operationsByResource.get(resource) ?? [];
        await writeResource(model, outDir, resource, operations);
        resourceIndex.push(`export * from "./${resource}/client/requests/index.js";`);
        resourceIndex.push(`export * as ${resource} from "./${resource}/index.js";`);
    }
    await write(outDir, "api/resources/index.ts", `${GENERATED_BANNER}${resourceIndex.join("\n")}\n`);
    await write(outDir, "api/index.ts", `${GENERATED_BANNER}export * from "./errors/index.js";\nexport * from "./resources/index.js";\nexport * from "./types/index.js";\n`);
}

async function writeResource(model, outDir, resource, operations) {
    const className = `${toPascal(resource)}Client`;
    const clientDir = `api/resources/${resource}/client`;
    const requestNames = [];
    for (const operation of operations) {
        if (!operation.requestType) continue;
        requestNames.push(operation.requestType);
        await write(outDir, `${clientDir}/requests/${operation.requestType}.ts`, requestTypeSource(model, operation));
    }
    await write(outDir, `${clientDir}/requests/index.ts`, `${GENERATED_BANNER}${[...new Set(requestNames)].sort().map((name) => `export type { ${name} } from "./${name}.js";`).join("\n")}\n`);
    await write(outDir, `${clientDir}/index.ts`, `${GENERATED_BANNER}export * from "./Client.js";\n`);
    await write(outDir, `api/resources/${resource}/index.ts`, `${GENERATED_BANNER}export * from "./client/index.js";\n`);
    await write(outDir, `api/resources/${resource}/exports.ts`, `${GENERATED_BANNER}export * from "./index.js";\n`);

    const methods = operations.map((operation) => methodSource(operation, resource, className)).join("\n\n");
    await write(outDir, `${clientDir}/Client.ts`, `${GENERATED_BANNER}import type { BaseClientOptions, BaseRequestOptions } from "../../../../BaseClient.js";\nimport { type NormalizedClientOptionsWithAuth, normalizeClientOptionsWithAuth } from "../../../../BaseClient.js";\nimport * as core from "../../../../core/index.js";\nimport type * as ClockifyApi from "../../../index.js";\n\nexport declare namespace ${className} {\n    export type Options = BaseClientOptions;\n    export interface RequestOptions extends BaseRequestOptions {}\n}\n\nexport class ${className} {\n    protected readonly _options: NormalizedClientOptionsWithAuth<${className}.Options>;\n    constructor(options: ${className}.Options) { this._options = normalizeClientOptionsWithAuth(options); }\n\n${indent(methods, 4)}\n}\n`);
}

function requestTypeSource(model, operation) {
    const fields = requestFields(model, operation);
    const body = bodyFields(model, operation);
    if (operation.requestBody) {
        const pathAndQueryFields = requestNonBodyFields(model, operation);
        const flattenedName = `${operation.requestType}Flattened`;
        const envelopeName = `${operation.requestType}BodyEnvelope`;
        const bodyName = `${operation.requestType}Body`;
        const bodyRequired = operation.requestBody.required === true || body.some((field) => field.required);
        const bodyType = body.length > 0 ? bodyName : typeFromSchema(operation.requestBody.schema, model);
        return `${GENERATED_BANNER}import type * as ClockifyApi from "../../../../index.js";\n\nexport type ${operation.requestType} = ${flattenedName} | ${envelopeName};\n\nexport interface ${flattenedName} {\n${fields.map(fieldLine).join("\n") || "    [key: string]: unknown;"}\n}\n\nexport interface ${envelopeName} {\n${pathAndQueryFields.map(fieldLine).join("\n") || ""}${pathAndQueryFields.length > 0 ? "\n" : ""}    body${bodyRequired ? "" : "?"}: ${bodyType};\n}\n${body.length > 0 ? `\nexport interface ${bodyName} {\n${body.map(fieldLine).join("\n")}\n}\n` : ""}`;
    }
    return `${GENERATED_BANNER}import type * as ClockifyApi from "../../../../index.js";\n\nexport interface ${operation.requestType} {\n${fields.map(fieldLine).join("\n") || "    [key: string]: unknown;"}\n}\n`;
}

function methodSource(operation, resource, className) {
    const responseType = responseTypeFromOperation(operation);
    const fields = operation.requestType ? requestFields(activeModel, operation) : [];
    const requestOptional = operation.requestType != null && fields.every((field) => !field.required);
    const requestParameter = operation.requestType
        ? `request${requestOptional ? "?" : ""}: ClockifyApi.${operation.requestType},\n        requestOptions?: ${className}.RequestOptions`
        : `requestOptions?: ${className}.RequestOptions`;
    const requestArg = operation.requestType ? (requestOptional ? "(request ?? {})" : "request") : "{}";
    return `/**\n * @param {${operation.requestType ? `ClockifyApi.${operation.requestType}` : `${className}.RequestOptions`}} ${operation.requestType ? "request" : "requestOptions"}\n */\npublic ${operation.methodName}(\n    ${requestParameter},\n): core.HttpResponsePromise<${responseType}> {\n    return core.HttpResponsePromise.fromPromise(\n        core.request<${responseType}>(this._options, ${operationSpecSource(operation, requestArg)}, ${operation.requestType ? "requestOptions" : "requestOptions"}),\n    );\n}`;
}

function operationSpecSource(operation, requestVar) {
    const pathParams = Object.fromEntries(operation.pathParams.map((parameter) => [parameter.name, propertyAccess(requestVar, parameter.name)]));
    const queryParams = Object.fromEntries(operation.queryParams.map((parameter) => [parameter.name, propertyAccess(requestVar, parameter.name)]));
    const bodyKeys = bodyFieldNames(operation);
    const lines = [
        "{",
        `    method: "${operation.httpMethod}",`,
        `    path: "${operation.path}",`,
    ];
    if (operation.baseUrl) lines.push(`    baseUrl: ${JSON.stringify(operation.baseUrl)},`);
    if (Object.keys(pathParams).length > 0) lines.push(`    pathParams: ${objectExpression(pathParams)},`);
    if (Object.keys(queryParams).length > 0) lines.push(`    queryParams: ${objectExpression(queryParams)},`);
    if (operation.requestBody) {
        if (bodyKeys.length > 0) lines.push(`    body: core.bodyFromRequest(${requestVar} as unknown as Record<string, unknown>, ${JSON.stringify(bodyKeys)}),`);
        else lines.push(`    body: (${requestVar} as { body?: unknown }).body,`);
        lines.push(`    contentType: "${operation.requestBody.contentType}",`);
        if (operation.requestBody.multipart) lines.push("    multipart: true,");
    }
    lines.push(`    responseType: "${operation.response.type}",`);
    lines.push("}");
    return lines.join("\n");
}

function objectExpression(entries) {
    const lines = ["{"];
    for (const [key, value] of Object.entries(entries)) lines.push(`        ${JSON.stringify(key)}: ${value},`);
    lines.push("    }");
    return lines.join("\n");
}

async function writeClient(model, outDir) {
    const imports = model.resources
        .map((resource) => `import { ${toPascal(resource)}Client } from "./api/resources/${resource}/client/Client.js";`)
        .join("\n");
    const fields = model.resources.map((resource) => `protected _${resource}: ${toPascal(resource)}Client | undefined;`).join("\n    ");
    const getters = model.resources
        .map((resource) => `public get ${resource}(): ${toPascal(resource)}Client { return (this._${resource} ??= new ${toPascal(resource)}Client(this._options)); }`)
        .join("\n\n    ");
    await write(outDir, "Client.ts", `${GENERATED_BANNER}${imports}\nimport type { BaseClientOptions, BaseRequestOptions } from "./BaseClient.js";\nimport { type NormalizedClientOptionsWithAuth, normalizeClientOptionsWithAuth } from "./BaseClient.js";\nimport * as core from "./core/index.js";\n\nexport declare namespace ClockifyApiClient {\n    export type Options = BaseClientOptions;\n    export interface RequestOptions extends BaseRequestOptions {}\n}\n\nexport class ClockifyApiClient {\n    protected readonly _options: NormalizedClientOptionsWithAuth<ClockifyApiClient.Options>;\n    ${fields}\n\n    constructor(options: ClockifyApiClient.Options) { this._options = normalizeClientOptionsWithAuth(options); }\n\n    ${getters}\n\n    public async fetch(input: Request | string | URL, init?: RequestInit, requestOptions?: core.PassthroughRequest.RequestOptions): Promise<Response> {\n        return core.makePassthroughRequest(input, init, {\n            baseUrl: this._options.baseUrl ?? this._options.environment,\n            headers: this._options.headers,\n            timeoutInSeconds: this._options.timeoutInSeconds,\n            maxRetries: this._options.maxRetries,\n            fetch: this._options.fetch,\n            logging: this._options.logging,\n            getAuthHeaders: async () => (await this._options.authProvider.getAuthRequest()).headers,\n        }, requestOptions);\n    }\n}\n`);
}

function bodyFieldNames(operation) {
    return operation.requestBody ? bodyFields(activeModel, operation).map((field) => field.name) : [];
}

function responseTypeFromOperation(operation) {
    if (operation.response.type === "void") return "void";
    if (operation.response.type === "binary") return "core.BinaryResponse";
    return typeFromSchema(operation.response.schema, activeModel);
}
