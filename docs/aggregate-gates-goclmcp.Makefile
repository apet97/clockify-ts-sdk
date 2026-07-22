# Source-derived fallback for the exact ../GOCLMCP Make graph recursively
# reached by this repository's goclmcp-drift target. check-aggregate-gates.mjs
# uses this file in a clean single-repository checkout and, when the sibling is
# present, compares every reached target's prerequisites, full recipe, and
# .PHONY status against the live sibling before accepting the live graph.
.PHONY: gen-tool-catalog catalog-drift gen-openapi openapi-drift gen-raw-allowlist raw-allowlist-drift selfinspect-drift

gen-tool-catalog:
	go run ./scripts/gen-tool-catalog -out docs

catalog-drift:
	@tmpdir="$$(mktemp -d)"; \
	 trap 'rm -rf "$$tmpdir"' EXIT; \
	 cp docs/tool-catalog.json "$$tmpdir/tool-catalog.json.before"; \
	 cp docs/tool-catalog.md "$$tmpdir/tool-catalog.md.before"; \
	 cp docs/default-toolset.json "$$tmpdir/default-toolset.json.before"; \
	 cp docs/default-toolset.md "$$tmpdir/default-toolset.md.before"; \
	 $(MAKE) --no-print-directory gen-tool-catalog >/dev/null; \
	 diff -q docs/tool-catalog.json "$$tmpdir/tool-catalog.json.before" >/dev/null \
	  && diff -q docs/tool-catalog.md "$$tmpdir/tool-catalog.md.before" >/dev/null \
	  && diff -q docs/default-toolset.json "$$tmpdir/default-toolset.json.before" >/dev/null \
	  && diff -q docs/default-toolset.md "$$tmpdir/default-toolset.md.before" >/dev/null \
	  || { echo "[catalog-drift] docs/tool-catalog/default-toolset files are stale; run make gen-tool-catalog"; \
	       diff -u "$$tmpdir/tool-catalog.md.before" docs/tool-catalog.md | head -80; exit 1; }

gen-openapi:
	scripts/gen-clockify-openapi --out docs/openapi/clockify-openapi.yaml

openapi-drift:
	@test -f docs/openapi/clockify-openapi.yaml || { echo "[openapi-drift] docs/openapi/clockify-openapi.yaml missing; run make gen-openapi"; exit 1; }
	@tmpdir="$$(mktemp -d)"; \
	 trap 'rm -rf "$$tmpdir"' EXIT; \
	 cp docs/openapi/clockify-openapi.yaml "$$tmpdir/clockify-openapi.yaml.before"; \
	 $(MAKE) --no-print-directory gen-openapi >/dev/null; \
	 scripts/gen-clockify-openapi --validate-only --out docs/openapi/clockify-openapi.yaml >/dev/null; \
	 diff -q docs/openapi/clockify-openapi.yaml "$$tmpdir/clockify-openapi.yaml.before" >/dev/null \
	  || { echo "[openapi-drift] docs/openapi/clockify-openapi.yaml is stale; run make gen-openapi"; \
	       diff -u "$$tmpdir/clockify-openapi.yaml.before" docs/openapi/clockify-openapi.yaml | head -120; exit 1; }

gen-raw-allowlist:
	go run ./scripts/gen-raw-allowlist

raw-allowlist-drift:
	@tmpdir="$$(mktemp -d)"; \
	 trap 'rm -rf "$$tmpdir"' EXIT; \
	 cp internal/tools/raw_allowlist_gen.go "$$tmpdir/raw_allowlist_gen.go.before"; \
	 $(MAKE) --no-print-directory gen-raw-allowlist >/dev/null; \
	 diff -q internal/tools/raw_allowlist_gen.go "$$tmpdir/raw_allowlist_gen.go.before" >/dev/null \
	  || { echo "[raw-allowlist-drift] internal/tools/raw_allowlist_gen.go is stale; run make gen-raw-allowlist"; \
	       diff -u "$$tmpdir/raw_allowlist_gen.go.before" internal/tools/raw_allowlist_gen.go | head -120; exit 1; }

selfinspect-drift:
	@diff -q docs/api-parity-matrix.md internal/tools/selfinspect_assets/api-parity-matrix.md >/dev/null \
	  || { echo "[selfinspect-drift] api parity asset is stale; run make sync-selfinspect-assets"; exit 1; }
	@diff -q docs/tool-coverage-dashboard.md internal/tools/selfinspect_assets/tool-coverage-dashboard.md >/dev/null \
	  || { echo "[selfinspect-drift] coverage dashboard asset is stale; run make sync-selfinspect-assets"; exit 1; }
	@diff -q docs/live-tests.md internal/tools/selfinspect_assets/live-tests.md >/dev/null \
	  || { echo "[selfinspect-drift] live tests asset is stale; run make sync-selfinspect-assets"; exit 1; }
