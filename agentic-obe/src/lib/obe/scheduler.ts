// ============================================================================
// Constraint-based academic scheduler.
//  - builds the day-by-day lecture/lab plan from the weekly plan, skipping holidays
//  - places quizzes/assignments/project/lab tests into weeks with a small
//    backtracking CSP solver:
//      HARD: not in exam weeks or week 1-2, a teaching day must exist in the week,
//            at most one formative assessment per week, >= 2 weeks between two of
//            the same type, the assessment must cover at least one CLO already taught
//      SOFT: close to evenly spaced "ideal" weeks
//  - links every assessment to the CLOs taught since the previous one of its type
// ============================================================================
import type { AssessmentType } from '../types';
import { examWeeks } from '../ai/nlp';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** Date of a given weekday within teaching week `week` (week 1 = week containing start date). */
export function dateFor(startDate: string, week: number, dayName: string): string {
  const start = parseDate(startDate);
  const monday = addDays(start, -((start.getUTCDay() + 6) % 7));
  const offset = (DAYS.indexOf(dayName) + 6) % 7; // Monday=0 .. Sunday=6
  return fmtDate(addDays(monday, (week - 1) * 7 + offset));
}

export interface ScheduleInput {
  startDate: string;
  totalWeeks: number;
  lectureDays: string[];
  labDay: string | null;
  holidays: Array<{ date: string; name: string }>;
  weeks: Array<{ week: number; topic: string; subtopics: string[]; clo_numbers: number[] }>;
  cloNumbers: number[];
  blueprint: { quizzes: number; assignments: number; project: boolean; labExam: boolean };
  labCloNumber?: number | null;
}

export interface PlannedSession {
  week: number;
  date: string;
  kind: 'lecture' | 'lab' | 'holiday' | 'exam' | 'assessment';
  title: string;
  details: string;
}

export interface PlannedAssessment {
  title: string;
  type: AssessmentType;
  week: number;
  date: string;
  total_marks: number;
  weight: number;
  clo_numbers: number[];
  is_formative: boolean;
}

export interface ScheduleResult {
  sessions: PlannedSession[];
  assessments: PlannedAssessment[];
  warnings: string[];
}

const DEFAULT_MARKS: Record<string, number> = { quiz: 10, assignment: 20, project: 50, lab: 50, midterm: 30, final_exam: 50 };

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const { totalWeeks, startDate } = input;
  const { mid, final } = examWeeks(totalWeeks);
  const holidayMap = new Map(input.holidays.map((h) => [h.date, h.name]));
  const warnings: string[] = [];
  const weekInfo = new Map(input.weeks.map((w) => [w.week, w]));
  const lectureDays = [...input.lectureDays].sort((a, b) => ((DAYS.indexOf(a) + 6) % 7) - ((DAYS.indexOf(b) + 6) % 7));

  const teachingDates = (week: number) =>
    lectureDays.map((d) => dateFor(startDate, week, d)).filter((d) => !holidayMap.has(d));

  // ---------------- daily sessions ----------------
  const sessions: PlannedSession[] = [];
  for (let week = 1; week <= totalWeeks; week++) {
    const w = weekInfo.get(week);
    const all = lectureDays.map((d) => dateFor(startDate, week, d));
    const open = all.filter((d) => !holidayMap.has(d));
    for (const d of all.filter((x) => holidayMap.has(x))) {
      sessions.push({ week, date: d, kind: 'holiday', title: `Holiday: ${holidayMap.get(d)}`, details: 'No class' });
    }
    if (week === mid || week === final) {
      const d = open[0] ?? all[0];
      sessions.push({ week, date: d, kind: 'exam', title: week === mid ? 'Midterm Examination' : 'Final Examination', details: w?.topic ?? '' });
      continue;
    }
    if (!w) continue;
    if (open.length < all.length && open.length) {
      warnings.push(`Week ${week}: ${all.length - open.length} lecture(s) fall on a holiday — content merged into ${open.length} remaining session(s).`);
    }
    if (!open.length) {
      warnings.push(`Week ${week}: every lecture day is a holiday — "${w.topic}" needs a make-up class.`);
      continue;
    }
    const subs = w.subtopics.length ? w.subtopics : [w.topic];
    const per = Math.ceil(subs.length / open.length);
    open.forEach((d, i) => {
      const chunk = subs.slice(i * per, (i + 1) * per);
      sessions.push({
        week,
        date: d,
        kind: 'lecture',
        title: open.length > 1 ? `${w.topic} — Lecture ${i + 1}` : w.topic,
        details: chunk.length ? chunk.join('; ') : 'Discussion, examples and practice problems',
      });
    });
    if (input.labDay) {
      const ld = dateFor(startDate, week, input.labDay);
      if (holidayMap.has(ld)) sessions.push({ week, date: ld, kind: 'holiday', title: `Holiday: ${holidayMap.get(ld)}`, details: 'No lab' });
      else sessions.push({ week, date: ld, kind: 'lab', title: `Lab: ${w.topic}`, details: 'Hands-on implementation and lab report' });
    }
  }

  // ---------------- CLOs taught per week ----------------
  const taughtBy = (fromExcl: number, toIncl: number) => {
    const s = new Set<number>();
    for (let k = fromExcl + 1; k <= toIncl; k++) weekInfo.get(k)?.clo_numbers.forEach((c) => s.add(c));
    return [...s].sort((a, b) => a - b);
  };

  // ---------------- CSP for formative assessments ----------------
  type Item = { type: AssessmentType; n: number };
  const items: Item[] = [];
  const q = input.blueprint.quizzes;
  const a = input.blueprint.assignments;
  for (let i = 0; i < Math.max(q, a); i++) {
    if (i < q) items.push({ type: 'quiz', n: i + 1 });
    if (i < a) items.push({ type: 'assignment', n: i + 1 });
  }
  const domain = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter(
    (w) => w >= 3 && w !== mid && w !== final && w !== final - 1 && teachingDates(w).length > 0
  );
  const ideal = items.map((_, i) => domain[Math.round(((i + 0.5) * domain.length) / Math.max(items.length, 1) - 0.5)] ?? domain[0]);

  function solve(maxPerWeek: number, minGap: number): number[] | null {
    const assign: number[] = [];
    const count = new Map<number, number>();
    const dfs = (i: number): boolean => {
      if (i === items.length) return true;
      const cands = [...domain].sort((x, y) => Math.abs(x - ideal[i]) - Math.abs(y - ideal[i]));
      for (const w of cands) {
        if ((count.get(w) ?? 0) >= maxPerWeek) continue;
        const clash = items.some((it, j) => j < i && it.type === items[i].type && Math.abs(assign[j] - w) < minGap);
        if (clash) continue;
        // order within a type must be chronological
        const prevSame = items.findLastIndex((it, j) => j < i && it.type === items[i].type);
        if (prevSame >= 0 && assign[prevSame] >= w) continue;
        if (!taughtBy(0, w - 1).length) continue;
        assign[i] = w;
        count.set(w, (count.get(w) ?? 0) + 1);
        if (dfs(i + 1)) return true;
        count.set(w, (count.get(w) ?? 1) - 1);
      }
      return false;
    };
    return dfs(0) ? assign : null;
  }

  let placement = solve(1, 2);
  if (!placement && items.length) {
    warnings.push('Not enough free weeks for one assessment per week with a 2-week gap — relaxed the gap to 1 week.');
    placement = solve(1, 1) ?? solve(2, 1);
    if (!placement) {
      warnings.push('Could not satisfy constraints even after relaxing; reduce the number of quizzes/assignments.');
      placement = items.map((_, i) => ideal[i]);
    }
  }

  // ---------------- weights ----------------
  const categories: Array<[string, number, number]> = [
    ['quiz', 10, q],
    ['assignment', 10, a],
    ['project', 10, input.blueprint.project ? 1 : 0],
    ['lab', 15, input.blueprint.labExam ? 1 : 0],
  ].filter(([, , n]) => (n as number) > 0) as Array<[string, number, number]>;
  // share 35% sessional marks across categories (largest-remainder to whole numbers),
  // then split each category across its items in 0.5% steps
  const sessionalTotal = 35;
  const rawSum = categories.reduce((s, [, w]) => s + w, 0) || 1;
  const exact = categories.map(([t, w]) => ({ t, v: (w / rawSum) * sessionalTotal }));
  const whole = exact.map((e) => ({ t: e.t, v: Math.floor(e.v), r: e.v - Math.floor(e.v) }));
  let left = sessionalTotal - whole.reduce((s, e) => s + e.v, 0);
  for (const e of [...whole].sort((x, y) => y.r - x.r)) {
    if (left <= 0) break;
    e.v += 1;
    left -= 1;
  }
  const perItemWeight = (type: string) => {
    const c = categories.find(([t]) => t === type);
    const total = whole.find((e) => e.t === type)?.v ?? 0;
    if (!c) return 0;
    return Math.round((total / c[2]) * 2) / 2;
  };
  const midW = categories.length ? 25 : 40;
  const finalW = categories.length ? 40 : 60;

  const pickDate = (week: number, last = true) => {
    const ds = teachingDates(week);
    if (ds.length) return last ? ds[ds.length - 1] : ds[0];
    // fall back to the next non-holiday weekday
    for (let k = 0; k < 7; k++) {
      const d = dateFor(startDate, week, DAYS[(1 + k) % 7]);
      if (!holidayMap.has(d)) return d;
    }
    return dateFor(startDate, week, 'Monday');
  };

  const assessments: PlannedAssessment[] = [];
  const lastOfType = new Map<string, number>();
  items.forEach((it, i) => {
    const week = placement![i];
    const prev = lastOfType.get(it.type) ?? 0;
    let clos = taughtBy(prev, week - 1);
    if (!clos.length) clos = taughtBy(0, week - 1).slice(-1);
    lastOfType.set(it.type, week);
    assessments.push({
      title: `${it.type === 'quiz' ? 'Quiz' : 'Assignment'} ${it.n}`,
      type: it.type,
      week,
      date: pickDate(week, it.type === 'quiz'),
      total_marks: DEFAULT_MARKS[it.type],
      weight: perItemWeight(it.type),
      clo_numbers: clos,
      is_formative: true,
    });
  });

  assessments.push({
    title: 'Midterm Exam',
    type: 'midterm',
    week: mid,
    date: pickDate(mid, false),
    total_marks: DEFAULT_MARKS.midterm,
    weight: midW,
    clo_numbers: taughtBy(0, mid - 1),
    is_formative: false,
  });

  if (input.blueprint.project) {
    const highest = input.cloNumbers.slice(-2);
    assessments.push({
      title: 'Semester Project',
      type: 'project',
      week: final - 1,
      date: pickDate(final - 1),
      total_marks: DEFAULT_MARKS.project,
      weight: perItemWeight('project'),
      clo_numbers: highest.length ? highest : input.cloNumbers,
      is_formative: true,
    });
  }
  if (input.blueprint.labExam) {
    const ld = input.labDay ? dateFor(startDate, final - 1, input.labDay) : pickDate(final - 1);
    assessments.push({
      title: 'Lab Exam',
      type: 'lab',
      week: final - 1,
      date: holidayMap.has(ld) ? pickDate(final - 1) : ld,
      total_marks: DEFAULT_MARKS.lab,
      weight: perItemWeight('lab'),
      clo_numbers: input.labCloNumber ? [input.labCloNumber] : input.cloNumbers.slice(-1),
      is_formative: true,
    });
  }
  assessments.push({
    title: 'Final Exam',
    type: 'final_exam',
    week: final,
    date: pickDate(final, false),
    total_marks: DEFAULT_MARKS.final_exam,
    weight: finalW,
    clo_numbers: input.cloNumbers,
    is_formative: false,
  });

  // fix rounding so weights sum to exactly 100
  const sum = assessments.reduce((s, x) => s + x.weight, 0);
  const fin = assessments.find((x) => x.type === 'final_exam')!;
  fin.weight = Math.round((fin.weight + (100 - sum)) * 100) / 100;

  // coverage check: every CLO assessed somewhere
  const assessed = new Set(assessments.flatMap((x) => x.clo_numbers));
  for (const c of input.cloNumbers) if (!assessed.has(c)) warnings.push(`CLO ${c} is not covered by any assessment.`);
  const taughtAll = new Set(taughtBy(0, totalWeeks));
  for (const c of input.cloNumbers) if (!taughtAll.has(c)) warnings.push(`CLO ${c} is not linked to any week of the plan.`);

  for (const x of assessments) {
    sessions.push({ week: x.week, date: x.date, kind: 'assessment', title: x.title, details: `CLO ${x.clo_numbers.join(', ')} · ${x.total_marks} marks · ${x.weight}%` });
  }
  sessions.sort((s1, s2) => s1.date.localeCompare(s2.date) || s1.kind.localeCompare(s2.kind));
  return { sessions, assessments, warnings };
}
