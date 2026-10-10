import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Nfc, Eye, EyeOff, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Minimum 8 characters'),
});

type Form = z.infer<typeof schema>;

export function LoginPage(): JSX.Element {
  const nav = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  const login = useMutation({
    mutationFn: async (v: Form) => (await api.post('/auth/login', v)).data.data,
    onSuccess: (data) => {
      setSession(data.accessToken, data.refreshToken, data.user);
      nav('/');
    },
  });

  return (
    <div className="premium-app-bg grid min-h-screen text-white lg:grid-cols-[1.05fr_1fr]">
      {/* ——— Brand panel ——— */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="premium-grid-bg absolute inset-0" aria-hidden />
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(640px 420px at 30% 20%, rgba(212,168,83,0.16), transparent 65%), radial-gradient(500px 500px at 80% 90%, rgba(212,168,83,0.07), transparent 60%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <span className="relative grid h-11 w-11 place-items-center rounded-[13px] bg-gradient-to-b from-[#F0D48A] via-[#D4A853] to-[#8F6A2E] shadow-glow">
              <Nfc size={21} className="text-[#1A1408]" strokeWidth={2.4} aria-hidden />
              <span className="absolute inset-0 rounded-[13px] ring-1 ring-inset ring-white/30" aria-hidden />
            </span>
            <span className="leading-none">
              <span className="block text-[19px] font-bold tracking-[-0.02em]">AirData</span>
              <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#D4A853]">
                NFC Intelligence
              </span>
            </span>
          </div>

          <div className="max-w-[520px]">
            <p className="eyebrow mb-5 flex items-center gap-2 text-[#D4A853]">
              <span className="h-px w-8 bg-[#D4A853]/60" aria-hidden />
              Enterprise access infrastructure
            </p>
            <h1 className="text-balance text-[52px] font-semibold leading-[1.02] tracking-[-0.03em] xl:text-[60px]">
              Every tap,
              <br />
              <span className="font-serif italic font-normal gold-text">perfectly</span> orchestrated.
            </h1>
            <p className="mt-5 max-w-[420px] text-[15px] leading-relaxed text-white/50">
              Bands, identity, payments and attendance — unified in one obsessively crafted
              black-glass command center.
            </p>

            <div className="mt-10 grid max-w-[460px] grid-cols-3 gap-3">
              {[
                { icon: Zap, k: '12ms', v: 'Median scan' },
                { icon: Activity, k: '99.99%', v: 'Uptime SLA' },
                { icon: ShieldCheck, k: 'SOC 2', v: 'Grade audit' },
              ].map((s) => (
                <div
                  key={s.v}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur"
                >
                  <s.icon size={16} className="text-[#E5BE6B]" aria-hidden />
                  <p className="mt-2.5 font-mono text-[17px] font-medium tabular-nums text-white">{s.k}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-white/40">{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11.5px] text-white/30">
            <p>Trusted by campuses, stadiums & enterprises</p>
            <p className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              All systems operational
            </p>
          </div>
        </div>
      </div>

      {/* ——— Form panel ——— */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b from-[#F0D48A] to-[#8F6A2E]">
              <Nfc size={19} className="text-black" aria-hidden />
            </span>
            <span className="text-[17px] font-bold">AirData</span>
          </div>

          <p className="eyebrow mb-3 text-[#D4A853]">Welcome back</p>
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.025em]">
            Sign in to your
            <br />
            workspace<span className="text-[#D4A853]">.</span>
          </h2>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/45">
            Secure, audited access to your NFC ecosystem.
          </p>

          <form
            onSubmit={handleSubmit((v) => login.mutate(v))}
            className="mt-8 space-y-5"
            aria-label="Login"
          >
            <div className="space-y-[7px]">
              <label className="block text-[12.5px] font-semibold text-white/85" htmlFor="email">
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                className="premium-input h-11 w-full rounded-xl px-4 text-[14px] text-white outline-none"
                {...register('email')}
              />
              {formState.errors.email && (
                <p className="text-xs font-medium text-red-400">{formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-[7px]">
              <div className="flex items-center justify-between">
                <label className="block text-[12.5px] font-semibold text-white/85" htmlFor="password">
                  Password
                </label>
                <span className="cursor-pointer text-[12px] font-medium text-[#D4A853]/90 hover:text-[#E5BE6B]">
                  Forgot?
                </span>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="premium-input h-11 w-full rounded-xl px-4 pr-11 text-[14px] text-white outline-none"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/35 transition hover:text-white"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {formState.errors.password && (
                <p className="text-xs font-medium text-red-400">{formState.errors.password.message}</p>
              )}
            </div>

            {login.isError && (
              <p
                className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-3 text-[13px] font-medium text-red-300"
                role="alert"
              >
                {(login.error as Error).message ?? 'Login failed — check your credentials.'}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="gold-button group flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold disabled:opacity-50"
            >
              {login.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                </>
              )}
            </button>

            <div className="flex items-center gap-3 text-[11px] text-white/30">
              <span className="h-px flex-1 bg-white/[0.08]" aria-hidden />
              PROTECTED BY AIRDATA TRUST
              <span className="h-px flex-1 bg-white/[0.08]" aria-hidden />
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-white/35">
              <ShieldCheck size={13} className="text-emerald-400/70" aria-hidden />
              256-bit encrypted · SSO-ready · Fully audited
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
