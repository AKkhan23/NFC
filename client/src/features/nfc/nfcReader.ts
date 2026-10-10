/**
 * Frontend NFC reader abstraction.
 * Mirrors server-side NfcReaderService so adapters are swappable.
 * - KeyboardNfcAdapter: readers that emulate keystrokes (default, works everywhere).
 * - BridgeNfcAdapter: localhost bridge (WebSocket) for PC/SC / serial / vendor SDK readers.
 * Browser JS cannot universally talk USB/PCSC — that path MUST go via the bridge.
 */

export interface NfcTag {
  uid: string;
  at: number;
}

export interface NfcReader {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): 'connected' | 'disconnected' | 'error';
  onTag(cb: (tag: NfcTag) => void): () => void;
}

/** Keyboard-emulation readers type the UID followed by Enter. Capture globally. */
export class KeyboardNfcAdapter implements NfcReader {
  readonly name = 'keyboard';
  private listeners = new Set<(t: NfcTag) => void>();
  private buffer = '';
  private lastKey = 0;
  private status: 'connected' | 'disconnected' = 'disconnected';
  private handler = (e: KeyboardEvent): void => {
    const now = Date.now();
    if (now - this.lastKey > 80) this.buffer = ''; // inter-key gap => new scan
    this.lastKey = now;
    if (e.key === 'Enter') {
      const uid = this.buffer.trim().toUpperCase();
      this.buffer = '';
      if (/^[0-9A-F:*-]{4,64}$/.test(uid)) {
        const tag = { uid, at: Date.now() };
        this.listeners.forEach((cb) => cb(tag));
      }
      return;
    }
    if (e.key.length === 1) this.buffer += e.key;
  };

  async connect(): Promise<void> {
    window.addEventListener('keydown', this.handler);
    this.status = 'connected';
  }
  async disconnect(): Promise<void> {
    window.removeEventListener('keydown', this.handler);
    this.status = 'disconnected';
  }
  getStatus(): 'connected' | 'disconnected' | 'error' {
    return this.status;
  }
  onTag(cb: (tag: NfcTag) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

/** Local bridge adapter: connects to nfc-bridge over WebSocket. */
export class BridgeNfcAdapter implements NfcReader {
  readonly name = 'bridge';
  private ws: WebSocket | null = null;
  private listeners = new Set<(t: NfcTag) => void>();
  private status: 'connected' | 'disconnected' | 'error' = 'disconnected';

  constructor(private url = 'ws://localhost:8787') {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);
        const timer = setTimeout(() => reject(new Error('bridge timeout')), 5000);
        ws.onopen = () => {
          clearTimeout(timer);
          this.ws = ws;
          this.status = 'connected';
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data as string) as { type?: string; uid?: string };
              if (msg.type === 'tag' && msg.uid) {
                const tag = { uid: String(msg.uid).toUpperCase(), at: Date.now() };
                this.listeners.forEach((cb) => cb(tag));
              }
            } catch { /* ignore malformed */ }
          };
          ws.onclose = () => { this.status = 'disconnected'; };
          ws.onerror = () => { this.status = 'error'; };
          resolve();
        };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('bridge unreachable')); };
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.status = 'disconnected';
  }

  getStatus(): 'connected' | 'disconnected' | 'error' {
    return this.status;
  }

  onTag(cb: (tag: NfcTag) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

export function createReader(mode: string): NfcReader {
  if (mode === 'bridge') return new BridgeNfcAdapter();
  if (mode === 'phone') return new WebNfcAdapter();
  return new KeyboardNfcAdapter();
}

/**
 * Phone-as-reader via Web NFC (Android Chrome/Edge only, HTTPS required).
 * Tap card to the phone -> serialNumber (UID) -> same onTag flow -> POST /api/nfc/scan.
 * iOS Safari and desktop browsers do not support Web NFC.
 */
export class WebNfcAdapter implements NfcReader {
  readonly name = 'phone';
  private listeners = new Set<(t: NfcTag) => void>();
  private status: 'connected' | 'disconnected' | 'error' = 'disconnected';
  private started = false;

  static supportError(): string | null {
    if (!window.isSecureContext) return 'Phone NFC needs HTTPS — open the https:// address, not http://.';
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.NDEFReader === 'undefined') return 'Web NFC not supported here — use Android Chrome/Edge. iPhone Safari cannot tap-scan.';
    return null;
  }

  async connect(): Promise<void> {
    const err = WebNfcAdapter.supportError();
    if (err) throw new Error(err);
    this.status = 'connected';
  }

  /** Must be called from a user gesture (button tap). Starts the NFC radio. */
  async beginScan(): Promise<void> {
    if (this.started) return;
    const err = WebNfcAdapter.supportError();
    if (err) throw new Error(err);
    const W = window as unknown as { NDEFReader: new () => { scan: (o?: object) => Promise<void>; onreading: ((e: unknown) => void) | null; onreadingerror: (() => void) | null } };
    const reader = new W.NDEFReader();
    reader.onreading = (ev: unknown) => {
      const serial = (ev as { serialNumber?: unknown }).serialNumber;
      const uid = String(serial ?? '').trim().toUpperCase();
      if (/^[0-9A-F:*-]{4,64}$/.test(uid)) {
        this.listeners.forEach((cb) => cb({ uid, at: Date.now() }));
      }
    };
    reader.onreadingerror = () => { /* card unreadable — keep listening */ };
    await reader.scan();
    this.started = true;
    this.status = 'connected';
  }

  async disconnect(): Promise<void> {
    this.started = false;
    this.status = 'disconnected';
  }
  getStatus(): 'connected' | 'disconnected' | 'error' {
    return this.status;
  }
  onTag(cb: (tag: NfcTag) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
