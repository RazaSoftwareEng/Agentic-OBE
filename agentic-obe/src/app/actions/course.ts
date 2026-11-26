'use server';

import { redirect } from 'next/navigation';
import { all, get, run, tx } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { suggestCloPloMappings } from '@/lib/ai';
import { generateSchedule, replaceClos, replaceWeeklyPlan, type Blueprint } from '@/lib/obe/service';
import type { BloomLevel, ExtractedPlan } from '@/lib/types';
import { DAYS } from '@/lib/obe/scheduler';
import { fail, guard, num, ok, refreshAll, requireCourseEditor, str, type ActionResult } from './common';

async function readCourseFields(fd: FormData) {
  const lectureDays = fd.getAll('lecture_days').map(String).filter((d) => DAYS.includes(d));
  const labDay = str(fd, 'lab_day');
  const startDate = str(fd, 'start_date');
  const fields = {
    program_id: num(fd, 'program_id'),
    code: str(fd, 'code').toUpperCase(),
    title: str(fd, 'title'),
    credit_hours: num(fd, 'credit_hours', 3),
    lab_credit_hours: num(fd, 'lab_credit_hours', 0),
    semester_label: str(fd, 'semester_label') || 'Fall 2026',
    start_date: startDate,
    total_weeks: Math.min(20, Math.max(8, num(fd, 'total_weeks', 16))),
    lecture_days: JSON.stringify(lectureDays.length ? lectureDays : ['Monday', 'Wednesday']),
    lab_day: DAYS.includes(labDay) ? labDay : null,
    status: (['draft', 'active', 'completed'].includes(str(fd, 'status')) ? str(fd, 'status') : 'active') as string,
  };
  if (!fields.code || !fields.title) throw new Error('Course code and title are required.');
  if (!fields.program_id || !await get('SELECT id FROM programs WHERE id = ?', fields.program_id)) throw new Error('Select a program.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Select a semester start date.');
  return fields;
}

export async function createCourseAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser(STAFF_ROLES);
  let id = 0;
  const res = await guard(async () => {
    const f = await readCourseFields(fd);
    const teacherId = user.role === 'teacher' ? user.id : num(fd, 'teacher_id') || user.id;
    id = (await run(
      `INSERT INTO courses (program_id, teacher_id, code, title, credit_hours, lab_credit_hours, semester_label, start_date, total_weeks, lecture_days, lab_day, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      f.program_id, teacherId, f.code, f.title, f.credit_hours, f.lab_credit_hours, f.semester_label, f.start_date, f.total_weeks, f.lecture_days, f.lab_day, f.status
    )).id;
    return ok();
  });
  if (!res?.ok) return res;
  refreshAll();
  redirect(`/dashboard/courses/${id}`);
}

export async function updateCourseAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = num(fd, 'course_id');
    const user = await requireCourseEditor(id);
    const f = await readCourseFields(fd);
    const teacherId = user.role === 'teacher' ? user.id : num(fd, 'teacher_id') || user.id;
    await run(
      `UPDATE courses SET program_id=?, teacher_id=?, code=?, title=?, credit_hours=?, lab_credit_hours=?, semester_label=?, start_date=?, total_weeks=?, lecture_days=?, lab_day=?, status=? WHERE id=?`,
      f.program_id, teacherId, f.code, f.title, f.credit_hours, f.lab_credit_hours, f.semester_label, f.start_date, f.total_weeks, f.lecture_days, f.lab_day, f.status, id
    );
    refreshAll();
    return ok('Course saved. Re-run the scheduler if you changed dates, days or weeks.');
  });
}

export async function deleteCourseAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = num(fd, 'course_id');
  const res = await guard(async () => {
    await requireCourseEditor(id);
    if (str(fd, 'confirm') !== 'DELETE') return fail('Type DELETE to confirm.');
    await run('DELETE FROM courses WHERE id = ?', id);
    return ok();
  });
  if (!res?.ok) return res;
  refreshAll();
  redirect('/dashboard/courses');
}

function readBlueprint(fd: FormData): Blueprint {
  return {
    quizzes: Math.min(8, Math.max(0, num(fd, 'quizzes', 4))),
    assignments: Math.min(8, Math.max(0, num(fd, 'assignments', 3))),
    project: fd.get('project') === 'on',
    labExam: fd.get('lab_exam') === 'on',
  };
}

export async function regenerateScheduleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = num(fd, 'course_id');
    await requireCourseEditor(id);
    const replace = fd.get('replace_assessments') === 'on';
    if (replace) {
      const hasMarks = await get<{ n: number }>(
        `SELECT COUNT(*) n FROM marks m JOIN questions q ON q.id = m.question_id JOIN assessments a ON a.id = q.assessment_id WHERE a.course_id = ?`,
        id
      );
      if (hasMarks && hasMarks.n > 0 && str(fd, 'confirm') !== 'yes') {
        return fail('Marks have already been entered. Replacing assessments would delete them — tick "I understand" to proceed.');
      }
    }
    if (!await get('SELECT id FROM weekly_plans WHERE course_id = ?', id)) return fail('Create a weekly plan first (AI Course Planner).');
    const r = await generateSchedule(id, readBlueprint(fd), replace);
    refreshAll();
    const n = r.sessions.filter((s) => s.kind === 'lecture' || s.kind === 'lab').length;
    return ok(
      `Scheduled ${n} sessions${replace ? ` and ${r.assessments.length} assessments` : ''}.` +
        (r.warnings.length ? ` Notes: ${r.warnings.join(' ')}` : ' All constraints satisfied.')
    );
  });
}

export async function updateWeekAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = num(fd, 'course_id');
    await requireCourseEditor(id);
    const week = num(fd, 'week');
    const topic = str(fd, 'topic');
    if (!topic) return fail('Topic is required.');
    const subtopics = str(fd, 'subtopics').split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    const clos = fd.getAll('clo_numbers').map(Number).filter((n) => n > 0);
    await run(
      `INSERT INTO weekly_plans (course_id, week, topic, subtopics, clo_numbers) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(course_id, week) DO UPDATE SET topic=excluded.topic, subtopics=excluded.subtopics, clo_numbers=excluded.clo_numbers`,
      id, week, topic, JSON.stringify(subtopics), JSON.stringify(clos)
    );
    refreshAll();
    return ok(`Week ${week} saved.`);
  });
}

/**
 * Planner "Approve & Save": stores the reviewed AI plan in a new or existing course,
 * generates AI CLO→PLO mapping suggestions (pending approval) and runs the scheduler.
 */
export async function savePlanAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser(STAFF_ROLES);
  let courseId = num(fd, 'course_id');
  const res = await guard(async () => {
    const plan = JSON.parse(str(fd, 'plan')) as ExtractedPlan;
    const outline = str(fd, 'outline');
    const clos = plan.clos.filter((c) => c.description.trim());
    if (!clos.length) return fail('At least one CLO is required.');
    if (!plan.weekly_plan.length) return fail('The weekly plan is empty.');

    if (courseId) {
      await requireCourseEditor(courseId);
      const marks = await get<{ n: number }>(
        'SELECT COUNT(*) n FROM marks m JOIN students s ON s.id = m.student_id WHERE s.course_id = ?',
        courseId
      );
      if (marks && marks.n > 0) return fail('This course already has student marks; edit its CLOs in CLO/PLO Management instead of replacing them.');
      await run('UPDATE courses SET outline_text = ? WHERE id = ?', outline, courseId);
    } else {
      const f = await readCourseFields(fd);
      courseId = (await run(
        `INSERT INTO courses (program_id, teacher_id, code, title, credit_hours, lab_credit_hours, semester_label, start_date, total_weeks, lecture_days, lab_day, outline_text, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        f.program_id, user.role === 'teacher' ? user.id : num(fd, 'teacher_id') || user.id, f.code, f.title, f.credit_hours, f.lab_credit_hours,
        f.semester_label, f.start_date, f.total_weeks, f.lecture_days, f.lab_day, outline
      )).id;
    }
    const totalWeeks = (await get<{ total_weeks: number }>('SELECT total_weeks FROM courses WHERE id = ?', courseId))!.total_weeks;
    await replaceClos(courseId, clos.map((c) => ({ description: c.description, bloom_level: c.bloom_level as BloomLevel })), true);
    await replaceWeeklyPlan(
      courseId,
      plan.weekly_plan
        .filter((w) => w.week >= 1 && w.week <= totalWeeks)
        .map((w) => ({ ...w, clo_numbers: w.clo_numbers.filter((n) => n <= clos.length) }))
    );
    // CLOs saved from the reviewed plan count as teacher-approved
    if (fd.get('approve_clos') === 'on') await run('UPDATE clos SET approved = 1 WHERE course_id = ?', courseId);

    const savedClos = await all<{ id: number; number: number; description: string; bloom_level: BloomLevel }>(
      'SELECT id, number, description, bloom_level FROM clos WHERE course_id = ? ORDER BY number',
      courseId
    );
    const programId = (await get<{ program_id: number }>('SELECT program_id FROM courses WHERE id = ?', courseId))!.program_id;
    const plos = await all<{ id: number; number: number; title: string; description: string }>('SELECT * FROM plos WHERE program_id = ? ORDER BY number', programId);
    const { suggestions } = await suggestCloPloMappings(savedClos, plos);
    await tx(async () => {
      for (const s of suggestions) {
        await run('INSERT INTO clo_plo (clo_id, plo_id, weight, approved, ai_suggested, rationale) VALUES (?, ?, ?, 0, 1, ?) ON CONFLICT (clo_id, plo_id) DO UPDATE SET weight = excluded.weight, approved = excluded.approved, ai_suggested = excluded.ai_suggested, rationale = excluded.rationale', s.clo_id, s.plo_id, s.weight, s.rationale);
      }
    });
    await generateSchedule(courseId, readBlueprint(fd), true);
    return ok();
  });
  if (!res?.ok) return res;
  refreshAll();
  redirect(`/dashboard/courses/${courseId}?saved=1`);
}
