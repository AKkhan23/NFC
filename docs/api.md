# API

Base `/api`. Envelope: `{ success, data, requestId }` / `{ success:false, message, code, requestId }`.
Auth: `POST /auth/login|refresh|logout`, `GET /auth/me`. All other routes require `Authorization: Bearer <access>`.
Org isolation enforced in services via `orgFilter(req.auth)`.

## Auth

- `POST /api/auth/login` `{ email, password }` → `{ accessToken, refreshToken, user }` + httpOnly refresh cookie. 401 on bad credentials, 403 if disabled.
- `POST /api/auth/refresh` `{ refreshToken }` → `{ accessToken }`. 401 if revoked/expired.
- `POST /api/auth/logout` `{ refreshToken }?` → revokes session, clears cookie.
- `GET /api/auth/me` → `{ auth: { userId, organizationId, role, permissions } }`.

## Users (`users.read|create|update`)

- `GET /api/users?page=&pageSize=&search=&role=&status=` — org-scoped, paginated. SUPER_ADMIN may pass `organizationId`.
- `POST /api/users` `{ email, password, firstName, lastName, role, permissions[] }` — org pinned to token (explicit `organizationId` honored for SUPER_ADMIN only). 409 on duplicate email in org.
- `GET /api/users/:id` — org-scoped; cross-org reads return 404 (no existence leak).
- `PATCH /api/users/:id` `{ firstName?, lastName?, role?, permissions?, status? }` — cannot self-disable; only SUPER_ADMIN may grant SUPER_ADMIN.

`passwordHash` is never serialized. User create/update/disable writes append-only audit records.

## Bands

- `GET /api/bands?search=&status=&type=&userId=` — org-scoped, paginated (`bands.read`).
- `POST /api/bands` `{ nfcUid, type, bandId?, expiresAt?, assignedLocationId? }` — register as AVAILABLE (`bands.create`). 409 on duplicate UID.
- `GET /api/bands/:id` — detail with populated user/location (`bands.read`).
- `POST /api/bands/:id/assign` `{ userId, locationId? }` — AVAILABLE → ASSIGNED (`bands.assign`).
- `POST /api/bands/:id/activate` — ASSIGNED → ACTIVE (`bands.assign`).
- `POST /api/bands/:id/block` `{ reason }` / `POST /api/bands/:id/unblock` (`bands.block`).
- `POST /api/bands/:id/mark-lost` / `/mark-damaged` (`bands.update`).
- `POST /api/bands/:id/replace` `{ nfcUid, bandId?, reason }` — retires old to DECOMMISSIONED, issues linked ACTIVE band (`bands.replace`).
- `POST /api/bands/:id/deactivate` — any live state → DECOMMISSIONED (`bands.update`).

Illegal transitions return 409 `INVALID_STATE`. Every mutation writes an audit record.

## NFC scanning

- `POST /api/nfc/scan` `{ nfcUid, action, deviceId?, locationId?, gateId?, requestId? }` (`nfc.scan`).
  Send `X-NFC-Adapter: bridge` when the UID arrived via nfc-bridge; anything else needs the bridge (501-style refusal).
  - New scan → 201; duplicate inside the window → 200 `{ duplicate: true }`; same `requestId` → 200 `{ replay: true }`.
  - Results: SUCCESS / DENIED / BLOCKED / LOST / EXPIRED / UNKNOWN / INVALID / ERROR.
  - Side effects: CHECK_IN/OUT → attendance rows; ENTRY/EXIT/EVENT_CHECK_IN → access events; every scan → audit + `nfc.scan` socket event on `org:{id}`.
- `GET /api/nfc/scans?nfcUid=&action=&result=&deviceId=&from=&to=` — immutable scan ledger (`nfc.scan`).

## Attendance

- `GET /api/attendance?date=&from=&to=&userId=&locationId=&status=` (`attendance.read`).
- `POST /api/attendance/check-in` / `/check-out` `{ userId, bandId?, locationId?, at? }` (`attendance.manage`).
  Late after org `attendanceLateAfter` (location tz); early checkout (>60 min before `attendanceDayEnd`) → EARLY_EXIT/HALF_DAY.
- `POST /api/attendance/manual` `{ userId, date, checkInAt?, checkOutAt?, status?, remarks? }` (`attendance.manage`).
- `PATCH /api/attendance/:id/correct` — audited correction with before/after (`attendance.manage`).

## Access control

- `GET /api/access/rules?gateId=&locationId=&status=` (`access.read`).
- `POST /api/access/rules` `{ name, gateId?, locationId?, userIds[], userGroups[], days[], startTime, endTime, eventId?, bandStatuses[], effect, priority }` (`access.manage`).
- `PATCH /api/access/rules/:id` (`access.manage`).
- `GET /api/access/events?gateId=&locationId=&decision=&from=&to=` (`access.read`).
- Evaluation: DENY-first by priority, then ALLOW; time/day in the location timezone; **no match → DENY**. EXIT is always allowed (recorded).

## Wallets & transactions

Money in integer minor units (paise). PENDING-first ledger + optimistic-locked `$inc` — safe without replica-set transactions.

- `GET /api/wallets/:userId` (`wallet.read`) — auto-opens a zero-balance wallet.
- `POST /api/wallets/:userId/credit` `{ amountMinor, idempotencyKey?, reason?, method? }` (`wallet.manage`).
- `POST /api/wallets/:userId/debit` (`wallet.manage`) — 409 `INSUFFICIENT_BALANCE` on overdraft.
- `POST /api/wallets/:userId/adjust` `{ deltaMinor, idempotencyKey, reason }` (`wallet.manage`).
- `POST /api/wallets/:userId/freeze|unfreeze` (`wallet.manage`).
- `POST /api/wallets/refund` `{ transactionId, idempotencyKey?, reason }` (`transactions.manage`) — new REFUND row; double refunds rejected.
- `GET /api/transactions?userId=&type=&status=&from=&to=` (`transactions.read`).
- NFC `POST /api/nfc/scan` with `action: PAYMENT` + `amountMinor` debits synchronously; broke/frozen wallets → DENIED scan.

## Devices, locations, events
- `GET /api/devices?status=&locationId=` (`devices.read`) — `health` is derived from heartbeats (stale > 5 min → OFFLINE).
- `POST /api/devices`, `PATCH /api/devices/:id` (`devices.manage`); `GET /api/devices/:id/stats` (24h scans/failed).
- `POST /api/devices/:id/heartbeat` (`devices.manage` or `nfc.scan` so kiosks can ping).
- `GET /api/locations`, `POST /api/locations`, `PATCH /api/locations/:id`, `GET /api/locations/tree` (`locations.read|manage`).
- `POST /api/locations/zones`, `POST /api/locations/gates`, `PATCH /api/locations/gates/:id` (`locations.manage`).
- `GET /api/events?status=&upcoming=`, `POST /api/events`, `PATCH /api/events/:id`, `POST /api/events/:id/check-in { userId }` (`access.read|manage`). Capacity enforced atomically; NFC `EVENT_CHECK_IN` with `metadata.eventId` fills the same counter.

## Notifications, audit, settings, reports

- `GET /api/notifications?unreadOnly=&type=&priority=` — own + org-wide; returns `unread` count. Any authenticated user.
- `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.
- Server-side fan-out: band blocked/lost (org HIGH + holder HIGH on refused scans), wallet low-balance (user MEDIUM, max one unread/day). All emit `notification` socket events.
- `GET /api/audit-logs?action=&entityType=&entityId=&actorId=&from=&to=` (`audit.read`). Append-only — no write routes exist.
- `GET /api/settings` (any auth), `PUT /api/settings` (`settings.manage`) — timezone, late/early times, dupe window; audited.
- `GET /api/reports/summary?from=&to=` — bands/scans/attendance/devices splits, active users, transaction volumes (`reports.read`).
- `GET /api/reports/export?domain=bands|scans|attendance|access-events|transactions|audit&from=&to=` — CSV download, 5,000-row cap.

## Online wallet top-up

- `POST /api/wallets/:userId/topup/intent` `{ amountMinor, provider: UPI|MANUAL|RAZORPAY|STRIPE|MOCK, method?, idempotencyKey? }` — any holder for self, else `wallet.manage`. Same key replays the same PENDING order. Returns `{ order, upiIntent, qrPayload, gateway? }`.
- `GET /api/wallets/topup/config` (any auth) — which providers are wired; exposes only public keys (Razorpay keyId, Stripe publishable key), never secrets.
- Live gateways (no SDKs — plain HTTPS + HMAC):
  - `RAZORPAY`: server creates a Razorpay order, client pays via checkout.js modal, the callback posts to `POST /api/wallets/topup/webhook/razorpay/callback` (fields HMAC with key secret). Server event `POST /api/wallets/topup/webhook/razorpay` verifies `x-razorpay-signature` over raw bytes (`payment.captured` settles, `payment.failed` fails).
  - `STRIPE`: server creates a PaymentIntent (returns `clientSecret`), client confirms with Stripe.js card Element, `POST /api/wallets/topup/webhook/stripe` verifies `stripe-signature` over raw bytes with timestamp tolerance (`payment_intent.succeeded` settles).
  - Paid amounts are enforced equal to the order; without configured keys orders stay local (staff confirm / generic webhook).
- `GET /api/wallets/topup/orders?userId=&status=` — self or staff; non-privileged callers are pinned to their own orders.
- `GET /api/wallets/topup/:orderId` — poll for kiosk QR screens (PENDING → SUCCESS/CANCELLED/FAILED).
- `POST /api/wallets/topup/:orderId/confirm` `{ providerReference? }` (`wallet.manage`) — cash-counter reconcile. Credits via ledger key `topup_<orderId>` so double-clicks credit once.
- `POST /api/wallets/topup/:orderId/cancel` — self or staff, PENDING only.
- `POST /api/wallets/topup/webhook` `{ orderId?|providerOrderId?|reference?, status: SUCCESS|FAILED|CANCELLED, providerReference? }` — public, verified by `X-Webhook-Secret` when `TOPUP_WEBHOOK_SECRET` is set. Safe to retry; duplicate SUCCESS is a replay.
- Socket `wallet.topup` on `org:{id}` for PENDING/SUCCESS/CANCELLED/FAILED.

## Canteen POS + settlement

- POS charges via existing `POST /api/nfc/scan` `{ action: PAYMENT, amountMinor, requestId }` — idempotent, debits synchronously. Never queue payments offline.
- `GET /api/reports/settlement?date=YYYY-MM-DD` (`reports.read` or `nfc.scan`, so counter staff pass) — day bounds computed in the org timezone, plus sales/refund/top-up counts + volumes, net, avg ticket, denied payments, org-local hourly buckets, last 10 sales (`recent`), and the exact `bounds` used (feed them to CSV export).
- `POST /api/pos/void` `{ transactionId, reason? }` (`nfc.scan`) — one-tap void for counter mistakes. Only today's successful `NFC payment` debits in the caller's org; everything else (top-ups, manual debits, older days) must use the finance refund flow. Idempotent per transaction.
- Canteen catalog lives in org settings (`PUT /api/settings` `{ posMenu: [{ name, priceMinor }] }`, max 50 items).

## Visitors & day QR

- `POST /api/visitors` `{ kind: VISITOR|DAY_QR, name, phone?, purpose?, userId?, validTo?, maxUses? }` (`attendance.manage`) — valid today by default. Returns secret `token` + `checkinUrl: /v/:token`.
- `GET /api/visitors`, `GET /api/visitors/:id`, `POST /api/visitors/:id/revoke` (`attendance.read|manage`).
- `POST /api/visitors/check-in` `{ token }` (`nfc.scan`) — single/multi-use gate entry, records an ENTRY scan + `visitor.checkin` socket event.
- `GET /api/v/:token` — public gate verification, no login.

## Expiry sweeps

- Job runs on boot + every 5 min (`SWEEP_ENABLED=false` disables; skipped in tests): cancels `PENDING` top-up orders past `expiresAt`, expires visitor passes past `validTo`.
- `POST /api/system/sweeps` (`settings.manage`) — manual run, returns `{ topupsCancelled, passesExpired }`.

## Billing (enterprise subscriptions)

- Plans: free `TRIAL` (14d) + paid `BASIC` → `ADVANCED` → `PRO`, with user/band/location/event caps and per-feature flags (`onlinePayments`, `pos`, `visitors`, `events`, `tapProfiles`, `reportsExport`, `apiAccess`).
- `GET /api/billing/plans` (any auth), `GET /api/billing/status` (any auth) — plan, usage vs limits, effective features (plan + overrides), trial/period/grace dates.
- `POST /api/billing/subscribe` `{ plan, provider: MANUAL|RAZORPAY|STRIPE, billingEmail? }` (`settings.manage`) — MANUAL activates immediately (audited offline invoice); RAZORPAY returns `{ subscriptionId, checkoutUrl }` (needs `RAZORPAY_PLAN_<TIER>`); STRIPE returns a first-invoice `clientSecret` (needs `STRIPE_PRICE_<TIER>`).
- `POST /api/billing/cancel` (`settings.manage`) — remote cancel best-effort, local state flips regardless; access holds till `periodEnd`.
- `POST /api/billing/webhook/razorpay|stripe` — HMAC-verified subscription lifecycle (`activated/charged` → ACTIVE, failures → PAST_DUE + 7d grace, cancel/delete → CANCELED).
- `GET/POST/DELETE /api/billing/keys` (`settings.manage`, requires `apiAccess`) — Stripe-style org API keys with least-privilege scopes, shown once. Integrators send `X-Api-Key`; a user session always wins when both present.
- Enforcement (402 `FORBIDDEN`): expired/graced-out orgs cannot create users, register bands, or open top-up intents; premium creation (visitors, events, profiles, exports, settlement/void) needs its feature flag. **Operational scans, check-ins and charges never block.**
- Super-admin: `GET /api/billing/orgs?search=` (usage included), `PATCH /api/billing/orgs/:id` — assign plan/status, extend trial/period, per-feature allow/deny/clear overrides, suspend/restore the org. Every change audited + socket-emitted.
