import { notFound } from 'next/navigation';
import { ReportShell, RSection, rth, rtd } from '@/components/report-shell';
import { requireUser } from '@/lib/auth';
import { get } from '@/lib/db';
import { canAccessCourse, getCourseOr404 } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';
import type { Student } from '@/lib/types';

export default async function StudentReport({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const student = await get<Student>('SELECT * FROM students WHERE id = ?', Number((await params).id));
  if (!student || !await canAccessCourse(user, student.course_id)) notFound();
  if (user.role === 'student' && student.email?.toLowerCase() !== user.email.toLowerCase()) notFound();
  const course = await getCourseOr404(user, student.course_id);
  const { analysis, settings, plos } = await runCourseAnalysis(course);
  const me = analysis.results.find((r) => r.student.id === student.id)!;
  const risk = analysis.risk.find((r) => r.result.student.id === student.id);

  return (
    <ReportShell
      title="Student Outcome Report"
      subtitle={`${student.name} (${student.roll_no}) · ${course.code} — ${course.title} · ${course.semester_label}`}
      back={user.role === 'student' ? '/dashboard' : `/dashboard/analytics?course=${course.id}`}
    >
      <RSection title="CLO Achievement">
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>CLO</th><th className={rth}>Statement</th><th className={rth}>Marks</th><th className={rth}>Score</th><th className={rth}>Class average</th><th className={rth}>Status (≥ {settings.clo_threshold}%)</th></tr></thead>
          <tbody>
            {analysis.cloAtt.map((c) => {
              const s = me.clo[c.clo.id];
              return (
                <tr key={c.clo.id}>
                  <td className={rtd}>CLO {c.clo.number}</td>
                  <td className={rtd}>{c.clo.description}</td>
                  <td className={rtd}>{s?.max ? `${s.obtained} / ${s.max}` : '—'}</td>
                  <td className={rtd}>{s?.pct ?? '—'}{s?.pct !== null && s?.pct !== undefined && '%'}</td>
                  <td className={rtd}>{c.avgPct ?? '—'}{c.avgPct !== null && '%'}</td>
                  <td className={rtd}>{s?.pct === null || s?.pct === undefined ? 'Pending' : s.pct >= settings.clo_threshold ? 'Attained' : 'Not attained'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </RSection>
      <RSection title="PLO Contribution">
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>PLO</th><th className={rth}>Score</th></tr></thead>
          <tbody>
            {plos.filter((p) => me.plo[p.id] !== undefined).map((p) => (
              <tr key={p.id}><td className={rtd}>PLO {p.number} — {p.title}</td><td className={rtd}>{me.plo[p.id] ?? '—'}{me.plo[p.id] !== null && '%'}</td></tr>
            ))}
          </tbody>
        </table>
      </RSection>
      <RSection title="Summary">
        <p className="text-sm">Weighted course score over conducted assessments: <strong>{me.grade ?? '—'}%</strong>.</p>
        {risk && <p className="mt-1 text-sm">Early-warning status: <strong>{risk.tier === 'low' ? 'on track' : `${risk.tier} risk`}</strong> ({risk.probability}%). {risk.recommendation}</p>}
      </RSection>
    </ReportShell>
  );
}
