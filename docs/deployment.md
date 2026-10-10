# Deployment

## Prerequisites

- Node.js 20+, MongoDB 6.0+ (local via `docker compose up -d`, or Atlas).
- Copy env: `cp .env.example .env` and set real secrets.

## Environment (production)

- `NODE_ENV=production`, `PORT`, `MONGODB_URI` (replica set recommended — enables multi-doc transactions if later needed).
- `JWT_SECRET` / `JWT_REFRESH_SECRET`: ≥32 random chars. The server **refuses to boot** in production with dev secrets.
- `CORS_ORIGINS`: comma-separated admin + operator origins (no wildcards with credentials).
- `CLIENT_URL`, `SOCKET_URL`, `NFC_BRIDGE_URL`, `NFC_READER_MODE`, `BCRYPT_ROUNDS=12` (default).

## Build & run

```bash
npm install
npm run build            # server tsc + client vite build
node server/dist/index.js
```

Serve `client/dist` from a CDN or reverse proxy (nginx/Caddy) with `VITE_API_URL=/api` proxied to the API.
Socket.IO needs sticky sessions only when scaling past one instance; single-instance needs nothing special.

## Operator terminals

- Open the deployed `/scanner` URL in a kiosk browser profile.
- Keyboard-mode readers: nothing to install.
- PC/SC / serial / vendor readers: run `nfc-bridge` on the terminal (`npm run dev:bridge` / `node nfc-bridge/dist/index.js`), bound to **localhost only**, and select `bridge` in the scanner settings (persisted per terminal).
- `BRIDGE_MOCK=1` simulates tags for UI testing without hardware.

## Seed demo data

```bash
npm run seed -w server   # Sunrise Academy org, staff (password ChangeMe123!), students, campus, gate, kiosk, 4 bands
```

Change or remove seeded passwords immediately in any shared environment.

## Health & ops

- `GET /api/health` — liveness (no auth, no DB).
- Logs: pino JSON in production (`LOG_LEVEL=info`). Every error response carries `requestId` for correlation.
- Back up MongoDB on a schedule; the financial ledger (`wallettransactions`) and `auditlogs` are append-only by design.
