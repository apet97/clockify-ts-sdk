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

    const privateIpv4 = [
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
    ];
    for (const candidate of privateIpv4) {
        it(`rejects private/reserved IPv4: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|metadata|reserved|nat/i);
            }
        });
    }

    it("accepts routable public IPv4 literals", () => {
        expect(validateWebhookUrl("https://8.8.8.8/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://172.32.0.1/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://100.63.255.255/hook").ok).toBe(true);
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
    ];
    for (const candidate of privateIpv6) {
        it(`rejects private/reserved IPv6: ${candidate}`, () => {
            const result = validateWebhookUrl(candidate);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toMatch(/private|loopback|link-local|unspecified|metadata/i);
            }
        });
    }

    it("treats a non-NAT64 IPv6 with an a9fe:a9fe tail as a normal (public) literal", () => {
        // 2001:db8::a9fe:a9fe is NOT the 64:ff9b::/96 NAT64 prefix, so its tail must
        // NOT be decoded as an embedded IPv4 — locks the && in the NAT64 guard.
        expect(validateWebhookUrl("https://[2001:db8::a9fe:a9fe]/hook").ok).toBe(true);
    });

    it("accepts a 6to4 / IPv4-compatible literal embedding a PUBLIC v4", () => {
        // 6to4 and IPv4-compatible decode like NAT64: only a private/metadata
        // embedded v4 is blocked. 2002:0808:0808:: and ::0808:0808 both embed
        // 8.8.8.8 (public), so they must stay allowed — kills the
        // ConditionalExpression->true mutants on the two new decode branches.
        expect(validateWebhookUrl("https://[2002:808:808::]/hook").ok).toBe(true);
        expect(validateWebhookUrl("https://[::808:808]/hook").ok).toBe(true);
    });

    it("treats near-miss embedding prefixes as normal public literals", () => {
        // Each host is ONE group off a private-embedding prefix, so it must NOT be
        // decoded as that embedding — pins the prefix-match operators in ipv6Reason.
        // 2003:: is not 6to4 (2002::/16): kills `groups[0] === 0x2002` -> true.
        expect(validateWebhookUrl("https://[2003:a9fe:a9fe::]/hook").ok).toBe(true);
        // 64:ff9c:: is not NAT64 (second group != 0xff9b): kills the && -> || and the
        // `groups[1] === 0xff9b` equality mutant in the NAT64 guard.
        expect(validateWebhookUrl("https://[64:ff9c::a9fe:a9fe]/hook").ok).toBe(true);
        // 65:ff9b:: is not NAT64 (first group != 0x0064): kills `groups[0] === 0x0064`.
        expect(validateWebhookUrl("https://[65:ff9b::a9fe:a9fe]/hook").ok).toBe(true);
        // 1::7f00:1 has a non-zero leading group, so it is NOT IPv4-compatible (::/96):
        // kills the `groups.slice(0, 6).every(g => g === 0)` -> `.some` mutant.
        expect(validateWebhookUrl("https://[1::7f00:1]/hook").ok).toBe(true);
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
    });

    it("accepts routable public IPv6 literals", () => {
        expect(validateWebhookUrl("https://[2606:4700:4700::1111]/hook").ok).toBe(true);
        // first group 0xfec0 sits just ABOVE the fe80::/10 link-local band (<=0xfebf),
        // so it must be accepted — kills the ConditionalExpression->true mutant at
        // webhook-url.ts:189.
        expect(validateWebhookUrl("https://[fec0::1]/hook").ok).toBe(true);
        // 0xfebf is the EXACT top of the fe80::/10 band, so it must be REJECTED.
        // This pins the inclusive upper bound and kills the EqualityOperator
        // mutant (<=0xfebf -> <0xfebf) at webhook-url.ts:189, which [fec0::1]
        // alone cannot distinguish (both <= and < are false for 0xfec0).
        expect(validateWebhookUrl("https://[febf::1]/hook").ok).toBe(false);
    });

    const internalNames = [
        "https://localhost/hook",
        "https://api.localhost/hook",
        "https://service.local/hook",
        "https://db.internal/hook",
        "https://host.internal./hook",
        "https://printer.home.arpa/hook",
        "https://nas.lan/hook",
        "https://intranet.corp/hook",
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
