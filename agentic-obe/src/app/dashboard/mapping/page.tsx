import Link from 'next/link';
import { Info, Sparkles, Target, Trash2, Plus, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader, Select, Textarea, th } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { CoursePicker } from '@/components/course-picker';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { canEditCourse, listClos, listCourses, listMappings, listPlos, resolveCourse } from '@/lib/queries';
import { analyzeClo } from '@/lib/ai/nlp';
import { BLOOM_LEVELS } from '@/lib/constants';
import {
  aiSuggestMappingsAction, approveAllClosAction, deleteCloAction, deletePloAction, saveCloAction, saveMatrixAction, savePloAction,
} from '@/app/actions/mapping';

const W_LABEL: Record<number, string> = { 0: '–', 1: '1 Low', 2: '2 Med', 3: '3 High' };

export default async function MappingPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const course = await resolveCourse(user, (await searchParams).course);
  const courses = await listCourses(user);
  if (!course) {
    return (
      <div className="space-y-8">
        <PageHeader icon={Target} tone="purple" title="CLO/PLO Management" />
        <EmptyState icon={Target} title="No courses yet">Create a course with the <Link className="text-indigo-600 underline" href="/dashboard/planner">AI Course Planner</Link> first.</EmptyState>
      </div>
    );
  }
  const editable = await canEditCourse(user, course.id);
  const canEditPlos = user.role === 'admin' || user.role === 'hod';
  const clos = await listClos(course.id);
  const plos = await listPlos(course.program_id);
  const maps = await listMappings(course.id);
  const mapOf = (c: number, p: number) => maps.find((m) => m.clo_id === c && m.plo_id === p);
  const pending = maps.filter((m) => !m.approved).length;

  return (
    <div className="space-y-8">
      <PageHeader icon={Target} tone="purple" title="CLO/PLO Management" description="Define measurable CLOs, then map them to the program's PLOs with approved correlation weights.">
        <CoursePicker courses={courses} current={course.id} />
      </PageHeader>

      {/* ------------------------------ CLOs ------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Course Learning Outcomes — {course.code}</CardTitle>
              <CardDescription>Each CLO is checked by the NLP engine for a measurable Bloom&apos;s verb.</CardDescription>
            </div>
            {editable && clos.some((c) => !c.approved) && (
              <ActionForm action={approveAllClosAction} inlineMessage>
                <input type="hidden" name="course_id" value={course.id} />
                <SubmitButton size="sm" variant="outline" className="gap-1"><CheckCheck className="h-4 w-4" /> Approve all CLOs</SubmitButton>
              </ActionForm>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!clos.length && <p className="text-sm text-slate-500">No CLOs yet — add one below or generate them in the AI Course Planner.</p>}
          {clos.map((clo) => {
            const a = analyzeClo(clo.description);
            return (
              <div key={`${clo.id}-${clo.description}-${clo.bloom_level}-${clo.approved}`} className="rounded-lg border border-slate-200 p-3">
                <ActionForm action={saveCloAction} className="flex flex-wrap items-start gap-3">
                  <input type="hidden" name="clo_id" value={clo.id} />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-indigo-600">{clo.number}</div>
                  <div className="min-w-[280px] flex-1 space-y-1">
                    <Textarea name="description" defaultValue={clo.description} className="min-h-[56px]" disabled={!editable} />
                    <div className="flex flex-wrap gap-2 text-xs">
                      {clo.ai_generated ? <Badge variant="info">AI generated</Badge> : <Badge variant="outline">Teacher written</Badge>}
                      {clo.approved ? <Badge variant="success">Approved</Badge> : <Badge variant="warning">Pending review</Badge>}
                      {a.issues.map((i) => <span key={i} className="text-amber-700">⚠ {i}</span>)}
                      {a.level && a.level !== clo.bloom_level && <span className="text-amber-700">Verb &quot;{a.verb}&quot; suggests {a.level}.</span>}
                    </div>
                  </div>
                  <Select name="bloom_level" defaultValue={clo.bloom_level} className="w-40" disabled={!editable}>
                    {Object.entries(BLOOM_LEVELS).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}
                  </Select>
                  {editable && (
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" name="approved" defaultChecked={!!clo.approved} className="h-4 w-4" /> Approved</label>
                      <SubmitButton size="sm">Save</SubmitButton>
                    </div>
                  )}
                </ActionForm>
                {editable && (
                  <ActionForm action={deleteCloAction} confirm={`Delete CLO ${clo.number}? Its mappings are removed and questions become unmapped.`} className="mt-1 flex justify-end">
                    <input type="hidden" name="clo_id" value={clo.id} />
                    <button type="submit" className="flex items-center gap-1 text-xs text-red-600 hover:underline"><Trash2 className="h-3 w-3" /> Delete</button>
                  </ActionForm>
                )}
              </div>
            );
          })}
          {editable && (
            <ActionForm action={saveCloAction} resetOnSuccess className="flex flex-wrap items-start gap-3 rounded-lg border border-dashed border-slate-300 p-3">
              <input type="hidden" name="course_id" value={course.id} />
              <Plus className="mt-2 h-5 w-5 text-slate-400" />
              <Textarea name="description" placeholder="e.g. Analyze the time complexity of recursive algorithms using recurrence relations." className="min-h-[56px] min-w-[280px] flex-1" required />
              <Select name="bloom_level" defaultValue="" className="w-48">
                <option value="">Auto-detect level</option>
                {Object.entries(BLOOM_LEVELS).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}
              </Select>
              <SubmitButton size="sm">Add CLO</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------ Matrix ------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>CLO–PLO Mapping Matrix</CardTitle>
              <CardDescription>
                Weights: 3 = high, 2 = medium, 1 = low. <span className="rounded bg-amber-100 px-1">Amber cells</span> are AI suggestions awaiting approval (hover for the reason).
                Only approved mappings count toward PLO attainment.
              </CardDescription>
            </div>
            {editable && clos.length > 0 && plos.length > 0 && (
              <ActionForm action={aiSuggestMappingsAction} inlineMessage className="max-w-md">
                <input type="hidden" name="course_id" value={course.id} />
                <SubmitButton variant="outline" className="gap-2" pendingText="Thinking…"><Sparkles className="h-4 w-4 text-indigo-600" /> AI Suggest Mappings</SubmitButton>
              </ActionForm>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!clos.length || !plos.length ? (
            <p className="text-sm text-slate-500">{!plos.length ? 'This program has no PLOs yet — add them below.' : 'Add CLOs first.'}</p>
          ) : (
            <ActionForm action={saveMatrixAction} className="space-y-4">
              <input type="hidden" name="course_id" value={course.id} />
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={`${th} sticky left-0 bg-white`}>CLO</th>
                      {plos.map((p) => <th key={p.id} className={`${th} text-center`} title={`${p.title}: ${p.description}`}>PLO {p.number}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {clos.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="sticky left-0 bg-white px-3 py-2 text-sm font-medium text-slate-900" title={c.description}>CLO {c.number} <span className="text-xs text-slate-400">{c.bloom_level}</span></td>
                        {plos.map((p) => {
                          const m = mapOf(c.id, p.id);
                          return (
                            <td key={p.id} className={`px-1 py-1 text-center ${m && !m.approved ? 'bg-amber-100' : m ? 'bg-blue-50' : ''}`} title={m?.rationale ?? ''}>
                              <select
                                key={`${m?.weight ?? 0}-${m?.approved ?? 0}`}
                                name={`w_${c.id}_${p.id}`}
                                defaultValue={m?.weight ?? 0}
                                disabled={!editable}
                                aria-label={`CLO ${c.number} to PLO ${p.number} weight`}
                                className="h-8 rounded border border-slate-200 bg-transparent px-1 text-xs"
                              >
                                {[0, 1, 2, 3].map((w) => <option key={w} value={w}>{W_LABEL[w]}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200">
                      <td className="px-3 py-2 text-xs font-semibold text-slate-500">Σ weight</td>
                      {plos.map((p) => (
                        <td key={p.id} className="px-1 py-2 text-center text-xs text-slate-600">{maps.filter((m) => m.plo_id === p.id && m.approved).reduce((s, m) => s + m.weight, 0) || '–'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="approve" defaultChecked className="h-4 w-4" /> Approve all mappings as shown {pending > 0 && <Badge variant="warning">{pending} pending</Badge>}</label>
                  <SubmitButton>Save Matrix</SubmitButton>
                </div>
              )}
            </ActionForm>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------ PLOs ------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Program Learning Outcomes — {course.program_code}</CardTitle>
          <CardDescription>{canEditPlos ? 'As HOD/Admin you can edit the program PLOs.' : 'Defined by the HOD/Admin for the program.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {plos.map((p) =>
            canEditPlos ? (
              <div key={`${p.id}-${p.title}-${p.description}`} className="rounded-lg border border-slate-200 p-3">
                <ActionForm action={savePloAction} className="flex flex-wrap items-start gap-3">
                  <input type="hidden" name="plo_id" value={p.id} />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-600">{p.number}</div>
                  <Input name="title" defaultValue={p.title} className="w-56" />
                  <Textarea name="description" defaultValue={p.description} className="min-h-[40px] min-w-[260px] flex-1" />
                  <SubmitButton size="sm" variant="outline">Save</SubmitButton>
                </ActionForm>
                <ActionForm action={deletePloAction} confirm={`Delete PLO ${p.number}? All mappings to it are removed.`} className="flex justify-end">
                  <input type="hidden" name="plo_id" value={p.id} />
                  <button type="submit" className="flex items-center gap-1 text-xs text-red-600 hover:underline"><Trash2 className="h-3 w-3" /> Delete</button>
                </ActionForm>
              </div>
            ) : (
              <div key={p.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-600">{p.number}</div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>
                </div>
              </div>
            )
          )}
          {canEditPlos && (
            <ActionForm action={savePloAction} resetOnSuccess className="flex flex-wrap items-start gap-3 rounded-lg border border-dashed border-slate-300 p-3">
              <input type="hidden" name="program_id" value={course.program_id} />
              <Input name="title" placeholder="New PLO title" className="w-56" required />
              <Textarea name="description" placeholder="Description" className="min-h-[40px] min-w-[260px] flex-1" required />
              <SubmitButton size="sm">Add PLO</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Info className="h-5 w-5 text-indigo-600" /> Bloom&apos;s Revised Taxonomy Reference</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(BLOOM_LEVELS).map(([key, level]) => (
              <div key={key} className="rounded-lg border border-slate-200 p-3 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: level.color }}>{key}</div>
                <p className="text-sm font-medium text-slate-900">{level.label}</p>
                <p className="mt-1 text-xs text-slate-500">{level.verbs.slice(0, 4).join(', ')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
