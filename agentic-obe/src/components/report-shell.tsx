import Link from 'next/link';
import { PrintButton } from './print-button';
import { getSettings } from '@/lib/settings';

/** Shared frame for printable accreditation reports. */
export async function ReportShell({ title, subtitle, back, children }: { title: string; subtitle: string; back: string; children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl items-center justify-between px-4">
        <Link href={back} className="text-sm font-medium text-indigo-600 hover:underline">← Back</Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-5xl space-y-8 bg-white p-10 text-slate-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-slate-900 pb-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-600">{s.university_name}</p>
          <p className="text-sm text-slate-600">{s.department_name} · Accreditation: {s.accreditation_body}</p>
          <h1 className="mt-3 text-2xl font-bold">{title}</h1>
          <p className="text-sm text-slate-600">{subtitle}</p>
          <p className="mt-1 text-xs text-slate-400">Generated {new Date().toLocaleString('en-GB')} by Agentic OBE</p>
        </header>
        {children}
      </article>
    </div>
  );
}

export function RSection({ title, children, breakBefore }: { title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={breakBefore ? 'print-break' : ''}>
      <h2 className="mb-3 border-b border-slate-300 pb-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export const rth = 'border border-slate-300 bg-slate-100 px-2 py-1.5 text-left text-xs font-semibold';
export const rtd = 'border border-slate-300 px-2 py-1.5 text-xs align-top';
