import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Copy,
  Eye,
  Facebook,
  Globe,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  Mail,
  MessageCircle,
  Nfc,
  Phone,
  SearchX,
  Share2,
  Twitter,
  UserRound,
  Youtube,
} from 'lucide-react';
import { api } from '../../lib/api';

export interface PublicProfile {
  slug: string;
  displayName: string;
  title?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  website?: string;
  links: { label: string; url: string }[];
  photoUrl?: string;
  views: number;
}

function socialIcon(label: string, url: string): JSX.Element {
  const l = label.toLowerCase();
  const u = url.toLowerCase();
  if (l.includes('insta') || u.includes('instagram')) return <Instagram size={18} aria-hidden />;
  if (l.includes('linkedin') || u.includes('linkedin')) return <Linkedin size={18} aria-hidden />;
  if (l.includes('twitter') || l === 'x' || u.includes('twitter') || u.includes('x.com')) return <Twitter size={18} aria-hidden />;
  if (l.includes('facebook') || u.includes('facebook')) return <Facebook size={18} aria-hidden />;
  if (l.includes('youtube') || u.includes('youtube')) return <Youtube size={18} aria-hidden />;
  return <LinkIcon size={18} aria-hidden />;
}

function waNumber(n: string): string {
  return n.replace(/\D/g, '');
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

export function PublicProfilePage(): JSX.Element {
  const { slug } = useParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = (await api.get(`/profiles/p/${slug}`)).data.data as PublicProfile;
        setProfile(res);
      } catch {
        setError('This profile link is invalid or unpublished. Ask the owner for a new one.');
      }
    })();
  }, [slug]);

  const pageUrl = useMemo(() => window.location.href, []);
  const vcardUrl = useMemo(
    () => `${import.meta.env.VITE_API_URL ?? '/api'}/profiles/p/${profile?.slug ?? slug}/vcard`,
    [profile?.slug, slug],
  );

  async function share(): Promise<void> {
    const text = profile ? `${profile.displayName}${profile.title ? ` — ${profile.title}` : ''}` : 'Tap card';
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: text, text, url: pageUrl });
        return;
      }
      throw new Error('no-share');
    } catch {
      try {
        await navigator.clipboard?.writeText(pageUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard unavailable */
      }
    }
  }

  if (error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0B10] p-6 text-center">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#F0D48A]/20 blur-[110px]" />
        <div role="alert" className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-white shadow-2xl backdrop-blur-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-[#F0D48A]">
            <SearchX size={26} aria-hidden />
          </span>
          <p className="mt-4 text-xl font-semibold tracking-tight">Profile not found</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0B10] p-6" aria-label="Loading profile">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#F0D48A]/20 blur-[110px]" />
        <div className="relative w-full max-w-sm animate-pulse space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="h-28 rounded-2xl bg-white/10" />
          <div className="mx-auto -mt-14 h-24 w-24 rounded-full bg-white/10 ring-4 ring-[#0B0B10]" />
          <div className="mx-auto h-5 w-40 rounded-full bg-white/10" />
          <div className="mx-auto h-4 w-28 rounded-full bg-white/10" />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="h-14 rounded-2xl bg-white/10" />
            <div className="h-14 rounded-2xl bg-white/10" />
            <div className="h-14 rounded-2xl bg-white/10" />
            <div className="h-14 rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  const actions = [
    ...(profile.phone
      ? [{ key: 'call', label: 'Call', sub: profile.phone, href: `tel:${profile.phone}`, icon: <Phone size={20} aria-hidden />, primary: true as const }]
      : []),
    ...(profile.whatsapp
      ? [{ key: 'wa', label: 'WhatsApp', sub: 'Chat instantly', href: `https://wa.me/${waNumber(profile.whatsapp)}`, external: true, icon: <MessageCircle size={20} aria-hidden />, tint: 'text-emerald-300 bg-emerald-400/10' }]
      : []),
    { key: 'save', label: 'Save contact', sub: 'vCard file', href: vcardUrl, download: true, icon: <UserRound size={20} aria-hidden />, tint: 'text-[#F0D48A] bg-[#F0D48A]/10' },
    ...(profile.email
      ? [{ key: 'mail', label: 'Email', sub: hostOf(`mailto:${profile.email}`).length > 24 ? 'Send mail' : profile.email, href: `mailto:${profile.email}`, icon: <Mail size={20} aria-hidden />, tint: 'text-sky-300 bg-sky-400/10' }]
      : []),
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0B10] text-white">
      {/* ambient stage */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-96 w-[42rem] max-w-none -translate-x-1/2 rounded-full bg-[#F0D48A]/[0.13] blur-[120px]" />
        <div className="absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-amber-600/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)', backgroundSize: '26px 26px' }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F0D48A]/60 to-transparent" />
      </div>

      <style>{`@keyframes card-rise { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: none; } }`}</style>

      <main className="relative mx-auto w-full max-w-md px-5 pb-14 pt-8 motion-safe:[animation:card-rise_.7s_cubic-bezier(.22,.8,.3,1)_both]">
        {/* tap badge */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur">
            <Nfc size={14} aria-hidden className="text-[#F0D48A]" /> Tap card
          </span>
          <button
            onClick={share}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-white/10 active:scale-95"
            aria-label="Share this card"
          >
            {copied ? <Check size={14} aria-hidden className="text-emerald-300" /> : <Share2 size={14} aria-hidden />}
            {copied ? 'Link copied' : 'Share'}
          </button>
        </div>

        {/* hero card */}
        <section className="relative mt-4 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          {/* silk cover */}
          <div aria-hidden className="relative h-32">
            <div className="absolute inset-0 bg-[#14100a]" />
            <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 130% at 15% 10%, #F0D48A 0%, #C69A4B 26%, #6B4E22 52%, #1A1409 78%)' }} />
            <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 120% at 85% 20%, rgba(255,255,255,0.35) 0%, transparent 45%), radial-gradient(70% 90% at 70% 100%, rgba(0,0,0,0.55) 0%, transparent 60%)' }} />
            <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full opacity-40">
              <path d="M0 70 C 60 30, 120 110, 200 65 S 340 20, 400 75 L400 120 L0 120 Z" fill="rgba(255,255,255,0.16)" />
              <path d="M0 90 C 70 55, 150 120, 230 85 S 350 55, 400 95 L400 120 L0 120 Z" fill="rgba(0,0,0,0.35)" />
            </svg>
            <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" /><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /></span>
              Available
            </div>
          </div>

          <div className="relative px-6 pb-6">
            <div className="-mt-12 flex items-end justify-between">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.displayName} className="h-24 w-24 rounded-3xl border border-white/20 object-cover shadow-xl ring-4 ring-[#151310]" />
              ) : (
                <span className="grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-b from-[#F0D48A] to-[#8F6A2E] text-3xl font-bold text-black shadow-xl ring-4 ring-[#151310]">
                  {initials(profile.displayName) || <UserRound size={36} aria-hidden />}
                </span>
              )}
              <button
                onClick={() => { void navigator.clipboard?.writeText(pageUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }}
                className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-[11px] text-white/70 backdrop-blur transition hover:text-white active:scale-95"
                title="Copy card link"
              >
                {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                /p/{profile.slug}
              </button>
            </div>

            <h1 className="mt-3 flex items-center gap-1.5 text-[1.7rem] font-bold leading-tight tracking-tight">
              <span className="truncate">{profile.displayName}</span>
              <BadgeCheck size={22} aria-label="Verified" className="shrink-0 text-[#F0D48A]" />
            </h1>
            {profile.title && <p className="mt-1 text-sm font-medium text-white/60">{profile.title}</p>}

            {/* quick actions */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {actions.map((a) =>
                'primary' in a && a.primary ? (
                  <a
                    key={a.key}
                    href={a.href}
                    className="group flex items-center gap-3 rounded-2xl bg-gradient-to-b from-[#F6DE9C] to-[#C99B45] p-[1px] shadow-[0_12px_30px_-10px_rgba(240,212,138,0.5)] transition active:scale-[0.97]"
                  >
                    <span className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-b from-[#F6DE9C] to-[#D9AE54] px-4 py-3.5 text-black">
                      {a.icon}
                      <span className="min-w-0 text-left">
                        <span className="block text-sm font-bold leading-none">{a.label}</span>
                        <span className="mt-1 block truncate text-[11px] font-medium text-black/60">{a.sub}</span>
                      </span>
                    </span>
                  </a>
                ) : (
                  <a
                    key={a.key}
                    href={a.href}
                    {...('external' in a && a.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    {...('download' in a && a.download ? { download: '' } : {})}
                    className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3.5 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.09] active:scale-[0.97]"
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${'tint' in a && typeof a.tint === 'string' ? a.tint : 'bg-white/10 text-white'}`}>
                      {a.icon}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold leading-none">{a.label}</span>
                      <span className="mt-1 block truncate text-[11px] text-white/50">{'sub' in a ? String(a.sub ?? '') : ''}</span>
                    </span>
                  </a>
                ),
              )}
            </div>
          </div>
        </section>

        {/* connect */}
        {(profile.website || profile.links.length > 0) && (
          <section className="mt-4">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">Connect</p>
            <div className="mt-2 space-y-2.5">
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-2xl border border-[#F0D48A]/25 bg-gradient-to-r from-[#F0D48A]/[0.12] to-transparent px-4 py-3.5 backdrop-blur transition hover:border-[#F0D48A]/50 active:scale-[0.99]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F0D48A]/15 text-[#F0D48A]">
                    <Globe size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold">Website</span>
                    <span className="block truncate text-xs text-white/50">{profile.website.replace(/^https?:\/\//, '')}</span>
                  </span>
                  <ArrowUpRight size={17} aria-hidden className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#F0D48A]" />
                </a>
              )}
              {profile.links.map((l) => (
                <a
                  key={`${l.label}-${l.url}`}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3.5 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.09] active:scale-[0.99]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-white/85">
                    {socialIcon(l.label, l.url)}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{l.label}</span>
                    <span className="block truncate text-xs text-white/50">{hostOf(l.url)}</span>
                  </span>
                  <ArrowUpRight size={17} aria-hidden className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* footer */}
        <footer className="mt-8 flex flex-col items-center gap-2 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50">
            <Eye size={12} aria-hidden /> {profile.views.toLocaleString()} {profile.views === 1 ? 'tap' : 'taps'}
          </span>
          <p className="inline-flex items-center gap-1.5 text-[11px] text-white/35">
            <Nfc size={12} aria-hidden /> Just tap to connect · Secured by AirData
          </p>
        </footer>
      </main>
    </div>
  );
}
