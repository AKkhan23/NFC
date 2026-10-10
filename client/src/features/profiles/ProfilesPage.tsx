import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useDebounced } from '../../hooks/hooks';
import { Badge, Button, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, ResponsiveTable, TableSkeleton } from '../../components/ui';
import { useProfiles, useUpdateProfile, useUpsertProfile, type ProfileForm, type ProfileItem } from './profilesApi';
import { ProfileFormFields } from './ProfileFormFields';

interface UserRow { _id: string; firstName: string; lastName: string; email: string; }

const emptyForm: ProfileForm = {
  userId: '', displayName: '', title: '', phone: '', email: '',
  whatsapp: '', website: '', links: [], photoUrl: '', isPublic: true,
};

function profileUrl(slug: string): string {
  return `${window.location.origin}/p/${slug}`;
}

export function ProfilesPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ProfileItem | 'new' | null>(null);
  const debounced = useDebounced(search);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm('users.update');

  const query = useProfiles({ page, search: debounced });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tap Profiles"
        subtitle="Digital business cards. Write a profile URL to a card — tap opens call, WhatsApp, contact save, and socials."
        actions={canManage ? <Button onClick={() => setEditing('new')}><Plus size={15} /> New profile</Button> : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <div className="min-w-100 flex-1">
          <Input placeholder="Search name or slug…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search profiles" />
        </div>
      </div>

      {query.isPending && <TableSkeleton cols={4} />}
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState
          title="No profiles yet"
          body="Publish the first tap profile, then write its URL to an NFC card."
          action={canManage ? <Button onClick={() => setEditing('new')}><Plus size={15} /> New profile</Button> : undefined}
        />
      )}
      {query.data && query.data.items.length > 0 && (
        <ResponsiveTable
          label="Tap profiles"
          rows={query.data.items}
          keyOf={(p) => p._id}
          columns={[
            { header: 'Name', render: (p) => <span className="font-medium">{p.displayName}</span> },
            { header: 'Link', render: (p) => <span className="break-all font-mono text-xs">/p/{p.slug}</span> },
            {
              header: 'Status',
              render: (p) => (
                <span className="inline-flex items-center gap-1.5">
                  <Badge value={p.isPublic ? 'ACTIVE' : 'BLOCKED'} />
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Profile views">
                    <Eye size={13} aria-hidden />{p.views}
                  </span>
                </span>
              ),
            },
            ...(canManage ? [{
              header: 'Actions',
              render: (p: ProfileItem) => (
                <span className="inline-flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(p)}>Edit</Button>
                </span>
              ),
            }] : []),
          ]}
        />
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
      {editing && <ProfileDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProfileDialog({ initial, onClose }: { initial: ProfileItem | null; onClose: () => void }): JSX.Element {
  const upsert = useUpsertProfile();
  const update = useUpdateProfile();
  const [form, setForm] = useState<ProfileForm>(() => initial ? {
    userId: typeof initial.userId === 'object' ? initial.userId._id : initial.userId,
    slug: initial.slug,
    displayName: initial.displayName,
    title: initial.title ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    whatsapp: initial.whatsapp ?? '',
    website: initial.website ?? '',
    links: initial.links ?? [],
    photoUrl: initial.photoUrl ?? '',
    isPublic: initial.isPublic,
  } : emptyForm);
  const [userLabel, setUserLabel] = useState(initial && typeof initial.userId === 'object'
    ? `${initial.userId.firstName} ${initial.userId.lastName} (${initial.userId.email})` : '');
  const [userSearch, setUserSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const debouncedUser = useDebounced(userSearch, 250);

  const users = useQuery({
    queryKey: ['profile-users', debouncedUser],
    queryFn: async () => (await api.get('/users', { params: { search: debouncedUser, pageSize: 6 } })).data.data.items as UserRow[],
    enabled: !initial && debouncedUser.length >= 1,
  });

  const set = (k: keyof ProfileForm, v: string | boolean | ProfileForm['links']) =>
    setForm((f) => ({ ...f, [k]: v }));
  const clean = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);
  const pending = upsert.isPending || update.isPending;

  async function save(): Promise<void> {
    setError(null);
    const body: ProfileForm = {
      ...form,
      displayName: form.displayName.trim(),
      slug: form.slug?.trim() ? form.slug.trim().toLowerCase() : undefined,
      title: clean(form.title ?? ''),
      phone: clean(form.phone ?? ''),
      email: clean(form.email ?? ''),
      whatsapp: clean(form.whatsapp ?? ''),
      website: clean(form.website ?? ''),
      photoUrl: clean(form.photoUrl ?? ''),
      links: form.links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    };
    try {
      if (initial) {
        const { userId: _omit, ...patch } = body;
        await update.mutateAsync({ id: initial._id, body: patch });
      } else {
        await upsert.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Tap profile">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 overflow-hidden rounded-2xl border border-border bg-background p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{initial ? 'Edit profile' : 'New profile'}</h2>
                <p className="text-xs text-muted-foreground">{initial ? 'Changes go live instantly.' : 'Pick the holder, fill the card, save.'}</p>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-white" aria-label="Close">✕</button>
            </div>

            {!initial && (
              <section aria-label="Holder" className="mb-5">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">1 · Holder *</h3>
                {form.userId && userLabel ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#D4A853]/40 bg-[#D4A853]/[0.07] p-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#E5BE6B] to-[#8F6A2E] text-xs font-bold text-black">
                      {userLabel.slice(0, 1).toUpperCase()}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{userLabel}</p>
                    <button
                      onClick={() => { set('userId', ''); setUserLabel(''); setUserSearch(''); }}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-white"
                      aria-label="Choose a different holder"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <Field label="Holder (user)" htmlFor="pf-user" hint="Search by name or email, then tap to select.">
                    <Input id="pf-user" placeholder="Type a name or email…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoComplete="off" />
                    {(users.data ?? []).length > 0 && (
                      <ul className="mt-1.5 max-h-48 divide-y divide-border overflow-auto rounded-xl border border-border">
                        {(users.data ?? []).map((u) => (
                          <li key={u._id}>
                            <button
                              onClick={() => { set('userId', u._id); setUserLabel(`${u.firstName} ${u.lastName} (${u.email})`); setUserSearch(''); if (!form.displayName.trim()) set('displayName', `${u.firstName} ${u.lastName}`); }}
                              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted"
                            >
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] font-bold text-[#E5BE6B]">
                                {u.firstName.slice(0, 1).toUpperCase()}{u.lastName.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="min-w-0"><span className="block truncate font-medium">{u.firstName} {u.lastName}</span><span className="block truncate text-xs text-muted-foreground">{u.email}</span></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {debouncedUser.length >= 1 && users.data && users.data.length === 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">No users match “{debouncedUser}”.</p>
                    )}
                  </Field>
                )}
              </section>
            )}

            <section aria-label="Card details">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{initial ? 'Card details' : '2 · Card details'}</h3>
              <ProfileFormFields form={form} set={set} />
            </section>

            {initial && (
              <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Write to NFC card</p>
                <p className="break-all font-mono text-xs">{profileUrl(initial.slug)}</p>
                <Button
                  variant="secondary"
                  onClick={() => { void navigator.clipboard?.writeText(profileUrl(initial.slug)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }}
                >
                  {copied ? 'Copied!' : 'Copy card URL'}
                </Button>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-500" role="alert">{error}</p>}
            {!initial && !form.userId && <p className="mt-3 text-xs text-muted-foreground">Select a holder above to enable saving.</p>}
          <div className="sticky bottom-0 -mx-4 mt-4 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pt-1">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
              <Button disabled={pending || (!initial && !form.userId) || !form.displayName.trim()} onClick={save} className="w-full sm:w-auto">
                {pending ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start" aria-label="Live card preview">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Live preview</p>
          <CardPreview form={form} />
        </aside>
      </div>
    </div>
  );
}

function CardPreview({ form }: { form: ProfileForm }): JSX.Element {
  const name = form.displayName.trim() || 'Your Name';
  const actions = [
    form.phone?.trim() && 'Call',
    form.whatsapp?.trim() && 'WhatsApp',
    form.email?.trim() && 'Email',
    form.website?.trim() && 'Web',
  ].filter(Boolean) as string[];
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[1.75rem] border border-white/10 bg-black p-2 shadow-2xl">
      <div className="rounded-[1.35rem] bg-gradient-to-b from-white/[0.07] to-transparent px-4 pb-5 pt-3 text-center">
        <span className="mx-auto mb-3 block h-1 w-16 rounded-full bg-white/15" aria-hidden />
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#F0D48A] to-[#8F6A2E] text-lg font-bold text-black">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <p className="mt-2 truncate text-[15px] font-semibold text-white">{name}</p>
        {form.title?.trim() && <p className="truncate text-xs text-white/50">{form.title.trim()}</p>}
        {!form.isPublic && <p className="mt-1.5 inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">Unpublished</p>}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {(actions.length > 0 ? actions : ['Call', 'Email']).map((a) => (
            <span key={a} className="rounded-lg bg-white/[0.07] px-2 py-2 text-[11px] font-medium text-white/80">{a}</span>
          ))}
        </div>
        {form.links.filter((l) => l.label.trim()).length > 0 && (
          <div className="mt-2 space-y-1.5">
            {form.links.filter((l) => l.label.trim()).slice(0, 3).map((l, i) => (
              <span key={i} className="block truncate rounded-lg border border-white/[0.08] px-2 py-1.5 text-[11px] text-white/60">{l.label.trim()}</span>
            ))}
          </div>
        )}
        <p className="mt-3 font-mono text-[10px] text-white/30">tap card → opens this page</p>
      </div>
    </div>
  );
}
