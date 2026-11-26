import Link from 'next/link';
import { RegisterForm } from '@/components/auth/register-form';
import { AuthLayout } from '@/components/auth/auth-layout';

export default function RegisterPage() {
  return (
    <AuthLayout title="Create your account" subtitle="Join Agentic OBE and start planning your courses with AI.">
      <div className="space-y-6">
        <RegisterForm />
        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
