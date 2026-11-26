import { notFound } from 'next/navigation';
import { ReportShell, RSection, rth, rtd } from '@/components/report-shell';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { getProgram, listCourses, listPlos } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';
import { getRiskModel } from '@/lib/obe/service';
import { getSettings } from '@/lib/settings';

export default async function ProgramReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semester?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const program = await getProgram(Number((await params).id));
  if (!program) notFound();
  const { semester } = await searchParams;
  const settings = await getSettings();
  const plos = await listPlos(program.id);
  const model = await getRiskModel();
  const courses = (await listCourses(user)).filter((c) => c.program_id === program.id && (!semester || c.semester_label === semester));
  const rows = await Promise.all(courses.map(async (c) => ({ course: c, ...(await runCourseAnalysis(c, model)).analysis })));

  const programValue = (ploId: number) => {
    const vals = rows.map((r) => r.ploAtt.find((p) => p.plo.id === ploId)?.value).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  };

  return (
    <ReportShell
      title="Program PLO Attainment Report"
      subtitle={`${program.code} — ${program.name}${semester ? ` · ${semester}` : ' · all semesters'} · ${courses.length} course offering(s)`}
      back="/dashboard/reports"
    >
      <RSection title="PLO Attainment Summary">
        <table className="w-full border-collapse">
          <thead><tr><th className={rth}>PLO</th><th className={rth}>Courses measuring it</th><th className={rth}>Program attainment</th><th className={rth}>Result (target {settings.plo_target}%)</th></tr></thead>
          <tbody>
            {plos.map((p) => {
              const v = programValue(p.id);
              const n = rows.filter((r) => r.ploAtt.find((x) => x.plo.id === p.id)?.value != null).length;
              return (
                <tr key={p.id}>
                  <td className={rtd}>PLO {p.number} — {p.title}</td>
                  <td className={rtd}>{n}</td>
                  <td className={rtd}>{v ?? '—'}{v !== null && '%'}</td>
                  <td className={rtd}>{v === null ? 'Not assessed — coverage gap' : v >= settings.plo_target ? 'Achieved' : 'Not achieved'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">Program attainment = mean of course-level weighted PLO attainment across offerings that measure the PLO.</p>
      </RSection>
      <RSection title="Course × PLO Matrix (attainment %)">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead><tr><th className={rth}>Course</th>{plos.map((p) => <th key={p.id} className={`${rth} text-center`}>PLO {p.number}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.course.id}>
                  <td className={`${rtd} text-left`}>{r.course.code} ({r.course.semester_label})</td>
                  {plos.map((p) => {
                    const v = r.ploAtt.find((x) => x.plo.id === p.id)?.value;
                    return <td key={p.id} className={`${rtd} text-center ${v != null && v < settings.plo_target ? 'font-bold' : ''}`}>{v ?? ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-slate-500">Bold = below target. Empty = course does not (yet) measure the PLO.</p>
      </RSection>
    </ReportShell>
  );
}
