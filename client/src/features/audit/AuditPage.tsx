import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../../lib/api';
import { useDebounced } from '../../hooks/hooks';
import { EmptyState, ErrorState, Input, PageHeader, Pagination, ResponsiveTable, TableSkeleton } from '../../components/ui';

interface AuditItem {
  _id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: { firstName: string; lastName: string; email: string } | string;
  createdAt: string;
  requestId?: string;
}

interface Paged { items: AuditItem[]; page: number; pageSize: number; total: number; totalPages: number; }

export function AuditPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const debouncedAction = useDebounced(action);

  const query = useQuery({
    queryKey: ['audit', page, debouncedAction, entityType],
    queryFn: async () =>
      (await api.get('/audit-logs', {
        params: { page, pageSize: 15, ...(debouncedAction ? { action: debouncedAction } : {}), ...(entityType ? { entityType } : {}) },
      })).data.data as Paged,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Logs" subtitle="Append-only record of every sensitive action. No edit or delete API exists." />
      <div className="flex flex-wrap gap-2">
        <div className="min-w-52"><Input placeholder="Filter by action, e.g. BAND_BLOCKED" value={action} onChange={(e) => { setAction(e.target.value.toUpperCase()); setPage(1); }} aria-label="Filter by action" className="font-mono" /></div>
        <div className="min-w-40"><Input placeholder="Entity type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} aria-label="Filter by entity type" /></div>
      </div>
      {query.isPending && <TableSkeleton cols={4} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && <EmptyState title="No audit records" body="Actions like band blocks, refunds, and corrections are recorded here." />}
      {query.data && query.data.items.length > 0 && (
        <ResponsiveTable
          label="Audit records"
          rows={query.data.items}
          keyOf={(a) => a._id}
          columns={[
            { header: 'Action', render: (a) => <span className="break-all font-mono text-xs">{a.action}</span> },
            { header: 'Entity', hideOnMobile: true, render: (a) => <span className="text-muted-foreground text-xs">{a.entityType} · {String(a.entityId).slice(-8)}</span> },
            { header: 'Actor', render: (a) => typeof a.actorId === 'object' ? `${a.actorId.firstName} ${a.actorId.lastName}` : '—' },
            { header: 'When', render: (a) => <span className="text-muted-foreground" title={a.requestId}>{format(new Date(a.createdAt), 'PP p')}</span> },
          ]}
        />
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
    </div>
  );
}
