import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { DemoAccounts } from '@/components/auth/demo-accounts';
import { AuthLayout } from '@/components/auth/auth-layout';
import { getCurrentUser } from '@/lib/auth';
import { isSeeded, seedDemo } from '@/lib/obe/seed';
import { isEphemeralDb } from '@/lib/db';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  // First run: create demo accounts and a fully worked demo course.
  if (!(await isSeeded())) await seedDemo();

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage your courses, outcomes and reports.">
      <div className="space-y-6">
        <LoginForm />
        <p className="text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-semibold text-indigo-600 hover:underline">Create one</Link>
        </p>
        {isEphemeralDb() && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Temporary database</p>
              <p className="mt-0.5 text-amber-800">
                This deployment has no DATABASE_URL, so data lives in /tmp and is lost when Vercel recycles the server. Add your Supabase connection string in
                Vercel → Settings → Environment Variables, then redeploy.
              </p>
            </div>
          </div>
        )}
        <DemoAccounts />
      </div>
    </AuthLayout>
  );
}
