import { Award, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, th, td } from '@/components/ui/field';
import { AttainmentBarChart } from '@/components/charts';
import { listCourses } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';
import type { User } from '@/lib/types';

export async function StudentResults({ user }: { user: User }) {
  const courses = await listCourses(user);
  const analyses = await Promise.all(courses.map((c) => runCourseAnalysis(c)));
  return (
    <div className="space-y-8">
      <PageHeader icon={Award} tone="green" title="My Outcome Results" description="Your Course Learning Outcome (CLO) and Program Learning Outcome (PLO) achievement." />
      {!courses.length && (
        <EmptyState icon={BookOpen} title="No enrolled courses found">
          Your teacher enrolls you with your email address ({user.email}). Once enrolled, your results appear here.
        </EmptyState>
      )}
      {courses.map((course, ci) => {
        const { analysis, settings, plos } = analyses[ci];
        const me = analysis.results.find((r) => r.student.email?.toLowerCase() === user.email.toLowerCase());
        if (!me) return null;
        const risk = analysis.risk.find((r) => r.result.student.id === me.student.id);
        return (
          <Card key={course.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{course.code} — {course.title}</CardTitle>
                  <CardDescription>{course.semester_label} · Roll no. {me.student.roll_no} · Instructor: {course.teacher_name}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Current grade: {me.grade ?? '—'}%</Badge>
                  {risk && (
                    <Badge variant={risk.tier === 'high' ? 'danger' : risk.tier === 'medium' ? 'warning' : 'success'}>
                      {risk.tier === 'low' ? 'On track' : `${risk.tier} risk`}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">My score per CLO (pass mark {settings.clo_threshold}%)</h4>
                <AttainmentBarChart
                  target={settings.clo_threshold}
                  targetLabel={`Pass ${settings.clo_threshold}%`}
                  data={analysis.cloAtt.map((c) => ({ label: `CLO ${c.clo.number}`, value: me.clo[c.clo.id]?.pct ?? null, detail: c.clo.description }))}
                />
              </div>
              <div className="space-y-4">
                <table className="w-full">
                  <thead className="border-b border-slate-200">
                    <tr><th className={th}>CLO</th><th className={th}>Score</th><th className={th}>Class avg</th><th className={th}>Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.cloAtt.map((c) => {
                      const p = me.clo[c.clo.id]?.pct;
                      return (
                        <tr key={c.clo.id}>
                          <td className={td} title={c.clo.description}>CLO {c.clo.number} <span className="text-xs text-slate-400">({c.clo.bloom_level})</span></td>
                          <td className={td}>{p ?? '—'}{p !== null && p !== undefined && '%'}</td>
                          <td className={td}>{c.avgPct ?? '—'}{c.avgPct !== null && '%'}</td>
                          <td className={td}>{p === null || p === undefined ? <span className="text-slate-400">pending</span> : p >= settings.clo_threshold ? <Badge variant="success">Attained</Badge> : <Badge variant="danger">Not yet</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-700">PLO contribution from this course</h4>
                  <div className="flex flex-wrap gap-2">
                    {plos.filter((p) => me.plo[p.id] !== undefined).map((p) => (
                      <span key={p.id} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700" title={p.description}>
                        PLO {p.number} {p.title}: <strong>{me.plo[p.id] ?? '—'}{me.plo[p.id] !== null && '%'}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                {risk && risk.tier !== 'low' && (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <Award className="mt-0.5 h-4 w-4 shrink-0" /> Advice: {risk.recommendation}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
