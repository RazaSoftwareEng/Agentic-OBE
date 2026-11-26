import Link from 'next/link';
import { GraduationCap, Brain, Target, BarChart3, ShieldCheck } from 'lucide-react';

const POINTS = [
  { icon: Brain, title: 'AI Course Planner', text: 'Outline → weekly plan & Bloom-aligned CLOs in seconds' },
  { icon: Target, title: 'CLO → PLO mapping', text: 'AI-suggested weights, approved by you' },
  { icon: BarChart3, title: 'Attainment & early warning', text: 'Live CLO/PLO results and at-risk prediction' },
  { icon: ShieldCheck, title: 'Accreditation-ready', text: 'Printable course files and CQI reports' },
];

/** Split-screen frame for sign-in / register: brand panel (desktop) + form column. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden>
          <defs><pattern id="auth-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0v36" fill="none" stroke="white" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#auth-grid)" />
        </svg>

        <Link href="/" className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="font-display text-xl font-extrabold tracking-tight">Agentic <span className="text-sky-300">OBE</span></span>
        </Link>

        <div className="relative my-auto max-w-lg py-12">
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
            Outcome-Based Education, <span className="bg-gradient-to-r from-sky-300 to-emerald-300 bg-clip-text text-transparent">planned by AI.</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-indigo-100">
            One workflow from course outline to accreditation report. Every AI suggestion waits for your approval.
          </p>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20">
                  <p.icon className="h-5 w-5 text-sky-200" />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-indigo-200">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-300">© 2026 Agentic OBE · AI-Based OBE Academic Planning</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="animate-fade-up w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30">
              <GraduationCap className="h-6 w-6" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight text-slate-900">Agentic <span className="text-indigo-600">OBE</span></span>
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
