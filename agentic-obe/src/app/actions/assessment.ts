'use server';

import { all, batch, get, run, tx, type Statement } from '@/lib/db';
import { splitMarks } from '@/lib/obe/service';
import { fail, guard, num, ok, refreshAll, requireCourseEditor, str, type ActionResult } from './common';

const TYPES = ['quiz', 'assignment', 'midterm', 'final_exam', 'lab', 'project', 'presentation', 'viva'];

async function requireAssessmentEditor(assessmentId: number) {
  const a = await get<{ course_id: number }>('SELECT course_id FROM assessments WHERE id = ?', assessmentId);
  if (!a) throw new Error('Assessment not found.');
  await requireCourseEditor(a.course_id);
  return a.course_id;
}

export async function saveAssessmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const title = str(fd, 'title');
    const type = str(fd, 'type');
    const total = num(fd, 'total_marks');
    const weight = num(fd, 'weight');
    const week = num(fd, 'week') || null;
    const date = str(fd, 'date') || null;
    if (!title) return fail('Title is required.');
    if (!TYPES.includes(type)) return fail('Choose a type.');
    if (total <= 0) return fail('Total marks must be positive.');
    if (weight < 0 || weight > 100) return fail('Weight must be between 0 and 100.');
    const formative = ['midterm', 'final_exam'].includes(type) ? 0 : 1;
    const id = num(fd, 'assessment_id');
    if (id) {
      await requireAssessmentEditor(id);
      await run('UPDATE assessments SET title=?, type=?, total_marks=?, weight=?, week=?, date=?, is_formative=? WHERE id=?', title, type, total, weight, week, date, formative, id);
    } else {
      const courseId = num(fd, 'course_id');
      await requireCourseEditor(courseId);
      const cloIds = fd.getAll('clo_ids').map(Number).filter(Boolean);
      await tx(async () => {
        const { id: aid } = await run(
          'INSERT INTO assessments (course_id, title, type, total_marks, weight, week, date, is_formative) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          courseId, title, type, total, weight, week, date, formative
        );
        const n = Math.max(1, cloIds.length);
        await batch(
          splitMarks(total, n).map((m, i): Statement => [
            'INSERT INTO questions (assessment_id, number, text, max_marks, clo_id) VALUES (?, ?, ?, ?, ?)',
            [aid, i + 1, `Question ${i + 1}`, m, cloIds[i] ?? null],
          ])
        );
      });
    }
    refreshAll();
    return ok('Assessment saved.');
  });
}

export async function deleteAssessmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = num(fd, 'assessment_id');
    await requireAssessmentEditor(id);
    await run('DELETE FROM assessments WHERE id = ?', id);
    refreshAll();
    return ok('Assessment deleted.');
  });
}

/** Save all questions of an assessment at once: q_<id>_text / _marks / _clo, plus optional new_* row. */
export async function saveQuestionsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const aid = num(fd, 'assessment_id');
    const courseId = await requireAssessmentEditor(aid);
    const cloIds = new Set((await all<{ id: number }>('SELECT id FROM clos WHERE course_id = ?', courseId)).map((c) => c.id));
    const qs = await all<{ id: number }>('SELECT id FROM questions WHERE assessment_id = ? ORDER BY number', aid);
    await tx(async () => {
      for (const q of qs) {
        if (fd.get(`q_${q.id}_delete`) === 'on') {
          await run('DELETE FROM questions WHERE id = ?', q.id);
          continue;
        }
        const clo = num(fd, `q_${q.id}_clo`);
        const marks = num(fd, `q_${q.id}_marks`);
        if (marks <= 0) throw new Error('Question marks must be positive.');
        await run('UPDATE questions SET text = ?, max_marks = ?, clo_id = ? WHERE id = ?', str(fd, `q_${q.id}_text`) || null, marks, cloIds.has(clo) ? clo : null, q.id);
      }
      const newMarks = num(fd, 'new_marks');
      if (newMarks > 0) {
        const clo = num(fd, 'new_clo');
        const next = (await get<{ n: number }>('SELECT COALESCE(MAX(number), 0) + 1 n FROM questions WHERE assessment_id = ?', aid))!.n;
        await run('INSERT INTO questions (assessment_id, number, text, max_marks, clo_id) VALUES (?, ?, ?, ?, ?)', aid, next, str(fd, 'new_text') || `Question ${next}`, newMarks, cloIds.has(clo) ? clo : null);
      }
      // renumber
      const ordered = await all<{ id: number }>('SELECT id FROM questions WHERE assessment_id = ? ORDER BY number, id', aid);
      await batch(ordered.map((q, i): Statement => ['UPDATE questions SET number = ? WHERE id = ?', [i + 1, q.id]]));
      if (fd.get('sync_total') === 'on') {
        await run('UPDATE assessments SET total_marks = (SELECT COALESCE(SUM(max_marks), 0) FROM questions WHERE assessment_id = ?) WHERE id = ?', aid, aid);
      }
    });
    const sum = (await get<{ s: number }>('SELECT COALESCE(SUM(max_marks), 0) s FROM questions WHERE assessment_id = ?', aid))!.s;
    const total = (await get<{ total_marks: number }>('SELECT total_marks FROM assessments WHERE id = ?', aid))!.total_marks;
    refreshAll();
    return ok(Math.abs(sum - total) > 0.01 ? `Saved. Note: question marks add up to ${sum} but the total is ${total}.` : 'Questions saved.');
  });
}
