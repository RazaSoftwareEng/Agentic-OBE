import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import type { User, UserRole } from './types';

export const SESSION_COOKIE = 'obe_session';
const SESSION_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expires),
  });
  // one-shot flag: the dashboard plays the "gate opening" welcome once, then clears it
  jar.set(WELCOME_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: 120 });
}

export const WELCOME_COOKIE = 'obe_welcome';

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run('DELETE FROM sessions WHERE token = ?', token);
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await get<User & { expires_at: number }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.department, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    token
  );
  if (!user || user.expires_at < Date.now()) return null;
  return { id: user.id, email: user.email, full_name: user.full_name, role: user.role, department: user.department };
}

/** Use in pages and server actions: redirects to /login when signed out. */
export async function requireUser(roles?: UserRole[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect('/dashboard');
  return user;
}

export const STAFF_ROLES: UserRole[] = ['admin', 'hod', 'teacher'];
