import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface BandUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface BandItem {
  _id: string;
  bandId: string;
  nfcUid: string;
  type: string;
  status: string;
  userId?: BandUser | string | null;
  issuedAt?: string;
  activatedAt?: string;
  expiresAt?: string;
  blockedReason?: string;
  replacementFor?: string;
  tapToken?: string;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function bandUserName(b: BandItem): string {
  const u = b.userId;
  if (u && typeof u === 'object') return `${u.firstName} ${u.lastName}`;
  return '—';
}

export function useBands(params: { page: number; search: string; status?: string; type?: string }) {
  return useQuery({
    queryKey: ['bands', params],
    queryFn: async () => (await api.get('/bands', { params: { ...params, pageSize: 12 } })).data.data as Paged<BandItem>,
  });
}

export function useBand(id: string | undefined) {
  return useQuery({
    queryKey: ['band', id],
    queryFn: async () => (await api.get(`/bands/${id}`)).data.data as BandItem,
    enabled: !!id,
  });
}

export function useBandAction(action: 'assign' | 'activate' | 'block' | 'unblock' | 'mark-lost' | 'mark-damaged' | 'replace' | 'deactivate' | 'tap-link') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      (await api.post(`/bands/${id}/${action}`, body ?? {})).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bands'] });
      qc.invalidateQueries({ queryKey: ['band'] });
    },
  });
}

export function useRegisterBand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { bandId?: string; nfcUid: string; type: string }) =>
      (await api.post('/bands', body)).data.data as BandItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bands'] }),
  });
}

export function exportBandsCsv(items: BandItem[]): void {
  const rows = [['Band ID', 'NFC UID', 'User', 'Type', 'Status', 'Issued', 'Expiry']];
  for (const b of items) {
    rows.push([b.bandId, b.nfcUid, bandUserName(b), b.type, b.status, b.issuedAt ?? '', b.expiresAt ?? '']);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `bands-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
