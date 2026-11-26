'use client';

import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, ChevronDown } from 'lucide-react';

export function CoursePicker({
  courses,
  current,
}: {
  courses: Array<{ id: number; code: string; title: string; semester_label: string }>;
  current: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (!courses.length) return null;
  return (
    <label className="relative flex w-full items-center sm:w-auto">
      <span className="sr-only">Course</span>
      <BookOpen className="pointer-events-none absolute left-3 h-4 w-4 text-indigo-500" />
      <select
        className="h-11 w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 sm:w-[340px]"
        value={current ?? ''}
        onChange={(e) => router.push(`${pathname}?course=${e.target.value}`)}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.title} ({c.semester_label})
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
    </label>
  );
}
