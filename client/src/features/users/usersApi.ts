import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface UserItem {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function useUsers(params: { page: number; search: string; role?: string; status?: string }) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => (await api.get('/users', { params: { ...params, pageSize: 10 } })).data.data as Paged<UserItem>,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; password: string; firstName: string; lastName: string; role: string }) =>
      (await api.post('/users', body)).data.data as UserItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<UserItem> }) =>
      (await api.patch(`/users/${id}`, body)).data.data as UserItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
