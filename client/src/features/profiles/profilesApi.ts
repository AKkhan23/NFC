import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileItem {
  _id: string;
  slug: string;
  displayName: string;
  title?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
  links: ProfileLink[];
  photoUrl?: string;
  isPublic: boolean;
  views: number;
  lastViewedAt?: string;
  userId: { _id: string; firstName: string; lastName: string; email: string } | string;
}

export interface ProfileForm {
  userId: string;
  slug?: string;
  displayName: string;
  title?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
  links: ProfileLink[];
  photoUrl?: string;
  isPublic: boolean;
}

export function useProfiles(params: { page: number; search: string }) {
  return useQuery({
    queryKey: ['profiles', params],
    queryFn: async () =>
      (await api.get('/profiles', { params: { ...params, pageSize: 12 } })).data.data as {
        items: ProfileItem[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      },
  });
}

export function useUpsertProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfileForm) => (await api.post('/profiles', body)).data.data as ProfileItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<ProfileForm> }) =>
      (await api.patch(`/profiles/${id}`, body)).data.data as ProfileItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

export type MyProfileForm = Omit<ProfileForm, 'userId'>;

export function useMyProfile() {
  return useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => (await api.get('/profiles/me')).data.data as ProfileItem,
    retry: false,
  });
}

export function useUpsertMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MyProfileForm) => (await api.post('/profiles/me', body)).data.data as ProfileItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
