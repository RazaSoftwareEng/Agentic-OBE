import Link from 'next/link';
import { Users, Upload, Plus, Trash2, PenLine } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader, Textarea, th, td } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CoursePicker } from '@/components/course-picker';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { canEditCourse, listAssessments, listClos, listCourses, listMarks, listQuestions, listStudents, resolveCourse } from '@/lib/queries';
import { addStudentAction, deleteStudentAction, importMarksAction, importStudentsAction, saveMarksAction } from '@/app/actions/students';
import { cn } from '@/lib/utils';

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ course?: string; assessment?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const sp = await searchParams;
  const course = await resolveCourse(user, sp.course);
  if (!course) {
    return (
      <div className="space-y-8">
        <PageHeader icon={Users} tone="orange" title="Students & Marks" />
        <EmptyState icon={Users} title="No courses yet">Create a course first.</EmptyState>
      </div>
    );
  }
  const editable = await canEditCourse(user, course.id);
  const students = await listStudents(course.id);
  const assessments = await listAssessments(course.id);
  const questions = await listQuestions(course.id);
  const marks = await listMarks(course.id);
  const clos = await listClos(course.id);
  const markMap = new Map(marks.map((m) => [`${m.student_id}:${m.question_id}`, m.marks]));
  const selected = assessments.find((a) => a.id === Number(sp.assessment)) ?? assessments[0] ?? null;
  const qs = selected ? questions.filter((q) => q.assessment_id === selected.id) : [];
  const entered = (aid: number) => {
    const ids = new Set(questions.filter((q) => q.assessment_id === aid).map((q) => q.id));
    return marks.some((m) => ids.has(m.question_id));
  };

  return (
    <div className="space-y-8">
      <PageHeader icon={Users} tone="orange" title="Students & Marks" description="Enroll students and enter question-wise marks; attainment recalculates instantly.">
        <CoursePicker courses={await listCourses(user)} current={course.id} />
      </PageHeader>

      {/* ---------------- Marks entry ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PenLine className="h-5 w-5 text-indigo-600" /> Marks Entry</CardTitle>
          <CardDescription>Leave a cell empty if marks are not available yet; once an assessment has any marks, missing cells count as 0 (absent).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {assessments.map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/students?course=${course.id}&assessment=${a.id}`}
                className={cn('rounded-full border px-3 py-1 text-sm', selected?.id === a.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
              >
                {a.title} {entered(a.id) ? '✓' : ''}
              </Link>
            ))}
          </div>
          {!selected ? (
            <p className="text-sm text-slate-500">Create assessments first.</p>
          ) : !students.length ? (
            <p className="text-sm text-slate-500">Enroll students below to enter marks.</p>
          ) : !qs.length ? (
            <p className="text-sm text-slate-500">This assessment has no questions — add them in Assessments.</p>
          ) : (
            <>
              <ActionForm action={saveMarksAction} className="space-y-3">
                <input type="hidden" name="assessment_id" value={selected.id} />
                <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr>
                        <th className={th}>Roll no.</th>
                        <th className={th}>Name</th>
                        {qs.map((q) => (
                          <th key={q.id} className={`${th} text-center`} title={q.text ?? ''}>
                            Q{q.number} <span className="font-normal normal-case">/{q.max_marks}</span>
                            <span className="block font-normal normal-case text-slate-400">CLO {clos.find((c) => c.id === q.clo_id)?.number ?? '?'}</span>
                          </th>
                        ))}
                        <th className={`${th} text-center`}>Total /{qs.reduce((s, q) => s + q.max_marks, 0)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => {
                        const vals = qs.map((q) => markMap.get(`${s.id}:${q.id}`));
                        const total = vals.reduce<number>((t, v) => t + (typeof v === 'number' ? v : 0), 0);
                        return (
                          <tr key={s.id}>
                            <td className={`${td} whitespace-nowrap font-mono text-xs`}>{s.roll_no}</td>
                            <td className={`${td} whitespace-nowrap`}>{s.name}</td>
                            {qs.map((q, i) => (
                              <td key={q.id} className="px-1 py-1 text-center">
                                <input
                                  key={`${s.id}-${q.id}-${vals[i] ?? ''}`}
                                  name={`m_${s.id}_${q.id}`}
                                  type="number"
                                  step="0.25"
                                  min={0}
                                  max={q.max_marks}
                                  defaultValue={vals[i] ?? ''}
                                  disabled={!editable}
                                  aria-label={`${s.roll_no} Q${q.number}`}
                                  className="h-8 w-16 rounded border border-slate-200 px-1 text-center text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                            ))}
                            <td className={`${td} text-center font-medium`}>{vals.some((v) => typeof v === 'number') ? total : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {editable && <SubmitButton pendingText="Saving…">Save Marks — {selected.title}</SubmitButton>}
              </ActionForm>
              {editable && (
                <details className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Import marks from CSV / Excel paste</summary>
                  <ActionForm action={importMarksAction} className="mt-3 space-y-3">
                    <input type="hidden" name="assessment_id" value={selected.id} />
                    <p className="text-xs text-slate-500">Columns: <code>roll_no, {qs.map((q) => `q${q.number}`).join(', ')}</code> (header optional). Paste from Excel (tab-separated) works too.</p>
                    <input type="file" name="file" accept=".csv,.txt" className="text-sm" />
                    <Textarea name="csv" rows={4} placeholder={`roll_no,${qs.map((q) => `q${q.number}`).join(',')}\n${students[0]?.roll_no ?? '25-CS-001'},${qs.map((q) => Math.round(q.max_marks * 0.8)).join(',')}`} />
                    <SubmitButton size="sm" variant="outline" className="gap-1"><Upload className="h-4 w-4" /> Import Marks</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Enrollment ---------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-orange-600" /> Enrolled Students <Badge variant="outline">{students.length}</Badge></CardTitle>
            <CardDescription>A student account whose email matches sees its own results.</CardDescription>
          </CardHeader>
          <CardContent>
            {!students.length ? (
              <p className="text-sm text-slate-500">No students yet.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white"><tr><th className={th}>Roll no.</th><th className={th}>Name</th><th className={th}>Email</th>{editable && <th className={th}></th>}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((s) => (
                      <tr key={s.id}>
                        <td className={`${td} font-mono text-xs`}>{s.roll_no}</td>
                        <td className={td}>{s.name}</td>
                        <td className={`${td} text-slate-500`}>{s.email ?? '—'}</td>
                        {editable && (
                          <td className={td}>
                            <ActionForm action={deleteStudentAction} confirm={`Remove ${s.name} and their marks?`}>
                              <input type="hidden" name="student_id" value={s.id} />
                              <button type="submit" className="text-red-600 hover:text-red-800" aria-label={`Remove ${s.name}`}><Trash2 className="h-4 w-4" /></button>
                            </ActionForm>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        {editable && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Add Student</CardTitle></CardHeader>
              <CardContent>
                <ActionForm action={addStudentAction} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="course_id" value={course.id} />
                  <Input id="roll_no" name="roll_no" label="Roll number" placeholder="25-CS-101" required />
                  <Input id="name" name="name" label="Full name" required />
                  <Input id="email" name="email" type="email" label="Email (optional)" />
                  <SubmitButton size="sm">Enroll</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Bulk Import</CardTitle>
                <CardDescription>CSV columns: roll_no, name, email</CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={importStudentsAction} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="course_id" value={course.id} />
                  <input type="file" name="file" accept=".csv,.txt" className="text-sm" />
                  <Textarea name="csv" rows={4} placeholder={'roll_no,name,email\n25-CS-101,Ali Raza,ali@uni.edu'} />
                  <SubmitButton size="sm" variant="outline">Import</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
