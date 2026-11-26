import { cookies } from 'next/headers';
import { AppShell } from '@/components/layout/app-shell';
import { Header } from '@/components/layout/header';
import { WelcomeGate } from '@/components/layout/welcome-gate';
import { requireUser, WELCOME_COOKIE } from '@/lib/auth';
import { getGeminiConfig, getSettings } from '@/lib/settings';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [gemini, settings, jar] = await Promise.all([getGeminiConfig(), getSettings(), cookies()]);
  const welcome = jar.get(WELCOME_COOKIE)?.value === '1';
  return (
    <>
      <AppShell role={user.role} header={<Header user={user} aiEngine={gemini ? 'gemini' : 'nlp'} />}>
        {children}
      </AppShell>
      {welcome && <WelcomeGate name={user.full_name} university={settings.university_name} />}
    </>
  );
}
