import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, TableSkeleton } from '../../components/ui';

interface EventItem {
  _id: string;
  name: string;
  startAt: string;
  endAt: string;
  capacity?: number;
  checkedInCount: number;
  allowedGroups: string[];
  status: string;
}

interface Paged<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number; }
interface UserRow { _id: string; firstName: string; lastName: string; email: string; }

export function EventsPage(): JSX.Element {
  const [creating, setCreating] = useState(false);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('access.manage');
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['events'],
    queryFn: async () => (await api.get('/events', { params: { pageSize: 30 } })).data.data as Paged<EventItem>,
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await api.patch(`/events/${id}`, { status })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events"
        subtitle="Capacity-guarded check-ins, manual or via NFC EVENT_CHECK_IN."
        actions={canManage ? <Button onClick={() => setCreating(true)}><Plus size={15} /> Create event</Button> : undefined}
      />
      {query.isPending && <TableSkeleton cols={5} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="No events" body="Create your first event to track registrations and NFC check-ins against capacity." />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.items.map((e) => (
          <Card key={e._id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{e.name}</h2>
              <Badge value={e.status} />
            </div>
            <p className="text-xs text-muted-foreground">{format(new Date(e.startAt), 'PP p')} → {format(new Date(e.endAt), 'PP p')}</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={e.checkedInCount} aria-valuemax={e.capacity ?? undefined} aria-label="Capacity">
              <div
                className="h-full bg-primary"
                style={{ width: e.capacity ? `${Math.min(100, (e.checkedInCount / e.capacity) * 100)}%` : '0%' }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {e.checkedInCount}{e.capacity !== undefined && e.capacity !== null ? ` / ${e.capacity}` : ''} checked in
              {e.allowedGroups.length > 0 && ` · ${e.allowedGroups.join(', ')} only`}
            </p>
            {canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                {e.status === 'DRAFT' && <Button variant="secondary" onClick={() => setStatus.mutate({ id: e._id, status: 'PUBLISHED' })}>Publish</Button>}
                {e.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => setStatus.mutate({ id: e._id, status: 'ONGOING' })}>Start</Button>}
                {e.status === 'ONGOING' && <Button variant="secondary" onClick={() => setStatus.mutate({ id: e._id, status: 'COMPLETED' })}>Complete</Button>}
                {['PUBLISHED', 'ONGOING'].includes(e.status) && <Button onClick={() => setCheckInId(e._id)}>Check in</Button>}
              </div>
            )}
          </Card>
        ))}
      </div>
      {creating && <CreateDialog onClose={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['events'] }); }} />}
      {checkInId && <CheckInDialog eventId={checkInId} onClose={() => { setCheckInId(null); qc.invalidateQueries({ queryKey: ['events'] }); }} />}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await api.post('/events', {
        name,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        ...(capacity ? { capacity: Number(capacity) } : {}),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Create event">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">Create event</h2>
        <Field label="Name" htmlFor="e-name"><Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="e-start"><Input id="e-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
          <Field label="Ends" htmlFor="e-end"><Input id="e-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
        </div>
        <Field label="Capacity (blank = unlimited)" htmlFor="e-cap"><Input id="e-cap" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={name.trim().length < 3 || !startAt || !endAt || pending} onClick={submit}>{pending ? 'Creating…' : 'Create'}</Button>
        </div>
      </div>
    </div>
  );
}

function CheckInDialog({ eventId, onClose }: { eventId: string; onClose: () => void }): JSX.Element {
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const users = useQuery({
    queryKey: ['event-users', q],
    queryFn: async () => (await api.get('/users', { params: { search: q, pageSize: 6 } })).data.data.items as UserRow[],
    enabled: q.length >= 1,
  });

  async function checkIn(userId: string): Promise<void> {
    setError(null);
    setPendingId(userId);
    try {
      await api.post(`/events/${eventId}/check-in`, { userId });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed');
      setPendingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Event check-in">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">Check in attendee</h2>
        <Field label="Find user" htmlFor="ev-user"><Input id="ev-user" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…" /></Field>
        <ul className="divide-y divide-border">
          {(users.data ?? []).map((u) => (
            <li key={u._id} className="flex items-center justify-between py-1.5 text-sm">
              <span>{u.firstName} {u.lastName} <span className="text-muted-foreground">{u.email}</span></span>
              <Button variant="secondary" disabled={pendingId !== null} onClick={() => checkIn(u._id)}>
                {pendingId === u._id ? '…' : 'Check in'}
              </Button>
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>
      </div>
    </div>
  );
}
