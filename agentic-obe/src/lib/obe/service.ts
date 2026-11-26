import 'server-only';
import { all, batch, get, parseJson, run, tx, type Statement } from '../db';
import type { BloomLevel, Course } from '../types';
import { buildSchedule } from './scheduler';
import { listHolidays } from '../queries';
import { priorModel, trainLogistic, computeStudentResults, studentFeatures, type Bundle, type Features, type RiskModel } from './analytics';

/** Split `total` marks across `n` questions as whole numbers where possible. */
export function splitMarks(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const out = Array.from({ length: n }, () => base);
  let rest = Math.round((total - base * n) * 100) / 100;
  for (let i = 0; rest > 0; i = (i + 1) % n) {
    const add = Math.min(1, rest);
    out[i] += add;
    rest = Math.round((rest - add) * 100) / 100;
  }
  return out;
}

export async function replaceClos(courseId: number, clos: Array<{ description: string; bloom_level: BloomLevel }>, aiGenerated: boolean) {
  await batch([
    ['DELETE FROM clos WHERE course_id = ?', [courseId]],
    ...clos.map(
      (c, i): Statement => [
        'INSERT INTO clos (course_id, number, description, bloom_level, approved, ai_generated) VALUES (?, ?, ?, ?, ?, ?)',
        [courseId, i + 1, c.description.trim(), c.bloom_level, aiGenerated ? 0 : 1, aiGenerated ? 1 : 0],
      ]
    ),
  ]);
}

export async function replaceWeeklyPlan(
  courseId: number,
  weeks: Array<{ week: number; topic: string; subtopics: string[]; clo_numbers: number[] }>
) {
  await batch([
    ['DELETE FROM weekly_plans WHERE course_id = ?', [courseId]],
    ...weeks.map(
      (w): Statement => [
        'INSERT INTO weekly_plans (course_id, week, topic, subtopics, clo_numbers) VALUES (?, ?, ?, ?, ?)',
        [
          courseId,
          w.week,
          w.topic.trim() || `Week ${w.week}`,
          JSON.stringify(w.subtopics.filter(Boolean)),
          JSON.stringify([...new Set(w.clo_numbers)].sort((a, b) => a - b)),
        ],
      ]
    ),
  ]);
}

export interface Blueprint {
  quizzes: number;
  assignments: number;
  project: boolean;
  labExam: boolean;
}

/**
 * Run the constraint scheduler for a course: rebuilds the daily session plan and
 * (optionally) the assessment plan with CLO-mapped questions.
 */
export async function generateSchedule(courseId: number, blueprint: Blueprint, replaceAssessments: boolean) {
  const course = await get<Course>('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) throw new Error('Course not found');
  const [clos, weeks, holidays] = await Promise.all([
    all<{ id: number; number: number; description: string }>('SELECT id, number, description FROM clos WHERE course_id = ? ORDER BY number', courseId),
    all<{ week: number; topic: string; subtopics: string; clo_numbers: string }>(
      'SELECT week, topic, subtopics, clo_numbers FROM weekly_plans WHERE course_id = ? ORDER BY week',
      courseId
    ),
    listHolidays(),
  ]);
  const labClo = clos.find((c) => /\blab/i.test(c.description));
  const result = buildSchedule({
    startDate: course.start_date,
    totalWeeks: course.total_weeks,
    lectureDays: parseJson<string[]>(course.lecture_days, ['Monday', 'Wednesday']),
    labDay: course.lab_day,
    holidays,
    weeks: weeks.map((w) => ({
      week: w.week,
      topic: w.topic,
      subtopics: parseJson<string[]>(w.subtopics, []),
      clo_numbers: parseJson<number[]>(w.clo_numbers, []),
    })),
    cloNumbers: clos.map((c) => c.number),
    blueprint,
    labCloNumber: labClo?.number ?? null,
  });

  await tx(async () => {
    await batch([
      ['DELETE FROM sessions_plan WHERE course_id = ?', [courseId]],
      ...result.sessions.map(
        (s): Statement => [
          'INSERT INTO sessions_plan (course_id, week, date, kind, title, details) VALUES (?, ?, ?, ?, ?, ?)',
          [courseId, s.week, s.date, s.kind, s.title, s.details],
        ]
      ),
    ]);
    if (!replaceAssessments) return;
    await run('DELETE FROM assessments WHERE course_id = ?', courseId);
    const cloByNumber = new Map(clos.map((c) => [c.number, c.id]));
    const questionStmts: Statement[] = [];
    for (const a of result.assessments) {
      const { id } = await run(
        'INSERT INTO assessments (course_id, title, type, total_marks, weight, week, date, is_formative) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        courseId, a.title, a.type, a.total_marks, a.weight, a.week, a.date, a.is_formative ? 1 : 0
      );
      const cloNums = a.clo_numbers.length ? a.clo_numbers : clos.map((c) => c.number);
      splitMarks(a.total_marks, cloNums.length).forEach((m, i) =>
        questionStmts.push([
          'INSERT INTO questions (assessment_id, number, text, max_marks, clo_id) VALUES (?, ?, ?, ?, ?)',
          [id, i + 1, `Question ${i + 1} (CLO ${cloNums[i]})`, m, cloByNumber.get(cloNums[i]) ?? null],
        ])
      );
    }
    await batch(questionStmts);
  });
  return result;
}

async function bundleFor(courseId: number): Promise<Bundle> {
  const [clos, mappings, assessments, questions, students, marks] = await Promise.all([
    all<Bundle['clos'][number]>('SELECT * FROM clos WHERE course_id = ?', courseId),
    all<Bundle['mappings'][number]>('SELECT m.* FROM clo_plo m JOIN clos c ON c.id = m.clo_id WHERE c.course_id = ?', courseId),
    all<Bundle['assessments'][number]>('SELECT * FROM assessments WHERE course_id = ?', courseId),
    all<Bundle['questions'][number]>('SELECT q.* FROM questions q JOIN assessments a ON a.id = q.assessment_id WHERE a.course_id = ?', courseId),
    all<Bundle['students'][number]>('SELECT * FROM students WHERE course_id = ?', courseId),
    all<Bundle['marks'][number]>('SELECT m.* FROM marks m JOIN students s ON s.id = m.student_id WHERE s.course_id = ?', courseId),
  ]);
  return { clos, mappings, assessments, questions, students, marks };
}

/**
 * Risk model: trained on real history (completed courses: features from formative
 * work only, label = final course grade < 50%) when there are >= 30 such students;
 * otherwise the synthetic prior.
 */
export async function getRiskModel(): Promise<RiskModel> {
  const completed = await all<{ id: number }>("SELECT id FROM courses WHERE status = 'completed'");
  const X: Features[] = [];
  const y: number[] = [];
  for (const { id } of completed) {
    const full = await bundleFor(id);
    const finalGrades = new Map(computeStudentResults(full).map((r) => [r.student.id, r.grade]));
    const formative: Bundle = {
      ...full,
      assessments: full.assessments.filter((a) => a.type !== 'final_exam'),
      questions: full.questions.filter((q) => full.assessments.find((a) => a.id === q.assessment_id)?.type !== 'final_exam'),
    };
    for (const r of computeStudentResults(formative)) {
      const g = finalGrades.get(r.student.id);
      if (g === null || g === undefined || r.grade === null) continue;
      X.push(studentFeatures(formative, r));
      y.push(g < 50 ? 1 : 0);
    }
  }
  if (X.length >= 30 && y.some((v) => v === 1) && y.some((v) => v === 0)) {
    return trainLogistic(X, y, `historical data (${X.length} students from ${completed.length} completed course${completed.length > 1 ? 's' : ''})`);
  }
  return priorModel();
}
