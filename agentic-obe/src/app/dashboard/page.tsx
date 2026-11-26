import Link from 'next/link';
import { BookOpen, Target, ClipboardCheck, Users, AlertTriangle, Brain, CalendarDays, TrendingUp, CheckCircle2, XCircle, Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stat, EmptyState, th, td } from '@/components/ui/field';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { listCourses } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';
import { getRiskModel } from '@/lib/obe/service';
import { getGeminiConfig } from '@/lib/settings';
import { StudentResults } from './student-results';
import { formatDate } from '@/lib/utils';

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === 'student') return <StudentResults user={user} />;

  const courses = (await listCourses(user)).filter((c) => c.status !== 'completed');
  const model = await getRiskModel();
  const analyses = await Promise.all(courses.map(async (c) => ({ course: c, ...(await runCourseAnalysis(c, model)) })));

  const totalClos = analyses.reduce((s, a) => s + a.bundle.clos.length, 0);
  const totalAssess = analyses.reduce((s, a) => s + a.bundle.assessments.length, 0);
  const totalStudents = analyses.reduce((s, a) => s + a.bundle.students.length, 0);
  const atRisk = analyses.reduce((s, a) => s + a.analysis.risk.filter((r) => r.tier === 'high').length, 0);
  const highGaps = analyses.flatMap((a) => a.analysis.gaps.filter((g) => g.severity === 'high').map((g) => ({ ...g, course: a.course })));

  const today = new Date().toISOString().slice(0, 10);
  const ids = courses.map((c) => c.id);
  const upcoming = ids.length
    ? await all<{ id: number; title: string; date: string; course_id: number; code: string; type: string }>(
        `SELECT a.id, a.title, a.date, a.course_id, c.code, a.type FROM assessments a JOIN courses c ON c.id = a.course_id
          WHERE a.course_id IN (${ids.map(() => '?').join(',')}) AND a.date >= ? ORDER BY a.date LIMIT 6`,
        ...ids,
        today
      )
    : [];

  return (
    <div className="space-y-8">
      <section className="animate-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-6 text-white shadow-xl shadow-indigo-900/20 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="white" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> AI-powered OBE workspace
            </p>
            <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">Welcome, {user.full_name}</h1>
            <p className="mt-2 text-sm leading-relaxed text-indigo-100 sm:text-base">
              Your OBE planning, mapping, assessment and attainment overview — live from the marks entered so far.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-indigo-100">
              {['Plan', 'Map CLOs → PLOs', 'Assess', 'Analyze', 'Report'].map((step, i, arr) => (
                <span key={step} className="inline-flex items-center gap-2">
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 ring-1 ring-inset ring-white/15">{i + 1}. {step}</span>
                  {i < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-indigo-300" />}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/planner" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-indigo-700 shadow-lg shadow-indigo-950/30 transition hover:-translate-y-0.5 hover:bg-indigo-50">
              <Brain className="h-4 w-4" /> New Course Plan
            </Link>
            <Link href="/dashboard/analytics" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20">
              <TrendingUp className="h-4 w-4" /> View Analytics
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat label="Active Courses" value={courses.length} icon={BookOpen} />
        <Stat label="CLOs Defined" value={totalClos} icon={Target} tone="purple" />
        <Stat label="Assessments" value={totalAssess} icon={ClipboardCheck} tone="green" />
        <Stat label="Students Enrolled" value={totalStudents} icon={Users} tone="orange" />
        <Stat label="High-Risk Students" value={atRisk} sub="ML early warning" icon={AlertTriangle} tone="red" />
      </div>

      {!courses.length ? (
        <EmptyState icon={BookOpen} title="No active courses yet">
          Use the <Link className="text-indigo-600 underline" href="/dashboard/planner">AI Course Planner</Link> to upload an outline, or{' '}
          <Link className="text-indigo-600 underline" href="/dashboard/courses">add a course</Link> manually.
        </EmptyState>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Course Outcome Status</CardTitle>
            <CardDescription>Live CLO attainment from the marks entered so far</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Course</th>
                  <th className={th}>CLOs achieved</th>
                  <th className={th}>Assessments conducted</th>
                  <th className={th}>At risk</th>
                  <th className={th}>Open issues</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analyses.map(({ course, analysis, bundle }) => {
                  const measured = analysis.cloAtt.filter((c) => c.achieved !== null);
                  const achieved = measured.filter((c) => c.achieved).length;
                  return (
                    <tr key={course.id}>
                      <td className={td}>
                        <p className="font-medium text-slate-900">{course.code} — {course.title}</p>
                        <p className="text-xs text-slate-500">{course.semester_label} · {course.teacher_name ?? 'Unassigned'}</p>
                      </td>
                      <td className={td}>
                        {measured.length ? (
                          <span className="inline-flex items-center gap-1">
                            {achieved === measured.length ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                            {achieved} / {measured.length}
                          </span>
                        ) : (
                          <span className="text-slate-400">not measured yet</span>
                        )}
                      </td>
                      <td className={td}>{analysis.conductedCount} / {bundle.assessments.length}</td>
                      <td className={td}>{analysis.risk.filter((r) => r.tier === 'high').length} high · {analysis.risk.filter((r) => r.tier === 'medium').length} medium</td>
                      <td className={td}>{analysis.gaps.filter((g) => g.severity !== 'low').length}</td>
                      <td className={td}>
                        <Link href={`/dashboard/analytics?course=${course.id}`} className="text-sm font-medium text-indigo-600 hover:underline">Analytics →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" /> Early Warnings</CardTitle>
            <CardDescription>Highest-priority learning gaps across your courses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {highGaps.length === 0 && <p className="text-sm text-slate-500">No high-priority gaps detected. 🎉</p>}
            {highGaps.slice(0, 6).map((g, i) => (
              <Link key={i} href={`/dashboard/analytics?course=${g.course.id}`} className="block rounded-lg border border-red-100 bg-red-50/60 p-3 hover:bg-red-50">
                <p className="text-sm font-medium text-red-900">{g.course.code}: {g.title}</p>
                <p className="text-xs text-red-800/80">{g.action}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-indigo-600" /> Upcoming Assessments</CardTitle>
            <CardDescription>From the constraint-based schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled ahead.</p>}
            {upcoming.map((a) => (
              <Link key={a.id} href={`/dashboard/assessments?course=${a.course_id}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <span className="text-sm font-medium text-slate-900">{a.code} · {a.title}</span>
                <Badge variant="outline">{formatDate(a.date)}</Badge>
              </Link>
            ))}
            <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" />
              AI engine: {await getGeminiConfig() ? 'Gemini LLM (with NLP fallback)' : 'built-in NLP — add a Gemini key in Settings for LLM suggestions'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
