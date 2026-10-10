import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Badge, Button, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, ResponsiveTable, Select, TableSkeleton } from '../../components/ui';
import { attUserName, useAttendance, useCheckIn, useCorrectAttendance } from './attendanceApi';

interface UserRow { _id: string; firstName: string; lastName: string; email: string; }

const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EARLY_EXIT', 'HALF_DAY', 'ON_LEAVE'];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AttendancePage(): JSX.Element {
  const [date, setDate] = useState(todayStr());
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [manual, setManual] = useState(false);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('attendance.manage');

  const query = useAttendance({ page, date, status: status || undefined });

  function downloadCsv(): void {
    const rows = [['Date', 'User', 'Check-in', 'Check-out', 'Status', 'Late (min)']];
    for (const a of query.data?.items ?? []) {
      rows.push([a.date, attUserName(a), a.checkInAt ?? '', a.checkOutAt ?? '', a.status, String(a.minutesLate ?? 0)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const el = document.createElement('a');
    el.href = url;
    el.download = `attendance-${date}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        subtitle="NFC check-ins, manual entries, and corrections."
        actions={
          <>
            {query.data && query.data.items.length > 0 && <Button variant="secondary" onClick={downloadCsv}><Download size={15} /> Export</Button>}
            {canManage && <Button onClick={() => setManual(true)}><Plus size={15} /> Manual check-in</Button>}
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} aria-label="Attendance date" className="w-auto" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {query.isPending && <TableSkeleton cols={6} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="No attendance records" body={`Nobody checked in on ${date} yet. NFC check-ins appear here automatically.`} />
      )}
      {query.data && query.data.items.length > 0 && (
        <ResponsiveTable
          label="Attendance records"
          rows={query.data.items}
          keyOf={(a) => a._id}
          columns={[
            { header: 'User', render: (a) => <span className="font-medium">{attUserName(a)}</span> },
            { header: 'Check-in', render: (a) => a.checkInAt ? new Date(a.checkInAt).toLocaleTimeString() : '—' },
            { header: 'Check-out', render: (a) => a.checkOutAt ? new Date(a.checkOutAt).toLocaleTimeString() : '—' },
            { header: 'Status', render: (a) => <Badge value={a.status} /> },
            { header: 'Late', hideOnMobile: true, render: (a) => <span className="text-muted-foreground">{a.minutesLate ? `${a.minutesLate}m` : '—'}</span> },
            ...(canManage ? [{
              header: 'Actions',
              render: (a: (typeof query.data.items)[number]) => (
                <Button variant="secondary" onClick={() => setCorrectId(a._id)}>Correct</Button>
              ),
            }] : []),
          ]}
        />
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
      {manual && <ManualDialog onClose={() => setManual(false)} />}
      {correctId && <CorrectDialog id={correctId} onClose={() => setCorrectId(null)} />}
    </div>
  );
}

function ManualDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const checkIn = useCheckIn();
  const users = useQuery({
    queryKey: ['manual-users', q],
    queryFn: async () => (await api.get('/users', { params: { search: q, pageSize: 6 } })).data.data.items as UserRow[],
    enabled: q.length >= 1,
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Manual check-in">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">Manual check-in</h2>
        <Field label="Find user" htmlFor="m-user">
          <Input id="m-user" placeholder="Type a name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <ul className="divide-y divide-border">
          {(users.data ?? []).map((u) => (
            <li key={u._id}>
              <button onClick={() => setUserId(u._id)} className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${userId === u._id ? 'bg-muted font-medium' : ''}`}>
                {u.firstName} {u.lastName} <span className="text-muted-foreground">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
        {checkIn.isError && <p className="text-sm text-red-600" role="alert">{(checkIn.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!userId || checkIn.isPending} onClick={() => checkIn.mutate({ userId }, { onSuccess: onClose })}>
            {checkIn.isPending ? 'Recording…' : 'Check in now'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CorrectDialog({ id, onClose }: { id: string; onClose: () => void }): JSX.Element {
  const [status, setStatus] = useState('PRESENT');
  const [remarks, setRemarks] = useState('');
  const correct = useCorrectAttendance();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Correct attendance">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-6">
        <h2 className="font-semibold">Correct attendance</h2>
        <p className="text-xs text-muted-foreground">Corrections are audited with before/after values.</p>
        <Field label="Status" htmlFor="c-status">
          <Select id="c-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Remarks" htmlFor="c-remarks">
          <Input id="c-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason for correction" />
        </Field>
        {correct.isError && <p className="text-sm text-red-600" role="alert">{(correct.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={correct.isPending} onClick={() => correct.mutate({ id, body: { status, remarks } }, { onSuccess: onClose })}>
            {correct.isPending ? 'Saving…' : 'Save correction'}
          </Button>
        </div>
      </div>
    </div>
  );
}
