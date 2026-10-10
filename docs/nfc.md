# NFC integration

## Reality first

Browser JavaScript cannot universally talk to USB / PC/SC / serial readers. The system therefore
supports exactly two web-reachable paths; everything else must sit behind the local bridge.

| Reader behavior | Adapter | How it reaches the web app | Hardware needed |
|---|---|---|---|
| Keyboard emulator (types UID + Enter) | `keyboard` (default) | `KeyboardNfcAdapter` captures keystrokes globally | Any HID-mode reader |
| PC/SC, serial, network, vendor SDK | `bridge` | `nfc-bridge` on the terminal → localhost WebSocket → `BridgeNfcAdapter` | Reader + vendor driver/SDK |

Server-side mirrors this: `getAdapter('keyboard' | 'bridge')` normalizes UIDs; any other
adapter name returns an adapter that fails loudly (HTTP 501) pointing at the bridge, instead of
pretending to work. The scan request carries `X-NFC-Adapter: keyboard|bridge` so the backend
knows which path was used.

## Selecting hardware

1. Identify the reader model and its protocol (HID/keyboard, PC/SC, serial, network, vendor SDK).
2. HID mode → use `keyboard`, no bridge, zero install.
3. Anything else → run `nfc-bridge` on each operator terminal (see below), set reader to `bridge`
   in the scanner settings (persisted per terminal in `localStorage`).

## nfc-bridge operations

```
NFC Reader → nfc-bridge → ws://localhost:8787 + http://localhost:8787 → React app → POST /api/nfc/scan
```

- `GET /status` → `{ ok, mode, clients, mock }` (polled by the scanner in bridge mode).
- `POST /inject { uid }` → broadcast to all connected operator UIs (mock + integration tests).
- WebSocket broadcast: `{ type: 'tag', uid, at }`.
- The bridge NEVER validates bands, users, or access — it forwards raw UIDs only.
- `BRIDGE_MOCK=1` simulates a tag every 15s for UI testing without hardware.
- Bind to localhost only; it must never be exposed to the LAN.

### Wiring a real PC/SC reader (insertion point: `nfc-bridge/src/index.ts`)

```ts
// TODO(hardware): e.g. with `node-pcsclite`:
//  - on reader attach → log + update /status
//  - on card insert → SELECT MF + GET DATA for UID → broadcast({ type: 'tag', uid })
//  - on card remove → broadcast({ type: 'removed' }) (UI ignores, keeps last result)
```

## Operator / kiosk deployment

- Open `/scanner` on the terminal; pick the adapter once (persisted per terminal).
- **Kiosk mode**: fullscreen, high-contrast, large controls, auto-reset with visible countdown
  (2s/4s/8s configurable), continuous scanning with no navigation chrome.
- Error states handled explicitly: reader offline (with retry + fallback to keyboard mode),
  bridge unreachable, backend unavailable, unknown/invalid tag, access denied with reason.
- Duplicate protection is server-side (configurable `dupScanWindowMs` per organization), so
  aggressive reader re-reads collapse into one scan row.

## Offline-first scanner PWA

- `/scanner` is installable (`/manifest.webmanifest` + `/sw.js` app-shell cache) — use
  **Install app** in the status strip on the gate tablet for a fullscreen kiosk icon.
- Network failures queue scans in **IndexedDB** (`airdata` → `scan-queue`), durable across
  reloads; the v1 localStorage queue migrates automatically on first load.
- Each queued scan keeps its original `requestId`; sync replays it so the server dedupes —
  retries never double-count attendance/access.
- Sync triggers: auto 4s after reconnect, **Sync now** button, and Background Sync
  (`scan-queue` tag) waking open tabs. Queue panel shows attempts, last error, last sync.
- **PAYMENT is never queued** (scanner + POS): charging against an unknown balance is
  unsafe. Offline payments show an explicit error — retry online or take cash.
- **Updates**: a new deploy installs a fresh worker in the background; the app shows an
  "Update now" banner (hourly update checks) so long-lived kiosk tabs don't run stale code.
