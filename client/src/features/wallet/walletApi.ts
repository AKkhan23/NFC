import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { newId } from '../../lib/utils';

export interface WalletInfo {
  _id: string;
  userId: string;
  balanceMinor: number;
  currency: string;
  status: string;
}

export interface TxnItem {
  _id: string;
  userId: { _id: string; firstName: string; lastName: string; email: string } | string;
  type: string;
  amountMinor: number;
  balanceAfterMinor: number;
  status: string;
  reason?: string;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function txnUserName(t: TxnItem): string {
  const u = t.userId;
  return u && typeof u === 'object' ? `${u.firstName} ${u.lastName}` : '—';
}

export function useWallet(userId: string | undefined) {
  return useQuery({
    queryKey: ['wallet', userId],
    queryFn: async () => (await api.get(`/wallets/${userId}`)).data.data as WalletInfo,
    enabled: !!userId,
  });
}

export function useWalletOp(op: 'credit' | 'debit' | 'adjust' | 'freeze' | 'unfreeze') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body?: Record<string, unknown> }) =>
      (await api.post(`/wallets/${userId}/${op}`, body ?? {})).data.data as { txn: TxnItem; replay: boolean },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { transactionId: string; reason: string }) =>
      (await api.post('/wallets/refund', { ...body, idempotencyKey: `refund_${newId()}` })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useTransactions(params: { page: number; userId?: string; type?: string; status?: string }) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: async () => (await api.get('/transactions', { params: { ...params, pageSize: 12 } })).data.data as Paged<TxnItem>,
  });
}

export interface TopupOrder {
  _id: string;
  userId: string;
  amountMinor: number;
  method: string;
  provider: string;
  providerOrderId?: string;
  status: string;
  reference?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface TopupIntentResult {
  order: TopupOrder;
  replay: boolean;
  upiIntent: string | null;
  qrPayload: string;
  gateway?: { live: boolean; providerOrderId: string; keyId?: string; clientSecret?: string };
}

export function useTopupConfig() {
  return useQuery({
    queryKey: ['topup-config'],
    queryFn: async () =>
      (await api.get('/wallets/topup/config')).data.data as {
        upi: { enabled: boolean };
        manual: { enabled: boolean };
        mock: { enabled: boolean };
        razorpay: { enabled: boolean; keyId: string };
        stripe: { enabled: boolean; publishableKey: string };
      },
    staleTime: 60000,
  });
}

export function useTopupIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body: Record<string, unknown> }) =>
      (await api.post(`/wallets/${userId}/topup/intent`, body)).data.data as TopupIntentResult,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topup'] }),
  });
}

export function useTopupOrder(orderId: string | null, enabledPolling = true) {
  return useQuery({
    queryKey: ['topup', orderId],
    queryFn: async () => (await api.get(`/wallets/topup/${orderId}`)).data.data as TopupOrder,
    enabled: !!orderId,
    refetchInterval: (query) => {
      if (!enabledPolling) return false;
      const s = (query.state.data as TopupOrder | undefined)?.status;
      return s === 'PENDING' ? 3000 : false;
    },
  });
}

export function useTopupConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, providerReference }: { orderId: string; providerReference?: string }) =>
      (await api.post(`/wallets/topup/${orderId}/confirm`, providerReference ? { providerReference } : {})).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topup'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useTopupCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => (await api.post(`/wallets/topup/${orderId}/cancel`)).data.data as TopupOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topup'] }),
  });
}
