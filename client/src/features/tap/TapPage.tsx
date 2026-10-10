import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { newId } from '../../lib/utils';

type TapState =
  | { kind: 'working' }
  | { kind: 'done'; ok: boolean; message: string; name?: string; at?: string };

/**
 * Public phone-tap landing page. Card holds `${origin}/t/:token` as an NDEF URL;
 * tapping opens this (no login) and the check-in is recorded immediately.
 */
export function TapPage(): JSX.Element {
  const { token } = useParams();
  const [state, setState] = useState<TapState>({ kind: 'working' });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = (await api.post('/nfc/tap', { token }, { headers: { 'X-Request-Id': `tap_${newId()}` } })).data.data as {
          result: string; message?: string; name?: string; at?: string;
        };
        const ok = res.result === 'SUCCESS';
        setState({ kind: 'done', ok, message: res.message ?? (ok ? 'Checked in' : `Result: ${res.result}`), name: res.name, at: res.at });
      } catch (e) {
        const resp = (e as { response?: { status?: number; data?: { message?: string } } }).response;
        setState({
          kind: 'done',
          ok: false,
          message: resp?.data?.message ?? 'Check-in failed. Ask your administrator for a new tap link.',
        });
      }
    })();
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center space-y-4 p-6 text-center">
      {state.kind === 'working' && (
        <>
          <p className="text-xl font-semibold">Recording check-in…</p>
          <p className="text-sm text-muted-foreground">Keep this page open for a moment.</p>
        </>
      )}
      {state.kind === 'done' && (
        <div role={state.ok ? 'status' : 'alert'} className="space-y-3">
          {state.ok
            ? <CheckCircle2 size={56} className="mx-auto text-green-600" aria-hidden />
            : <XCircle size={56} className="mx-auto text-red-600" aria-hidden />}
          <h1 className={`text-3xl font-bold ${state.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
            {state.ok ? '✓ CHECKED IN' : 'CHECK-IN FAILED'}
          </h1>
          {state.name && <p className="text-lg font-medium">{state.name}</p>}
          <p className="text-sm text-muted-foreground">{state.message}{state.at ? ` · ${new Date(state.at).toLocaleTimeString()}` : ''}</p>
        </div>
      )}
    </div>
  );
}
