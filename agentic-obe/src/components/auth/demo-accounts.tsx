'use client';

import { MousePointerClick, ShieldCheck, BookOpen, GraduationCap, ArrowRight } from 'lucide-react';

const ACCOUNTS = [
  { email: 'admin@obe.edu', password: 'admin123', role: 'Admin / HOD', icon: ShieldCheck, tint: 'from-violet-500 to-fuchsia-500' },
  { email: 'teacher@obe.edu', password: 'teacher123', role: 'Teacher · owns demo CS-201', icon: BookOpen, tint: 'from-indigo-500 to-sky-500' },
  { email: 'student@obe.edu', password: 'student123', role: 'Student', icon: GraduationCap, tint: 'from-emerald-500 to-teal-500' },
];

/** Click an account to fill the login form (the inputs are uncontrolled, so we set them directly). */
export function DemoAccounts() {
  const fill = (email: string, password: string) => {
    const e = document.getElementById('email') as HTMLInputElement | null;
    const p = document.getElementById('password') as HTMLInputElement | null;
    if (!e || !p) return;
    e.value = email;
    p.value = password;
    document.querySelector<HTMLButtonElement>('form button[type="submit"]')?.focus();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur">
      <p className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
        Demo accounts
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
          <MousePointerClick className="h-3.5 w-3.5" /> click to fill
        </span>
      </p>
      <ul className="mt-3 space-y-2">
        {ACCOUNTS.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => fill(a.email, a.password)}
              title={`Fill ${a.email}`}
              className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-all hover:border-indigo-100 hover:bg-indigo-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${a.tint} text-white shadow-sm`}>
                <a.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{a.role}</span>
                <span className="block truncate font-mono text-xs text-slate-500">{a.email} / {a.password}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-500" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
