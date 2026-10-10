import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Field, Input } from '../../components/ui';
import type { ProfileForm } from './profilesApi';

/** Shared detail fields for tap profiles (admin dialog + self-service page). */
export function ProfileFormFields({
  form,
  set,
}: {
  form: ProfileForm;
  set: (k: keyof ProfileForm, v: string | boolean | ProfileForm['links']) => void;
}): JSX.Element {
  const [photoOk, setPhotoOk] = useState(true);
  const slug = (form.slug ?? '').trim().toLowerCase() || 'your-slug';

  return (
    <div className="space-y-5">
      <section aria-label="Identity" className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Identity</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Display name *" htmlFor="pf-name">
            <Input id="pf-name" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Akshay Nagdiya" autoComplete="off" />
          </Field>
          <Field label="Title / role" htmlFor="pf-title">
            <Input id="pf-title" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Sales Manager" autoComplete="off" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Link slug (optional)" htmlFor="pf-slug" hint={`Card URL: ${window.location.origin}/p/${slug} — changing it breaks already-written cards.`}>
            <Input id="pf-slug" value={form.slug ?? ''} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="akshay-nagdiya" className="font-mono" autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Photo URL (optional)" htmlFor="pf-photo">
            <div className="flex items-center gap-2.5">
              {form.photoUrl?.trim() && photoOk ? (
                <img
                  src={form.photoUrl.trim()}
                  alt=""
                  aria-hidden
                  className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                  onError={() => setPhotoOk(false)}
                  onLoad={() => setPhotoOk(true)}
                />
              ) : null}
              <Input id="pf-photo" value={form.photoUrl ?? ''} onChange={(e) => { setPhotoOk(true); set('photoUrl', e.target.value); }} placeholder="https://…" inputMode="url" autoComplete="off" />
            </div>
          </Field>
        </div>
      </section>

      <section aria-label="Contact" className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Tap-to-contact</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone (tap-to-call)" htmlFor="pf-phone" hint="E.164, e.g. +919876543210">
            <Input id="pf-phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+91…" inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="WhatsApp (optional)" htmlFor="pf-wa">
            <Input id="pf-wa" value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+91…" inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="pf-email">
            <Input id="pf-email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" inputMode="email" autoComplete="off" />
          </Field>
          <Field label="Website (optional)" htmlFor="pf-web">
            <Input id="pf-web" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://…" inputMode="url" autoComplete="off" />
          </Field>
        </div>
      </section>

      <section aria-label="Social links" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Social links ({form.links.length}/12)</h3>
          {form.links.length < 12 && (
            <Button variant="secondary" onClick={() => set('links', [...form.links, { label: '', url: '' }])} className="h-8 text-xs"><Plus size={14} aria-hidden /> Add link</Button>
          )}
        </div>
        {form.links.length === 0 && (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-xs text-white/35">No social links yet — Instagram, LinkedIn, X…</p>
        )}
        {form.links.map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
            <Input value={l.label} onChange={(e) => set('links', form.links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Instagram" aria-label={`Link ${i + 1} label`} autoComplete="off" />
            <Input value={l.url} onChange={(e) => set('links', form.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" aria-label={`Link ${i + 1} URL`} inputMode="url" autoComplete="off" className="col-span-2 font-mono !text-xs sm:col-span-1" />
            <Button variant="secondary" onClick={() => set('links', form.links.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`} className="h-10 w-10 shrink-0 !px-0"><X size={14} aria-hidden /></Button>
          </div>
        ))}
      </section>

      <section aria-label="Visibility">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm">
          <input type="checkbox" checked={form.isPublic} onChange={(e) => set('isPublic', e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#D4A853]" />
          <span>
            <span className="inline-flex items-center gap-1.5 font-medium">{form.isPublic ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />} Public card</span>
            <span className="block text-xs text-muted-foreground">Uncheck to disable the link without deleting the profile.</span>
          </span>
        </label>
      </section>
    </div>
  );
}
