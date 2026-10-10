# Security

## Implemented

- **Helmet** headers, **CORS** allowlist with credentials, **rate limits** (global 600/15min + strict 50/15min login).
- **Zod validation** on every write + query boundary; centralized error envelope, no stack traces in production.
- **JWT access (15m) + rotating refresh sessions** (revocable, hashed at rest, TTL index). httpOnly refresh cookie + Bearer access.
- **bcrypt** cost 12 in prod (4 in tests only), generic 401 messages (no user enumeration).
- **RBAC middleware** (`requireAuth`, `requirePerm`) on every route; frontend hiding is cosmetic only.
- **Organization isolation**: `orgFilter(auth)` pins all queries; explicit `organizationId` honored for SUPER_ADMIN only; cross-org reads return **404** (no existence leak).
- **Secure defaults**: access-deny unless a rule allows; lost bands must be replaced, never reactivated; audit log has no write API.
- **Financial safety**: integer minor units, PENDING-first ledger, optimistic-locked `$inc` with overdraft guard, idempotency keys, single-refund enforcement.
- **Request IDs** end-to-end, structured pino logs, append-only audit with actor/IP/user-agent.
- **Never trusted from clients**: `organizationId`, `userId`, `role`, `permissions`, `amount`, `locationId`, `deviceId` — all re-validated server-side against the token + DB.

## Residual risks / operator duties

- Change seeded passwords; rotate `JWT_SECRET`s; serve only over TLS (cookies assume it in prod).
- MongoDB auth + network isolation; backups for the append-only collections.
- `nfc-bridge` binds localhost only — never expose it to the LAN.
- CSV exports cap at 5,000 rows; paginate or narrow date ranges beyond that.
- Socket.IO auth uses the access token from handshake — short TTL (15m) bounds stolen-token use; clients re-handshake on refresh.
