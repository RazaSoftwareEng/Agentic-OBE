import Link from 'next/link';
import { CalendarDays, CheckCircle2, ListChecks, Pencil, Trash2, Wand2, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, Textarea, th, td } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CourseFields } from '@/components/course-fields';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { parseJson } from '@/lib/db';
import { canEditCourse, getCourseOr404, listAssessments, listClos, listPrograms, listSessions, listTeachers, listWeeklyPlan } from '@/lib/queries';
import { deleteCourseAction, regenerateScheduleAction, updateCourseAction, updateWeekAction } from '@/app/actions/course';
import { formatDate } from '@/lib/utils';

const KIND_STYLE: Record<string, string> = {
  lecture: 'bg-blue-50 text-blue-800 border-blue-100',
  lab: 'bg-teal-50 text-teal-800 border-teal-100',
  holiday: 'bg-slate-100 text-slate-500 border-slate-200 line-through',
  exam: 'bg-purple-50 text-purple-800 border-purple-100',
  assessment: 'bg-amber-50 text-amber-900 border-amber-100',
};

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const { saved } = await searchParams;
  const course = await getCourseOr404(user, Number(id));
  const editable = await canEditCourse(user, course.id);
  const clos = await listClos(course.id);
  const weeks = await listWeeklyPlan(course.id);
  const sessions = await listSessions(course.id);
  const assessments = await listAssessments(course.id);
  const lectureDays = parseJson<string[]>(course.lecture_days, []);
  const byWeek = new Map<number, typeof sessions>();
  for (const s of sessions) byWeek.set(s.week, [...(byWeek.get(s.week) ?? []), s]);
  const quizzes = assessments.filter((a) => a.type === 'quiz').length;
  const assigns = assessments.filter((a) => a.type === 'assignment').length;

  return (
    <div className="space-y-8">
      <PageHeader icon={BookOpen} tone="blue"
        title={`${course.code} — ${course.title}`}
        description={`${course.program_code} · ${course.semester_label} · ${course.credit_hours}+${course.lab_credit_hours} credit hours · ${lectureDays.join(' & ')}${course.lab_day ? ` · Lab ${course.lab_day}` : ''} · starts ${formatDate(course.start_date)}`}
      >
        <Badge variant={course.status === 'active' ? 'success' : 'outline'}>{course.status}</Badge>
        <Link href={`/dashboard/mapping?course=${course.id}`} className="text-sm font-medium text-indigo-600 hover:underline">CLO/PLO →</Link>
        <Link href={`/dashboard/assessments?course=${course.id}`} className="text-sm font-medium text-indigo-600 hover:underline">Assessments →</Link>
        <Link href={`/dashboard/analytics?course=${course.id}`} className="text-sm font-medium text-indigo-600 hover:underline">Analytics →</Link>
      </PageHeader>

      {saved && (
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Plan saved and scheduled.</p>
            <p>Next: review the AI-suggested CLO→PLO mappings in <Link className="underline" href={`/dashboard/mapping?course=${course.id}`}>CLO/PLO Management</Link> and approve them, then enroll students.</p>
          </div>
        </div>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-indigo-600" /> Constraint-Based Scheduler</CardTitle>
            <CardDescription>
              Builds the day-by-day lecture/lab plan (skipping holidays) and places assessments: none in exam weeks, max one per week, ≥2 weeks between
              the same type, and each assessment only covers CLOs already taught.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={regenerateScheduleAction} className="space-y-4">
              <input type="hidden" name="course_id" value={course.id} />
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Input id="quizzes" name="quizzes" type="number" min={0} max={8} label="Quizzes" defaultValue={quizzes || 4} />
                <Input id="assignments" name="assignments" type="number" min={0} max={8} label="Assignments" defaultValue={assigns || 3} />
                <label className="flex items-center gap-2 pt-6 text-sm text-slate-700"><input type="checkbox" name="project" defaultChecked={assessments.some((a) => a.type === 'project') || !assessments.length} className="h-4 w-4" /> Semester project</label>
                <label className="flex items-center gap-2 pt-6 text-sm text-slate-700"><input type="checkbox" name="lab_exam" defaultChecked={!!course.lab_day} className="h-4 w-4" /> Lab exam</label>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="checkbox" name="replace_assessments" defaultChecked={!assessments.length} className="h-4 w-4" /> Also regenerate assessments (replaces existing ones)</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" className="h-4 w-4" /> I understand existing marks will be deleted</label>
              </div>
              <SubmitButton className="gap-2" pendingText="Scheduling…"><CalendarDays className="h-4 w-4" /> Run Scheduler</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-purple-600" /> Weekly Plan</CardTitle>
          <CardDescription>Topics per week and the CLOs each week contributes to. {editable && 'Click a week to edit it.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!weeks.length && <p className="text-sm text-slate-500">No weekly plan yet. Use the <Link className="text-indigo-600 underline" href="/dashboard/planner">AI Course Planner</Link> to generate one from the course outline.</p>}
          {weeks.map((w) => {
            const subs = parseJson<string[]>(w.subtopics, []);
            const wc = parseJson<number[]>(w.clo_numbers, []);
            return (
              <details key={w.id} className="group rounded-lg border border-slate-200">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-3 hover:bg-slate-50">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{w.week}</span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{w.topic}</p>
                    {subs.length > 0 && <p className="text-xs text-slate-500">{subs.join(' · ')}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">{wc.map((n) => <Badge key={n}>CLO {n}</Badge>)}</div>
                  {editable && <Pencil className="mt-1 h-4 w-4 text-slate-400" />}
                </summary>
                {editable && (
                  <ActionForm action={updateWeekAction} className="space-y-3 border-t border-slate-100 p-3">
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="week" value={w.week} />
                    <Input name="topic" id={`topic_${w.id}`} label="Topic" defaultValue={w.topic} required />
                    <Textarea name="subtopics" defaultValue={subs.join('\n')} placeholder="One subtopic per line" rows={3} />
                    <div className="flex flex-wrap gap-3 text-sm">
                      {clos.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5" title={c.description}>
                          <input type="checkbox" name="clo_numbers" value={c.number} defaultChecked={wc.includes(c.number)} className="h-4 w-4" /> CLO {c.number}
                        </label>
                      ))}
                    </div>
                    <SubmitButton size="sm">Save Week {w.week}</SubmitButton>
                  </ActionForm>
                )}
              </details>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-teal-600" /> Daily Teaching Schedule</CardTitle>
          <CardDescription>Generated day-by-day plan: lectures, labs, holidays, exams and assessments</CardDescription>
        </CardHeader>
        <CardContent>
          {!sessions.length ? (
            <p className="text-sm text-slate-500">Run the scheduler to generate the daily plan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200"><tr><th className={th}>Week</th><th className={th}>Sessions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, list]) => (
                    <tr key={week}>
                      <td className={`${td} w-16 font-semibold`}>{week}</td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-2">
                          {list.map((s) => (
                            <div key={s.id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${KIND_STYLE[s.kind] ?? ''}`} title={s.details ?? ''}>
                              <span className="font-semibold">{formatDate(s.date)}</span> · {s.title}
                              {s.details && s.kind !== 'holiday' && <span className="block max-w-xs truncate opacity-80">{s.details}</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editable && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-slate-600" /> Edit Course Details</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={updateCourseAction} className="space-y-4">
                <input type="hidden" name="course_id" value={course.id} />
                <CourseFields
                  programs={await listPrograms()}
                  teachers={user.role === 'teacher' ? undefined : await listTeachers()}
                  showStatus
                  defaults={{ ...course, lecture_days: lectureDays }}
                />
                <SubmitButton>Save Course</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700"><Trash2 className="h-5 w-5" /> Delete Course</CardTitle>
              <CardDescription>Removes the course with its CLOs, plan, assessments, students and marks. This cannot be undone.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={deleteCourseAction} className="space-y-3">
                <input type="hidden" name="course_id" value={course.id} />
                <Input id="confirm" name="confirm" label='Type "DELETE" to confirm' autoComplete="off" />
                <SubmitButton variant="destructive">Delete Course</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
