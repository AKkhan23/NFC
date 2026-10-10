import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface AttendanceItem {
  _id: string;
  userId: { _id: string; firstName: string; lastName: string; email: string } | string;
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  status: string;
  minutesLate?: number;
  remarks?: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function attUserName(a: AttendanceItem): string {
  const u = a.userId;
  return u && typeof u === 'object' ? `${u.firstName} ${u.lastName}` : '—';
}

export function useAttendance(params: { page: number; date?: string; from?: string; to?: string; status?: string }) {
  return useQuery({
    queryKey: ['attendance', params],
    queryFn: async () => (await api.get('/attendance', { params: { ...params, pageSize: 12 } })).data.data as Paged<AttendanceItem>,
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { userId: string; at?: string }) => (await api.post('/attendance/check-in', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { userId: string; at?: string }) => (await api.post('/attendance/check-out', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}

export function useCorrectAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/attendance/${id}/correct`, body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}
