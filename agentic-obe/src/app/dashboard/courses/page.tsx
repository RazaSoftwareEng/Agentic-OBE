import Link from 'next/link';
import { BookOpen, Plus, Brain, CalendarDays, UserRound, Target, ClipboardCheck, Users, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CourseFields } from '@/components/course-fields';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { all } from '@/lib/db';
import { listCourses, listPrograms, listTeachers } from '@/lib/queries';
import { createCourseAction } from '@/app/actions/course';
import { ProgramForm } from './program-form';

export default async function CoursesPage() {
  const user = await requireUser(STAFF_ROLES);
  const courses = await listCourses(user);
  const programs = await listPrograms();
  const counts = new Map(
    (await all<{ course_id: number; clos: number; students: number; assessments: number }>(
      `SELECT c.id course_id,
        (SELECT COUNT(*) FROM clos WHERE course_id = c.id) clos,
        (SELECT COUNT(*) FROM students WHERE course_id = c.id) students,
        (SELECT COUNT(*) FROM assessments WHERE course_id = c.id) assessments
       FROM courses c`
    )).map((r) => [r.course_id, r])
  );

  return (
    <div className="space-y-8">
      <PageHeader icon={BookOpen} tone="blue" title="Courses & Schedule" description="Course offerings, weekly/daily plans and semester schedules">
        <Link href="/dashboard/planner"><Button className="gap-2"><Brain className="h-4 w-4" /> Create with AI Planner</Button></Link>
      </PageHeader>

      {courses.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {courses.map((c, i) => {
            const n = counts.get(c.id);
            const status = c.status === 'active' ? 'success' : c.status === 'completed' ? 'outline' : 'warning';
            return (
              <Link
                key={c.id}
                href={`/dashboard/courses/${c.id}`}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-fade-up group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-6px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_16px_36px_-14px_rgba(79,70,229,0.35)]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400 opacity-80" />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-sky-50 text-indigo-600 ring-1 ring-indigo-100">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-indigo-600">{c.code} · {c.program_code}</p>
                      <h3 className="mt-0.5 font-display text-base font-bold leading-snug text-slate-900 group-hover:text-indigo-700">{c.title}</h3>
                    </div>
                  </div>
                  <Badge variant={status} dot className="capitalize">{c.status}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />{c.semester_label}</span>
                  <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4 text-slate-400" />{c.teacher_name ?? 'Unassigned'}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                  {[
                    { label: 'CLOs', value: n?.clos ?? 0, icon: Target, color: 'text-violet-600 bg-violet-50' },
                    { label: 'Assessments', value: n?.assessments ?? 0, icon: ClipboardCheck, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Students', value: n?.students ?? 0, icon: Users, color: 'text-orange-600 bg-orange-50' },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.color}`}><m.icon className="h-4 w-4" /></span>
                      <div className="leading-tight">
                        <p className="font-display text-base font-bold text-slate-900">{m.value}</p>
                        <p className="text-[11px] text-slate-500">{m.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                  Open course <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title="No courses yet">Create one below, or let the AI Course Planner build it from an outline.</EmptyState>
      )}

      {programs.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-indigo-600" /> Add Course Manually</CardTitle>
            <CardDescription>You can add CLOs and a weekly plan afterwards, or use the AI Planner on this course later.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createCourseAction} className="space-y-4">
              <CourseFields programs={programs} teachers={user.role === 'teacher' ? undefined : await listTeachers()} defaults={{ teacher_id: user.id }} />
              <SubmitButton pendingText="Creating…">Create Course</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {(user.role !== 'teacher' || !programs.length) && <ProgramForm firstProgram={!programs.length} />}
    </div>
  );
}
