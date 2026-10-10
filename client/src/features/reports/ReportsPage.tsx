import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '../../lib/api';
import { inr } from '../../lib/format';
import { Button, Card, PageHeader, Skeleton } from '../../components/ui';

const DOMAINS = ['bands', 'scans', 'attendance', 'access-events', 'transactions', 'audit'] as const;

interface Summary {
  bandsByStatus: { _id: string; count: number }[];
  scansByResult: { _id: string; count: number }[];
  attendanceByStatus: { _id: string; count: number }[];
  devicesByStatus: { _id: string; count: number }[];
  activeUsers: number;
  transactions: { _id: string; count: number; volumeMinor: number }[];
}

function Split({ title, rows }: { title: string; rows: { _id: string; count: number }[] }): JSX.Element {
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No data in range.</p>}
      {rows.map((r) => (
        <div key={r._id} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
          <span>{r._id}</span><span className="font-medium">{r.count}</span>
        </div>
      ))}
    </Card>
  );
}

export function ReportsPage(): JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = { ...(from ? { from: new Date(from).toISOString() } : {}), ...(to ? { to: new Date(to).toISOString() } : {}) };

  const summary = useQuery({
    queryKey: ['reports-summary', from, to],
    queryFn: async () => (await api.get('/reports/summary', { params })).data.data as Summary,
  });

  function download(domain: string): void {
    const qs = new URLSearchParams({ domain, ...params }).toString();
    window.open(`/api/reports/export?${qs}`, '_blank');
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle="Aggregates plus spreadsheet-ready CSV exports (up to 5,000 rows)." />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5" aria-label="From date" /></label>
        <label className="text-sm">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5" aria-label="To date" /></label>
      </div>

      {summary.isPending && <Skeleton className="h-48 w-full" />}
      {summary.data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Split title="Bands by status" rows={summary.data.bandsByStatus} />
          <Split title="Scans by result" rows={summary.data.scansByResult} />
          <Split title="Attendance by status" rows={summary.data.attendanceByStatus} />
          <Split title="Devices by status" rows={summary.data.devicesByStatus} />
          <Card>
            <h2 className="mb-2 font-semibold">Finance</h2>
            <div className="flex justify-between border-b border-border py-1.5 text-sm"><span>Active users</span><span className="font-medium">{summary.data.activeUsers}</span></div>
            {summary.data.transactions.map((t) => (
              <div key={t._id} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
                <span>{t._id} × {t.count}</span><span className="font-medium">{inr(t.volumeMinor)}</span>
              </div>
            ))}
            {summary.data.transactions.length === 0 && <p className="text-sm text-muted-foreground">No successful transactions in range.</p>}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Exports</h2>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <Button key={d} variant="secondary" onClick={() => download(d)}>
                  <Download size={14} /> {d}.csv
                </Button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
