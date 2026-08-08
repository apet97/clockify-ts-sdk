#!/usr/bin/env bash
# Proves .gitleaks.toml narrows rather than mutes.
#
# An allowlist is easy to write too wide, and a too-wide one fails silently:
# the scan goes green because it stopped looking. Every case below pairs a
# "must stay quiet" fixture with a "must still be reported" fixture of the
# SAME shape, so a widened allowlist fails here instead of in production.
#
# Needs the gitleaks binary on PATH. Skips, loudly, when it is absent — a
# missing tool is a blocked check, not a passing one.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="${repo_root}/.gitleaks.toml"

if ! command -v gitleaks >/dev/null 2>&1; then
    echo "gitleaks-config.test: BLOCKED — gitleaks is not on PATH. Install it, then re-run." >&2
    exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

failures=0

# Reports the number of findings gitleaks produces for one file.
count_findings() {
    local target="$1" report="${work}/report.json"
    rm -f "${report}"
    gitleaks dir --no-banner --redact --exit-code 0 -c "${config}" \
        -f json -r "${report}" "${target}" >/dev/null 2>&1 || true
    if [[ -s "${report}" ]]; then
        python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "${report}"
    else
        echo 0
    fi
}

expect() {
    local label="$1" want="$2" target="$3"
    local got
    got="$(count_findings "${target}")"
    if [[ "${want}" == "quiet" && "${got}" -ne 0 ]]; then
        echo "FAIL ${label}: expected no findings, got ${got}" >&2
        failures=$((failures + 1))
    elif [[ "${want}" == "reported" && "${got}" -eq 0 ]]; then
        echo "FAIL ${label}: expected a finding, got none" >&2
        failures=$((failures + 1))
    else
        echo "ok   ${label}"
    fi
}

hex="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
ghp="ghp_$(python3 -c 'import secrets,string; a=string.ascii_letters+string.digits; print("".join(secrets.choice(a) for _ in range(36)))')"

# 1. A SHA-256 digest is muted only inside the attestation files.
mkdir -p "${work}/docs"
printf '{"h": "%s"}\n' "${hex}" >"${work}/docs/live-evidence-currentness.json"
expect "digest inside an attestation file is quiet" quiet "${work}/docs/live-evidence-currentness.json"

printf 'CLOCKIFY_API_KEY=%s\n' "${hex}" >"${work}/leak.env"
expect "same digest as a credential elsewhere is reported" reported "${work}/leak.env"

# 2. The path list is literal, not a directory-wide mute. A neighbour of an
#    allowlisted file must still be scanned — this is what bounds the blast
#    radius to the three generated attestation files.
printf '{"t": "%s"}\n' "${ghp}" >"${work}/docs/neighbour.json"
expect "secret in a file beside an attestation file is reported" reported "${work}/docs/neighbour.json"

# 3. Clockify's own credential shapes, which no upstream rule covers.
#    Both fixtures are GENERATED, never written down. A committed
#    credential-shaped literal would be a finding in this very file — which is
#    how the first version of this test reddened CI.
api_key="$(python3 -c 'import base64,uuid; print(base64.b64encode(str(uuid.uuid4()).encode()).decode())')"
printf 'x-api-key: %s\n' "${api_key}" >"${work}/header.txt"
expect "base64-of-UUID API key in a header dump is reported" reported "${work}/header.txt"

jwt="$(python3 -c '
import base64, json, secrets
def seg(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
print(seg({"alg":"RS256","typ":"JWT"}) + "." + seg({"sub":secrets.token_hex(8)}) + "." + secrets.token_urlsafe(32))
')"
printf 'X-Addon-Token: %s\n' "${jwt}" >"${work}/addon.txt"
expect "JWT add-on token is reported" reported "${work}/addon.txt"

# 4. Placeholders must not cry wolf, or the gate gets ignored.
printf 'const c = createClockifyClient({ apiKey: "drift-check" });\n' >"${work}/short.mjs"
expect "short placeholder key stays quiet" quiet "${work}/short.mjs"

if [[ "${failures}" -gt 0 ]]; then
    echo "gitleaks-config.test: ${failures} failure(s)" >&2
    exit 1
fi
echo "gitleaks-config.test: all cases pass"
