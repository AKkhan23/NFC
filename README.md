# AirData — NFC Band Management System

Production-grade, web-only NFC band platform: admin web UI, operator/kiosk web UI, backend API, and an isolated local NFC bridge.

## What's inside

- **Admin UI** (`client/`): dashboard with live KPIs/charts/activity, users, bands + issue wizard, attendance, access rules, wallet + transactions, devices, locations, events, reports + CSV export, notifications, audit log, settings. Dark mode, `Ctrl+K` search, route-level code splitting.
- **Operator UI** (same app, `/scanner`): adapter-aware scanner (keyboard/bridge), kiosk mode with auto-reset, explicit offline/error states.
- **Backend** (`server/`): modular Express + TypeScript + MongoDB API — JWT auth with refresh sessions, RBAC, org isolation, audited band lifecycle, NFC scan pipeline (dedupe + idempotency + socket events), attendance engine, rule-based access (default-deny), idempotent wallet ledger with NFC payments, devices, events with capacity, reports, notifications, audit, settings.
- **NFC bridge** (`nfc-bridge/`): localhost agent for PC/SC / serial / vendor readers. Forwards raw UIDs only — zero business logic.
- **Tests**: 67 backend tests across 13 files (auth, RBAC, isolation, bands, scans, attendance, access, wallet incl. concurrency, devices/events, reports/notifications/audit/settings, full E2E journey).

## Quick start

```bash
cp .env.example .env
npm install
docker compose up -d        # local MongoDB (or set MONGODB_URI)
npm run dev:server          # http://localhost:4000
npm run dev:client          # http://localhost:5173
npm run seed -w server      # demo org (admin password ChangeMe123!)
```

Login with `admin@sunrise-academy.example` / `ChangeMe123!`, or scan a demo band (`NF-4821`) at `/scanner`.

## NFC hardware reality

Browser JS cannot universally access USB/PC-SC readers:

- **Keyboard-emulation readers**: work directly (default, no install).
- **PC/SC, serial, vendor SDK**: run `nfc-bridge/` on the terminal; it forwards raw UIDs over localhost WebSocket. See `docs/nfc.md`.

## Docs

`docs/architecture.md` · `database.md` · `api.md` · `nfc.md` · `security.md` · `deployment.md` — plus `PROGRESS.md` for the build log.
