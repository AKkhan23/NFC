# Database

MongoDB via Mongoose. Every organization-owned document carries `organizationId`; services scope
all queries with `orgFilter(auth)` and cross-org reads return 404 (no existence leak).

## Conventions

- `timestamps: true` everywhere (immutable ledgers use `createdAt` only).
- Idempotent model registration (`models.X ?? model(...)` with explicit `Model<T>`) — safe under test re-imports and hot-reload.
- Money in integer minor units (`balanceMinor`, `amountMinor`) — never floats.
- Immutable collections (create-only, no update/delete API): `NFCScan`, `AccessEvent`, `WalletTransaction`, `AuditLog`.

## Collections & key indexes

| Collection | Uniqueness | Hot indexes |
|---|---|---|
| `organizations` | `slug` | `name` |
| `users` | `{organizationId, email}` | `{organizationId, role}`, `{organizationId, status}` |
| `roles` | `{organizationId, name}` | — |
| `nfcbands` | `nfcUid` (global — burned in silicon); `{organizationId, bandId}` | `{org, status}`, `{org, userId}`, `{org, type, status}` |
| `nfcscans` | — (ledger) | `{org, timestamp↓}`, `{org, nfcUid, timestamp↓}`, `{org, deviceId, timestamp↓}`, `{org, nfcUid, deviceId, action, timestamp↓}` (dedupe) |
| `locations` | `{org, code}` | — |
| `zones` | `{org, locationId, code}` | — |
| `gates` | `{org, locationId, code}` | — |
| `nfcdevices` | `{org, deviceId}` | `{org, status}`, `{org, locationId}` |
| `attendances` | `{org, userId, date}` (date = YYYY-MM-DD, location tz) | `{org, date, status}`, `{org, locationId, date}` |
| `accessrules` | — | `{org, gateId, status}`, `{org, locationId, status}` |
| `accessevents` | — (ledger) | `{org, timestamp↓}`, `{org, gateId, timestamp↓}` |
| `wallets` | `{org, userId}` | — (`version` + `optimisticConcurrency` for double-spend guard) |
| `wallettransactions` | `{org, idempotencyKey}` | `{org, walletId, createdAt↓}` |
| `payments` | — | `{org, createdAt↓}` |
| `orgevents` | — | `{org, startAt↓}` |
| `notifications` | — | `{org, userId, createdAt↓}`, `{org, readAt}` |
| `auditlogs` | — (append-only) | `{org, createdAt↓}`, `{org, entityType, entityId}` |
| `sessions` | `refreshHash` | TTL on `expiresAt` |

## Field reference (abridged)

- **NFCBand**: `bandId` (NF-4821), `nfcUid`, `type` (STUDENT/STAFF/VISITOR/VENDOR/VIP/TEMPORARY),
  `status` (AVAILABLE/ASSIGNED/ACTIVE/BLOCKED/LOST/DAMAGED/EXPIRED/DECOMMISSIONED),
  `userId`, `issuedAt/activatedAt/expiresAt/blockedAt(+Reason)/lostAt/damagedAt`,
  `replacementFor/replacementReason`, `assignedLocationId`, `metadata`, `createdBy/updatedBy`.
- **NFCScan**: `nfcUid/bandId/userId/deviceId/locationId/gateId`, `action`
  (CHECK_IN/CHECK_OUT/ENTRY/EXIT/PAYMENT/IDENTIFY/EVENT_CHECK_IN), `result`
  (SUCCESS/DENIED/BLOCKED/LOST/EXPIRED/UNKNOWN/INVALID/ERROR), `failureReason`,
  `operatorId`, `timestamp`, `requestId` (client idempotency key), `metadata`.
- **AccessRule**: `locationId/gateId`, `userIds/userGroups`, `days`, `startTime/endTime`,
  `eventId`, `bandStatuses`, `effect` ALLOW/DENY, `priority` (DENY evaluated first).
- **Wallet/WalletTransaction/Payment**: minor-unit amounts, `version` locking, idempotency keys,
  reversals as new REFUND rows.
- **Notification**: `userId` null = org broadcast; types BAND_BLOCKED/BAND_LOST/ACCESS_DENIED/
  DEVICE_OFFLINE/PAYMENT_FAILED/LOW_BALANCE/SUSPICIOUS_ACTIVITY/SYSTEM_ALERT.
