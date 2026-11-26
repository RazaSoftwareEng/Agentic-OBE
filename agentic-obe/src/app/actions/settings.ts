'use server';

import { get, run } from '@/lib/db';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { saveSettings } from '@/lib/settings';
import { fail, guard, num, ok, refreshAll, requireCourseEditor, str, type ActionResult } from './common';

export async function saveSettingsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser(['admin', 'hod']);
    const pct = (k: string) => Math.min(100, Math.max(0, num(fd, k)));
    await saveSettings({
      university_name: str(fd, 'university_name'),
      department_name: str(fd, 'department_name'),
      accreditation_body: str(fd, 'accreditation_body'),
      clo_threshold: pct('clo_threshold'),
      clo_target: pct('clo_target'),
      plo_target: pct('plo_target'),
    });
    refreshAll();
    return ok('Settings saved.');
  });
}

export async function saveAiSettingsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser(['admin', 'hod']);
    const key = str(fd, 'gemini_api_key');
    const values: Record<string, string> = { gemini_model: str(fd, 'gemini_model') || 'gemini-2.5-flash' };
    if (fd.get('clear_key') === 'on') values.gemini_api_key = '';
    else if (key) values.gemini_api_key = key;
    await saveSettings(values);
    refreshAll();
    return ok(values.gemini_api_key === '' ? 'API key removed — the built-in NLP engine will be used.' : 'AI settings saved.');
  });
}

export async function addHolidayAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser(STAFF_ROLES);
    const date = str(fd, 'date');
    const name = str(fd, 'name');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return fail('Date and name are required.');
    await run('INSERT INTO holidays (date, name) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET name = excluded.name', date, name);
    refreshAll();
    return ok('Holiday saved. Re-run the scheduler on affected courses to move sessions.');
  });
}

export async function deleteHolidayAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser(STAFF_ROLES);
    await run('DELETE FROM holidays WHERE id = ?', num(fd, 'id'));
    refreshAll();
    return ok('Holiday removed.');
  });
}

export async function setUserRoleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const me = await requireUser(['admin']);
    const id = num(fd, 'user_id');
    const role = str(fd, 'role');
    if (!['admin', 'hod', 'teacher', 'student'].includes(role)) return fail('Invalid role.');
    if (id === me.id && role !== 'admin') return fail('You cannot remove your own admin role.');
    if (!await get('SELECT id FROM users WHERE id = ?', id)) return fail('User not found.');
    await run('UPDATE users SET role = ? WHERE id = ?', role, id);
    refreshAll();
    return ok('Role updated.');
  });
}

export async function addCorrectiveActionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const courseId = num(fd, 'course_id');
    await requireCourseEditor(courseId);
    const note = str(fd, 'note');
    if (note.length < 5) return fail('Describe the corrective action.');
    await run('INSERT INTO actions_log (course_id, clo_id, note) VALUES (?, ?, ?)', courseId, num(fd, 'clo_id') || null, note);
    refreshAll();
    return ok('Corrective action recorded — it will appear in the CQI report.');
  });
}
