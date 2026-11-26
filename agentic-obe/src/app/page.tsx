import Link from 'next/link';
import { GraduationCap, Brain, Target, ClipboardCheck, BarChart3, FileText, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

const features = [
  { icon: Brain, title: 'AI Course Planner', tint: 'from-indigo-500 to-sky-500', description: "Upload a course outline — AI extracts topics, builds a weekly & daily plan and writes measurable CLOs with Bloom's taxonomy." },
  { icon: Target, title: 'CLO/PLO Management', tint: 'from-violet-500 to-fuchsia-500', description: 'AI-recommended CLO → PLO mappings with correlation weights 1–3, reviewed and approved by the teacher.' },
  { icon: ClipboardCheck, title: 'Assessment Mapping', tint: 'from-emerald-500 to-teal-500', description: 'Constraint-based scheduling of quizzes, assignments and exams, with every question linked to the CLO it measures.' },
  { icon: BarChart3, title: 'Analytics & Early Warning', tint: 'from-amber-500 to-orange-500', description: 'Live CLO/PLO attainment, automatic learning-gap detection and ML prediction of students at risk.' },
  { icon: FileText, title: 'Accreditation Reports', tint: 'from-rose-500 to-red-500', description: 'Printable course files, CQI reports and program PLO reports for PEC, NCEAC and ABET reviews.' },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">Agentic <span className="text-indigo-600">OBE</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign in</Link>
            <Link href="/register" className="rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 hover:to-indigo-700">Get started</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-300/30 via-sky-300/25 to-fuchsia-300/25 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
            <Sparkles className="h-4 w-4 text-amber-500" /> AI-powered Outcome-Based Education
          </span>
          <h1 className="animate-fade-up mt-6 font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            From course outline to <span className="bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500 bg-clip-text text-transparent">accreditation report</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Agentic OBE connects course planning, CLO/PLO mapping, assessment design and attainment analytics in one workflow. Every AI output is a suggestion you review and approve.
          </p>
          <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-6 font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:-translate-y-0.5">
              Start planning <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-6 font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              Try the demo
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            {['Works offline with built-in NLP', 'Teacher approves every suggestion', 'PEC · NCEAC · ABET ready'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200/70 bg-white/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Five core modules</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Everything OBE needs, connected</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-6px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_-16px_rgba(79,70,229,0.35)]">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.tint} text-white shadow-lg`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8">
        <p className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-500">© 2026 Agentic OBE — AI-Based OBE Academic Planning Platform.</p>
      </footer>
    </div>
  );
}
