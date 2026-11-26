import { getCurrentUser, STAFF_ROLES } from '@/lib/auth';
import { listCourses } from '@/lib/queries';
import { runCourseAnalysis } from '@/lib/obe/course-analysis';

export const runtime = 'nodejs';

function csv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((r) => r.map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');
}

/** GET /api/export?course=<id>&type=clo|plo|students|risk */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !STAFF_ROLES.includes(user.role)) return new Response('Unauthorized', { status: 401 });
  const url = new URL(req.url);
  const course = (await listCourses(user)).find((c) => c.id === Number(url.searchParams.get('course')));
  if (!course) return new Response('Not found', { status: 404 });
  const type = url.searchParams.get('type') ?? 'students';
  const { analysis, plos } = await runCourseAnalysis(course);
  let rows: Array<Array<string | number | null | undefined>> = [];

  if (type === 'clo') {
    rows = [['CLO', 'Statement', 'Bloom', 'Assessed by', 'Average score %', 'Students attaining', 'Students assessed', 'Attainment %', 'Achieved']];
    for (const c of analysis.cloAtt) {
      rows.push([`CLO ${c.clo.number}`, c.clo.description, c.clo.bloom_level, c.assessedBy.join('; '), c.avgPct, c.attainedCount, c.assessedStudents, c.attainmentPct, c.achieved === null ? '' : c.achieved ? 'Yes' : 'No']);
    }
  } else if (type === 'plo') {
    rows = [['PLO', 'Title', 'Contributing CLOs', 'Attainment %', 'Achieved']];
    for (const p of analysis.ploAtt.filter((x) => x.contributors.length)) {
      rows.push([`PLO ${p.plo.number}`, p.plo.title, p.contributors.map((c) => `CLO ${c.cloNumber} x${c.weight}`).join('; '), p.value, p.achieved === null ? '' : p.achieved ? 'Yes' : 'No']);
    }
  } else if (type === 'risk') {
    rows = [['Roll no', 'Name', 'Risk tier', 'Probability %', 'Grade %', 'Weak CLOs', 'Recommendation']];
    for (const r of analysis.risk) {
      rows.push([r.result.student.roll_no, r.result.student.name, r.tier, r.probability, r.result.grade, r.weakClos.map((w) => `CLO ${w.number}`).join('; '), r.recommendation]);
    }
  } else {
    const mappedPlos = plos.filter((p) => analysis.results.some((r) => r.plo[p.id] !== undefined));
    rows = [['Roll no', 'Name', ...analysis.cloAtt.map((c) => `CLO ${c.clo.number} %`), ...mappedPlos.map((p) => `PLO ${p.number} %`), 'Grade %']];
    for (const r of analysis.results) {
      rows.push([r.student.roll_no, r.student.name, ...analysis.cloAtt.map((c) => r.clo[c.clo.id]?.pct), ...mappedPlos.map((p) => r.plo[p.id]), r.grade]);
    }
  }
  const name = `${course.code}_${course.semester_label}_${type}.csv`.replace(/\s+/g, '_');
  return new Response('﻿' + csv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
  });
}
