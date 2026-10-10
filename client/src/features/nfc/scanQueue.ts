import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { newId } from '../../lib/utils';

export interface QueuedScan {
  localId: string;
  nfcUid: string;
  action: string;
  amountMinor?: number;
  requestId: string;
  adapter: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const LEGACY_KEY = 'airdata_scan_queue_v1';
const DB_NAME = 'airdata';
const STORE = 'scan-queue';
const SYNC_TAG = 'scan-queue';

function legacyLoad(): QueuedScan[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueuedScan[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function idbSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!idbSupported()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'localId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

async function idbAll(): Promise<QueuedScan[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result ?? []) as QueuedScan[];
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error('IDB read failed'));
    tx.oncomplete = () => db.close();
  });
}

async function idbPut(item: QueuedScan): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
  });
}

async function idbDelete(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(localId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error('IDB delete failed'));
  });
}

let memoryFallback: QueuedScan[] | null = null;

async function loadAll(): Promise<QueuedScan[]> {
  if (!idbSupported()) {
    if (memoryFallback) return memoryFallback;
    return legacyLoad();
  }
  try {
    const rows = await idbAll();
    if (rows.length === 0) {
      // One-time migration from v1 localStorage queue.
      const legacy = legacyLoad();
      if (legacy.length > 0) {
        for (const item of legacy) {
          await idbPut(item).catch(() => undefined);
        }
        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          /* keep legacy copy */
        }
        return legacy;
      }
    }
    return rows;
  } catch {
    if (memoryFallback) return memoryFallback;
    return legacyLoad();
  }
}

async function persistAll(items: QueuedScan[]): Promise<void> {
  // Keep a legacy mirror for very old WebViews; IDB is source of truth.
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(items));
  } catch {
    /* quota — IDB still holds the data */
  }
  memoryFallback = items;
}

function notifyChanged(): void {
  window.dispatchEvent(new Event('scan-queue-changed'));
  // Ask the service worker to run a Background Sync when the tab closes.
  try {
    const nav = navigator as Navigator & {
      serviceWorker?: { ready: Promise<unknown> };
    };
    nav.serviceWorker?.ready
      .then((reg) => {
        const sync = (reg as { sync?: { register: (tag: string) => Promise<void> } }).sync;
        return sync?.register(SYNC_TAG).catch(() => undefined);
      })
      .catch(() => undefined);
  } catch {
    /* no SW — in-tab timer still syncs */
  }
}

/** Durable enqueue (IndexedDB). Same requestId is replayed on sync so the server dedupes. */
export async function enqueueScan(
  entry: Omit<QueuedScan, 'localId' | 'createdAt' | 'attempts' | 'requestId'> & { requestId?: string },
): Promise<QueuedScan> {
  const item: QueuedScan = {
    ...entry,
    localId: `q_${newId()}`,
    requestId: entry.requestId ?? `req_${newId()}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  if (idbSupported()) {
    try {
      await idbPut(item);
    } catch {
      memoryFallback = [...(memoryFallback ?? legacyLoad()), item];
    }
  } else {
    memoryFallback = [...(memoryFallback ?? legacyLoad()), item];
  }
  await persistMirror();
  notifyChanged();
  return item;
}

async function persistMirror(): Promise<void> {
  try {
    const items = idbSupported() ? await idbAll().catch(() => memoryFallback ?? legacyLoad()) : (memoryFallback ?? legacyLoad());
    await persistAll(items);
  } catch {
    /* best effort */
  }
}

export function useScanQueue() {
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ synced: number; failed: number } | null>(null);

  const refresh = useCallback(() => {
    loadAll()
      .then(setQueue)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = (): void => refresh();
    const onOnline = (): void => {
      setOnline(true);
      refresh();
    };
    const onOffline = (): void => setOnline(false);
    const onSwMessage = (e: MessageEvent): void => {
      if ((e.data as { type?: string })?.type === 'SYNC_SCAN_QUEUE') refresh();
    };
    window.addEventListener('scan-queue-changed', onChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', onChange);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    return () => {
      window.removeEventListener('scan-queue-changed', onChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  const remove = useCallback((localId: string) => {
    (async () => {
      if (idbSupported()) {
        await idbDelete(localId).catch(() => undefined);
      } else if (memoryFallback) {
        memoryFallback = memoryFallback.filter((q) => q.localId !== localId);
      }
      await persistMirror();
      notifyChanged();
    })().catch(() => undefined);
  }, []);

  /** Flush FIFO. Same requestId is reused so server dedupes replays. */
  const syncNow = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    const items = await loadAll();
    if (items.length === 0) return { synced: 0, failed: 0 };
    setSyncing(true);
    let synced = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await api.post(
          '/nfc/scan',
          {
            nfcUid: item.nfcUid,
            action: item.action,
            ...(item.amountMinor ? { amountMinor: item.amountMinor } : {}),
            requestId: item.requestId,
            metadata: { offlineQueue: true, queuedAt: item.createdAt },
          },
          { headers: { 'X-NFC-Adapter': item.adapter } },
        );
        if (idbSupported()) {
          await idbDelete(item.localId).catch(() => undefined);
        } else if (memoryFallback) {
          memoryFallback = memoryFallback.filter((q) => q.localId !== item.localId);
        }
        synced++;
      } catch (e) {
        failed++;
        const message = (e as Error).message ?? 'Sync failed';
        const status = (e as { response?: { status?: number } }).response?.status;
        const next = { ...item, attempts: item.attempts + 1, lastError: message };
        if (!status || status >= 500) {
          // Network/server down — keep the item, stop the run, retry later.
          if (idbSupported()) await idbPut(next).catch(() => undefined);
          break;
        }
        // Client error (bad UID, validation): retry a few times, then drop the poison item.
        if (next.attempts >= 5) {
          if (idbSupported()) await idbDelete(item.localId).catch(() => undefined);
        } else if (idbSupported()) {
          await idbPut(next).catch(() => undefined);
        }
      }
    }
    await persistMirror();
    setSyncing(false);
    setLastSync(new Date().toISOString());
    setLastResult({ synced, failed });
    notifyChanged();
    refresh();
    return { synced, failed };
  }, [refresh]);

  // Auto-sync shortly after reconnect / new items arrive (SW Background Sync covers closed tabs).
  const queueLen = queue.length;
  useEffect(() => {
    if (queueLen === 0 || !online) return;
    const t = window.setTimeout(() => {
      setSyncing((s) => {
        if (!s) {
          syncNow().catch(() => undefined);
        }
        return s;
      });
    }, 4000);
    return () => window.clearTimeout(t);
  }, [queueLen, online, syncNow]);

  return { queue, syncing, online, lastSync, lastResult, refresh, remove, syncNow };
}

export function isNetworkError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } }).response?.status;
  if (!status) return true;
  return status === 0 || (typeof status === 'number' && status >= 500);
}

/** PAYMENT scans must never silently queue — balances can't be verified offline. */
export function offlinePolicy(action: string): { queueable: boolean; reason?: string } {
  if (action === 'PAYMENT') {
    return { queueable: false, reason: 'Payments need a live connection — the balance cannot be verified offline. Retry online or take cash.' };
  }
  return { queueable: true };
}
