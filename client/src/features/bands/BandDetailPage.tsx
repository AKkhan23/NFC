import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { Badge, Button, Card, ErrorState, PageHeader, Skeleton, useConfirm } from '../../components/ui';
import type { ScanItem } from '../dashboard/dashboardApi';
import { bandUserName, useBand, useBandAction } from './bandsApi';

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function BandDetailPage(): JSX.Element {
  const { id } = useParams();
  const band = useBand(id);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const { ask, dialog } = useConfirm();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = useBandAction('block');
  const unblock = useBandAction('unblock');
  const activate = useBandAction('activate');
  const lost = useBandAction('mark-lost');
  const damaged = useBandAction('mark-damaged');
  const deactivate = useBandAction('deactivate');
  const tapLink = useBandAction('tap-link');
  const [copied, setCopied] = useState(false);
  const pending = act.isPending || unblock.isPending || activate.isPending || lost.isPending || damaged.isPending || deactivate.isPending || tapLink.isPending;

  const scans = useQuery({
    queryKey: ['band-scans', band.data?.nfcUid],
    queryFn: async () => (await api.get('/nfc/scans', { params: { nfcUid: band.data?.nfcUid, pageSize: 20 } })).data.data.items as ScanItem[],
    enabled: !!band.data?.nfcUid,
  });

  async function run(fn: () => Promise<unknown>, opts: { title: string; body: string; confirmLabel?: string; danger?: boolean }): Promise<void> {
    setError(null);
    if (!(await ask(opts))) return;
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  if (band.isPending) return <div className="space-y-5"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (band.isError || !band.data) return <div className="p-6"><ErrorState message={(band.error as Error)?.message ?? 'Band not found'} /></div>;
  const b = band.data;

  return (
    <div className="space-y-5">
      <PageHeader title={`Band ${b.bandId}`} subtitle={b.nfcUid} actions={<Badge value={b.status} />} />
      {error && <p className="rounded-md border border-red-200 p-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Overview</h2>
          <Row k="NFC UID" v={b.nfcUid} />
          <Row k="Type" v={b.type} />
          <Row k="Holder" v={bandUserName(b)} />
          <Row k="Issued" v={b.issuedAt ? format(new Date(b.issuedAt), 'PP') : '—'} />
          <Row k="Activated" v={b.activatedAt ? format(new Date(b.activatedAt), 'PP') : '—'} />
          <Row k="Expires" v={b.expiresAt ? format(new Date(b.expiresAt), 'PP') : 'Never'} />
          {b.blockedReason && <Row k="Block reason" v={b.blockedReason} />}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {hasPerm('bands.assign') && b.status === 'ASSIGNED' && (
              <Button disabled={pending} onClick={() => run(() => activate.mutateAsync({ id: b._id }), { title: 'Activate band?', body: `${b.bandId} will become ACTIVE and usable at readers.` })}>Activate</Button>
            )}
            {hasPerm('bands.block') && (b.status === 'ACTIVE' || b.status === 'ASSIGNED') && (
              <Button variant="danger" disabled={pending} onClick={() => run(() => act.mutateAsync({ id: b._id, body: { reason: reason || 'Blocked by administrator' } }), { title: 'Block band?', body: 'Scans will be denied until it is unblocked.', confirmLabel: 'Block', danger: true })}>Block</Button>
            )}
            {hasPerm('bands.block') && b.status === 'BLOCKED' && (
              <Button disabled={pending} onClick={() => run(() => unblock.mutateAsync({ id: b._id }), { title: 'Unblock band?', body: `${b.bandId} will become ACTIVE again.` })}>Unblock</Button>
            )}
            {hasPerm('bands.update') && ['ACTIVE', 'BLOCKED'].includes(b.status) && (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => run(() => lost.mutateAsync({ id: b._id }), { title: 'Mark as lost?', body: 'Lost bands must be replaced — they cannot be silently reactivated.', danger: true })}>Mark lost</Button>
                <Button variant="secondary" disabled={pending} onClick={() => run(() => damaged.mutateAsync({ id: b._id }), { title: 'Mark as damaged?', body: 'Damaged bands must be replaced.', danger: true })}>Mark damaged</Button>
              </>
            )}
            {hasPerm('bands.update') && b.status !== 'DECOMMISSIONED' && (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => deactivate.mutateAsync({ id: b._id }), { title: 'Deactivate band?', body: 'This retires the band permanently.', confirmLabel: 'Deactivate', danger: true })}>Deactivate</Button>
            )}
          </div>
          {hasPerm('bands.block') && (b.status === 'ACTIVE' || b.status === 'ASSIGNED') && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Block reason (optional)"
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              aria-label="Block reason"
            />
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Phone tap link</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Write this URL to the card (NFC Tools → Write → URL). Tapping the card opens it and marks check-in — no login needed.
        </p>
        {b.tapToken ? (
          <div className="space-y-2">
            <p className="break-all rounded-md bg-muted p-2 font-mono text-xs">{`${window.location.origin}/t/${b.tapToken}`}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  void navigator.clipboard?.writeText(`${window.location.origin}/t/${b.tapToken ?? ''}`);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </Button>
              {hasPerm('bands.update') && (
                <Button variant="secondary" disabled={pending} onClick={() => run(() => tapLink.mutateAsync({ id: b._id }), { title: 'Rotate tap link?', body: 'The old URL on the card stops working. You must write the new URL to the card.' })}>Rotate link</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">No tap link yet.</p>
            {hasPerm('bands.update') && (
              <Button disabled={pending} onClick={() => run(() => tapLink.mutateAsync({ id: b._id }), { title: 'Create tap link?', body: `Anyone with this link can check in ${b.bandId}. Write it to the card after creating.` })}>Create tap link</Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Recent activity</h2>
        {scans.isPending && <Skeleton className="h-24 w-full" />}
        {scans.data && scans.data.length === 0 && <p className="text-sm text-muted-foreground">No scans recorded for this band yet.</p>}
        {scans.data && scans.data.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {scans.data.map((s) => (
              <li key={s._id} className="flex items-center justify-between py-2">
                <span>{s.action} · <span className="text-muted-foreground">{format(new Date(s.timestamp), 'PP p')}</span></span>
                <Badge value={s.result} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dialog}
    </div>
  );
}
