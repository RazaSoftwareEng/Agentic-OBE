import Link from 'next/link';
import { FileText, Download, Printer, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/field';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { listCourses, listPrograms } from '@/lib/queries';

const btn = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50';

export default async function ReportsPage() {
  const user = await requireUser(STAFF_ROLES);
  const courses = await listCourses(user);
  const programs = (await listPrograms()).filter((p) => courses.some((c) => c.program_id === p.id));
  const semesters = (pid: number) => [...new Set(courses.filter((c) => c.program_id === pid).map((c) => c.semester_label))];

  return (
    <div className="space-y-8">
      <PageHeader icon={FileText} tone="orange" title="OBE Reports" description="Accreditation-ready reports. Open a report and use Print → Save as PDF; tables also export to CSV (Excel)." />

      {!courses.length && <EmptyState icon={FileText} title="No courses yet">Reports appear once you have courses.</EmptyState>}

      {programs.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-purple-600" /> Program PLO Attainment — {p.code}</CardTitle>
            <CardDescription>Program-level PLO achievement across all course offerings, with the course × PLO coverage matrix.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link className={btn} href={`/report/program/${p.id}`}><Printer className="h-3.5 w-3.5" /> All semesters</Link>
            {semesters(p.id).map((s) => <Link key={s} className={btn} href={`/report/program/${p.id}?semester=${encodeURIComponent(s)}`}><Printer className="h-3.5 w-3.5" /> {s}</Link>)}
          </CardContent>
        </Card>
      ))}

      {courses.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100"><FileText className="h-5 w-5 text-indigo-600" /></div>
              <div>
                <h3 className="font-semibold text-slate-900">{c.code} — {c.title}</h3>
                <p className="mt-0.5 text-sm text-slate-500">{c.semester_label} · {c.teacher_name ?? '—'} · Course file with CLOs, mapping, plan, assessments, CLO/PLO attainment, gaps, CQI actions and at-risk list</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`} href={`/report/course/${c.id}`}><Printer className="h-3.5 w-3.5" /> Course File / CQI</Link>
              <a className={btn} href={`/api/export?course=${c.id}&type=clo`}><Download className="h-3.5 w-3.5" /> CLO CSV</a>
              <a className={btn} href={`/api/export?course=${c.id}&type=plo`}><Download className="h-3.5 w-3.5" /> PLO CSV</a>
              <a className={btn} href={`/api/export?course=${c.id}&type=students`}><Download className="h-3.5 w-3.5" /> Student results CSV</a>
              <a className={btn} href={`/api/export?course=${c.id}&type=risk`}><Download className="h-3.5 w-3.5" /> At-risk CSV</a>
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="text-sm text-slate-500">Individual student reports: open <Link className="text-indigo-600 underline" href="/dashboard/analytics">Analytics</Link> and click a student&apos;s name.</p>
    </div>
  );
}
