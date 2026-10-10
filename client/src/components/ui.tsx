import { forwardRef, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '../lib/utils';

/* ————— Button ————— */

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';
type BtnSize = 'sm' | 'md' | 'lg' | 'icon';

const BTN_SIZES: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[13.5px]',
  lg: 'h-11 px-6 text-sm',
  icon: 'h-9 w-9',
};

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  size = 'md',
  disabled,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}): JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-medium tracking-[-0.01em] transition-all duration-200 disabled:pointer-events-none disabled:opacity-40',
        BTN_SIZES[size],
        variant === 'primary' && 'bg-white text-black hover:bg-white/90 active:scale-[0.98] shadow-[0_8px_20px_-8px_rgba(255,255,255,0.4)]',
        variant === 'gold' && 'gold-button font-semibold',
        variant === 'secondary' &&
          'border border-white/[0.09] bg-white/[0.04] text-[hsl(var(--foreground))] hover:border-white/[0.16] hover:bg-white/[0.07] active:scale-[0.98]',
        variant === 'danger' &&
          'border border-red-500/25 bg-red-500/[0.12] text-red-300 hover:bg-red-500/[0.2] active:scale-[0.98]',
        variant === 'ghost' && 'text-white/70 hover:bg-white/[0.06] hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ————— Inputs ————— */

// forwardRef: react-hook-form's register() passes a ref that must reach the DOM node,
// otherwise typed values are never captured and every field fails as "Required".
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return (
      <input
        {...props}
        ref={ref}
        className={cn(
          'premium-input h-10 w-full rounded-[10px] px-3.5 text-[13.5px] text-white outline-none',
          props.className,
        )}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    return (
      <select
        {...props}
        ref={ref}
        className={cn(
          'premium-input h-10 rounded-[10px] px-3 pr-8 text-[13.5px] text-white outline-none',
          props.className,
        )}
      />
    );
  },
);

export function Field({
  label,
  error,
  children,
  htmlFor,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="space-y-[7px]">
      <label htmlFor={htmlFor} className="block text-[12.5px] font-semibold tracking-[-0.01em] text-white/85">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs leading-relaxed text-white/35">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ————— Badge ————— */

const BADGE_TONES: Record<string, string> = {
  ACTIVE: 'border-emerald-400/20 bg-emerald-400/[0.1] text-emerald-300',
  SUCCESS: 'border-emerald-400/20 bg-emerald-400/[0.1] text-emerald-300',
  ALLOW: 'border-emerald-400/20 bg-emerald-400/[0.1] text-emerald-300',
  PRESENT: 'border-emerald-400/20 bg-emerald-400/[0.1] text-emerald-300',
  ASSIGNED: 'border-sky-400/20 bg-sky-400/[0.1] text-sky-300',
  AVAILABLE: 'border-white/10 bg-white/[0.05] text-white/60',
  BLOCKED: 'border-red-400/20 bg-red-400/[0.1] text-red-300',
  DENIED: 'border-red-400/20 bg-red-400/[0.1] text-red-300',
  LOST: 'border-amber-400/20 bg-amber-400/[0.1] text-amber-300',
  DAMAGED: 'border-orange-400/20 bg-orange-400/[0.1] text-orange-300',
  EXPIRED: 'border-violet-400/20 bg-violet-400/[0.1] text-violet-300',
  DECOMMISSIONED: 'border-white/10 bg-white/[0.04] text-white/40',
  DISABLED: 'border-white/10 bg-white/[0.04] text-white/40',
  UNKNOWN: 'border-white/10 bg-white/[0.05] text-white/55',
  INVALID: 'border-red-400/20 bg-red-400/[0.1] text-red-300',
  ERROR: 'border-red-400/20 bg-red-400/[0.1] text-red-300',
};

const DOT_TONES: Record<string, string> = {
  ACTIVE: 'bg-emerald-400',
  SUCCESS: 'bg-emerald-400',
  ALLOW: 'bg-emerald-400',
  PRESENT: 'bg-emerald-400',
  ASSIGNED: 'bg-sky-400',
  DENIED: 'bg-red-400',
  BLOCKED: 'bg-red-400',
  LOST: 'bg-amber-400',
};

export function Badge({ value, dot = true }: { value: string; dot?: boolean }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-[0.06em]',
        BADGE_TONES[value] ?? BADGE_TONES.AVAILABLE,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_TONES[value] ?? 'bg-current opacity-60')} aria-hidden />}
      {value}
    </span>
  );
}

/* ————— Card ————— */

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}): JSX.Element {
  return (
    <div className={cn('premium-card rounded-2xl p-5', hover && 'premium-card-hover', className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-white/40">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div aria-hidden className={cn('shimmer rounded-lg', className)} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }): JSX.Element {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07]" aria-label="Loading table">
      <div className="flex gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-0">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-2 border-b border-white/[0.04] px-4 py-3.5 last:border-0">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ————— Premium table wrapper ————— */

export function TableWrap({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="premium-card overflow-x-auto rounded-2xl">
      <table className="premium-table">{children}</table>
    </div>
  );
}

/* ————— Responsive table: real table on desktop, stacked cards on phones ————— */

export interface RTableColumn<T> {
  header: string;
  render: (row: T, index: number) => ReactNode;
  /** Omit this column from the mobile card (still shown in the desktop table). */
  hideOnMobile?: boolean;
}

export function ResponsiveTable<T>({
  columns,
  rows,
  keyOf,
  framed = true,
  label,
}: {
  columns: RTableColumn<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
  /** Wrap the desktop table in a bordered box (set false when already inside a Card). */
  framed?: boolean;
  label?: string;
}): JSX.Element {
  const mobileCols = columns.filter((c) => !c.hideOnMobile);
  const [lead, ...rest] = mobileCols;
  return (
    <>
      <div className={framed ? 'hidden overflow-x-auto rounded-xl border border-border md:block' : 'hidden overflow-x-auto md:block'} role="region" aria-label={label} tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>{columns.map((c) => <th key={c.header} className="px-4 py-2.5">{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={keyOf(r, i)} className="border-b border-border last:border-0 hover:bg-muted/40">
                {columns.map((c) => <td key={c.header} className="px-4 py-2.5">{c.render(r, i)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2.5 md:hidden" aria-label={label}>
        {rows.map((r, i) => (
          <li key={keyOf(r, i)} className="min-w-0 space-y-1.5 rounded-xl border border-border p-3.5">
            {lead && <div className="min-w-0 font-medium leading-snug">{lead.render(r, i)}</div>}
            {rest.map((c) => (
              <div key={c.header} className="flex min-w-0 items-start justify-between gap-3 text-[13px]">
                <span className="shrink-0 uppercase tracking-wide text-muted-foreground text-[11px] pt-0.5">{c.header}</span>
                <span className="min-w-0 text-right">{c.render(r, i)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ————— Empty / Error ————— */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.015] px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/50">
        <Inbox size={20} aria-hidden />
      </span>
      <p className="mt-1 text-[14px] font-semibold text-white">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-white/40">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-6 py-12 text-center"
      role="alert"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
        <AlertTriangle size={20} aria-hidden />
      </span>
      <p className="mt-1 text-[14px] font-semibold text-white">Something went wrong</p>
      <p className="max-w-md text-[13px] leading-relaxed text-white/50">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function SuccessNote({ message }: { message: string }): JSX.Element {
  return (
    <p className="flex items-center gap-2 rounded-[10px] border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2.5 text-[13px] font-medium text-emerald-300">
      <CheckCircle2 size={15} aria-hidden /> {message}
    </p>
  );
}

/* ————— Page header ————— */

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-[#D4A853]">{eyebrow}</p>}
        <h1 className="text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-white/45">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ————— Pagination ————— */

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}): JSX.Element {
  if (totalPages <= 1) return <></>;
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p aria-live="polite" className="text-xs tabular-nums text-white/40">
        Page <span className="font-semibold text-white/80">{page}</span> of{' '}
        <span className="font-semibold text-white/80">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} ariaLabel="Previous page">
          <ChevronLeft size={15} /> Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          ariaLabel="Next page"
        >
          Next <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

/* ————— Dialog ————— */

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
  pending,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="premium-card w-full max-w-[400px] animate-fade-up space-y-4 rounded-3xl p-6">
        <h2 className="text-[16px] font-semibold tracking-tight text-white">{title}</h2>
        <p className="text-[13.5px] leading-relaxed text-white/50">{body}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'gold'} onClick={onConfirm} disabled={pending}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): {
  ask: (opts: { title: string; body: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [opts, setOpts] = useState<{ title: string; body: string; confirmLabel?: string; danger?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const resolver = useRef<(v: boolean) => void>(() => undefined);

  function ask(o: { title: string; body: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }

  const dialog = opts ? (
    <ConfirmDialog
      title={opts.title}
      body={opts.body}
      confirmLabel={opts.confirmLabel}
      danger={opts.danger}
      pending={pending}
      onCancel={() => {
        setOpts(null);
        resolver.current(false);
      }}
      onConfirm={() => {
        setPending(true);
        setOpts(null);
        setPending(false);
        resolver.current(true);
      }}
    />
  ) : null;

  return { ask, dialog };
}

/* ————— Misc ————— */

export function Divider({ className }: { className?: string }): JSX.Element {
  return <div className={cn('h-px bg-white/[0.07]', className)} aria-hidden />;
}

export function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <p className="eyebrow text-white/35">{label}</p>
      <p className="mt-1 truncate text-[14px] font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
