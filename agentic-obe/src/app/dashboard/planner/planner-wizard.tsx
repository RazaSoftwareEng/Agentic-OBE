'use client';

import { useActionState, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, FileText, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, Select, Textarea, fieldClass, th, td } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/action-form';
import { CourseFields } from '@/components/course-fields';
import { analyzeClo } from '@/lib/ai/nlp';
import { BLOOM_LEVELS } from '@/lib/constants';
import { savePlanAction } from '@/app/actions/course';
import type { BloomLevel, ExtractedPlan } from '@/lib/types';
import { cn } from '@/lib/utils';

type CourseOpt = { id: number; label: string; total_weeks: number; has_lab: boolean; outline: string; lecture_days: string[] };

const SAMPLE = `Course Code: CS-341
Course Title: Database Systems
Credit Hours: 4 (3,1)

Course Contents:
1. Introduction to databases: file systems vs DBMS, database users, architecture
2. Entity-Relationship modeling: entities, attributes, relationships, ER diagrams
3. Relational model: keys, integrity constraints, relational algebra
4. SQL: DDL, DML, joins, subqueries, views
5. Normalization: functional dependencies, 1NF, 2NF, 3NF, BCNF
6. Transactions: ACID properties, concurrency control, locking
7. Indexing and hashing: B+ trees, hash indexes, query optimization
8. Database security and recovery: authorization, backups, logging
9. NoSQL databases: document stores, key-value stores, CAP theorem`;

export function PlannerWizard({
  programs,
  teachers,
  courses,
  initialCourseId,
  engine,
  userId,
}: {
  programs: Array<{ id: number; code: string; name: string }>;
  teachers?: Array<{ id: number; full_name: string }>;
  courses: CourseOpt[];
  initialCourseId: number | null;
  engine: 'gemini' | 'nlp';
  userId: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(savePlanAction, null);
  const [step, setStep] = useState<'input' | 'processing' | 'review'>('input');
  const [target, setTarget] = useState<number | 'new'>(courses.some((c) => c.id === initialCourseId) ? initialCourseId! : 'new');
  const [text, setText] = useState(courses.find((c) => c.id === initialCourseId)?.outline ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ExtractedPlan | null>(null);
  const [outline, setOutline] = useState('');
  const [dragging, setDragging] = useState(false);
  const existing = target === 'new' ? null : courses.find((c) => c.id === target) ?? null;

  async function extract() {
    setError(null);
    const fd = new FormData();
    const form = formRef.current ? new FormData(formRef.current) : new FormData();
    let weeks = Number(form.get('total_weeks')) || 16;
    let hasLab = Number(form.get('lab_credit_hours')) > 0 || !!form.get('lab_day');
    if (existing) {
      weeks = existing.total_weeks;
      hasLab = existing.has_lab;
    } else if (!String(form.get('code') ?? '').trim() && !file && !text.trim()) {
      setError('Paste an outline or upload a file.');
      return;
    }
    if (file) fd.append('file', file);
    fd.append('text', text);
    fd.append('total_weeks', String(weeks));
    fd.append('has_lab', String(hasLab));
    setStep('processing');
    try {
      const res = await fetch('/api/planner/extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
      setPlan(data.plan);
      setOutline(data.text);
      // pre-fill course code/title for a new course
      if (!existing && formRef.current) {
        const code = formRef.current.elements.namedItem('code') as HTMLInputElement | null;
        const title = formRef.current.elements.namedItem('title') as HTMLInputElement | null;
        const ch = formRef.current.elements.namedItem('credit_hours') as HTMLInputElement | null;
        if (code && !code.value) code.value = data.plan.course_code;
        if (title && !title.value) title.value = data.plan.course_title;
        if (ch && data.plan.credit_hours) {
          const lab = formRef.current.elements.namedItem('lab_credit_hours') as HTMLInputElement | null;
          ch.value = String(Math.max(1, data.plan.credit_hours - Number(lab?.value || 0)));
        }
      }
      setStep('review');
    } catch (e) {
      setError((e as Error).message);
      setStep('input');
    }
  }

  const updateClo = (i: number, patch: Partial<ExtractedPlan['clos'][number]>) =>
    setPlan((p) => p && { ...p, clos: p.clos.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const removeClo = (i: number) =>
    setPlan((p) => {
      if (!p) return p;
      const n = i + 1;
      return {
        ...p,
        clos: p.clos.filter((_, k) => k !== i).map((c, k) => ({ ...c, number: k + 1 })),
        weekly_plan: p.weekly_plan.map((w) => ({ ...w, clo_numbers: w.clo_numbers.filter((x) => x !== n).map((x) => (x > n ? x - 1 : x)) })),
      };
    });
  const updateWeek = (i: number, patch: Partial<ExtractedPlan['weekly_plan'][number]>) =>
    setPlan((p) => p && { ...p, weekly_plan: p.weekly_plan.map((w, k) => (k === i ? { ...w, ...patch } : w)) });

  const steps = [
    { key: 'input', label: '1. Upload Outline', icon: Upload },
    { key: 'processing', label: '2. AI Processing', icon: Brain },
    { key: 'review', label: '3. Review & Approve', icon: CheckCircle2 },
  ];

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', step === s.key ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500')}>
              <s.icon className="h-5 w-5" />
            </div>
            <span className={cn('text-sm font-medium', step === s.key ? 'text-indigo-600' : 'text-slate-500')}>{s.label}</span>
            {i < 2 && <ArrowRight className="mx-2 h-4 w-4 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* ---------------- Course target (kept mounted so its fields are submitted) ---------------- */}
      <Card className={cn(step === 'processing' && 'hidden')}>
        <CardHeader>
          <CardTitle>Course</CardTitle>
          <CardDescription>Create a new course from this outline, or (re)plan one of your existing courses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xl space-y-1">
            <Label htmlFor="target">Target</Label>
            <Select
              id="target"
              value={String(target)}
              disabled={step === 'review'}
              onChange={(e) => {
                const v = e.target.value === 'new' ? 'new' : Number(e.target.value);
                setTarget(v);
                const c = courses.find((x) => x.id === v);
                if (c?.outline) setText(c.outline);
              }}
            >
              <option value="new">➕ New course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
          {existing ? (
            <>
              <input type="hidden" name="course_id" value={existing.id} />
              <p className="text-sm text-slate-500">{existing.total_weeks} weeks · lectures {existing.lecture_days.join(', ')}{existing.has_lab ? ' · has lab' : ''}. Saving replaces this course&apos;s CLOs, weekly plan and generated schedule.</p>
            </>
          ) : (
            <CourseFields programs={programs} teachers={teachers} defaults={{ teacher_id: userId }} />
          )}
        </CardContent>
      </Card>

      {step === 'input' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-600" /> Course Outline</CardTitle>
            <CardDescription>
              Upload a PDF, DOCX or TXT outline, or paste its text. Engine: {engine === 'gemini' ? 'Gemini LLM (falls back to NLP on error)' : 'built-in NLP engine (add a Gemini key in Settings for LLM extraction)'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
              className={cn('block cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors', dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50')}
            >
              <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <span className="inline-flex items-center gap-2 text-slate-800">
                  <FileText className="h-6 w-6 text-indigo-600" /> {file.name} ({Math.round(file.size / 1024)} KB)
                  <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="rounded p-1 hover:bg-slate-200" aria-label="Remove file"><X className="h-4 w-4" /></button>
                </span>
              ) : (
                <>
                  <Upload className="mx-auto h-10 w-10 text-slate-400" />
                  <p className="mt-3 font-medium text-slate-700">Drag & drop your course outline here, or click to browse</p>
                  <p className="mt-1 text-sm text-slate-500">PDF, DOCX, TXT — max 10 MB</p>
                </>
              )}
            </label>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-white px-4 text-slate-500">or paste the outline text</span></div>
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Course Code: ...&#10;Course Contents:&#10;1. Topic one: subtopic, subtopic&#10;2. Topic two ..." disabled={!!file} />
            {error && <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}
            <div className="flex flex-wrap justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => { setFile(null); setText(SAMPLE); }}>Use a sample outline</Button>
              <Button type="button" className="gap-2" onClick={extract} disabled={!file && text.trim().length < 30}>
                <Brain className="h-4 w-4" /> Extract & Generate with AI
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'processing' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="mb-6 h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <h3 className="text-xl font-semibold text-slate-900">AI is analyzing your outline…</h3>
            <p className="mt-2 text-slate-500">Extracting topics, distributing them over the semester and writing Bloom-aligned CLOs.</p>
          </CardContent>
        </Card>
      )}

      {step === 'review' && plan && (
        <div className="space-y-6">
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <input type="hidden" name="outline" value={outline} />
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <Sparkles className="h-5 w-5" />
            <span>
              Generated by the <strong>{plan.engine === 'gemini' ? 'Gemini LLM' : 'built-in NLP engine'}</strong>: {plan.topics.length} topics, {plan.weekly_plan.length} weeks, {plan.clos.length} CLOs.
              These are suggestions — edit anything before approving.
            </span>
            {plan.notes && <span className="w-full text-amber-800">{plan.notes}</span>}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Suggested Course Learning Outcomes</CardTitle>
              <CardDescription>The NLP checker flags non-measurable verbs and Bloom-level issues as you type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.clos.map((clo, i) => {
                const a = analyzeClo(clo.description);
                return (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-indigo-600">{clo.number}</div>
                      <Textarea className="min-h-[60px] flex-1" value={clo.description} onChange={(e) => updateClo(i, { description: e.target.value })} />
                      <select className={cn(fieldClass, 'h-10 w-40')} value={clo.bloom_level} onChange={(e) => updateClo(i, { bloom_level: e.target.value as BloomLevel })}>
                        {Object.entries(BLOOM_LEVELS).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}
                      </select>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeClo(i)} aria-label="Remove CLO"><Trash2 className="h-4 w-4 text-slate-500" /></Button>
                    </div>
                    <div className="ml-11 mt-2 flex flex-wrap gap-2 text-xs">
                      {a.level && a.level !== clo.bloom_level && <span className="text-amber-700">Verb &quot;{a.verb}&quot; suggests {a.level} ({BLOOM_LEVELS[a.level].label}).</span>}
                      {a.issues.map((iss) => <span key={iss} className="text-amber-700">⚠ {iss}</span>)}
                      {a.measurable && !a.issues.length && <span className="text-green-700">✓ Measurable ({a.verb})</span>}
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setPlan((p) => p && { ...p, clos: [...p.clos, { number: p.clos.length + 1, description: '', bloom_level: 'C3' }] })}>
                <Plus className="h-4 w-4" /> Add CLO
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weekly Plan</CardTitle>
              <CardDescription>Edit topics and subtopics (separate with ;) and tick the CLOs each week contributes to.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200"><tr><th className={th}>Week</th><th className={th}>Topic</th><th className={th}>Subtopics</th><th className={th}>CLOs</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.weekly_plan.map((w, i) => (
                    <tr key={w.week}>
                      <td className={`${td} font-semibold`}>{w.week}</td>
                      <td className={td}><input className={cn(fieldClass, 'min-w-[220px]')} value={w.topic} onChange={(e) => updateWeek(i, { topic: e.target.value })} /></td>
                      <td className={td}><input className={cn(fieldClass, 'min-w-[260px]')} value={w.subtopics.join('; ')} onChange={(e) => updateWeek(i, { subtopics: e.target.value.split(';').map((s) => s.trimStart()) })} /></td>
                      <td className={td}>
                        <div className="flex gap-1">
                          {plan.clos.map((c) => {
                            const on = w.clo_numbers.includes(c.number);
                            return (
                              <button
                                key={c.number}
                                type="button"
                                onClick={() => updateWeek(i, { clo_numbers: on ? w.clo_numbers.filter((x) => x !== c.number) : [...w.clo_numbers, c.number].sort() })}
                                className={cn('rounded-full px-2 py-0.5 text-xs font-medium', on ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500')}
                                aria-pressed={on}
                              >
                                {c.number}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assessment Blueprint</CardTitle>
              <CardDescription>The constraint-based scheduler places these through the semester and links each to the CLOs taught before it.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Input id="quizzes" name="quizzes" type="number" min={0} max={8} label="Quizzes" defaultValue={4} />
              <Input id="assignments" name="assignments" type="number" min={0} max={8} label="Assignments" defaultValue={3} />
              <label className="flex items-center gap-2 pt-6 text-sm text-slate-700"><input type="checkbox" name="project" defaultChecked className="h-4 w-4" /> Semester project</label>
              <label className="flex items-center gap-2 pt-6 text-sm text-slate-700"><input type="checkbox" name="lab_exam" defaultChecked={existing ? existing.has_lab : false} className="h-4 w-4" /> Lab exam</label>
            </CardContent>
          </Card>

          {state && !state.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep('input')}>← Back to Upload</Button>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="approve_clos" defaultChecked className="h-4 w-4" /> I have reviewed and approve these CLOs</label>
              <SubmitButton className="gap-2" pendingText="Saving & scheduling…"><CheckCircle2 className="h-4 w-4" /> Approve & Save</SubmitButton>
            </div>
          </div>
          <p className="text-xs text-slate-500"><Badge variant="outline">Next</Badge> CLO→PLO mappings are generated as suggestions and wait for your approval in CLO/PLO Management.</p>
        </div>
      )}
    </form>
  );
}
