import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CloudOff, Maximize, Minimize, RotateCcw, Settings2 } from 'lucide-react';
import { api } from '../../lib/api';
import { cn, newId } from '../../lib/utils';
import type { NfcTag } from './nfcReader';
import { useReader, type ReaderMode } from './useReader';
import { enqueueScan, isNetworkError, offlinePolicy, useScanQueue } from './scanQueue';
import { usePwaInstall } from './usePwaInstall';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'reading'; uid: string }
  | { kind: 'success'; uid: string; message: string; user?: string; at: Date }
  | { kind: 'denied'; uid: string; message: string; result: string; at: Date }
  | { kind: 'error'; message: string };

const ACTIONS = ['ENTRY', 'EXIT', 'CHECK_IN', 'CHECK_OUT', 'IDENTIFY', 'PAYMENT'];
const RESET_OPTIONS = [2000, 4000, 8000];

export function ScannerPage(): JSX.Element {
  const [action, setAction] = useState('ENTRY');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [kiosk, setKiosk] = useState(false);
  const [resetMs, setResetMs] = useState(4000);
  const [amount, setAmount] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const timer = useRef<number | null>(null);
  const countdown = useRef<number | null>(null);
  const [countdownPct, setCountdownPct] = useState(100);
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const { queue, syncing, online, lastSync, lastResult, syncNow, remove } = useScanQueue();
  const { canInstall, install } = usePwaInstall();

  const scan = useMutation({
    mutationFn: async ({ tag, mode, requestId }: { tag: NfcTag; mode: ReaderMode; requestId: string }) => {
      const body: Record<string, unknown> = { nfcUid: tag.uid, action, requestId };
      if (action === 'PAYMENT') {
        const paise = Math.round(Number(amount) * 100);
        if (!Number.isFinite(paise) || paise <= 0) throw new Error('Enter a valid amount for payment.');
        body.amountMinor = paise;
      }
      return (await api.post('/nfc/scan', body, { headers: { 'X-NFC-Adapter': mode } })).data.data as {
        result: string; message?: string; scan?: { nfcUid?: string };
      };
    },
    onSuccess: (res, { tag }) => {
      const at = new Date();
      if (res.result === 'SUCCESS') {
        setState({ kind: 'success', uid: tag.uid, message: res.message ?? 'Access granted', at });
      } else {
        setState({ kind: 'denied', uid: tag.uid, message: res.message ?? `Result: ${res.result}`, result: res.result, at });
      }
      scheduleReset();
    },
    onError: (e: unknown, vars) => {
      // Offline-first: queue network failures, replay later with the same requestId.
      // PAYMENT is never queued — charging against an unknown balance is unsafe.
      if (isNetworkError(e)) {
        const policy = offlinePolicy(action);
        if (!policy.queueable) {
          setState({ kind: 'error', message: policy.reason ?? 'Payment needs a connection.' });
          scheduleReset();
          return;
        }
        void enqueueScan({
          nfcUid: vars.tag.uid,
          action,
          requestId: vars.requestId,
          adapter: vars.mode,
        }).catch(() => undefined);
        setQueuedNote(`${vars.tag.uid} queued offline — will sync automatically.`);
        setState({ kind: 'idle' });
        return;
      }
      const status = (e as { response?: { status?: number; data?: { message?: string } } }).response;
      const message =
        status?.data?.message ??
        (status?.status === 0 || !status ? 'Backend unavailable — scan queued offline.' : 'Scan failed.');
      setState({ kind: 'error', message });
      scheduleReset();
    },
  });

  function scheduleReset(): void {
    if (timer.current) window.clearTimeout(timer.current);
    if (countdown.current) window.clearInterval(countdown.current);
    const started = Date.now();
    setCountdownPct(100);
    countdown.current = window.setInterval(() => {
      const left = Math.max(0, 1 - (Date.now() - started) / resetMs);
      setCountdownPct(left * 100);
      if (left <= 0 && countdown.current) window.clearInterval(countdown.current);
    }, 100);
    timer.current = window.setTimeout(() => setState({ kind: 'idle' }), resetMs);
  }

  function resetNow(): void {
    if (timer.current) window.clearTimeout(timer.current);
    if (countdown.current) window.clearInterval(countdown.current);
    setState({ kind: 'idle' });
  }

  const busy = state.kind === 'reading';
  const { mode, setMode, status, bridge, retry, beginPhoneScan, phoneActive, phoneError } = useReader({
    paused: busy || scan.isPending,
    onTag: (tag) => {
      setQueuedNote(null);
      setState({ kind: 'reading', uid: tag.uid });
      scan.mutate({ tag, mode: getMode(), requestId: `req_${newId()}` });
    },
  });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  function getMode(): ReaderMode {
    return modeRef.current;
  }

  // Kiosk fullscreen handling.
  useEffect(() => {
    if (!kiosk) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      return;
    }
    document.documentElement.requestFullscreen().catch(() => undefined);
  }, [kiosk]);

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (countdown.current) window.clearInterval(countdown.current);
  }, []);

  const readerOk = status === 'connected' && (
    mode === 'keyboard' || (mode === 'phone' && phoneActive) || (mode === 'bridge' && bridge.ok)
  );

  return (
    <div className={cn('mx-auto max-w-3xl space-y-6', kiosk && 'max-w-5xl bg-black text-white min-h-screen')}>
      {/* Status strip */}
      <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-xs', kiosk ? 'text-gray-300' : 'text-white/50')}>
        <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-medium" role="status" aria-label={`Reader ${status}`}>
          <span className={cn('h-1.5 w-1.5 rounded-full', status === 'connected' ? 'animate-pulse-dot bg-emerald-400' : 'bg-red-400')} aria-hidden />
          Reader: {status} · {mode}
        </span>
        {mode === 'bridge' && (
          <span title={bridge.error ?? `Bridge mode: ${bridge.mode}, ${bridge.clients ?? 0} clients`}>
            · Bridge: {bridge.ok ? `ok${bridge.mock ? ' (mock)' : ''}` : 'unreachable'}
          </span>
        )}
        <span aria-hidden>·</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" aria-hidden /> Live</span>
        {!online && (
          <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-medium text-amber-300">
            <CloudOff size={12} aria-hidden /> Offline
          </span>
        )}
        {queue.length > 0 && (
          <button
            onClick={() => syncNow().catch(() => undefined)}
            className="flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-1 font-medium hover:bg-white/[0.1]"
            title={queue.map((q) => `${q.nfcUid} ${q.action}`).join('\n')}
          >
            {syncing ? 'Syncing…' : `Queued: ${queue.length}`} · Sync now
          </button>
        )}
        {canInstall && (
          <button
            onClick={() => install().catch(() => undefined)}
            className="rounded-full border border-[#D4A853]/40 bg-[#D4A853]/10 px-2.5 py-1 font-medium text-[#E5BE6B] hover:bg-[#D4A853]/20"
            title="Install the scanner on this device for offline kiosk use"
          >
            Install app
          </button>
        )}
        <span className="ml-auto flex gap-1">
          {!kiosk && (
            <button onClick={() => setShowSettings((v) => !v)} className="rounded-md p-2 hover:bg-muted" aria-label="Scanner settings">
              <Settings2 size={16} />
            </button>
          )}
          <button
            onClick={() => setKiosk((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
            aria-label={kiosk ? 'Exit kiosk mode' : 'Enter kiosk mode'}
          >
            {kiosk ? <Minimize size={14} /> : <Maximize size={14} />} {kiosk ? 'Exit kiosk' : 'Kiosk'}
          </button>
        </span>
      </div>

      {!kiosk && showSettings && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4 text-sm">
          <label className="flex items-center gap-2">
            Reader
            <select value={mode} onChange={(e) => setMode(e.target.value as ReaderMode)} className="rounded-md border border-border bg-background px-2 py-1.5" aria-label="Reader adapter">
              <option value="keyboard">Keyboard (direct)</option>
              <option value="phone">Phone NFC (tap to phone)</option>
              <option value="bridge">Local bridge (PC/SC · serial · vendor)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Auto-reset
            <select value={resetMs} onChange={(e) => setResetMs(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1.5" aria-label="Auto-reset timeout">
              {RESET_OPTIONS.map((ms) => <option key={ms} value={ms}>{ms / 1000}s</option>)}
            </select>
          </label>
          {mode === 'bridge' && bridge.error && <span className="text-xs text-red-600">{bridge.error}</span>}
        </div>
      )}

      {mode === 'phone' && !phoneActive && (
        <div className="rounded-xl border border-border p-4 text-center text-sm">
          <p className="font-medium">Phone-as-reader uses Web NFC (Android Chrome/Edge + HTTPS only — iPhone Safari cannot tap-scan).</p>
          <button onClick={beginPhoneScan} className="mt-3 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">Enable phone NFC</button>
          {phoneError && <p className="mt-2 text-xs text-red-600" role="alert">{phoneError}</p>}
        </div>
      )}
      <div className="text-center">
        <p className="eyebrow mb-2 justify-center text-[#D4A853]">Live terminal</p>
        <h1 className={cn('font-semibold tracking-[-0.025em] text-white', kiosk ? 'text-5xl' : 'text-[30px]')}>NFC Scanner</h1>
        <p className="mt-1.5 text-[13.5px] text-white/45">Tap a band — result in milliseconds.</p>
      </div>

      {/* Action selector (compact in kiosk) */}
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Scan action">
        {ACTIONS.map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            aria-pressed={action === a}
            className={cn(
              'h-9 rounded-[10px] border px-3.5 text-[13px] font-semibold transition-all',
              kiosk && 'h-auto px-6 py-4 text-xl rounded-2xl',
              action === a
                ? 'gold-button border-transparent'
                : kiosk ? 'border-gray-600 text-white hover:bg-gray-800' : 'border-white/[0.09] bg-white/[0.03] text-white/60 hover:border-white/[0.16] hover:text-white',
            )}
          >
            {a.replace('_', ' ')}
          </button>
        ))}
      </div>

      {action === 'PAYMENT' && (
        <div className="mx-auto flex max-w-xs items-center gap-2">
          <label htmlFor="scan-amount" className={cn('text-sm', kiosk ? 'text-gray-200' : 'text-muted-foreground')}>Amount ₹</label>
          <input
            id="scan-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className={cn('w-full rounded-lg border px-4 font-mono', kiosk ? 'border-gray-600 bg-gray-900 py-4 text-2xl text-white' : 'border-border bg-background py-2 text-sm')}
          />
        </div>
      )}

      {/* Main panel */}
      {state.kind === 'idle' && (
        <div className={cn('premium-card rounded-3xl p-10 text-center', kiosk && 'border-gray-700 bg-gray-900')}>
          {readerOk ? (
            <>
              <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-[#F0D48A] to-[#8F6A2E] shadow-glow text-black font-mono text-xl">◉</span>
              <p className={cn('font-semibold text-white', kiosk ? 'text-3xl' : 'text-[19px]')}>Ready to scan</p>
              <p className={cn('mt-2', kiosk ? 'text-xl text-gray-300' : 'text-[13.5px] text-white/45')}>
                Place the NFC band near the reader.
              </p>
            </>
          ) : (
            <div role="alert">
              <p className={cn('font-semibold', kiosk ? 'text-3xl' : 'text-xl')}>NFC READER OFFLINE</p>
              <p className={cn('mt-2', kiosk ? 'text-lg text-gray-300' : 'text-sm text-muted-foreground')}>
                {mode === 'bridge'
                  ? (bridge.error ?? 'The bridge is not responding.')
                  : 'The NFC reader is not responding.'}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button onClick={retry} className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">Retry Connection</button>
                {mode === 'bridge' && (
                  <button onClick={() => setMode('keyboard')} className="rounded-lg border border-border px-6 py-3">Use keyboard mode</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {state.kind === 'reading' && (
        <div className="rounded-2xl border border-border p-10 text-center" role="status" aria-label="Reading tag">
          <p className={cn(kiosk ? 'text-3xl' : 'text-xl')}>Reading <span className="font-mono">{state.uid}</span>…</p>
        </div>
      )}

      {(state.kind === 'success' || state.kind === 'denied') && (
        <div
          role={state.kind === 'success' ? 'status' : 'alert'}
          className={cn(
            'rounded-2xl border p-10 text-center',
            state.kind === 'success'
              ? 'border-green-500 bg-green-50 dark:bg-green-950'
              : 'border-red-500 bg-red-50 dark:bg-red-950',
            kiosk && state.kind === 'success' && 'bg-green-900',
            kiosk && state.kind === 'denied' && 'bg-red-900',
          )}
        >
          <p className={cn('font-bold', kiosk ? 'text-5xl' : 'text-3xl', state.kind === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
            {state.kind === 'success' ? '✓ ACCESS GRANTED' : state.result === 'UNKNOWN' ? 'UNKNOWN BAND' : 'ACCESS DENIED'}
          </p>
          <p className={cn('mt-3 font-mono', kiosk ? 'text-2xl' : 'text-lg')}>{state.uid}</p>
          <p className={cn('mt-1', kiosk ? 'text-xl' : 'text-sm', kiosk ? 'text-gray-200' : 'text-muted-foreground')}>
            {state.message} · {format(state.at, 'HH:mm:ss')}
          </p>
          {/* auto-reset progress */}
          <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-black/10" aria-hidden>
            <div className="h-full bg-current opacity-40" style={{ width: `${countdownPct}%` }} />
          </div>
          <button onClick={resetNow} className={cn('mt-4 rounded-lg border px-8 font-medium', kiosk ? 'border-gray-500 py-4 text-xl' : 'border-border px-6 py-2.5 text-sm')}>
            <span className="inline-flex items-center gap-2"><RotateCcw size={16} /> Scan Again</span>
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-2xl border border-border p-10 text-center" role="alert">
          <p className={cn('font-semibold', kiosk ? 'text-3xl' : 'text-xl')}>BACKEND UNAVAILABLE</p>
          <p className={cn('mt-2', kiosk ? 'text-lg text-gray-300' : 'text-sm text-muted-foreground')}>{state.message}</p>
          <button onClick={resetNow} className="mt-5 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">Scan Again</button>
        </div>
      )}

      {queuedNote && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-200" role="status">{queuedNote}</p>
      )}

      <VisitorQrInline />

      {queue.length > 0 && (
        <div className="rounded-2xl border border-border p-4 text-sm" aria-label="Offline scan queue">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold">Offline queue ({queue.length}) · stored on this device</p>
            <button
              onClick={() => syncNow().catch(() => undefined)}
              disabled={syncing || !online}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : online ? 'Sync now' : 'Waiting for network…'}
            </button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {queue.slice(0, 20).map((q) => (
              <li key={q.localId} className="flex items-center justify-between gap-2 font-mono text-xs">
                <span>{q.nfcUid} · {q.action}{q.attempts > 0 ? ` · try ${q.attempts + 1}` : ''}{q.lastError ? ` · ${q.lastError}` : ''}</span>
                <button onClick={() => remove(q.localId)} className="rounded px-2 py-0.5 text-muted-foreground hover:bg-muted" aria-label={`Discard ${q.nfcUid}`}>✕</button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Same request ID is replayed on sync — the server dedupes, so retries never double-count.
            {lastSync ? ` Last sync ${format(new Date(lastSync), 'HH:mm:ss')}${lastResult ? ` · +${lastResult.synced}/${lastResult.failed} failed` : ''}.` : ''}
            {' '}Payments are never queued offline.
          </p>
        </div>
      )}
    </div>
  );
}

function VisitorQrInline(): JSX.Element {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkin(): Promise<void> {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.post('/visitors/check-in', { token: code.trim() });
      setResult(`Checked in ${res.data.data.pass.name}`);
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl border border-border p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Visitor / Day-QR fallback</summary>
      <p className="mt-1 text-muted-foreground">Forgot band? Paste the 64-char pass code to check in without NFC.</p>
      <div className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste pass code…"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs"
          aria-label="Visitor pass code"
        />
        <button
          onClick={checkin}
          disabled={code.trim().length < 64 || busy}
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? '…' : 'Check in'}
        </button>
      </div>
      {result && <p className="mt-2 text-green-700" role="status">{result}</p>}
      {error && <p className="mt-2 text-red-600" role="alert">{error}</p>}
    </details>
  );
}
