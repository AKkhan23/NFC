import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../../lib/api';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Pagination, Select, TableSkeleton } from '../../components/ui';

interface Notif {
  _id: string;
  type: string;
  title: string;
  body?: string;
  priority: string;
  readAt?: string;
  createdAt: string;
}

interface Paged {
  items: Notif[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread: number;
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => (await api.get('/notifications', { params: { pageSize: 1, unreadOnly: true } })).data.data.unread as number,
    refetchInterval: 30000,
  });
}

export function NotificationsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  };

  const query = useQuery({
    queryKey: ['notifications', page, unreadOnly],
    queryFn: async () =>
      (await api.get('/notifications', { params: { page, pageSize: 15, ...(unreadOnly ? { unreadOnly: true } : {}) } })).data.data as Paged,
  });
  const read = useMutation({
    mutationFn: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: async () => (await api.post('/notifications/read-all')).data,
    onSuccess: refresh,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Notifications"
        subtitle={query.data ? `${query.data.unread} unread` : undefined}
        actions={
          <div className="flex gap-2">
            <Select value={unreadOnly ? 'unread' : 'all'} onChange={(e) => { setUnreadOnly(e.target.value === 'unread'); setPage(1); }} aria-label="Filter read state">
              <option value="all">All</option>
              <option value="unread">Unread</option>
            </Select>
            <Button variant="secondary" disabled={readAll.isPending} onClick={() => readAll.mutate()}>Mark all read</Button>
          </div>
        }
      />
      {query.isPending && <TableSkeleton cols={3} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="All caught up" body="Band blocks, low balances, device alerts, and system notices land here." />
      )}
      <ul className="space-y-2">
        {query.data?.items.map((n) => (
          <li
            key={n._id}
            className={`flex items-start gap-3 rounded-xl border p-4 ${n.readAt ? 'border-border opacity-70' : 'border-primary/40 bg-primary/5'}`}
          >
            <div className="flex-1">
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {n.type} · {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge value={n.priority} />
              {!n.readAt && (
                <Button variant="secondary" disabled={read.isPending} onClick={() => read.mutate(n._id)}>Mark read</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
    </div>
  );
}
