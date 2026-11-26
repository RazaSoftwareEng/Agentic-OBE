'use client';

import { useActionState } from 'react';
import { ArrowRight } from 'lucide-react';
import { loginAction } from '@/app/actions/auth';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/action-form';

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <Input id="email" name="email" label="Email Address" type="email" placeholder="teacher@obe.edu" required autoComplete="email" />
      <Input id="password" name="password" label="Password" type="password" placeholder="••••••••" required autoComplete="current-password" />
      {state?.message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
      <SubmitButton className="w-full gap-2" pendingText="Signing in…">
        Sign In <ArrowRight className="h-4 w-4" />
      </SubmitButton>
    </form>
  );
}
