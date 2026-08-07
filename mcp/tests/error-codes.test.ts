// Direct unit coverage for the message-only classification branches of
// errorCodeForMessage (mcp/src/error-codes.ts). The wrapper's error-code-wiring
// test exercises the status-first path through getStableErrorCode; these cases
// pin the pure message matcher itself, one assertion per ordered branch plus
// the precedence guards between overlapping matchers.
import { describe, expect, it } from "vitest";

import { errorCodeForMessage } from "../src/error-codes.js";

describe("errorCodeForMessage message-only classification", () => {
    it("classifies a 'doesn't exist' wrong-id message as not_found", () => {
        expect(errorCodeForMessage("Project doesn't exist")).toBe("not_found");
    });

    it("classifies a 'doesn't belong to' wrong-id message as not_found", () => {
        expect(errorCodeForMessage("Task doesn't belong to Project")).toBe("not_found");
    });

    it("classifies a 'does not exist' (spelled-out) message as not_found", () => {
        expect(errorCodeForMessage("Client does not exist")).toBe("not_found");
    });

    it("classifies an auth/permission message as auth_or_permission", () => {
        expect(errorCodeForMessage("Unauthorized request")).toBe("auth_or_permission");
        expect(errorCodeForMessage("You do not have permission")).toBe("auth_or_permission");
        expect(errorCodeForMessage("CLOCKIFY_API_KEY is not set")).toBe("auth_or_permission");
        expect(errorCodeForMessage("addon-token rejected")).toBe("auth_or_permission");
    });

    it("classifies a validation message as invalid_request", () => {
        expect(errorCodeForMessage("name is required")).toBe("invalid_request");
        expect(errorCodeForMessage("unknown option --foo")).toBe("invalid_request");
        expect(errorCodeForMessage("could not parse the payload")).toBe("invalid_request");
        expect(errorCodeForMessage("confirmation token mismatch")).toBe("invalid_request");
    });

    it("classifies a status-less upstream/gateway message as clockify_upstream_error, not invalid_request", () => {
        // Reachable only when errorCodeForError's status map already came up
        // empty (see result.ts) -- e.g. a custom fetch that throws a
        // status-less Error. Must beat the generic "invalid" token below:
        // the message merely QUOTES a downstream failure, so it is retryable
        // upstream flakiness, not a client validation mistake.
        expect(errorCodeForMessage("upstream gateway error: invalid gateway")).toBe(
            "clockify_upstream_error",
        );
        expect(errorCodeForMessage("bad gateway")).toBe("clockify_upstream_error");
        expect(errorCodeForMessage("service unavailable, try again")).toBe("clockify_upstream_error");
        expect(errorCodeForMessage("internal server error")).toBe("clockify_upstream_error");
        expect(errorCodeForMessage("received 503 from upstream")).toBe("clockify_upstream_error");
        // A number that merely CONTAINS 500 as a substring must not match
        // (word-boundary guard on the status-code branch).
        expect(errorCodeForMessage("invalid value 45003 for --limit")).toBe("invalid_request");
    });

    it("classifies a bare 'not found' (no does/doesn't prefix) as not_found", () => {
        // This is the SECOND not_found branch, distinct from the leading
        // "doesn't belong to/exist" matcher — a plain "not found" phrase.
        expect(errorCodeForMessage("Resource not found")).toBe("not_found");
    });

    it("classifies a rate-limit message as rate_limited", () => {
        expect(errorCodeForMessage("Rate limit exceeded")).toBe("rate_limited");
        expect(errorCodeForMessage("too many requests, slow down")).toBe("rate_limited");
    });

    it("classifies a network failure message as connection_error", () => {
        expect(errorCodeForMessage("fetch failed")).toBe("connection_error");
        expect(errorCodeForMessage("ECONNRESET while reading")).toBe("connection_error");
        expect(errorCodeForMessage("DNS lookup failed")).toBe("connection_error");
        expect(errorCodeForMessage("TLS handshake error")).toBe("connection_error");
    });

    it("classifies an abort/cancel message as aborted", () => {
        expect(errorCodeForMessage("Request was cancelled")).toBe("aborted");
        expect(errorCodeForMessage("operation abort signal received")).toBe("aborted");
    });

    it("falls through to the generic error code for an unmatched message", () => {
        expect(errorCodeForMessage("Something unexpected happened")).toBe("error");
        expect(errorCodeForMessage("")).toBe("error");
    });

    it("orders the not_found wrong-id matcher ahead of the auth matcher", () => {
        // The leading "doesn't exist" branch must win even when an auth token
        // ("unauthorized") is also present in the same message.
        expect(errorCodeForMessage("user doesn't exist (unauthorized)")).toBe("not_found");
    });

    it("orders the auth matcher ahead of the bare 'not found' matcher", () => {
        // "permission" must classify as auth before the later "not found" branch.
        expect(errorCodeForMessage("permission revoked and resource not found")).toBe(
            "auth_or_permission",
        );
    });
});
