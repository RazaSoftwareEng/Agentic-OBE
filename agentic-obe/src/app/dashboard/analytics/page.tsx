import Link from 'next/link';
import { AlertTriangle, BarChart3, TrendingUp, Users, ClipboardCheck, Brain, Wrench, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Select, Stat, Textarea, th, td } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CoursePicker } from '@/components/course-picker';
import { AttainmentBarChart, HistogramChart, HorizontalBarChart } from '@/components/charts';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { all } from '@/lib/db';
import { canEditCourse, listCourses, resolveCourse } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';
import { addCorrectiveActionAction } from '@/app/actions/settings';
import { cn, formatDate } from '@/lib/utils';

const SEV = { high: 'danger', medium: 'warning', low: 'outline' } as const;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const course = await resolveCourse(user, (await searchParams).course);
  if (!course) {
    return (
      <div className="space-y-8">
        <PageHeader icon={BarChart3} tone="teal" title="CLO/PLO Analytics" />
        <EmptyState icon={BarChart3} title="No courses yet">Create a course first.</EmptyState>
      </div>
    );
  }
  const { analysis, settings, model, bundle } = await runCourseAnalysis(course);
  const { cloAtt, ploAtt, gaps, risk, results, conductedCount } = analysis;
  const editable = await canEditCourse(user, course.id);
  const ploMeasured = ploAtt.filter((p) => p.value !== null);
  const avgClo = avg(cloAtt.map((c) => c.attainmentPct).filter((x): x is number => x !== null));
  const avgPlo = avg(ploMeasured.map((p) => p.value as number));
  const grades = results.map((r) => r.grade).filter((g): g is number => g !== null);
  const bins = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 9}`, value: grades.filter((g) => Math.min(99.9, g) >= i * 10 && Math.min(99.9, g) < i * 10 + 10).length }));
  const actions = await all<{ id: number; note: string; created_at: string; clo_number: number | null }>(
    'SELECT l.id, l.note, l.created_at, c.number clo_number FROM actions_log l LEFT JOIN clos c ON c.id = l.clo_id WHERE l.course_id = ? ORDER BY l.id DESC',
    course.id
  );

  return (
    <div className="space-y-8">
      <PageHeader icon={BarChart3} tone="teal" title="CLO/PLO Analytics" description={`Attainment, learning gaps and early warning for ${course.code} — ${course.title}`}>
        <CoursePicker courses={await listCourses(user)} current={course.id} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Avg CLO attainment" value={avgClo === null ? '—' : `${avgClo}%`} sub={`% of students ≥ ${settings.clo_threshold}% · target ${settings.clo_target}%`} icon={TrendingUp} tone="green" />
        <Stat label="Avg PLO attainment" value={avgPlo === null ? '—' : `${avgPlo}%`} sub={`${ploMeasured.filter((p) => p.achieved).length}/${ploMeasured.length} PLOs achieved`} icon={BarChart3} />
        <Stat label="Assessments conducted" value={`${conductedCount} / ${bundle.assessments.length}`} sub={`${bundle.students.length} students`} icon={ClipboardCheck} tone="purple" />
        <Stat label="At-risk students" value={risk.filter((r) => r.tier === 'high').length} sub={`${risk.filter((r) => r.tier === 'medium').length} medium risk`} icon={AlertTriangle} tone="red" />
      </div>

      {conductedCount === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No marks entered yet. <Link className="underline" href={`/dashboard/students?course=${course.id}`}>Enter marks</Link> to see attainment — structural gaps are already listed below.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>CLO Attainment</CardTitle>
            <CardDescription>Share of students scoring ≥ {settings.clo_threshold}% on each CLO&apos;s questions (dashed line = {settings.clo_target}% target)</CardDescription>
          </CardHeader>
          <CardContent>
            <AttainmentBarChart
              target={settings.clo_target}
              data={cloAtt.map((c) => ({ label: `CLO ${c.clo.number}`, value: c.attainmentPct, detail: `${c.clo.description} · avg score ${c.avgPct ?? '—'}%` }))}
            />
            <table className="mt-4 w-full">
              <thead className="border-b border-slate-200"><tr><th className={th}>CLO</th><th className={th}>Assessed by</th><th className={th}>Avg score</th><th className={th}>Attained</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cloAtt.map((c) => (
                  <tr key={c.clo.id}>
                    <td className={`${td} whitespace-nowrap`} title={c.clo.description}>CLO {c.clo.number} <span className="text-xs text-slate-400">{c.clo.bloom_level}</span></td>
                    <td className={`${td} text-xs text-slate-500`}>{c.assessedBy.join(', ') || '—'}</td>
                    <td className={td}>{c.avgPct ?? '—'}{c.avgPct !== null && '%'}</td>
                    <td className={td}>{c.assessedStudents ? `${c.attainedCount}/${c.assessedStudents} (${c.attainmentPct}%)` : '—'}</td>
                    <td className={td}>
                      {c.achieved === null ? <span className="text-slate-400">not measured</span> : c.achieved ? (
                        <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> Achieved</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-4 w-4" /> Below target</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PLO Attainment (this course)</CardTitle>
            <CardDescription>Σ(weight × CLO attainment) / Σ weight over approved CLO–PLO mappings · target {settings.plo_target}%</CardDescription>
          </CardHeader>
          <CardContent>
            {ploMeasured.length ? (
              <HorizontalBarChart
                target={settings.plo_target}
                data={ploMeasured.map((p) => ({ label: `PLO ${p.plo.number} ${p.plo.title}`.slice(0, 24), value: p.value, detail: `${p.plo.title} — from ${p.contributors.map((c) => `CLO ${c.cloNumber}×${c.weight}`).join(', ')}` }))}
              />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">No approved CLO–PLO mappings with measured CLOs yet. <Link className="text-indigo-600 underline" href={`/dashboard/mapping?course=${course.id}`}>Approve mappings</Link>.</p>
            )}
            <table className="mt-4 w-full">
              <thead className="border-b border-slate-200"><tr><th className={th}>PLO</th><th className={th}>Contributing CLOs (weight)</th><th className={th}>Attainment</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ploAtt.filter((p) => p.contributors.length).map((p) => (
                  <tr key={p.plo.id}>
                    <td className={td}>PLO {p.plo.number} <span className="text-xs text-slate-500">{p.plo.title}</span></td>
                    <td className={`${td} text-xs`}>{p.contributors.map((c) => `CLO ${c.cloNumber} (×${c.weight})`).join(', ')}</td>
                    <td className={td}>{p.value === null ? '—' : <Badge variant={p.achieved ? 'success' : 'danger'}>{p.value}% {p.achieved ? '✓' : '✗'}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Learning Gaps & Recommended Actions</CardTitle>
            <CardDescription>Detected automatically from the plan, mappings, assessment design and results</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!gaps.length && <p className="text-sm text-slate-500">No gaps detected.</p>}
            {gaps.map((g, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <Badge variant={SEV[g.severity]}>{g.severity}</Badge>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{g.title}</p>
                    <p className="text-xs text-slate-500">{g.detail}</p>
                    <p className="mt-1 text-xs text-blue-800">→ {g.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Grade Distribution</CardTitle>
            <CardDescription>Weighted course % over conducted assessments</CardDescription>
          </CardHeader>
          <CardContent>
            {grades.length ? <HistogramChart data={bins} /> : <p className="py-10 text-center text-sm text-slate-500">No marks yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-purple-600" /> Early Warning — At-Risk Prediction</CardTitle>
          <CardDescription>
            Logistic-regression model on current grade, weakest CLO score, missed assessments and performance trend. Trained on {model.trainedOn} (training accuracy {model.accuracy}%).
            Probability = estimated chance of finishing below 50%.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!risk.length ? (
            <p className="text-sm text-slate-500">The early-warning model activates once marks are entered.</p>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr><th className={th}>Student</th><th className={th}>Risk</th><th className={th}>Probability</th><th className={th}>Grade so far</th><th className={th}>Weak CLOs</th><th className={th}>Missed</th><th className={th}>Recommendation</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {risk.filter((r) => r.tier !== 'low').concat(risk.filter((r) => r.tier === 'low').slice(0, 3)).map((r) => (
                  <tr key={r.result.student.id}>
                    <td className={td}><p className="font-medium text-slate-900">{r.result.student.name}</p><p className="font-mono text-xs text-slate-500">{r.result.student.roll_no}</p></td>
                    <td className={td}><Badge variant={r.tier === 'high' ? 'danger' : r.tier === 'medium' ? 'warning' : 'success'}>{r.tier === 'low' ? 'on track' : r.tier}</Badge></td>
                    <td className={td}>{r.probability}%</td>
                    <td className={td}>{r.result.grade}%</td>
                    <td className={td}>{r.weakClos.map((w) => `CLO ${w.number} (${w.pct}%)`).join(', ') || '—'}</td>
                    <td className={td}>{Math.round(r.features[2] * 100)}%</td>
                    <td className={`${td} text-xs`}>{r.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {risk.filter((r) => r.tier === 'low').length > 3 && <p className="mt-2 text-xs text-slate-500">+ {risk.filter((r) => r.tier === 'low').length - 3} more students on track.</p>}
        </CardContent>
      </Card>

      {results.length > 0 && conductedCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-orange-600" /> Student × CLO Scores</CardTitle>
            <CardDescription>Shaded cells are below the {settings.clo_threshold}% CLO threshold</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr><th className={th}>Roll no.</th><th className={th}>Name</th>{cloAtt.map((c) => <th key={c.clo.id} className={`${th} text-center`}>CLO {c.clo.number}</th>)}<th className={`${th} text-center`}>Grade</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.student.id}>
                    <td className={`${td} font-mono text-xs`}>{r.student.roll_no}</td>
                    <td className={td}><Link href={`/report/student/${r.student.id}`} className="hover:underline">{r.student.name}</Link></td>
                    {cloAtt.map((c) => {
                      const p = r.clo[c.clo.id]?.pct;
                      return <td key={c.clo.id} className={cn(td, 'text-center', p !== null && p !== undefined && p < settings.clo_threshold && 'bg-red-50 font-medium text-red-800')}>{p ?? '—'}</td>;
                    })}
                    <td className={`${td} text-center font-medium`}>{r.grade ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-slate-600" /> Corrective Actions (CQI log)</CardTitle>
          <CardDescription>Record what you did about weak outcomes — included in the course CQI report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editable && (
            <ActionForm action={addCorrectiveActionAction} resetOnSuccess className="flex flex-wrap items-start gap-3">
              <input type="hidden" name="course_id" value={course.id} />
              <Select name="clo_id" className="w-40" defaultValue="">
                <option value="">General</option>
                {bundle.clos.map((c) => <option key={c.id} value={c.id}>CLO {c.number}</option>)}
              </Select>
              <Textarea name="note" rows={2} className="min-w-[300px] flex-1" placeholder="e.g. Conducted two remedial sessions on algorithm analysis and a re-quiz in week 13." />
              <SubmitButton size="sm">Add</SubmitButton>
            </ActionForm>
          )}
          {actions.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <Badge variant="outline">{a.clo_number ? `CLO ${a.clo_number}` : 'General'}</Badge>
              <p className="flex-1 text-slate-800">{a.note}</p>
              <span className="text-xs text-slate-400">{formatDate(a.created_at)}</span>
            </div>
          ))}
          {!actions.length && <p className="text-sm text-slate-500">No actions recorded yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
