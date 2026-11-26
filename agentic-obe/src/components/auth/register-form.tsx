'use client';

import { useActionState } from 'react';
import { ArrowRight } from 'lucide-react';
import { registerAction } from '@/app/actions/auth';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/action-form';
import { Label, Select } from '@/components/ui/field';

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, null);
  return (
    <form action={action} className="space-y-4">
      <Input id="full_name" name="full_name" label="Full Name" placeholder="Dr. Ahmed Khan" required />
      <Input id="email" name="email" label="Email Address" type="email" placeholder="you@university.edu" required />
      <Input id="password" name="password" label="Password (min 6 characters)" type="password" required minLength={6} />
      <div className="space-y-1">
        <Label htmlFor="role">Role</Label>
        <Select id="role" name="role" defaultValue="teacher">
          <option value="teacher">Teacher / Instructor</option>
          <option value="student">Student</option>
        </Select>
        <p className="text-xs text-slate-500">Students see results for courses where their email is enrolled. HOD/Admin roles are granted by an administrator.</p>
      </div>
      <Input id="department" name="department" label="Department" placeholder="Computer Science" />
      {state?.message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <SubmitButton className="w-full gap-2" pendingText="Creating account…">
        Create Account <ArrowRight className="h-4 w-4" />
      </SubmitButton>
    </form>
  );
}
