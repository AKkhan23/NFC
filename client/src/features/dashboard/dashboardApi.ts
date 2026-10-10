import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface ScanItem {
  _id: string;
  nfcUid: string;
  bandId?: string;
  userId?: string;
  action: string;
  result: string;
  failureReason?: string;
  timestamp: string;
}

export interface LiveScanEvent {
  scanId: string;
  nfcUid: string;
  bandId: string | null;
  user: string | null;
  action: string;
  result: string;
  timestamp: string;
}

async function total(path: string, params: Record<string, unknown>): Promise<number> {
  const res = await api.get(path, { params: { ...params, page: 1, pageSize: 1 } });
  return res.data.data.total as number;
}

export function todayRange(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: new Date().toISOString() };
}

export function useKpiCounts() {
  const { from, to } = todayRange();
  const bands = useQuery({ queryKey: ['kpi-bands'], queryFn: () => total('/bands', {}) });
  const activeBands = useQuery({ queryKey: ['kpi-bands-active'], queryFn: () => total('/bands', { status: 'ACTIVE' }) });
  const users = useQuery({ queryKey: ['kpi-users'], queryFn: () => total('/users', { status: 'ACTIVE' }) });
  const scansToday = useQuery({ queryKey: ['kpi-scans', from], queryFn: () => total('/nfc/scans', { from, to }) });
  return { bands, activeBands, users, scansToday };
}

export function useTodayScans(pageSize = 100) {
  const { from, to } = todayRange();
  return useQuery({
    queryKey: ['scans-today', from, pageSize],
    queryFn: async () => (await api.get('/nfc/scans', { params: { from, to, page: 1, pageSize } })).data.data.items as ScanItem[],
    refetchInterval: 30000,
  });
}

export function bucketByHour(scans: ScanItem[]): { hour: string; success: number; denied: number }[] {
  const buckets = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    success: 0,
    denied: 0,
  }));
  for (const s of scans) {
    const h = new Date(s.timestamp).getHours();
    if (s.result === 'SUCCESS') buckets[h].success += 1;
    else buckets[h].denied += 1;
  }
  return buckets;
}
