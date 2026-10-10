import { useState } from 'react';
import { format } from 'date-fns';
import { useAuthStore } from '../../stores/authStore';
import { inr } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Pagination, ResponsiveTable, Select, TableSkeleton, useConfirm } from '../../components/ui';
import { txnUserName, useRefund, useTransactions } from '../wallet/walletApi';

export function TransactionsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canRefund = hasPerm('transactions.manage');
  const { ask, dialog } = useConfirm();
  const refund = useRefund();

  const query = useTransactions({ page, type: type || undefined, status: status || undefined });

  async function doRefund(id: string): Promise<void> {
    if (!(await ask({ title: 'Refund this debit?', body: 'A REFUND ledger row restores the balance. The original row is never modified.', danger: true }))) return;
    refund.mutate({ transactionId: id, reason: 'Refunded from transactions console' });
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Transactions" subtitle="Immutable financial ledger. Reversals are new REFUND rows." />
      <div className="flex flex-wrap gap-2">
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type">
          <option value="">All types</option>
          {['CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT'].map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option>
          {['SUCCESS', 'PENDING', 'FAILED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {query.isPending && <TableSkeleton cols={6} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="No transactions" body="Wallet credits, debits, refunds, and adjustments will appear here." />
      )}
      {query.data && query.data.items.length > 0 && (
        <ResponsiveTable
          label="Transactions"
          rows={query.data.items}
          keyOf={(t) => t._id}
          columns={[
            { header: 'User', render: (t) => <span className="font-medium">{txnUserName(t)}</span> },
            { header: 'Type', render: (t) => <Badge value={t.type} /> },
            {
              header: 'Amount',
              render: (t) => (
                <span className={`font-medium ${t.type === 'DEBIT' ? 'text-red-600' : 'text-green-700'}`}>
                  {t.type === 'DEBIT' ? '−' : '+'}{inr(t.amountMinor)}
                </span>
              ),
            },
            { header: 'Balance after', render: (t) => <span className="text-muted-foreground">{inr(t.balanceAfterMinor)}</span> },
            { header: 'Status', render: (t) => <Badge value={t.status} /> },
            { header: 'Date', hideOnMobile: true, render: (t) => <span className="text-muted-foreground">{format(new Date(t.createdAt), 'PP p')}</span> },
            ...(canRefund ? [{
              header: 'Actions',
              render: (t: (typeof query.data.items)[number]) => t.type === 'DEBIT' && t.status === 'SUCCESS' ? (
                <Button variant="secondary" disabled={refund.isPending} onClick={() => doRefund(t._id)}>Refund</Button>
              ) : null,
            }] : []),
          ]}
        />
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
      {dialog}
    </div>
  );
}
