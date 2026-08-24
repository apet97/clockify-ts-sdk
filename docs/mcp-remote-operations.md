# Clockify MCP remote operations

This guide operates the stateless, multi-user `clockify115-mcp-http` service.
Local `clockify115-mcp` stdio remains the simpler one-user deployment. The
remote service does not include an authorization server, a TLS terminator, or
an administration API.

## Architecture and trust boundaries

Each `POST /mcp` is independent. The service verifies the caller's bearer
token, resolves one provisioned principal to one encrypted Clockify credential,
builds a fresh MCP server, and discards the request context afterward. There is
no MCP session ID, sticky state, shared Clockify key, or bearer-token storage.
Horizontal replicas share PostgreSQL and the same key ring.

Put the service behind an HTTPS reverse proxy that:

- terminates TLS for the exact `CLOCKIFY_MCP_PUBLIC_URL`;
- preserves the public `Host` header;
- accepts a maximum request body of 1 MiB or less;
- applies an operator-defined per-client request-rate limit;
- caps upstream connections at or below the configured process admission limit;
- does not rewrite `/mcp` or either well-known metadata path; and
- forwards no untrusted identity headers as authorization.

Keep `/readyz` on a private probe path. Do not expose it through a public load
balancer. Every route, including `/healthz` and `/readyz`, validates the exact
`Host` header before it runs. Configure the probe with one value from
`CLOCKIFY_MCP_HOST_ALLOWLIST`; a default pod-IP or loopback Host value fails.

The process binds to loopback by default. Set `CLOCKIFY_MCP_BIND_HOST=0.0.0.0`
only inside a private container or network boundary. The supplied Compose
example publishes the service on host loopback and intentionally omits a proxy
and authorization server.

The portable example is [`deploy/mcp-remote/compose.yaml`](../deploy/mcp-remote/compose.yaml).
It pins PostgreSQL by manifest digest, can build the non-root MCP image, drops
Linux capabilities, uses a read-only root filesystem, and keeps PostgreSQL
private. A production deployment must set `CLOCKIFY_MCP_IMAGE` to an immutable
registry reference such as `registry.example/mcp@sha256:<digest>` and set
`CLOCKIFY_MCP_PULL_POLICY=always`. A registry failure must stop deployment; it
must never fall back to building the checkout. Do not use the local default tag
as deployment identity. `CLOCKIFY_MCP_NODE_IMAGE` and
`CLOCKIFY_MCP_POSTGRES_IMAGE` may point at approved internal mirrors, but both
references must remain digest-qualified. The image publishes OCI source,
revision, version, description, title, license labels. Set
`CLOCKIFY_MCP_SOURCE_REVISION` and `CLOCKIFY_MCP_IMAGE_VERSION` when you build
the image, then record the resulting digest and labels in the deployment
receipt.

For an authenticated npm proxy or private build CA, pass BuildKit secrets
instead of copying configuration into the context or image. The optional npmrc
can set its registry, scoped authentication, and `cafile=/run/secrets/npm-ca`:

```sh
docker build \
  --secret id=npmrc,src=/private/build/npmrc \
  --secret id=npm-ca,src=/private/build/npm-ca.pem \
  --build-arg NODE_IMAGE="$CLOCKIFY_MCP_NODE_IMAGE" \
  --file mcp/Dockerfile.remote .
```

The repository-owned container proofs accept the same digest-qualified
`CLOCKIFY_MCP_NODE_IMAGE` and `CLOCKIFY_MCP_POSTGRES_IMAGE` overrides. They
reject tags and unqualified references before creating proof resources.

The `admin` Compose profile uses the same image and has no published port.
Before its first local use, run `docker compose build mcp`; in a registry-backed
deployment, pull the configured digest first. Then run an administrative
command through the profile, for example:

```sh
docker compose --profile admin run --rm admin encryption status
```

Before using it on Linux, create `deploy/mcp-remote/secrets/`, make the MCP
secret files owner UID/GID `1000:1000`, make `postgres-password` owner
`999:999`, and set every file to mode `0600`. Bind-mounted file ownership varies
under desktop virtualization; verify ownership from inside each container
instead of weakening the mode check. Supply the non-secret OAuth/public URL
settings to Compose, then put the host-loopback listener behind the separately
managed TLS proxy.

Some secret stores project values through symlinks or read-only files with a
mode other than `0600`. The service rejects those files. Use an init container
or a platform startup adapter to copy each projected value into a private
memory-backed volume as a regular file owned by the service UID. Create the
destination directory with mode `0700` and each file with mode `0600`. Point
the service at the copied file. Do not disable the file check, follow the
projection symlink directly, or change the shared projection in place.

For an image that provides `install`, the materialization step has this shape.
Run it as the UID that will run the service. Do not print either file.

```sh
install -d -m 0700 /run/clockify-mcp-private
install -m 0600 /projected/keyring.json \
  /run/clockify-mcp-private/keyring.json
install -m 0600 /projected/oauth-client-secret \
  /run/clockify-mcp-private/oauth-client-secret
```

## Required configuration

Both remote binaries fail closed when either local-mode variable,
`CLOCKIFY_API_KEY` or `CLOCKIFY_WORKSPACE_ID`, is present, including as an empty
variable. Remote credentials are provisioned only through the admin CLI.

| Setting | Purpose |
|---|---|
| `CLOCKIFY_MCP_PUBLIC_URL` | Exact externally visible HTTPS URL ending in `/mcp`. It is also the exact OAuth resource and audience. |
| `CLOCKIFY_MCP_OAUTH_ISSUER` | One canonical trusted HTTPS issuer. |
| `CLOCKIFY_MCP_OAUTH_JWKS_URL` | HTTPS JWKS endpoint used for JWT-shaped access tokens. Responses must use a JSON JWK-set media type and stay within 256 KiB. |
| `CLOCKIFY_MCP_OAUTH_JWT_ALGORITHMS` | Comma-separated asymmetric allowlist, such as `RS256`. |
| `CLOCKIFY_MCP_OAUTH_INTROSPECTION_URL` | HTTPS RFC 7662 endpoint for non-JWT tokens. Requests time out after five seconds; redirects and responses larger than 64 KiB are rejected. |
| `CLOCKIFY_MCP_OAUTH_CLIENT_ID` | OAuth client ID for `client_secret_basic` introspection. |
| `CLOCKIFY_MCP_OAUTH_CLIENT_SECRET_FILE` | Regular mode-`0600` file containing exactly one secret line. |
| `CLOCKIFY_MCP_OAUTH_AUTHORIZATION_ENDPOINT` | Authorization endpoint published in compatibility metadata. |
| `CLOCKIFY_MCP_OAUTH_TOKEN_ENDPOINT` | Token endpoint published in compatibility metadata. |
| `CLOCKIFY_MCP_KEYRING_FILE` | Regular mode-`0600` AES-256-GCM key-ring JSON file. |
| `CLOCKIFY_MCP_HOST_ALLOWLIST` | Optional exact comma-separated `hostname[:port]` values. The public URL host is always required. |
| `CLOCKIFY_MCP_ORIGIN_ALLOWLIST` | Optional exact comma-separated origins. A missing `Origin` is accepted; a present origin must match. |
| `CLOCKIFY_MCP_BIND_HOST` | Listen address; defaults to `127.0.0.1`. |
| `CLOCKIFY_MCP_PORT` | Listen port; defaults to `3000`. |
| `CLOCKIFY_MCP_MIGRATION_MODE` | `apply` or `verify`; defaults to `apply`. Use `verify` for a least-privilege runtime after a separate migrator applies the schema. |
| `CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS` | Per-attempt Clockify request deadline from 1 through 600 seconds; defaults to 180. Retry-safe reads can make more than one bounded attempt. |
| `CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS` | Process-local authenticated MCP admission limit from 1 through 10000; defaults to 64. An excess request receives `503` and `Retry-After: 1`. |
| `CLOCKIFY_MCP_DATABASE_URL_FILE` | Optional mode-`0600` PostgreSQL URL file. It is mutually exclusive with `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSFILE`, and `PGSSLMODE`. |
| `CLOCKIFY_MCP_DATABASE_CA_FILE` | Optional mode-`0600` PEM private-CA file, limited to 256 KiB. It is valid only with `sslmode=verify-full` or `PGSSLMODE=verify-full`. |
| `DATABASE_URL` | Rejected because it commonly exposes a database password through the process environment. Use `CLOCKIFY_MCP_DATABASE_URL_FILE`. |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` | Standard non-secret PostgreSQL connection settings. |
| `PGPASSFILE` | Optional mode-`0600` PostgreSQL password file. `PGPASSWORD` is rejected. |
| `PGSSLMODE` | Exactly `disable`, `require`, or `verify-full`. Use `verify-full` outside an isolated private network. |

A URL file may contain only the `sslmode` query parameter, using those same
three values. The service owns connection limits, query/statement/lock
timeouts, application name, UTF-8 client encoding, public-schema search path,
and non-replication mode. `PGOPTIONS`, `PGREPLICATION`, and every other
unlisted `PG*` setting are rejected; URL parameters cannot override policy.

The database pool uses at most ten connections per process, a five-second
connection timeout, and a 30-second idle timeout. An unexpected idle-client
error produces only a sanitized `service_dependency` log. The service does not
write the raw driver error. Capacity planning must reserve
`replica count × 10` connections plus space for administration, migration, and
backups.

The process stops admission, closes the listener, drains requests for at most
10 seconds, closes MCP resources and PostgreSQL, and enforces a 25-second total
shutdown deadline. The supplied Compose service gives it 30 seconds before a
forced stop. Keep the platform termination grace period above 25 seconds.

## OAuth issuer setup

Configure the existing authorization server before starting the MCP service:

1. Register the exact `CLOCKIFY_MCP_PUBLIC_URL`, including `/mcp`, as the OAuth
   resource and audience. Do not use a host-only or wildcard audience.
2. Define the exact `clockify:read`, `clockify:write`, and `clockify:admin`
   scopes. A token scope never raises the principal's database grant ceiling.
3. Issue access tokens with one trusted `iss`, a nonempty `sub`, OAuth client
   ID, future expiry, exact audience/resource, and recognized scope list.
4. Publish an HTTPS JWKS endpoint and configure only approved asymmetric JWT
   algorithms. A JWT-shaped token that fails local verification is rejected and
   never retried through introspection.
5. For opaque tokens, expose an HTTPS RFC 7662 endpoint that accepts
   `client_secret_basic`. Put its client secret in the configured mode-`0600`
   file; redirects, timeouts, oversized responses, inactive tokens, and claim
   mismatches fail closed.

The service publishes protected-resource metadata and an OAuth compatibility
response. It does not register clients or provide an authorization server.

### Key-ring format

The key ring is external to the image and database. Every value is canonical
base64 for exactly 32 random bytes. The active key is used for new writes; all
listed keys remain available for reads. Each key ID is immutable: never replace
its key material or reuse a retired ID.

```json
{
  "version": 1,
  "activeKeyId": "2026-08-a",
  "keys": {
    "2026-08-a": "BASE64_OF_32_RANDOM_BYTES"
  }
}
```

Create secret files with a restrictive umask and verify them before startup:

```sh
umask 077
openssl rand -base64 32
chmod 600 /run/secrets/clockify-mcp-keyring.json
chmod 600 /run/secrets/clockify-mcp-oauth-client-secret
chmod 600 /run/secrets/clockify-mcp.pgpass
```

Do not put access tokens, Clockify API keys, database passwords, or encryption
keys in argv, images, Compose environment values, logs, screenshots, or support
bundles.

## Database lifecycle

Run the checksum-verified migrations with the database-owner or migrator role
before provisioning users:

```sh
clockify115-mcp-admin db migrate
```

`CLOCKIFY_MCP_MIGRATION_MODE=apply` makes the HTTP binary apply migrations at
startup. This compatible default requires schema-write privileges. For
production, run the separate migration command and set the HTTP service to
`CLOCKIFY_MCP_MIGRATION_MODE=verify`. Verify mode checks the packaged migration
inventory, exact application-owned columns and defaults, primary/unique/foreign
key/check constraints, critical indexes, and checksums without data definition
language (DDL) privileges. An applied migration whose bytes no longer match its
stored SHA-256 checksum stops startup. Never edit an applied migration; add the
next numbered file.

Use a dedicated database. Separate the migration owner, runtime, and
administrator roles. The runtime needs only the following table privileges.
The column-level `UPDATE` grants permit the implementation's
`SELECT ... FOR UPDATE` row locks; the runtime does not issue an update against
those columns.

```sql
GRANT CONNECT ON DATABASE clockify_mcp TO mcp_runtime;
GRANT USAGE ON SCHEMA public TO mcp_runtime;
GRANT SELECT ON mcp_schema_migrations TO mcp_runtime;
GRANT SELECT ON mcp_principals, mcp_credentials TO mcp_runtime;
GRANT UPDATE (id) ON mcp_principals TO mcp_runtime;
GRANT SELECT, INSERT, DELETE ON mcp_confirmations TO mcp_runtime;
GRANT UPDATE (token_hash) ON mcp_confirmations TO mcp_runtime;
```

The offline administrator needs `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on
the three data tables. The migration role must own the schema objects because
migrations can create and alter them. Do not give the HTTP runtime the migration
or administrator role. The Compose file uses one role to remain a small local
example; override its database identity when you apply this production split.

`/healthz` reports process liveness. `/readyz` stays unavailable until the
migration apply or verification step completes, PostgreSQL responds, and the
configured key ring contains every referenced key ID and can open a
representative credential and confirmation for each key. A missing retired key
or wrong key material therefore stops readiness before traffic. After startup,
every readiness refresh runs one bounded database query that rejects any
credential or confirmation key ID absent from this process's loaded key ring.
It does not load or decrypt ciphertext rows. Readiness checks are single-flight
and cache their result for one second to bound anonymous database work.

`make mcp-remote-proof` owns a uniquely labeled PostgreSQL volume and local
OAuth plus Clockify fixtures. It drives the real admin process through
stdin-only credential set and stored-credential validation. Its TLS OAuth
fixture proves real-socket JWKS and opaque introspection behavior,
redirect/timeout/oversize rejection, cross-client and cross-principal
confirmation isolation, database-owned five-minute expiry, migration-history
shape and checksum enforcement, custom-format dump/restore, restored credential
decryption, and the remaining successful admin CLI paths. Its `finally`
cleanup fails unless both its container and volume are absent.

`make mcp-remote-live-proof` is the separate credentialed composition gate.
It retains the local OAuth issuer and ephemeral database but replaces the fake
Clockify boundary with the exact fingerprint-pinned sacrificial workspace. It
provisions the Clockify key only through admin-CLI stdin, proves JWT and opaque
stateless calls, report App envelopes or exact entitlement recovery, DEMO
retry/cleanup, database row teardown, and a direct zero-leftover fallback
sweep. Run it serially with `make perfect-live`; neither gate deploys a service
or rotates the Clockify key.

Each principal may retain at most 256 active confirmation previews totaling
4 MiB. Each request removes at most 256 expired confirmations before it applies
those limits. A process-local maintenance task removes at most 10,000
more expired rows once per minute. Both paths use row locks with
`SKIP LOCKED`, so replicas cannot turn cleanup into one unbounded transaction.

The schema contains exactly four concerns: migration history, principals,
encrypted Clockify credentials, and encrypted confirmation previews. Back up
PostgreSQL and the external key ring as one recovery set. A database backup
without its matching key ring cannot recover API keys. Keep the OAuth client
secret in the deployment secret store, not in the database backup.

### Backup and restore

1. Record the running image digest and active key ID.
2. Create a PostgreSQL custom-format backup with `pg_dump --format=custom`.
3. Back up the mode-`0600` key ring through the organization's secret-backup
   process.
4. Restore into an empty, access-controlled database with `pg_restore`.
5. Mount the matching key ring, verify migration checksums, and run
   `encryption status`.
6. Start one replica, require `/readyz` success, and validate one provisioned
   credential before returning traffic.

Confirmation rows expire after five minutes and may be discarded during
recovery. Credential rows and their key ring are the recovery-critical data.
The local remote proof verifies a custom-format `pg_dump`/`pg_restore` round
trip and exact credential decryption with the matching key ring. It does not
prove a platform backup schedule, retention policy, recovery point objective
(RPO), or recovery time objective (RTO). The owning platform must define and
test those values in its environment.

### Rollback

Roll back by immutable image digest, not a mutable tag. First stop new traffic
and back up the database. A previous image is safe only when it understands all
already-applied migrations. Migration history is forward-only and
checksum-bound; never delete history rows or reverse schema manually. If
compatibility is uncertain, keep the new image stopped, restore the pre-change
database backup into a separate database, and validate there before switching.

## Provisioning and revocation

The admin CLI is the only administration surface. `db migrate` requires only
the PostgreSQL configuration needed by the separate migration owner. Principal,
credential, and encryption commands additionally require
`CLOCKIFY_MCP_OAUTH_ISSUER` and `CLOCKIFY_MCP_KEYRING_FILE`. Receipts contain
identifiers and revisions, never secrets or account email.

```sh
clockify115-mcp-admin principal grant --subject SUBJECT --grant read
clockify115-mcp-admin principal grant --subject SUBJECT --grant write
clockify115-mcp-admin principal grant --subject SUBJECT --grant admin
clockify115-mcp-admin principal disable --subject SUBJECT
clockify115-mcp-admin principal delete --subject SUBJECT
```

Each principal has one active workspace credential. Relinking atomically
replaces it, increments its revision, and invalidates outstanding confirmations.
The API key is accepted only as one line on stdin. `credential set` authenticates
the current user and verifies access to the pinned workspace before committing.

```sh
secret-provider read clockify-key | \
  clockify115-mcp-admin credential set \
    --subject SUBJECT --workspace 000000000000000000000000 --region global

clockify115-mcp-admin credential validate --subject SUBJECT
clockify115-mcp-admin credential revoke --subject SUBJECT
```

Token scopes and database grants are both required. They do not imply one
another:

| Tool risk | Exact token scope | Database ceiling |
|---|---|---|
| `read` | `clockify:read` | `read`, `write`, or `admin` |
| `routine_write`, `business_write`, `external_side_effect` | `clockify:write` | `write` or `admin` |
| `privileged`, `destructive` | `clockify:admin` | `admin` |

Disabling or deleting a principal and revoking or replacing a credential clear
its outstanding confirmations. Bearer-token revocation remains the
authorization server's responsibility.

## Encryption rotation

Rotation is a two-stage all-replica rollout followed by bounded re-encryption:

1. Back up the database and current key ring.
2. Create the stage-one key ring: add the new 32-byte key, retain the old key,
   and keep the **old** ID as `activeKeyId`. Every replica is now capable of
   dual-read but continues old-key writes.
3. Distribute that exact stage-one secret revision and restart every replica.
   Require the deployment controller to report the rollout complete and every
   replica to pass `/readyz`. Readiness cannot attest an unused new key before a
   row references it, so the exact secret revision and completed rollout are
   mandatory evidence. Do not switch the active key or start rotation earlier.
4. Run `clockify115-mcp-admin encryption status` with the same stage-one key
   ring.
5. Create the stage-two key ring with the same two keys and set the **new** ID
   as `activeKeyId`. Distribute that exact secret revision, restart every
   replica, and require the rollout complete with every replica ready. During
   this rollout, replicas that still write with the old key can read new-key
   rows because stage one already gave every replica both keys.
6. Run `clockify115-mcp-admin encryption status` with the stage-two key ring,
   then run `clockify115-mcp-admin encryption rotate --batch-size 100`.
7. Run `encryption status` again. Require zero rows on the old key and confirm
   that it appears in `retireableKeyIds`.
8. Remove the old key from every key-ring file, restart all replicas, and
   require the rollout complete with every replica ready.

Run exactly one rotation command. A PostgreSQL advisory lock rejects a second
coordinator while rotation is active. The coordinator uses bounded
transactions and `FOR UPDATE SKIP LOCKED`, so it releases row locks between
batches. Never retire a key merely because one replica reports the new key
active.

## Health, logs, and incident response

Endpoints are deliberately small:

- `GET /healthz`: process is serving requests.
- `GET /readyz`: migration state, PostgreSQL, and ongoing stored-ciphertext key
  coverage are ready. The bounded database check is single-flight and cached
  for one second.
- `POST /mcp`: authenticated stateless MCP request.
- `GET /.well-known/oauth-protected-resource/mcp`: RFC 9728 metadata.
- `GET /.well-known/oauth-authorization-server`: compatibility metadata.

Every request needs an allowed `Host`, including a local health probe:

```sh
curl --fail --header 'Host: mcp.example.internal' \
  http://127.0.0.1:3000/healthz
```

All other paths return 404; unsupported methods return 405. MCP, health, and
ready responses are `Cache-Control: no-store`; metadata is bounded public cache
data. Modern responses do not issue `Mcp-Session-Id`, and GET/DELETE are not MCP
session controls.

Stderr contains one-line JSON request logs with request ID, method, route,
status, duration, coarse authentication outcome, and one allowlisted failure
code. Lifecycle phases are `starting`, `migrating` or
`verifying_migrations`, `validating_encryption`, `ready`, `draining`,
`stopped`, and `fatal`. A PostgreSQL idle-client error produces a sanitized
`service_dependency` event. Expired-confirmation cleanup produces a bounded
`service_maintenance` event only when it removes rows or fails. Logs exclude
bearer tokens, subjects, Clockify keys, request bodies, previews, raw database
errors, and error objects. Preserve `x-request-id` when it is safe ASCII; the
service generates a UUID otherwise.

Fatal lifecycle events use one stable allowlisted `failure` value:
`invalid_configuration`, `postgresql_initialization_failed`,
`secret_loading_failed`, `oauth_initialization_failed`,
`listener_initialization_failed`, `migration_apply_failed`,
`migration_verification_failed`, `encryption_validation_failed`,
`runtime_failure`, `shutdown_failed`, or `shutdown_timeout`. These codes are
safe alert dimensions; no raw exception text accompanies them.

Alert on sustained 5xx responses, readiness failure, repeated authentication
unavailability, repeated `overloaded` failures, migration checksum failure,
`idle_client_error`, failed confirmation cleanup, database pool exhaustion,
and Clockify rate-limit receipts. During an incident:

1. Remove the instance from traffic and retain structured logs.
2. Revoke affected OAuth tokens at the issuer.
3. Disable the affected principal or revoke its Clockify credential.
4. Rotate a potentially exposed Clockify API key in Clockify, then relink it by
   stdin.
5. Rotate the database encryption key if its material may have been exposed.
6. Validate zero plaintext secrets in database extracts and support artifacts.

## Local proof and deployment acceptance

Use Node 22.13 or newer. The remote integration proof owns and removes a
digest-pinned ephemeral PostgreSQL container and local OAuth fixture:

```sh
make mcp-remote-proof
make mcp-remote-live-proof  # credentialed sacrificial-workspace acceptance
make mcp-container-smoke
make mcp-container-service-proof
make mcp-gates
make mcpb-smoke
make pack-smoke
```

The container-service proof starts two independent non-root replicas of the
exact built image against one digest-pinned PostgreSQL database and synthetic
OAuth fixture. It alternates JWT and opaque stateless discovery across both
replicas, and proves that a confirmation issued on one replica is visible on
the other. Wrong business arguments from the same principal and OAuth client
burn that owner's token without dispatching a Clockify mutation; another
principal or client can neither read nor burn it. The surviving replica remains
ready for both token forms.

The same proof holds a credential read behind a PostgreSQL lock, sends SIGTERM
to the replica with the admitted request, and requires that request to finish
with HTTP 200 before the drain deadline while new admission stops. It also
retains migration apply/verify separation, readiness, deterministic
startup-failure precedence, ordered lifecycle events, and zero owned
containers or temporary files after cleanup.

`make perfect-fast` intentionally excludes containerized remote proof. A
deployment is accepted only after the chosen immutable image digest, restored
secret files, migration status, `/readyz`, OAuth issuer metadata, JWT and opaque
token paths, all three authorization ceilings, and credential revocation have
been exercised in that environment.
