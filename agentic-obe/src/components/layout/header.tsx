import { LogOut, Sparkles, Cpu } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import type { User as AppUser } from '@/lib/types';
import { getInitials } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', hod: 'Head of Department', teacher: 'Teacher', student: 'Student' };

/** Header contents (the sticky bar itself is rendered by AppShell). */
export function Header({ user, aiEngine }: { user: AppUser; aiEngine: 'gemini' | 'nlp' }) {
  const initials = getInitials(user.full_name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, ''));
  return (
    <div className="flex flex-1 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-display text-base font-bold text-slate-900 sm:text-lg">OBE Academic Planning</p>
        <p className="hidden text-xs text-slate-500 sm:block">Plan · Map · Assess · Improve</p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {user.role !== 'student' && (
          <span
            className={`hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset md:inline-flex ${
              aiEngine === 'gemini' ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-slate-50 text-slate-600 ring-slate-200'
            }`}
            title="Engine used for AI suggestions"
          >
            {aiEngine === 'gemini' ? <Sparkles className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
            {aiEngine === 'gemini' ? 'Gemini LLM' : 'Built-in NLP'}
          </span>
        )}
        <div className="flex items-center gap-2.5 rounded-2xl p-1 sm:pr-3 sm:ring-1 sm:ring-slate-200">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white shadow-md shadow-indigo-500/25">
            {initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800">{user.full_name}</p>
            <p className="max-w-[180px] truncate text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button type="submit" title="Sign out" aria-label="Sign out" className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600">
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
