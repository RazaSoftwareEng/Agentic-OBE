import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { canEditCourse } from '@/lib/queries';

export type ActionResult = { ok: boolean; message?: string } | null;

export const ok = (message?: string): ActionResult => ({ ok: true, message });
export const fail = (message: string): ActionResult => ({ ok: false, message });

export function refreshAll() {
  revalidatePath('/', 'layout');
}

/** Staff user who may edit the given course; throws a friendly error otherwise. */
export async function requireCourseEditor(courseId: number) {
  const user = await requireUser(STAFF_ROLES);
  if (!courseId || !await canEditCourse(user, courseId)) throw new Error('You do not have permission to edit this course.');
  return user;
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim();
}
export function num(fd: FormData, key: string, fallback = 0): number {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : fallback;
}

/** Wrap an action body so thrown errors become a friendly ActionResult. */
export async function guard(fn: () => Promise<ActionResult> | ActionResult): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    // let Next.js redirects/notFound propagate
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_')) throw e;
    return fail((e as Error).message || 'Something went wrong');
  }
}
