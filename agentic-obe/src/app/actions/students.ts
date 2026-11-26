'use server';

import { all, batch, get, run, type Statement } from '@/lib/db';
import { fail, guard, num, ok, refreshAll, requireCourseEditor, str, type ActionResult } from './common';

export async function addStudentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const courseId = num(fd, 'course_id');
    await requireCourseEditor(courseId);
    const roll = str(fd, 'roll_no');
    const name = str(fd, 'name');
    if (!roll || !name) return fail('Roll number and name are required.');
    if (await get('SELECT id FROM students WHERE course_id = ? AND roll_no = ?', courseId, roll)) return fail(`Roll number ${roll} is already enrolled.`);
    await run('INSERT INTO students (course_id, roll_no, name, email) VALUES (?, ?, ?, ?)', courseId, roll, name, str(fd, 'email').toLowerCase() || null);
    refreshAll();
    return ok(`${name} enrolled.`);
  });
}

export async function deleteStudentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = num(fd, 'student_id');
    const s = await get<{ course_id: number }>('SELECT course_id FROM students WHERE id = ?', id);
    if (!s) return fail('Student not found.');
    await requireCourseEditor(s.course_id);
    await run('DELETE FROM students WHERE id = ?', id);
    refreshAll();
    return ok('Student removed.');
  });
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => {
      const out: string[] = [];
      let cur = '';
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = !q;
        } else if ((ch === ',' || ch === '\t') && !q) {
          out.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    })
    .filter((r) => r.some((c) => c));
}

async function readCsvInput(fd: FormData): Promise<string> {
  const file = fd.get('file');
  if (file && typeof file === 'object' && 'text' in file && (file as File).size > 0) return (file as File).text();
  return str(fd, 'csv');
}

const UPSERT_MARK =
  'INSERT INTO marks (student_id, question_id, marks) VALUES (?, ?, ?) ON CONFLICT(student_id, question_id) DO UPDATE SET marks = excluded.marks';

/** CSV columns: roll_no, name, email (header row optional). */
export async function importStudentsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const courseId = num(fd, 'course_id');
    await requireCourseEditor(courseId);
    const rows = parseCsv(await readCsvInput(fd));
    if (rows.length && /roll/i.test(rows[0][0] ?? '')) rows.shift();
    const before = (await get<{ n: number }>('SELECT COUNT(*) n FROM students WHERE course_id = ?', courseId))!.n;
    const valid = rows.filter(([roll, name]) => roll && name);
    await batch(
      valid.map(([roll, name, email]): Statement => [
        'INSERT INTO students (course_id, roll_no, name, email) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [courseId, roll, name, email?.toLowerCase() || null],
      ])
    );
    const added = (await get<{ n: number }>('SELECT COUNT(*) n FROM students WHERE course_id = ?', courseId))!.n - before;
    const skipped = rows.length - added;
    refreshAll();
    return ok(`Imported ${added} student(s)${skipped ? `, skipped ${skipped} (duplicate or incomplete)` : ''}.`);
  });
}

/** Marks grid: fields m_<studentId>_<questionId>. Empty = not entered/absent. */
export async function saveMarksAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const aid = num(fd, 'assessment_id');
    const a = await get<{ course_id: number }>('SELECT course_id FROM assessments WHERE id = ?', aid);
    if (!a) return fail('Assessment not found.');
    await requireCourseEditor(a.course_id);
    const qMax = new Map((await all<{ id: number; max_marks: number }>('SELECT id, max_marks FROM questions WHERE assessment_id = ?', aid)).map((q) => [q.id, q.max_marks]));
    const studentIds = new Set((await all<{ id: number }>('SELECT id FROM students WHERE course_id = ?', a.course_id)).map((s) => s.id));
    const errors: string[] = [];
    const stmts: Statement[] = [];
    let saved = 0;
    for (const [key, raw] of fd.entries()) {
      const m = /^m_(\d+)_(\d+)$/.exec(key);
      if (!m) continue;
      const sid = Number(m[1]);
      const qid = Number(m[2]);
      if (!studentIds.has(sid) || !qMax.has(qid)) continue;
      const v = String(raw).trim();
      if (v === '') {
        stmts.push(['DELETE FROM marks WHERE student_id = ? AND question_id = ?', [sid, qid]]);
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > qMax.get(qid)!) {
        errors.push(v);
        continue;
      }
      stmts.push([UPSERT_MARK, [sid, qid, n]]);
      saved++;
    }
    await batch(stmts);
    refreshAll();
    if (errors.length) return fail(`Saved ${saved} mark(s); ${errors.length} value(s) were invalid or above the question maximum and were skipped.`);
    return ok(`Saved ${saved} mark(s). CLO/PLO attainment updated.`);
  });
}

/** CSV: roll_no, q1, q2, ... (header row optional). */
export async function importMarksAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const aid = num(fd, 'assessment_id');
    const a = await get<{ course_id: number }>('SELECT course_id FROM assessments WHERE id = ?', aid);
    if (!a) return fail('Assessment not found.');
    await requireCourseEditor(a.course_id);
    const qs = await all<{ id: number; max_marks: number }>('SELECT id, max_marks FROM questions WHERE assessment_id = ? ORDER BY number', aid);
    const rows = parseCsv(await readCsvInput(fd));
    if (rows.length && /roll/i.test(rows[0][0] ?? '')) rows.shift();
    const byRoll = new Map((await all<{ id: number; roll_no: string }>('SELECT id, roll_no FROM students WHERE course_id = ?', a.course_id)).map((s) => [s.roll_no.toLowerCase(), s.id]));
    let saved = 0;
    const unknown: string[] = [];
    const stmts: Statement[] = [];
    for (const [roll, ...vals] of rows) {
      const sid = byRoll.get((roll ?? '').toLowerCase());
      if (!sid) {
        if (roll) unknown.push(roll);
        continue;
      }
      qs.forEach((q, i) => {
        const v = Number(vals[i]);
        if (vals[i] === undefined || vals[i] === '' || !Number.isFinite(v)) return;
        stmts.push([UPSERT_MARK, [sid, q.id, Math.min(Math.max(v, 0), q.max_marks)]]);
        saved++;
      });
    }
    await batch(stmts);
    refreshAll();
    return ok(`Imported ${saved} mark(s).${unknown.length ? ` Unknown roll numbers: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}` : ''}`);
  });
}
