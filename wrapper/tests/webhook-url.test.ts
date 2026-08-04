import { describe, expect, it } from "vitest";

import { assertSafeWebhookUrl, validateWebhookUrl } from "../webhook-url.js";

describe("validateWebhookUrl", () => {
    it("accepts normal public HTTPS URLs", () => {
        expect(validateWebhookUrl("https://example.com/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://hooks.example.com:8443/clockify?x=1").ok).toBe(true);
    });

    const nonHttps = [
        "http://example.com/hook",
        "ftp://example.com/hook",
        "ws://example.com/hook",
        "file:///etc/passwd",
    ];
    for (const candidate of nonHttps) {
        it(`rejects non-HTTPS scheme: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/https/i);
        });
    }

    it("rejects malformed URLs and embedded credentials", () => {
        expect(validateWebhookUrl("not a url").ok).toBe(false);
        const credentials = validateWebhookUrl("https://user:pass@example.com/hook");
        expect(credentials.ok).toBe(false);
        if (!credentials.ok) expect(credentials.reason).toMatch(/credential/i);
    });

    const blockedIpv4 = [
        "https://0.0.0.0/hook",
        "https://10.0.0.1/hook",
        "https://100.64.0.1/hook",
        // Inclusive TOP of the CGNAT 100.64.0.0/10 band: a `b <= 127` -> `b < 127`
        // mutant would wrongly allow 100.127.x.x. Witness the boundary.
        "https://100.127.255.255/hook",
        "https://127.0.0.1/hook",
        "https://169.254.169.254/hook",
        "https://172.16.0.1/hook",
        // Inclusive TOP of the private 172.16.0.0/12 band: a `b <= 31` -> `b < 31`
        // mutant would wrongly allow 172.31.x.x. Witness the boundary.
        "https://172.31.255.255/hook",
        "https://192.168.1.1/hook",
        // IANA special-purpose ranges that are not ordinary global-unicast
        // callback destinations: protocol assignments, documentation, legacy
        // relay anycast, benchmarking, and TEST-NET space.
        "https://64.0.0.1/hook",
        "https://192.0.0.1/hook",
        "https://192.0.2.1/hook",
        "https://192.31.196.1/hook",
        "https://192.52.193.1/hook",
        "https://192.88.99.1/hook",
        "https://192.175.48.1/hook",
        "https://198.18.0.1/hook",
        "https://198.19.255.255/hook",
        "https://198.51.100.1/hook",
        "https://203.0.113.1/hook",
        // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved (Class E), 255.255.255.255
        // limited broadcast — all non-unicast, blocked by the `a >= 224` arm.
        // 224.0.0.1 is the EXACT lower edge: a `>= 224` -> `> 224` mutant would
        // wrongly allow it, so witnessing it blocked pins the inclusive bound.
        "https://224.0.0.1/hook",
        "https://239.255.255.250/hook",
        "https://240.0.0.1/hook",
        "https://255.255.255.255/hook",
    ];
    for (const candidate of blockedIpv4) {
        it(`rejects non-global IPv4: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(
                    /private|loopback|metadata|reserved|nat|multicast|broadcast|documentation|benchmark|special-purpose/i,
                );
            }
        });
    }

    // Regression for deep-ssrf-1: Node's URL parser folds ONE trailing dot into
    // the IPv4 form but preserves 2+ verbatim (127.0.0.1.. stays 127.0.0.1..),
    // and ideographic / percent-encoded dots fold to the same "..". All of these
    // must be rejected as the internal literal they normalize to.
    const trailingDotIpv4 = [
        "https://127.0.0.1../",
        "https://169.254.169.254../",
        "https://10.0.0.1../",
        "https://127.0.0.1。。/",
        "https://10.0.0.1%2e%2e/",
    ];
    for (const candidate of trailingDotIpv4) {
        it(`rejects trailing-dot internal IPv4: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|metadata|reserved|nat|multicast|broadcast/i);
            }
        });
    }

    it("accepts routable public IPv4 literals", () => {
        expect(validateWebhookUrl("https://8.8.8.8/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://172.32.0.1/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://100.63.255.255/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://192.1.2.1/hook").ok).toBe(true);
        // 223.255.255.255 is the last unicast address BELOW the 224.0.0.0/4
        // multicast block: it must stay allowed so the `a >= 224` arm does not
        // over-block. Pins the boundary against a `>= 224` -> `>= 223` mutant.
        expect(validateWebhookUrl("https://223.255.255.255/hook").ok).toBe(true);
    });

    const privateIpv6 = [
        "https://[::]/hook",
        "https://[::1]/hook",
        "https://[fc00::1]/hook",
        "https://[fd12:3456::1]/hook",
        "https://[fe80::1]/hook",
        "https://[::ffff:127.0.0.1]/hook",
        "https://[::ffff:10.0.0.1]/hook",
        "https://[::ffff:169.254.169.254]/hook",
        // NAT64 well-known prefix (64:ff9b::/96) embedding a private/metadata v4.
        "https://[64:ff9b::a9fe:a9fe]/hook",
        "https://[64:ff9b::7f00:1]/hook",
        // 6to4 prefix (2002::/16) embedding a private/metadata v4.
        // 2002:a9fe:a9fe:: -> 169.254.169.254; 2002:7f00:1:: -> 127.0.0.1.
        "https://[2002:a9fe:a9fe::]/hook",
        "https://[2002:7f00:1::]/hook",
        // IPv4-compatible IPv6 (::/96) embedding a private/metadata v4.
        // ::a9fe:a9fe -> 169.254.169.254; ::7f00:1 -> 127.0.0.1.
        "https://[::a9fe:a9fe]/hook",
        "https://[::7f00:1]/hook",
        // IPv4-translated IPv6 (::ffff:0:0:0/96, RFC 2765) embedding a private/metadata v4.
        // ::ffff:0:a9fe:a9fe -> 169.254.169.254; ::ffff:0:7f00:1 -> 127.0.0.1.
        // The dotted ::ffff:0:169.254.169.254 form folds to the same hex literal.
        "https://[::ffff:0:a9fe:a9fe]/hook",
        "https://[::ffff:0:7f00:1]/hook",
        "https://[::ffff:0:169.254.169.254]/hook",
        // ff00::/8 multicast (firstByte 0xff): ff02::1 all-nodes link-local,
        // ff0e::1 global. `new URL()` keeps these un-folded, so the guard sees
        // 0xff and the `firstByte === 0xff` arm blocks them.
        "https://[ff02::1]/hook",
        "https://[ff0e::1]/hook",
        // Non-global special-purpose ranges must not become callback targets
        // merely because they are syntactically valid unicast literals.
        "https://[64:ff9b::808:808]/hook",
        "https://[2001:2::1]/hook",
        "https://[2001:db8::1]/hook",
        "https://[2002:808:808::]/hook",
        "https://[2620:4f:8000::1]/hook",
        "https://[3fff::1]/hook",
    ];
    for (const candidate of privateIpv6) {
        it(`rejects private/reserved IPv6: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(
                    /private|loopback|link-local|unspecified|metadata|multicast|non-global|documentation|special-purpose/i,
                );
            }
        });
    }

    it("does not misread an ordinary global IPv6 tail as embedded IPv4", () => {
        expect(validateWebhookUrl("https://[2606:4700::a9fe:a9fe]/hook").ok).toBe(true);
    });

    it("rejects translation ranges even when they embed a public IPv4 address", () => {
        expect(validateWebhookUrl("https://[2002:808:808::]/hook").ok).toBe(false);
        expect(validateWebhookUrl("https://[::808:808]/hook").ok).toBe(false);
        expect(validateWebhookUrl("https://[::ffff:0:808:808]/hook").ok).toBe(false);
        expect(validateWebhookUrl("https://[64:ff9b::808:808]/hook").ok).toBe(false);
    });

    it("allows global unicast near 6to4 but rejects non-global lookalikes", () => {
        expect(validateWebhookUrl("https://[2003:a9fe:a9fe::]/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://[64:ff9c::a9fe:a9fe]/hook").ok).toBe(false);
        expect(validateWebhookUrl("https://[65:ff9b::a9fe:a9fe]/hook").ok).toBe(false);
        expect(validateWebhookUrl("https://[1::7f00:1]/hook").ok).toBe(false);
    });

    it("reports the specific reason for each special/embedded IPv6 form", () => {
        // The shared reject loop uses a lenient reason regex; pin each discrimination
        // branch to its OWN reason so a mutant that misroutes one form to another
        // (e.g. loopback -> IPv4-compatible) flips the reason and is killed.
        const reasonFor = (host: string) => {
            const result = validateWebhookUrl(`https://[${host}]/hook`);
            return result.ok ? "" : result.reason;
        };
        expect(reasonFor("::1")).toMatch(/loopback/);
        expect(reasonFor("::")).toMatch(/unspecified/);
        expect(reasonFor("::ffff:169.254.169.254")).toMatch(/IPv4-mapped/);
        expect(reasonFor("64:ff9b::a9fe:a9fe")).toMatch(/NAT64/);
        expect(reasonFor("2002:a9fe:a9fe::")).toMatch(/6to4/);
        expect(reasonFor("::a9fe:a9fe")).toMatch(/IPv4-compatible/);
        expect(reasonFor("::ffff:0:a9fe:a9fe")).toMatch(/IPv4-translated/);
        // ff00::/8 multicast routes to its OWN reason, distinct from the fc00/fe80
        // ranges above — a mutant misrouting it would flip the reason and be killed.
        expect(reasonFor("ff02::1")).toMatch(/multicast/);
        expect(reasonFor("ff0e::1")).toMatch(/multicast/);
    });

    it("reports the specific reason for IPv4 multicast / reserved / broadcast", () => {
        // Pin the `a >= 224` arm's reason so a mutant routing it elsewhere is caught.
        const reasonFor = (host: string) => {
            const result = validateWebhookUrl(`https://${host}/hook`);
            return result.ok ? "" : result.reason;
        };
        expect(reasonFor("224.0.0.1")).toMatch(/multicast|reserved|broadcast/);
        expect(reasonFor("255.255.255.255")).toMatch(/multicast|reserved|broadcast/);
    });

    it("rejects deprecated IPv6 site-local literals", () => {
        expect(validateWebhookUrl("https://[2606:4700:4700::1111]/hook").ok).toBe(true);
        // first group 0xfec0 sits just ABOVE the fe80::/10 link-local band (<=0xfebf),
        // so it must be accepted — kills the ConditionalExpression->true mutant at
        // webhook-url.ts:189.
        expect(validateWebhookUrl("https://[fec0::1]/hook")).toMatchObject({
            ok: false,
            reason: expect.stringMatching(/site-local.*fec0::\/10/i),
        });
        // 0xfebf is the EXACT top of the fe80::/10 band, so it must be REJECTED.
        // This pins the inclusive upper bound and kills the EqualityOperator
        // mutant (<=0xfebf -> <0xfebf) at webhook-url.ts:189, which [fec0::1]
        // alone cannot distinguish (both <= and < are false for 0xfec0).
        expect(validateWebhookUrl("https://[febf::1]/hook").ok).toBe(false);
    });

    const internalNames = [
        "https://localhost/hook",
        "https://api.localhost/hook",
        "https://local/hook",
        "https://service.local/hook",
        "https://internal/hook",
        "https://db.internal/hook",
        "https://host.internal./hook",
        "https://printer.home.arpa/hook",
        "https://lan/hook",
        "https://nas.lan/hook",
        "https://corp/hook",
        "https://intranet.corp/hook",
        "https://intranet/hook",
        "https://wiki.intranet/hook",
    ];
    for (const candidate of internalNames) {
        it(`rejects internal hostname: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/localhost|internal|home network|TLD|\.local/i);
        });
    }
});

describe("assertSafeWebhookUrl", () => {
    it("returns the normalized URL for a public HTTPS host", () => {
        const url = assertSafeWebhookUrl("https://example.com/hook");
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toBe("example.com");
    });

    it("throws for an unsafe host", () => {
        expect(() => assertSafeWebhookUrl("https://10.0.0.1/hook")).toThrow(
            /private|loopback|reserved|internal/i,
        );
    });
});

// ---------------------------------------------------------------------------
// Mutation-campaign NoCoverage-reach kills (CI mutation artifact
// mutation-reports-wrapper-1, wrapper/webhook-url.ts, group nocov-reach).
// Each test below reaches a previously-unexecuted line AND pins its
// OBSERVABLE behavior with exact toEqual/toBe assertions on full reason
// strings or acceptance — toMatch(regex) leniency is exactly why the
// reason-string mutants survived (SSRF-guard rule: assert the specific
// rejection reason, or acceptance; never just "threw").
// Equivalent NoCoverage mutants are deliberately NOT chased; they are
// ledgered in the campaign ledger comment block (errors.test.ts pattern).
// ---------------------------------------------------------------------------

describe("dot-only hosts hit the post-normalize empty-host guard (mutants 1996/1994)", () => {
    it("reports the exact empty-host reason for dot-only hosts", () => {
        // Node parses dots-only hosts ('https://.' -> hostname '.'), the
        // trailing-dot strip at webhook-url.ts:66 reduces them to "", and the
        // L67 guard must reject with the SPECIFIC reason. Exact toEqual kills
        // the reason-string mutant (1996: "empty host" -> "") and the fail-OPEN
        // guard mutant (1994: length check -> false ACCEPTS these hosts).
        expect(validateWebhookUrl("https://.")).toEqual({
            ok: false,
            reason: "webhook URL host . is not allowed: empty host",
        });
        expect(validateWebhookUrl("https://...")).toEqual({
            ok: false,
            reason: "webhook URL host ... is not allowed: empty host",
        });
        // Ideographic full stop (U+3002, percent-encoded) IDNA-folds to '.'.
        expect(validateWebhookUrl("https://%E3%80%82")).toEqual({
            ok: false,
            reason: "webhook URL host . is not allowed: empty host",
        });
    });
});

describe("uncompressed IPv6 literals parse via the no-:: arm (mutants 2215/2216 + 2167/2168)", () => {
    it("accepts a full-form 8-group IPv6 literal with no ::", () => {
        // WHATWG URL preserves uncompressed 8-group literals verbatim, so the
        // doubleColon === -1 arm of expandIpv6 (webhook-url.ts:170-171) is the
        // live parse path. Acceptance flips to a 'malformed IPv6 literal'
        // rejection under 2215 (=== 8 -> false), 2216 (=== -> !==), and the
        // expandIpv6 initializer/guard mutants 2167/2168.
        const full = validateWebhookUrl("https://[2606:4700:1:2:3:4:5:6]/hook");
        expect(full.ok).toBe(true);
        if (full.ok) expect(full.url.hostname).toBe("[2606:4700:1:2:3:4:5:6]");
    });
});

describe("validateWebhookUrl — private-IPv4 operand isolation (mutation group: private-ipv4-operands)", () => {
    // Survivor cluster 2063-2131 (parseIpv4 + ipv4Reason, webhook-url.ts L101-119).
    // Every fixture is ACCEPT-side (ok: true) on purpose: these mutants weaken
    // one operand of a range guard, so an in-range reject fixture cannot tell
    // original from mutant — only a host on the PUBLIC side of exactly one
    // operand of each conjunction can. All 12 mutants hand-flip-verified.

    // parseIpv4 structural guards: hosts that look dotted-numeric but must fall
    // through "not-ipv4" to classifyHostname and be accepted. The trailing ".."
    // on the first two defeats Node's own IPv4 parsing (the WHATWG parser only
    // folds a single trailing dot), so the raw string reaches classifyHost,
    // whose trailing-dot normalize then exposes the 5-part / >255 shape.
    const notQuiteIpv4 = [
        // Five dotted parts -> parts.length !== 4 -> not-ipv4. Mutant 2063
        // (`parts.length !== 4` -> false) reads the leading octets as 127.x
        // and mis-rejects this public hostname as loopback.
        "https://127.0.0.1.1../hook",
        // Octet 999 -> `value > 255` -> not-ipv4. Mutant 2075 (guard -> false)
        // mis-rejects as 10.0.0.0/8 private.
        "https://10.999.0.1../hook",
        // Non-digit part -> /^\d{1,3}$/ fails -> not-ipv4. Mutant 2069 (guard
        // -> false) lets Number("x") = NaN through; [10, 0, 0, NaN] then
        // mis-rejects as 10.0.0.0/8 private.
        "https://10.0.0.x/hook",
        // "x1" matches the ^-stripped regex (mutant 2070: /\d{1,3}$/): only
        // the anchored original keeps this a hostname.
        "https://10.0.0.x1/hook",
        // "1x" matches the $-stripped regex (mutant 2071: /^\d{1,3}/): same.
        "https://10.0.0.1x/hook",
    ];
    for (const candidate of notQuiteIpv4) {
        it(`accepts a dotted host that only LOOKS like IPv4: ${candidate}`, () => {
            expect(validateWebhookUrl(candidate).ok).toBe(true);
        });
    }

    // ipv4Reason range operands: public addresses adjacent to each private
    // band, isolating ONE operand of each conjunction. The reject side of
    // every band is already pinned by the privateIpv4 block above.
    const publicNeighbours = [
        // A normal 192/8 allocation outside every special range: a === 192 but
        // b !== 168 — still isolates the private-range operands.
        // `b === 168` -> true mutant (2110) and the && -> || mutant (2107).
        "https://192.1.2.1/hook",
        // b === 168 but a !== 192 — kills the `a === 192` -> true mutant
        // (2108), which 192.1.2.1 alone cannot flip.
        "https://8.168.0.1/hook",
        // 172.15.x sits just BELOW 172.16.0.0/12 — kills `b >= 16` -> true
        // (2098); the in-band 172.16.0.1 reject cannot distinguish it.
        "https://172.15.0.1/hook",
        // a === 169 but b !== 254 — kills the && -> || mutant (2115) and the
        // `b === 254` -> true mutant (2118).
        "https://169.253.0.1/hook",
        // b === 254 but a !== 169 — isolates the other operand of the
        // link-local conjunction (also flips 2115 from the b side).
        "https://8.254.0.1/hook",
        // 100.128.x sits just ABOVE the CGNAT 100.64.0.0/10 band — kills
        // `b <= 127` -> true (2131). The lower neighbour 100.63.255.255 is
        // already pinned in the routable-public block.
        "https://100.128.0.1/hook",
    ];
    for (const candidate of publicNeighbours) {
        it(`accepts a public IPv4 neighbour of a private band: ${candidate}`, () => {
            expect(validateWebhookUrl(candidate).ok).toBe(true);
        });
    }
});

// ---------------------------------------------------------------------------
// Mutation-campaign kills: ipv6-parse group (wrapper/webhook-url.ts survivors).
// Killable: 2228/2230/2232/2233 (C6, L181) + 2244 (C7, L182). The group's 12
// equivalents (C1-C5) are recorded in the campaign ledger at the end of this
// file. Every kill asserts the VERBATIM reason string — the loose /unspecified/i
// regex in the shared reject loop is exactly why these mutants survived.
// ---------------------------------------------------------------------------

describe("ipv6Reason unspecified-address branch pins its verbatim reason (mutants 2228/2230/2232/2233)", () => {
    it("rejects https://[::]/hook with exactly the unspecified-address reason", () => {
        // The shared privateIpv6 reject loop only regex-matches /unspecified/i.
        // Forcing the `groups.every((g) => g === 0)` check false (or mutating its
        // predicate) misroutes :: to the IPv4-compatible decode, whose reason —
        // "IPv4-compatible IPv6 of a reserved/unspecified range (0.0.0.0/8)" —
        // STILL matches that loose regex, which is exactly why these mutants
        // survived. Only the verbatim reason string separates the two branches.
        expect(validateWebhookUrl("https://[::]/hook")).toEqual({
            ok: false,
            reason: "webhook URL host :: is not allowed: unspecified address (::)",
        });
    });
});

describe("ipv6Reason loopback check requires the last group to be exactly 1 (mutant 2244)", () => {
    it("routes ::2 to the IPv4-compatible decode, not the loopback branch", () => {
        // `groups[7] === 1` -> true would classify EVERY ::x single-group tail as
        // "loopback address (::1)". ::2 embeds 0.0.0.2 (0.0.0.0/8), so the intact
        // guard falls through to the IPv4-compatible decode with a different
        // verbatim reason — rejected either way, so only the exact string kills.
        expect(validateWebhookUrl("https://[::2]/hook")).toEqual({
            ok: false,
            reason:
                "webhook URL host ::2 is not allowed: IPv4-compatible IPv6 of a reserved/unspecified range (0.0.0.0/8)",
        });
    });
});

// ---------------------------------------------------------------------------
// Mutation-campaign kill tests — protocol/formatter clusters (CI wrapper run,
// webhook-url.ts survivors 1941 / 1950-1954 / 2357-2361). Each test pins the
// EXACT observable reason string — toMatch(regex) leniency is exactly why
// these mutants survived.
// ---------------------------------------------------------------------------

describe("invalid-URL reason string (mutant 1941)", () => {
    it("reports the exact reason including the offending candidate", () => {
        expect(validateWebhookUrl("not a url")).toEqual({
            ok: false,
            reason: "webhook URL is not a valid URL: not a url",
        });
    });
});

describe("non-https scheme reason interpolation (mutants 1950/1951/1952/1954)", () => {
    it("names the offending scheme with the trailing colon stripped", () => {
        // Pins the `url.protocol.replace(/:$/, "") || "no"` interpolation: the
        // ConditionalExpression mutants render "got true|false scheme", the
        // || -> && mutant renders "got no scheme", and a poisoned replace()
        // replacement renders "got httpStryker was here! scheme" — every one
        // fails this equality.
        expect(validateWebhookUrl("http://example.com/hook")).toEqual({
            ok: false,
            reason: "webhook URL must use https (got http scheme)",
        });
    });
});

describe("truncate() boundary in the invalid-URL reason (mutants 2357-2361)", () => {
    // A bare repeat-char candidate contains no ":" so new URL() throws and the
    // invalid-URL arm formats the raw candidate through truncate(). The
    // 119/120/121 trio pins the `value.length > 120` comparison exactly:
    // 119 kills the always-truncate arm (-> true), 120 kills > -> >= (its ONLY
    // killer), 121 kills the never-truncate arm (-> false, its ONLY killer),
    // and all three kill the emptied-function-body mutant. The same trio also
    // kills the NoCoverage formatter mutants 2362/2363 (same boundary) — keep
    // ONE 119/120/121 block if another campaign group proposes a duplicate.
    it("passes a 119-char candidate through untruncated", () => {
        const candidate = "a".repeat(119);
        expect(validateWebhookUrl(candidate)).toEqual({
            ok: false,
            reason: `webhook URL is not a valid URL: ${candidate}`,
        });
    });

    it("passes a 120-char candidate through untruncated (inclusive boundary)", () => {
        const candidate = "a".repeat(120);
        expect(validateWebhookUrl(candidate)).toEqual({
            ok: false,
            reason: `webhook URL is not a valid URL: ${candidate}`,
        });
    });

    it("truncates a 121-char candidate to 117 chars plus an ellipsis", () => {
        const candidate = "a".repeat(121);
        expect(validateWebhookUrl(candidate)).toEqual({
            ok: false,
            reason: `webhook URL is not a valid URL: ${"a".repeat(117)}...`,
        });
    });
});

describe("classifyHostname anchors internal-suffix checks at the END of the host (mutant 2006)", () => {
    it("rejects https://.localhost/x with exactly the loopback-hostname reason", () => {
        // Gap survivor 2006 (webhook-url.ts:79, endsWith(".") -> startsWith(".")):
        // a LEADING-dot host trips the mutated guard, so ".localhost" is
        // truncated to ".localhos" BEFORE the suffix checks and the mutant
        // fails OPEN -- https://.localhost/x (and .local/.internal/.lan/
        // .home.arpa alike) would be ACCEPTED: a security-relevant SSRF
        // bypass. Node parses the leading-empty-label host verbatim; the
        // intact guard leaves it untouched and .endsWith(".localhost") must
        // reject with the exact loopback-hostname reason.
        expect(validateWebhookUrl("https://.localhost/x")).toEqual({
            ok: false,
            reason: "webhook URL host .localhost is not allowed: loopback hostname",
        });
    });
});

// ---------------------------------------------------------------------------
// Mutation-campaign ledger (CI runs 30420465438 and 30509504520,
// wrapper/webhook-url.ts).
//
// The mutation-campaign describe blocks above kill those runs' survived and
// NoCoverage mutants by asserting OBSERVABLE behavior. The 35 mutants below
// are EQUIVALENT (platform-unreachable, dead-branch, or observably
// identical) and intentionally not chased (same treatment as errors.ts,
// composed-fetch.ts, and subdomain-label.ts at its 80 ceiling):
//
// - 1953 (L30): Regex /:$/ -> /:/. WHATWG url.protocol is always "<scheme>:"
//   with exactly one colon, at the end, so the anchored and unanchored
//   strips remove the same character — unobservable.
// - 1955 (L30): scheme-reason fallback `"no"` -> `""`. Dead right operand:
//   url.protocol of every successfully parsed WHATWG URL is a non-empty
//   scheme + ':' (scheme-less candidates throw in new URL()), so
//   `.replace(/:$/, "")` is always truthy and the `|| "no"` arm never
//   evaluates.
// - 1966 (L40): bracket guard && -> ||. new URL() emits "["/"]" in
//   url.hostname only as a matched pair around an IPv6 literal (a lone
//   bracket makes the constructor throw), so both operators select the
//   same host set.
// - 1968 (L40): "[" -> "". startsWith("") is always true, reducing the
//   guard to endsWith("]") — the same matched-pair host set as 1966.
// - 1970 (L40): "]" -> "". endsWith("") is always true, reducing the
//   guard to startsWith("[") — the same matched-pair host set as 1966.
// - 1989 (L57): classifyHost entry `"empty host"` -> `""`. Unreachable
//   return: WHATWG https requires a non-empty host — 'https://',
//   'https://:443/x', 'https://@/x', '[]', and every IDNA-maps-to-empty
//   host (U+00AD, U+200B, U+2060, U+FEFF, bare 'xn--') all THROW in
//   new URL(), and 'https:///x' parses host 'x' — so classifyHost never
//   receives "" (cross-evidence: 1987, the same guard -> false, Survived
//   with zero behavioral diffs).
// - 2008/2009: RESOLVED 2026-07-31 (polish round 7) — these no longer exist.
//   They were the classifyHostname trailing-dot slice arm, documented here as
//   equivalent because the arm was dead: the only caller passes `normalized`,
//   from which classifyHost's `replace(/\.+$/, "")` has already stripped ALL
//   trailing dots. The dead arm was deleted rather than left to generate
//   permanent unkillable survivors, so Stryker now emits no mutant there.
//   Kept as a record: if a second caller of classifyHostname is ever added, it
//   MUST normalize trailing dots itself — the strip is gone.
// - 2146/2147/2148/2150 (L130-132): dotted-tail branch selectors (lastIndexOf
//   ":" literal, tail slice, `tail.includes(".")` -> false). WHATWG URL
//   canonicalizes every IPv6 literal to pure lowercase hex before the guard
//   runs (verified: ::ffff:10.0.0.1 -> ::ffff:a00:1, ::ffff:0:169.254.169.254
//   -> ::ffff:0:a9fe:a9fe), so the host at classifyIpv6 never contains "."
//   and the dotted-tail branch is URL-unreachable either way.
// - 2152-2160 (L132-135): dotted-tail embedded-IPv4 branch of classifyIpv6
//   (block -> {}, sentinel comparisons, reason strings). Dead branch: the
//   WHATWG/Ada serializer emits IPv6 hostnames hex-only ('[::ffff:10.0.0.1]'
//   -> '[::ffff:a00:1]', '[::1.2.3.4]' -> '[::102:304]'; malformed dotted
//   forms throw in new URL()), so a ':'-containing hostname never contains
//   '.'. The LIVE mapped-literal defence is the hex path at ipv6Reason
//   L187-199, which is covered and killed (cross-evidence: 2150
//   `tail.includes('.')` -> false Survived).
// - 2164 (L140): `"malformed IPv6 literal"` -> `""`. Unreachable return:
//   expandIpv6 never returns null for URL-canonical input — every malformed
//   bracketed literal throws inside new URL() first (cross-evidence: 2163
//   `!groups` -> false Survived with zero diffs).
// - 2199/2200/2201 (L160): hex-group regex guard -> false / de-anchored.
//   Malformed groups (":::", 5-hex-digit like 12345::1, non-hex) make
//   `new URL()` itself throw, so toGroups only ever sees canonical 1-4-char
//   lowercase hex parts the regex (anchored or not) always accepts.
// - 2205/2206 (L168): `!headGroups || !tailGroups` -> false / `||` -> `&&`.
//   toGroups returns null only for regex-rejected parts, which are
//   URL-unreachable (above), so both operands are always false.
// - 2210 (L170): `doubleColon === -1` -> false. A no-`::` literal has exactly
//   8 head groups, so the fall-through computes missing = 0, zero-fills
//   nothing, and returns the identical group array.
// - 2213/2214 (L170-171): no-'::' return block -> {} / `=== 8` -> true.
//   Fallthrough identity: with the block emptied an 8-group literal falls
//   through to `missing = 0` zero-fill and returns identical groups, and
//   every reachable no-'::' literal has exactly 8 groups (WHATWG omits '::'
//   only when all 8 are present; 7-group literals throw in new URL()).
//   NOTE: the cluster-5 accept fixture COVERS both, converting them from
//   NoCoverage to covered Survivors — accepted at merge (the same fixture
//   kills 2215/2216 AND gap survivors 2167/2168: net score-positive, plus a
//   genuine full-form-IPv6 acceptance regression test).
// - 2220/2221 (L175): `missing < 0` -> false / `<` -> `<=`. With a `::`
//   present, 8+ explicit groups (the only way missing hits <= 0) are
//   rejected by `new URL()` itself (verified: [1:2:3:4:5:6:7::8],
//   [1:2:3:4:5:6:7:8::], [1:2:3:4:5:6:7:8:9] all throw), so missing is
//   always >= 1 on reachable input.
// - 1987/2163/2174 (L57/L140/L149): merge-stage gap-probe equivalents.
//   1987: classifyHost's entry guard `host.length === 0` -> false is
//   unreachable -- WHATWG https URLs never surface an empty hostname (every
//   maps-to-empty candidate throws in new URL(); same platform argument as
//   1989, hand-verified over the 52-input battery). 2163: `!groups` -> false
//   is dead -- expandIpv6 never returns null on URL-canonical input (2164's
//   argument, corroborated by the 37-fixture gap battery: 0 diffs). 2174:
//   the second-`::` guard -> false is dead -- multi-`::` literals throw
//   inside new URL() first (same invariant as the ipv6-parse C5 cluster).
// ---------------------------------------------------------------------------
