import { cn } from '@/lib/utils';

export const fieldClass =
  'flex w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 disabled:bg-slate-50 disabled:opacity-60';

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm font-medium text-slate-700', className)}>
      {children}
    </label>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, 'h-10 cursor-pointer pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, 'min-h-[80px] leading-relaxed', className)} {...props} />;
}

type Tone = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'teal' | 'slate';

const TONES: Record<Tone, { chip: string; glow: string }> = {
  blue: { chip: 'from-indigo-500 to-blue-500', glow: 'bg-indigo-500' },
  purple: { chip: 'from-violet-500 to-fuchsia-500', glow: 'bg-violet-500' },
  green: { chip: 'from-emerald-500 to-teal-500', glow: 'bg-emerald-500' },
  orange: { chip: 'from-amber-500 to-orange-500', glow: 'bg-orange-500' },
  red: { chip: 'from-rose-500 to-red-500', glow: 'bg-rose-500' },
  teal: { chip: 'from-cyan-500 to-teal-500', glow: 'bg-cyan-500' },
  slate: { chip: 'from-slate-600 to-slate-800', glow: 'bg-slate-500' },
};

/** Gradient icon tile used by page headers, stats and empty states. */
export function IconChip({ icon: Icon, tone = 'blue', size = 'md', className }: { icon: React.ElementType; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'h-9 w-9 rounded-lg [&>svg]:h-4 [&>svg]:w-4', md: 'h-11 w-11 rounded-xl [&>svg]:h-5 [&>svg]:w-5', lg: 'h-14 w-14 rounded-2xl [&>svg]:h-7 [&>svg]:w-7' }[size];
  return (
    <div className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/20', TONES[tone].chip, s, className)} style={{ boxShadow: '0 8px 20px -8px rgba(79,70,229,0.45)' }}>
      <Icon />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  tone = 'blue',
  children,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ElementType;
  tone?: Tone;
  children?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {icon && <IconChip icon={icon} tone={tone} size="lg" className="hidden sm:flex" />}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500 sm:text-base">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 ring-1 ring-indigo-100">
        <Icon className="h-8 w-8 text-indigo-500" />
      </div>
      <h3 className="mt-4 font-display text-lg font-bold text-slate-900">{title}</h3>
      <div className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = 'blue' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType; tone?: Tone }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-6px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-12px_rgba(15,23,42,0.18)]">
      <div className={cn('pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.08] blur-2xl transition-opacity group-hover:opacity-[0.16]', TONES[tone].glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <IconChip icon={icon} tone={tone} size="sm" className="sm:h-11 sm:w-11 sm:rounded-xl" />
      </div>
    </div>
  );
}

/** Table cell helpers */
export const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap';
export const td = 'px-4 py-3 text-sm text-slate-700 align-top';
