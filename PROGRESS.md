# Handoff — AirData (NFC Band Management System)

Last updated: 2026-09-03 (end of day). Next session: resume at "Remaining work" below.

## Status by phase

| Phase | State | Evidence |
|---|---|---|
| 1 Foundation (monorepo, toolchains, env) | ✅ complete | server+client+bridge typecheck, `vite build` OK |
| 2 Backend core (auth, RBAC, org isolation, users) | ✅ complete | 21/21 tests |
| 3 Database models + indexes | ✅ complete | 25/25 tests (incl. constraint tests) |
| 4 Bands + NFC scan pipeline | ✅ complete | 38/38 tests |
| 5 Admin UI (dashboard, users, bands, palette, theme) | ✅ complete | typecheck + `vite build` OK |
| 6–7 Adapters + operator/kiosk scanner | ✅ complete | typecheck OK |
| 8 Attendance + access rules | ✅ complete | 49/49 tests |
| 9 Finance (wallet, idempotent ledger, NFC PAYMENT) | ✅ complete + verified | full suite 67/67 (13 files), both typechecks clean |
| 10 Devices / locations / events | ✅ complete + verified | `devices-events.test.ts` 4/4, server typecheck clean |
| 11 Reports / notifications / audit / settings | ✅ complete + verified | `reports.test.ts` 5/5, server typecheck clean |
| 12 Hardening | ✅ complete | lazy routes + manualChunks (recharts/socket split, no size warnings), `e2e.test.ts` passes, skip-link/focus/reduced-motion/mobile drawer, `api.md`+`deployment.md`+`security.md`+`README.md` refreshed |

## Remaining work (in order)

1. `npm run typecheck -w server` + `npm run typecheck -w client` (both were clean at last check)
2. `npm test -w server` — full suite (expect ~13 files / ~67+ tests; last full run was 49/49 BEFORE phases 9–11)
3. `npm run build -w client` — confirm route code-splitting shrank the 983KB chunk
4. Docs: extend `docs/api.md` (Phase 11 endpoints: notifications, audit-logs, settings, reports), refresh `docs/deployment.md`, `docs/security.md`, `README.md`
5. Final review pass: `npx tsc` clean, tests green, seed (`npm run seed -w server`) sanity check against local Mongo
6. If `vite build` still warns on chunk size, add `manualChunks` for recharts/socket.io

## Environment notes

- No local MongoDB / mongosh; Docker daemon down. Tests use `mongodb-memory-server@6.0.x` (binary cached in `~/.cache/mongodb-binaries`). Do NOT upgrade to 8.x (781MB download).
- `BCRYPT_ROUNDS=4` + `LOG_LEVEL=warn` are set in `server/tests/setup.ts` (test-only; prod default 12 unchanged).
- `server/tests/helpers.ts`: `clearDb` uses `deleteMany` (NOT `dropDatabase` — drop wipes indexes and breaks unique-constraint tests); `startDb` runs `syncIndexes()`.
- Mongoose models must use the idempotent pattern: `(models.X as Model<T> | undefined) ?? model<T>('X', schema)` (prevents `OverwriteModelError` in multi-file runs without losing types).
- Money is integer minor units everywhere. Scan ledger / access events / wallet txns / audit are immutable (no update/delete APIs by design).
- Secure default-deny on ENTRY scans: `scan.test.ts` / `devices-events.test.ts` / `e2e.test.ts` seed an open ALLOW rule in setup — keep that pattern.
- Test idempotency keys must be ≥8 chars (`wallet.validators.ts` enforces `min(8)`).

## Quick commands

```bash
cp .env.example .env
npm install
npm run typecheck -w server && npm run typecheck -w client
npm test -w server
npm run build -w client
```
