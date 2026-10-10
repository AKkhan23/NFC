/**
 * Local NFC Bridge — isolated from business logic.
 *
 * NFC Reader  ->  this bridge  ->  WebSocket/HTTP on localhost  ->  React app  ->  Backend API
 *
 * Supports:
 *  - keyboard: nothing to do (browser captures keystrokes directly, no bridge needed)
 *  - pcsc/serial/vendor: implement here with the vendor SDK (e.g. node-pcsclite, serialport)
 *    and broadcast `{ type: 'tag', uid }` to all WS clients.
 *  - mock: keyboard-less development without hardware (enabled with BRIDGE_MOCK=1)
 *
 * The bridge NEVER validates bands, users, or access — it only forwards raw UIDs.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const MOCK = process.env.BRIDGE_MOCK === '1';

const app = express();
app.use(cors());
app.use(express.json());

const clients = new Set<WebSocket>();

app.get('/status', (_req, res) => {
  res.json({ ok: true, mode: process.env.BRIDGE_READER ?? 'keyboard', clients: clients.size, mock: MOCK });
});

// Manual inject (mock + integration tests): POST /inject { uid }
app.post('/inject', (req, res) => {
  const uid = String(req.body?.uid ?? '').toUpperCase();
  if (!uid) {
    res.status(400).json({ ok: false, error: 'uid required' });
    return;
  }
  broadcast({ type: 'tag', uid, at: Date.now() });
  res.json({ ok: true, uid });
});

const http = createServer(app);
const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'hello', mock: MOCK }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(msg: unknown): void {
  const raw = JSON.stringify(msg);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(raw);
  }
}

// TODO(hardware): replace this stub with the selected reader SDK.
// Example (PC/SC): import pcsclite, on card insert read UID via SELECT/GET DATA, broadcast().
if (MOCK) {
  const demo = ['04:A3:F1:9C:2B:80', '04:77:1D:4E:5A:81', '04:C9:02:77:1F:80'];
  let i = 0;
  setInterval(() => {
    if (clients.size === 0) return;
    broadcast({ type: 'tag', uid: demo[i++ % demo.length], at: Date.now() });
  }, 15000);
}

http.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[nfc-bridge] listening on http://localhost:${PORT} (mock=${MOCK})`);
});
