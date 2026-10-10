import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface AccessRuleItem {
  _id: string;
  name: string;
  gateId?: string;
  locationId?: string;
  userGroups: string[];
  days: string[];
  startTime: string;
  endTime: string;
  effect: 'ALLOW' | 'DENY';
  priority: number;
  status: string;
}

export interface AccessEventItem {
  _id: string;
  userId?: { firstName: string; lastName: string; email: string } | string;
  direction: string;
  decision: string;
  reason?: string;
  timestamp: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function useAccessRules() {
  return useQuery({
    queryKey: ['access-rules'],
    queryFn: async () => (await api.get('/access/rules', { params: { pageSize: 50 } })).data.data as Paged<AccessRuleItem>,
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post('/access/rules', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-rules'] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/access/rules/${id}`, body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-rules'] }),
  });
}

export function useAccessEvents(decision?: string) {
  return useQuery({
    queryKey: ['access-events', decision],
    queryFn: async () =>
      (await api.get('/access/events', { params: { pageSize: 20, ...(decision ? { decision } : {}) } })).data.data as Paged<AccessEventItem>,
    refetchInterval: 15000,
  });
}
