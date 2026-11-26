'use server';

import { redirect } from 'next/navigation';
import { get, run } from '@/lib/db';
import { createSession, destroySession, hashPassword, verifyPassword } from '@/lib/auth';
import { fail, str, type ActionResult } from './common';

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const user = await get<{ id: number; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.password_hash)) return fail('Invalid email or password.');
  await createSession(user.id);
  redirect('/dashboard');
}

export async function registerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const full_name = str(fd, 'full_name');
  const role = str(fd, 'role');
  const department = str(fd, 'department');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter a valid email address.');
  if (password.length < 6) return fail('Password must be at least 6 characters.');
  if (!full_name) return fail('Full name is required.');
  if (!['teacher', 'student'].includes(role)) {
    return fail('Choose Teacher or Student. HOD/Admin roles are granted by an administrator in Settings.');
  }
  if (await get('SELECT id FROM users WHERE email = ?', email)) return fail('An account with this email already exists.');
  const { id } = await run(
    'INSERT INTO users (email, password_hash, full_name, role, department) VALUES (?, ?, ?, ?, ?)',
    email,
    hashPassword(password),
    full_name,
    role,
    department || null
  );
  await createSession(id);
  redirect('/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
