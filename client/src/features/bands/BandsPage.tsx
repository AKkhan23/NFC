import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDebounced } from '../../hooks/hooks';
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Pagination, ResponsiveTable, Select, TableSkeleton } from '../../components/ui';
import { bandUserName, exportBandsCsv, useBands } from './bandsApi';

const STATUSES = ['AVAILABLE', 'ASSIGNED', 'ACTIVE', 'BLOCKED', 'LOST', 'DAMAGED', 'EXPIRED', 'DECOMMISSIONED'];
const TYPES = ['STUDENT', 'STAFF', 'VISITOR', 'VENDOR', 'VIP', 'TEMPORARY'];

export function BandsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const debounced = useDebounced(search);
  const hasPerm = useAuthStore((s) => s.hasPerm);

  const query = useBands({ page, search: debounced, status: status || undefined, type: type || undefined });

  return (
    <div className="space-y-5">
      <PageHeader
        title="NFC Bands"
        subtitle="Register, assign, and manage every band in your organization."
        actions={
          <>
            {query.data && query.data.items.length > 0 && (
              <Button variant="secondary" onClick={() => exportBandsCsv(query.data.items)}><Download size={15} /> Export</Button>
            )}
            {hasPerm('bands.create') && <Link to="/bands/issue" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus size={15} /> Issue band</Link>}
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <div className="min-w-52 flex-1"><Input placeholder="Search band ID or UID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search bands" /></div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type">
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>

      {query.isPending && <TableSkeleton cols={6} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState
          title="No NFC bands found"
          body="Register your first NFC band to get started."
          action={hasPerm('bands.create') ? <Link to="/bands/issue" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Plus size={15} /> Register band</Link> : undefined}
        />
      )}
      {query.data && query.data.items.length > 0 && (
        <ResponsiveTable
          label="NFC bands"
          rows={query.data.items}
          keyOf={(b) => b._id}
          columns={[
            { header: 'Band ID', render: (b) => <Link to={`/bands/${b._id}`} className="font-medium text-primary hover:underline">{b.bandId}</Link> },
            { header: 'NFC UID', render: (b) => <span className="break-all font-mono text-xs">{b.nfcUid}</span> },
            { header: 'User', render: (b) => bandUserName(b) },
            { header: 'Type', hideOnMobile: true, render: (b) => <span className="text-muted-foreground">{b.type}</span> },
            { header: 'Status', render: (b) => <Badge value={b.status} /> },
            { header: 'Issued', hideOnMobile: true, render: (b) => <span className="text-muted-foreground">{b.issuedAt ? new Date(b.issuedAt).toLocaleDateString() : '—'}</span> },
          ]}
        />
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
    </div>
  );
}
