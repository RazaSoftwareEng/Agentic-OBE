import Link from 'next/link';
import { ClipboardCheck, Plus, Trash2, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, Label, PageHeader, Select, fieldClass, th, td } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CoursePicker } from '@/components/course-picker';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { canEditCourse, listAssessments, listClos, listCourses, listQuestions, resolveCourse } from '@/lib/queries';
import { ASSESSMENT_TYPES } from '@/lib/constants';
import { deleteAssessmentAction, saveAssessmentAction, saveQuestionsAction } from '@/app/actions/assessment';
import { formatDate, cn } from '@/lib/utils';
import type { Assessment } from '@/lib/types';

function AssessmentFields({ a }: { a?: Assessment }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      <div className="col-span-2"><Input name="title" id={`t_${a?.id ?? 'new'}`} label="Title" defaultValue={a?.title} required /></div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select name="type" defaultValue={a?.type ?? 'quiz'}>
          {Object.entries(ASSESSMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <Input name="total_marks" id={`m_${a?.id ?? 'new'}`} type="number" step="0.5" min={0.5} label="Total marks" defaultValue={a?.total_marks ?? 10} required />
      <Input name="weight" id={`w_${a?.id ?? 'new'}`} type="number" step="0.5" min={0} max={100} label="Weight %" defaultValue={a?.weight ?? 5} required />
      <Input name="week" id={`wk_${a?.id ?? 'new'}`} type="number" min={1} max={20} label="Week" defaultValue={a?.week ?? undefined} />
      <Input name="date" id={`d_${a?.id ?? 'new'}`} type="date" label="Date" defaultValue={a?.date ?? undefined} />
    </div>
  );
}

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const course = await resolveCourse(user, (await searchParams).course);
  if (!course) {
    return (
      <div className="space-y-8">
        <PageHeader icon={ClipboardCheck} tone="green" title="Assessment Mapping" />
        <EmptyState icon={ClipboardCheck} title="No courses yet">Create a course first.</EmptyState>
      </div>
    );
  }
  const editable = await canEditCourse(user, course.id);
  const clos = await listClos(course.id);
  const assessments = await listAssessments(course.id);
  const questions = await listQuestions(course.id);
  const totalWeight = assessments.reduce((s, a) => s + a.weight, 0);
  const cloMarks = (aid: number, cid: number) => questions.filter((q) => q.assessment_id === aid && q.clo_id === cid).reduce((s, q) => s + q.max_marks, 0);
  const cloTotal = (cid: number) => questions.filter((q) => q.clo_id === cid).reduce((s, q) => s + q.max_marks, 0);
  const grand = questions.reduce((s, q) => s + q.max_marks, 0);

  return (
    <div className="space-y-8">
      <PageHeader icon={ClipboardCheck} tone="green" title="Assessment Mapping" description="Every assessment question is linked to the CLO it measures — this drives CLO/PLO attainment.">
        <CoursePicker courses={await listCourses(user)} current={course.id} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={Math.abs(totalWeight - 100) < 0.5 ? 'success' : 'warning'}>Total weight {Math.round(totalWeight * 100) / 100}%</Badge>
        <Badge variant="outline">{assessments.length} assessments · {questions.length} questions</Badge>
        {questions.some((q) => !q.clo_id) && <Badge variant="danger">{questions.filter((q) => !q.clo_id).length} unmapped question(s)</Badge>}
        <Link href={`/dashboard/courses/${course.id}`} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"><CalendarDays className="h-4 w-4" /> Auto-schedule with the constraint scheduler</Link>
      </div>

      {assessments.length > 0 && clos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assessment × CLO Coverage (marks)</CardTitle>
            <CardDescription>How many marks each assessment devotes to each CLO. Empty columns mean a CLO is not measured.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Assessment</th><th className={th}>Week · Date</th><th className={th}>Weight</th>
                  {clos.map((c) => <th key={c.id} className={`${th} text-center`} title={c.description}>CLO {c.number}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td className={td}>{a.title}</td>
                    <td className={td}>{a.week ? `W${a.week}` : '—'}{a.date ? ` · ${formatDate(a.date)}` : ''}</td>
                    <td className={td}>{a.weight}%</td>
                    {clos.map((c) => {
                      const m = cloMarks(a.id, c.id);
                      return <td key={c.id} className={cn(td, 'text-center', m ? 'font-medium text-slate-900' : 'text-slate-300')}>{m || '·'}</td>;
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className={`${td} font-semibold`} colSpan={3}>Share of all marks</td>
                  {clos.map((c) => <td key={c.id} className={`${td} text-center font-semibold`}>{grand ? Math.round((cloTotal(c.id) / grand) * 100) : 0}%</td>)}
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {!assessments.length && <EmptyState icon={ClipboardCheck} title="No assessments yet">Run the scheduler on the course page, or create one below.</EmptyState>}
        {assessments.map((a) => {
          const qs = questions.filter((q) => q.assessment_id === a.id);
          const sum = qs.reduce((s, q) => s + q.max_marks, 0);
          return (
            <details key={a.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 hover:bg-slate-50">
                <Badge variant={a.is_formative ? 'default' : 'info'}>{ASSESSMENT_TYPES[a.type]?.label ?? a.type}</Badge>
                <span className="font-semibold text-slate-900">{a.title}</span>
                <span className="text-sm text-slate-500">{a.week ? `Week ${a.week}` : ''}{a.date ? ` · ${formatDate(a.date)}` : ''} · {a.total_marks} marks · {a.weight}%</span>
                <span className="ml-auto flex flex-wrap gap-1">
                  {[...new Set(qs.map((q) => clos.find((c) => c.id === q.clo_id)?.number).filter(Boolean))].map((n) => <Badge key={n} variant="outline">CLO {n}</Badge>)}
                  {Math.abs(sum - a.total_marks) > 0.01 && <Badge variant="warning">Σ questions {sum}</Badge>}
                </span>
              </summary>
              <div className="space-y-5 border-t border-slate-100 p-4">
                <ActionForm action={saveQuestionsAction} className="space-y-3">
                  <input type="hidden" name="assessment_id" value={a.id} />
                  <table className="w-full">
                    <thead className="border-b border-slate-200"><tr><th className={th}>#</th><th className={th}>Question / description</th><th className={th}>Max marks</th><th className={th}>Measures CLO</th>{editable && <th className={th}>Remove</th>}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {qs.map((q) => (
                        <tr key={`${q.id}-${q.max_marks}-${q.clo_id}-${q.text}`}>
                          <td className={td}>{q.number}</td>
                          <td className={td}><input name={`q_${q.id}_text`} defaultValue={q.text ?? ''} className={cn(fieldClass, 'h-9')} disabled={!editable} /></td>
                          <td className={td}><input name={`q_${q.id}_marks`} type="number" step="0.5" min={0.5} defaultValue={q.max_marks} className={cn(fieldClass, 'h-9 w-24')} disabled={!editable} /></td>
                          <td className={td}>
                            <select name={`q_${q.id}_clo`} defaultValue={q.clo_id ?? ''} className={cn(fieldClass, 'h-9 w-48', !q.clo_id && 'border-red-300')} disabled={!editable}>
                              <option value="">— unmapped —</option>
                              {clos.map((c) => <option key={c.id} value={c.id}>CLO {c.number} ({c.bloom_level})</option>)}
                            </select>
                          </td>
                          {editable && <td className={td}><input type="checkbox" name={`q_${q.id}_delete`} className="h-4 w-4" aria-label="Remove question" /></td>}
                        </tr>
                      ))}
                      {editable && (
                        <tr className="bg-slate-50/60">
                          <td className={td}><Plus className="h-4 w-4 text-slate-400" /></td>
                          <td className={td}><input name="new_text" placeholder="New question (optional)" className={cn(fieldClass, 'h-9')} /></td>
                          <td className={td}><input name="new_marks" type="number" step="0.5" min={0} placeholder="marks" className={cn(fieldClass, 'h-9 w-24')} /></td>
                          <td className={td}>
                            <select name="new_clo" defaultValue="" className={cn(fieldClass, 'h-9 w-48')}>
                              <option value="">— CLO —</option>
                              {clos.map((c) => <option key={c.id} value={c.id}>CLO {c.number} ({c.bloom_level})</option>)}
                            </select>
                          </td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {editable && (
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="sync_total" className="h-4 w-4" /> Set total marks = sum of questions</label>
                      <SubmitButton size="sm">Save Questions</SubmitButton>
                      <Link href={`/dashboard/students?course=${course.id}&assessment=${a.id}`} className="text-sm font-medium text-indigo-600 hover:underline">Enter marks →</Link>
                    </div>
                  )}
                </ActionForm>
                {editable && (
                  <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
                    <ActionForm action={saveAssessmentAction} className="flex-1 space-y-3">
                      <input type="hidden" name="assessment_id" value={a.id} />
                      <AssessmentFields a={a} />
                      <SubmitButton size="sm" variant="outline">Save Details</SubmitButton>
                    </ActionForm>
                    <ActionForm action={deleteAssessmentAction} confirm={`Delete ${a.title} and all its marks?`}>
                      <input type="hidden" name="assessment_id" value={a.id} />
                      <SubmitButton size="sm" variant="ghost" className="gap-1 text-red-600"><Trash2 className="h-4 w-4" /> Delete</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-green-600" /> Create Assessment</CardTitle>
            <CardDescription>Marks are split into one question per selected CLO; refine the questions afterwards.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveAssessmentAction} resetOnSuccess className="space-y-4">
              <input type="hidden" name="course_id" value={course.id} />
              <AssessmentFields />
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="font-medium text-slate-700">Measures:</span>
                {clos.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5" title={c.description}>
                    <input type="checkbox" name="clo_ids" value={c.id} className="h-4 w-4" /> CLO {c.number}
                  </label>
                ))}
              </div>
              <SubmitButton>Create Assessment</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
