'use server';

import { all, get, run, tx } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { suggestCloPloMappings } from '@/lib/ai';
import { analyzeClo } from '@/lib/ai/nlp';
import type { BloomLevel } from '@/lib/types';
import { fail, guard, num, ok, refreshAll, requireCourseEditor, str, type ActionResult } from './common';

const LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

async function requireCloEditor(cloId: number) {
  const clo = await get<{ course_id: number }>('SELECT course_id FROM clos WHERE id = ?', cloId);
  if (!clo) throw new Error('CLO not found.');
  await requireCourseEditor(clo.course_id);
  return clo.course_id;
}

export async function saveCloAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const description = str(fd, 'description');
    let level = str(fd, 'bloom_level');
    if (description.length < 10) return fail('Describe the CLO in a full sentence.');
    const analysis = analyzeClo(description);
    if (!LEVELS.includes(level)) level = analysis.level ?? 'C2';
    const approved = fd.get('approved') === 'on' ? 1 : 0;
    const cloId = num(fd, 'clo_id');
    if (cloId) {
      await requireCloEditor(cloId);
      await run('UPDATE clos SET description = ?, bloom_level = ?, approved = ? WHERE id = ?', description, level, approved, cloId);
    } else {
      const courseId = num(fd, 'course_id');
      await requireCourseEditor(courseId);
      const next = ((await get<{ n: number }>('SELECT COALESCE(MAX(number), 0) + 1 n FROM clos WHERE course_id = ?', courseId))?.n) ?? 1;
      await run('INSERT INTO clos (course_id, number, description, bloom_level, approved, ai_generated) VALUES (?, ?, ?, ?, 1, 0)', courseId, next, description, level);
    }
    refreshAll();
    const hint = analysis.issues.length ? ` NLP check: ${analysis.issues.join(' ')}` : '';
    return ok(`CLO saved.${hint}`);
  });
}

export async function deleteCloAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const cloId = num(fd, 'clo_id');
    const courseId = await requireCloEditor(cloId);
    await tx(async () => {
      await run('DELETE FROM clos WHERE id = ?', cloId);
      // renumber remaining CLOs and keep weekly-plan links consistent
      const rest = await all<{ id: number; number: number }>('SELECT id, number FROM clos WHERE course_id = ? ORDER BY number', courseId);
      const remap = new Map<number, number>();
      rest.forEach((c, i) => remap.set(c.number, i + 1));
      for (const [i, c] of rest.entries()) await run('UPDATE clos SET number = ? WHERE id = ?', i + 1, c.id);
      for (const w of await all<{ id: number; clo_numbers: string }>('SELECT id, clo_numbers FROM weekly_plans WHERE course_id = ?', courseId)) {
        const nums = (JSON.parse(w.clo_numbers) as number[]).map((n) => remap.get(n)).filter((n): n is number => !!n);
        await run('UPDATE weekly_plans SET clo_numbers = ? WHERE id = ?', JSON.stringify(nums), w.id);
      }
    });
    refreshAll();
    return ok('CLO deleted. Questions that measured it are now unmapped — re-map them in Assessments.');
  });
}

export async function approveAllClosAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const courseId = num(fd, 'course_id');
    await requireCourseEditor(courseId);
    await run('UPDATE clos SET approved = 1 WHERE course_id = ?', courseId);
    refreshAll();
    return ok('All CLOs approved.');
  });
}

/** Save the whole CLO×PLO matrix (cells named w_<cloId>_<ploId> with 0..3). */
export async function saveMatrixAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const courseId = num(fd, 'course_id');
    await requireCourseEditor(courseId);
    const approveAll = fd.get('approve') === 'on';
    const cloIds = new Set((await all<{ id: number }>('SELECT id FROM clos WHERE course_id = ?', courseId)).map((c) => c.id));
    let n = 0;
    await tx(async () => {
      for (const [key, value] of fd.entries()) {
        const m = /^w_(\d+)_(\d+)$/.exec(key);
        if (!m) continue;
        const cloId = Number(m[1]);
        const ploId = Number(m[2]);
        if (!cloIds.has(cloId)) continue;
        const w = Number(value);
        const existing = await get<{ weight: number; approved: number }>('SELECT weight, approved FROM clo_plo WHERE clo_id = ? AND plo_id = ?', cloId, ploId);
        if (!w) {
          if (existing) await run('DELETE FROM clo_plo WHERE clo_id = ? AND plo_id = ?', cloId, ploId);
          continue;
        }
        n++;
        if (existing) {
          const approved = approveAll || (existing.approved && existing.weight === w) ? 1 : existing.weight === w ? existing.approved : 1;
          await run('UPDATE clo_plo SET weight = ?, approved = ? WHERE clo_id = ? AND plo_id = ?', w, approved, cloId, ploId);
        } else {
          await run('INSERT INTO clo_plo (clo_id, plo_id, weight, approved, ai_suggested) VALUES (?, ?, ?, 1, 0)', cloId, ploId, w);
        }
      }
    });
    refreshAll();
    return ok(`Saved ${n} mapping(s)${approveAll ? ' and approved all of them' : ''}.`);
  });
}

export async function aiSuggestMappingsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const courseId = num(fd, 'course_id');
    await requireCourseEditor(courseId);
    const clos = await all<{ id: number; number: number; description: string; bloom_level: BloomLevel }>(
      'SELECT id, number, description, bloom_level FROM clos WHERE course_id = ? ORDER BY number',
      courseId
    );
    if (!clos.length) return fail('Add CLOs first.');
    const programId = (await get<{ program_id: number }>('SELECT program_id FROM courses WHERE id = ?', courseId))!.program_id;
    const plos = await all<{ id: number; number: number; title: string; description: string }>('SELECT * FROM plos WHERE program_id = ? ORDER BY number', programId);
    if (!plos.length) return fail('This program has no PLOs yet — add them below.');
    const { suggestions, engine, notes } = await suggestCloPloMappings(clos, plos);
    await tx(async () => {
      // keep approved mappings; replace unapproved ones with fresh suggestions
      await run('DELETE FROM clo_plo WHERE approved = 0 AND clo_id IN (SELECT id FROM clos WHERE course_id = ?)', courseId);
      for (const s of suggestions) {
        const ex = await get('SELECT 1 FROM clo_plo WHERE clo_id = ? AND plo_id = ?', s.clo_id, s.plo_id);
        if (!ex) await run('INSERT INTO clo_plo (clo_id, plo_id, weight, approved, ai_suggested, rationale) VALUES (?, ?, ?, 0, 1, ?)', s.clo_id, s.plo_id, s.weight, s.rationale);
      }
    });
    refreshAll();
    return ok(`${suggestions.length} suggestion(s) from the ${engine === 'gemini' ? 'Gemini LLM' : 'built-in NLP engine'} — review the highlighted cells, then Save & Approve.${notes ? ' ' + notes : ''}`);
  });
}

// ------------------------------ PLOs / programs ------------------------------

export async function savePloAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser(['admin', 'hod']);
    const title = str(fd, 'title');
    const description = str(fd, 'description');
    if (!title || !description) return fail('Title and description are required.');
    const ploId = num(fd, 'plo_id');
    if (ploId) await run('UPDATE plos SET title = ?, description = ? WHERE id = ?', title, description, ploId);
    else {
      const programId = num(fd, 'program_id');
      const next = (await get<{ n: number }>('SELECT COALESCE(MAX(number), 0) + 1 n FROM plos WHERE program_id = ?', programId))!.n;
      await run('INSERT INTO plos (program_id, number, title, description) VALUES (?, ?, ?, ?)', programId, next, title, description);
    }
    refreshAll();
    return ok('PLO saved.');
  });
}

export async function deletePloAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser(['admin', 'hod']);
    await run('DELETE FROM plos WHERE id = ?', num(fd, 'plo_id'));
    refreshAll();
    return ok('PLO deleted.');
  });
}

export async function createProgramAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser(STAFF_ROLES);
    if (user.role === 'teacher' && await get('SELECT id FROM programs LIMIT 1')) return fail('Only HOD/Admin can add programs.');
    const code = str(fd, 'code').toUpperCase();
    const name = str(fd, 'name');
    if (!code || !name) return fail('Program code and name are required.');
    if (await get('SELECT id FROM programs WHERE code = ?', code)) return fail('A program with this code exists.');
    const { id } = await run('INSERT INTO programs (name, code, department, accreditation_body) VALUES (?, ?, ?, ?)', name, code, str(fd, 'department') || null, str(fd, 'accreditation_body') || null);
    if (fd.get('standard_plos') === 'on') {
      const { STANDARD_PLOS } = await import('@/lib/constants');
      for (const p of STANDARD_PLOS) await run('INSERT INTO plos (program_id, number, title, description) VALUES (?, ?, ?, ?)', id, p.number, p.title, p.description);
    }
    refreshAll();
    return ok(`Program ${code} created.`);
  });
}
