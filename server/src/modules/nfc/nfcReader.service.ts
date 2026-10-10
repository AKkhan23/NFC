import { ApiError } from '../../utils/errors.js';

/**
 * Server-side NFC reader abstraction.
 *
 * ```
 * NFC Reader → Reader Adapter → NfcScanService → business logic
 * ```
 *
 * Only `keyboard` (keystroke-emulating readers, UID arrives in the scan request body)
 * and `bridge` (localhost nfc-bridge forwards raw UIDs) can actually be honored by a
 * web app. PC/SC, serial, network and vendor-SDK readers CANNOT be touched from browser
 * JS — they must sit behind the local bridge, which then presents as `bridge` here.
 * Requesting any other adapter fails loudly instead of pretending to work.
 */

export type AdapterType = 'keyboard' | 'pcsc' | 'serial' | 'network' | 'vendor' | 'bridge';

const UID_RE = /^(?:[0-9A-F]{2}:){3,}[0-9A-F]{2}$|^[0-9A-F]{8,24}$/;

export interface NfcReaderAdapter {
  readonly type: AdapterType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Normalize + validate a raw UID string into canonical uppercase form. */
  normalize(rawUid: string): string;
  getStatus(): 'connected' | 'disconnected' | 'error';
}

abstract class BaseAdapter implements NfcReaderAdapter {
  abstract readonly type: AdapterType;
  protected status: 'connected' | 'disconnected' | 'error' = 'disconnected';

  async connect(): Promise<void> {
    this.status = 'connected';
  }
  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }
  getStatus(): 'connected' | 'disconnected' | 'error' {
    return this.status;
  }

  normalize(rawUid: string): string {
    const uid = rawUid.trim().toUpperCase();
    if (!UID_RE.test(uid)) {
      throw new ApiError(400, 'INVALID', `Invalid NFC UID format: ${rawUid}`);
    }
    return uid;
  }
}

/** Keystroke-emulating readers: UID arrives as request data. Always supportable. */
export class KeyboardNfcAdapter extends BaseAdapter {
  readonly type = 'keyboard' as const;
}

/** Local bridge: raw UID forwarded by nfc-bridge over localhost. Always supportable. */
export class BridgeNfcAdapter extends BaseAdapter {
  readonly type = 'bridge' as const;
}

/** Hardware that needs a local agent — refuse loudly instead of faking support. */
export class UnsupportedAdapter extends BaseAdapter {
  constructor(readonly type: AdapterType) {
    super();
  }

  override normalize(_rawUid: string): string {
    throw new ApiError(
      501,
      'INTERNAL_ERROR',
      `${this.type} readers cannot be accessed from a browser. Run nfc-bridge on the terminal (see docs/nfc.md) and use adapter 'bridge'.`,
    );
  }
}

export function getAdapter(type: AdapterType): NfcReaderAdapter {
  if (type === 'keyboard') return new KeyboardNfcAdapter();
  if (type === 'bridge') return new BridgeNfcAdapter();
  return new UnsupportedAdapter(type);
}
