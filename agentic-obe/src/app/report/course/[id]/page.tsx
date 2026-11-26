import { ReportShell, RSection, rth, rtd } from '@/components/report-shell';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { all, parseJson } from '@/lib/db';
import { getCourseOr404, listAssessments, listQuestions } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';
import { formatDate } from '@/lib/utils';

export default async function CourseReport({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const course = await getCourseOr404(user, Number((await params).id));
  const { analysis, settings, plos, weekly, bundle, model } = await runCourseAnalysis(course);
  const { cloAtt, ploAtt, gaps, risk, results } = analysis;
  const assessments = await listAssessments(course.id);
  const questions = await listQuestions(course.id);
  const mapped = plos.filter((p) => bundle.mappings.some((m) => m.plo_id === p.id && m.approved));
  const actions = await all<{ note: string; created_at: string; clo_number: number | null }>(
    'SELECT l.note, l.created_at, c.number clo_number FROM actions_log l LEFT JOIN clos c ON c.id = l.clo_id WHERE l.course_id = ? ORDER BY l.id',
    course.id
  );
  const grades = results.map((r) => r.grade).filter((g): g is number => g !== null);

  return (
    <ReportShell
      title="Course File & CQI Report"
      subtitle={`${course.code} — ${course.title} · ${course.semester_label} · ${course.program_name} · Instructor: ${course.teacher_name ?? '—'}`}
      back={`/dashboard/reports`}
    >
      <RSection title="1. Course Information">
        <table className="w-full border-collapse">
          <tbody>
            {[
              ['Course code / title', `${course.code} — ${course.title}`],
              ['Credit hours', `${course.credit_hours + course.lab_credit_hours} (${course.credit_hours} theory + ${course.lab_credit_hours} lab)`],
              ['Semester', `${course.semester_label}, starting ${formatDate(course.start_date)}, ${course.total_weeks} weeks`],
              ['Lecture days', `${parseJson<string[]>(course.lecture_days, []).join(', ')}${course.lab_day ? `; lab on ${course.lab_day}` : ''}`],
              ['Thresholds', `Student attains a CLO at ≥ ${settings.clo_threshold}%; CLO achieved when ≥ ${settings.clo_target}% of students attain it; PLO target ${settings.plo_target}%`],
              ['Enrolment', `${bundle.students.length} students`],
            ].map(([k, v]) => (
              <tr key={k}><td className={`${rth} w-48`}>{k}</td><td className={rtd}>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </RSection>

      <RSection title="2. Course Learning Outcomes">
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>CLO</th><th className={rth}>Statement</th><th className={rth}>Bloom</th><th className={rth}>Status</th></tr></thead>
          <tbody>
            {bundle.clos.map((c) => (
              <tr key={c.id}><td className={rtd}>CLO {c.number}</td><td className={rtd}>{c.description}</td><td className={rtd}>{c.bloom_level}</td><td className={rtd}>{c.approved ? 'Approved' : 'Pending'}</td></tr>
            ))}
          </tbody>
        </table>
      </RSection>

      <RSection title="3. CLO–PLO Mapping (approved)">
        <table className="w-full border-collapse text-center">
          <thead><tr><th className={rth}>CLO</th>{mapped.map((p) => <th key={p.id} className={`${rth} text-center`}>PLO {p.number}</th>)}</tr></thead>
          <tbody>
            {bundle.clos.map((c) => (
              <tr key={c.id}>
                <td className={`${rtd} text-left`}>CLO {c.number}</td>
                {mapped.map((p) => {
                  const m = bundle.mappings.find((x) => x.clo_id === c.id && x.plo_id === p.id && x.approved);
                  return <td key={p.id} className={`${rtd} text-center`}>{m ? m.weight : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">3 = high, 2 = medium, 1 = low correlation. {mapped.map((p) => `PLO ${p.number}: ${p.title}`).join('; ')}.</p>
      </RSection>

      <RSection title="4. Weekly Teaching Plan" breakBefore>
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>Week</th><th className={rth}>Topic</th><th className={rth}>Subtopics</th><th className={rth}>CLOs</th></tr></thead>
          <tbody>
            {weekly.map((w) => (
              <tr key={w.id}><td className={rtd}>{w.week}</td><td className={rtd}>{w.topic}</td><td className={rtd}>{parseJson<string[]>(w.subtopics, []).join('; ')}</td><td className={rtd}>{parseJson<number[]>(w.clo_numbers, []).join(', ')}</td></tr>
            ))}
          </tbody>
        </table>
      </RSection>

      <RSection title="5. Assessment Plan & CLO Mapping">
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>Assessment</th><th className={rth}>Week / date</th><th className={rth}>Marks</th><th className={rth}>Weight</th><th className={rth}>Questions → CLO</th></tr></thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.id}>
                <td className={rtd}>{a.title}</td>
                <td className={rtd}>{a.week ? `W${a.week}` : ''} {a.date ? formatDate(a.date) : ''}</td>
                <td className={rtd}>{a.total_marks}</td>
                <td className={rtd}>{a.weight}%</td>
                <td className={rtd}>
                  {questions.filter((q) => q.assessment_id === a.id).map((q) => `Q${q.number} (${q.max_marks}) → CLO ${bundle.clos.find((c) => c.id === q.clo_id)?.number ?? '?'}`).join('; ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RSection>

      <RSection title="6. CLO Attainment" breakBefore>
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>CLO</th><th className={rth}>Assessed by</th><th className={rth}>Average score</th><th className={rth}>Students attaining</th><th className={rth}>Attainment</th><th className={rth}>Result</th></tr></thead>
          <tbody>
            {cloAtt.map((c) => (
              <tr key={c.clo.id}>
                <td className={rtd}>CLO {c.clo.number}</td>
                <td className={rtd}>{c.assessedBy.join(', ')}</td>
                <td className={rtd}>{c.avgPct ?? '—'}{c.avgPct !== null && '%'}</td>
                <td className={rtd}>{c.assessedStudents ? `${c.attainedCount} / ${c.assessedStudents}` : '—'}</td>
                <td className={rtd}>{c.attainmentPct ?? '—'}{c.attainmentPct !== null && '%'}</td>
                <td className={rtd}>{c.achieved === null ? 'Not measured' : c.achieved ? 'Achieved' : 'Not achieved'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {grades.length > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            Class grade so far: mean {Math.round((grades.reduce((s, g) => s + g, 0) / grades.length) * 10) / 10}%, min {Math.min(...grades)}%, max {Math.max(...grades)}%, {grades.filter((g) => g < 50).length} student(s) below 50%.
          </p>
        )}
      </RSection>

      <RSection title="7. PLO Attainment (course contribution)">
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>PLO</th><th className={rth}>Contributing CLOs (weight)</th><th className={rth}>Weighted attainment</th><th className={rth}>Result</th></tr></thead>
          <tbody>
            {ploAtt.filter((p) => p.contributors.length).map((p) => (
              <tr key={p.plo.id}>
                <td className={rtd}>PLO {p.plo.number} — {p.plo.title}</td>
                <td className={rtd}>{p.contributors.map((c) => `CLO ${c.cloNumber} (×${c.weight}): ${c.value ?? '—'}%`).join('; ')}</td>
                <td className={rtd}>{p.value ?? '—'}{p.value !== null && '%'}</td>
                <td className={rtd}>{p.achieved === null ? 'Not measured' : p.achieved ? 'Achieved' : 'Not achieved'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RSection>

      <RSection title="8. Gap Analysis & Continuous Quality Improvement" breakBefore>
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>Severity</th><th className={rth}>Finding</th><th className={rth}>Recommended action</th></tr></thead>
          <tbody>
            {gaps.map((g, i) => (
              <tr key={i}><td className={rtd}>{g.severity}</td><td className={rtd}>{g.title}. {g.detail}</td><td className={rtd}>{g.action}</td></tr>
            ))}
            {!gaps.length && <tr><td className={rtd} colSpan={3}>No gaps detected.</td></tr>}
          </tbody>
        </table>
        <h3 className="mb-2 mt-4 text-sm font-bold">Corrective actions taken</h3>
        {actions.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {actions.map((a, i) => <li key={i}>{a.clo_number ? `CLO ${a.clo_number}: ` : ''}{a.note} <span className="text-xs text-slate-500">({formatDate(a.created_at)})</span></li>)}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">None recorded.</p>
        )}
      </RSection>

      <RSection title="9. Students at Risk (early warning)">
        <p className="mb-2 text-xs text-slate-600">Model: logistic regression trained on {model.trainedOn}.</p>
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>Roll no.</th><th className={rth}>Name</th><th className={rth}>Risk</th><th className={rth}>Grade so far</th><th className={rth}>Weak CLOs</th><th className={rth}>Recommendation</th></tr></thead>
          <tbody>
            {risk.filter((r) => r.tier !== 'low').map((r) => (
              <tr key={r.result.student.id}>
                <td className={rtd}>{r.result.student.roll_no}</td><td className={rtd}>{r.result.student.name}</td>
                <td className={rtd}>{r.tier} ({r.probability}%)</td><td className={rtd}>{r.result.grade}%</td>
                <td className={rtd}>{r.weakClos.map((w) => `CLO ${w.number}`).join(', ') || '—'}</td><td className={rtd}>{r.recommendation}</td>
              </tr>
            ))}
            {!risk.some((r) => r.tier !== 'low') && <tr><td className={rtd} colSpan={6}>No students flagged.</td></tr>}
          </tbody>
        </table>
      </RSection>

      <footer className="grid grid-cols-2 gap-16 pt-12 text-sm">
        <div className="border-t border-slate-900 pt-1 text-center">Course Instructor</div>
        <div className="border-t border-slate-900 pt-1 text-center">Head of Department</div>
      </footer>
    </ReportShell>
  );
}
