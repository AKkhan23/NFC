import { useState } from 'react';
import { Button, Card, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { ProfileFormFields } from './ProfileFormFields';
import { useMyProfile, useUpsertMyProfile, type MyProfileForm, type ProfileForm, type ProfileItem } from './profilesApi';

const empty: MyProfileForm = {
  displayName: '', title: '', phone: '', email: '',
  whatsapp: '', website: '', links: [], photoUrl: '', isPublic: true,
};

function toForm(p: ProfileItem): MyProfileForm {
  return {
    slug: p.slug,
    displayName: p.displayName,
    title: p.title ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    whatsapp: p.whatsapp ?? '',
    website: p.website ?? '',
    links: p.links ?? [],
    photoUrl: p.photoUrl ?? '',
    isPublic: p.isPublic,
  };
}

/** Self-service tap card: every login fills their own details, no admin needed. */
export function MyTapCardPage(): JSX.Element {
  const mine = useMyProfile();
  const save = useUpsertMyProfile();
  const [form, setForm] = useState<MyProfileForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  const current: MyProfileForm | null = form ?? (mine.data ? toForm(mine.data) : null);
  // Same shape the shared fields component expects (it never touches userId).
  const set = (k: keyof ProfileForm, v: string | boolean | ProfileForm['links']) =>
    setForm((f) => ({ ...(f ?? current ?? empty), [k]: v }) as MyProfileForm);

  const clean = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

  async function onSave(): Promise<void> {
    if (!current) return;
    setError(null);
    try {
      const out = await save.mutateAsync({
        ...current,
        displayName: current.displayName.trim(),
        slug: current.slug?.trim() ? current.slug.trim().toLowerCase() : undefined,
        title: clean(current.title ?? ''),
        phone: clean(current.phone ?? ''),
        email: clean(current.email ?? ''),
        whatsapp: clean(current.whatsapp ?? ''),
        website: clean(current.website ?? ''),
        photoUrl: clean(current.photoUrl ?? ''),
        links: current.links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
      });
      setForm(null);
      setSavedSlug(out.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  const slug = savedSlug ?? mine.data?.slug;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="My Tap Card" subtitle="Fill your details once — this is what people see when they tap your card." />

      {mine.isPending && <Skeleton className="h-64 w-full" />}
      {mine.isError && (mine.error as { response?: { status?: number } }).response?.status !== 404 && (
        <ErrorState message={(mine.error as Error).message} onRetry={() => mine.refetch()} />
      )}
      {(mine.data || (mine.isError && (mine.error as { response?: { status?: number } }).response?.status === 404)) && current && (
        <Card className="space-y-4">
          <ProfileFormFields form={{ ...current, userId: '' }} set={set} />
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end">
            <Button disabled={save.isPending || !current.displayName.trim()} onClick={onSave}>
              {save.isPending ? 'Saving…' : 'Save my card'}
            </Button>
          </div>
        </Card>
      )}

      {slug && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Your share link</h2>
          <p className="text-sm text-muted-foreground">Write this URL to your NFC card (NFC Tools → Write → URL). Anyone tapping it sees your profile — no login needed.</p>
          <p className="break-all rounded-md bg-muted p-2 font-mono text-xs">{`${window.location.origin}/p/${slug}`}</p>
          <div>
            <Button
              variant="secondary"
              onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/p/${slug}`); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
