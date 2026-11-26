// ============================================================================
// CLO / PLO attainment, learning-gap detection and at-risk prediction.
// Pure functions over a course bundle (see lib/queries.ts#loadCourseBundle).
// ============================================================================
import type { Assessment, CLO, CloPlo, Mark, PLO, Question, RiskTier, Student } from '../types';

export interface Bundle {
  clos: CLO[];
  mappings: CloPlo[];
  assessments: Assessment[];
  questions: Question[];
  students: Student[];
  marks: Mark[];
}

export interface Thresholds {
  clo_threshold: number; // student-level pass mark per CLO (%)
  clo_target: number; // % of students that must pass a CLO
  plo_target: number; // PLO achieved when weighted attainment >= this
}

export interface StudentCloScore {
  clo_id: number;
  obtained: number;
  max: number;
  pct: number | null; // null = not yet assessed
}

export interface StudentResult {
  student: Student;
  clo: Record<number, StudentCloScore>;
  plo: Record<number, number | null>;
  /** weighted course grade over conducted assessments (%) */
  grade: number | null;
  /** fraction of conducted assessments with no marks entered for this student */
  missingRate: number;
}

export interface CloAttainment {
  clo: CLO;
  assessedBy: string[];
  maxMarks: number;
  avgPct: number | null;
  attainedCount: number;
  assessedStudents: number;
  attainmentPct: number | null; // % of students >= threshold
  achieved: boolean | null;
}

export interface PloAttainment {
  plo: PLO;
  value: number | null;
  achieved: boolean | null;
  contributors: Array<{ cloNumber: number; weight: number; value: number | null }>;
}

export interface Gap {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  action: string;
}

const round = (x: number) => Math.round(x * 10) / 10;

/** An assessment is "conducted" once any mark has been entered for any of its questions. */
export function conductedAssessmentIds(b: Bundle): Set<number> {
  const qToA = new Map(b.questions.map((q) => [q.id, q.assessment_id]));
  const s = new Set<number>();
  for (const m of b.marks) if (m.marks !== null && qToA.has(m.question_id)) s.add(qToA.get(m.question_id)!);
  return s;
}

export function computeStudentResults(b: Bundle): StudentResult[] {
  const conducted = conductedAssessmentIds(b);
  const qs = b.questions.filter((q) => conducted.has(q.assessment_id));
  const markMap = new Map(b.marks.map((m) => [`${m.student_id}:${m.question_id}`, m.marks]));
  const approvedMaps = b.mappings.filter((m) => m.approved);
  const ploIds = [...new Set(approvedMaps.map((m) => m.plo_id))];

  return b.students.map((student) => {
    const clo: Record<number, StudentCloScore> = {};
    for (const c of b.clos) clo[c.id] = { clo_id: c.id, obtained: 0, max: 0, pct: null };
    let missing = 0;
    const perAssessment = new Map<number, { got: number; max: number; any: boolean }>();
    for (const q of qs) {
      const v = markMap.get(`${student.id}:${q.id}`);
      const got = typeof v === 'number' ? Math.min(v, q.max_marks) : 0; // absent = 0
      const pa = perAssessment.get(q.assessment_id) ?? { got: 0, max: 0, any: false };
      pa.got += got;
      pa.max += q.max_marks;
      pa.any ||= typeof v === 'number';
      perAssessment.set(q.assessment_id, pa);
      if (q.clo_id && clo[q.clo_id]) {
        clo[q.clo_id].obtained += got;
        clo[q.clo_id].max += q.max_marks;
      }
    }
    for (const s of Object.values(clo)) s.pct = s.max > 0 ? round((s.obtained / s.max) * 100) : null;

    let wSum = 0;
    let gSum = 0;
    for (const a of b.assessments) {
      const pa = perAssessment.get(a.id);
      if (!pa || pa.max === 0) continue;
      if (!pa.any) missing++;
      gSum += (pa.got / pa.max) * a.weight;
      wSum += a.weight;
    }

    const plo: Record<number, number | null> = {};
    for (const pid of ploIds) {
      let num = 0;
      let den = 0;
      for (const m of approvedMaps.filter((x) => x.plo_id === pid)) {
        const p = clo[m.clo_id]?.pct;
        if (p === null || p === undefined) continue;
        num += p * m.weight;
        den += m.weight;
      }
      plo[pid] = den ? round(num / den) : null;
    }
    return {
      student,
      clo,
      plo,
      grade: wSum ? round((gSum / wSum) * 100) : null,
      missingRate: perAssessment.size ? missing / perAssessment.size : 0,
    };
  });
}

export function computeCloAttainment(b: Bundle, results: StudentResult[], t: Thresholds): CloAttainment[] {
  const conducted = conductedAssessmentIds(b);
  const aTitle = new Map(b.assessments.map((a) => [a.id, a.title]));
  return b.clos.map((clo) => {
    const qs = b.questions.filter((q) => q.clo_id === clo.id);
    const assessedBy = [...new Set(qs.map((q) => aTitle.get(q.assessment_id) ?? '?'))];
    const maxMarks = qs.filter((q) => conducted.has(q.assessment_id)).reduce((s, q) => s + q.max_marks, 0);
    const scores = results.map((r) => r.clo[clo.id]?.pct).filter((p): p is number => p !== null && p !== undefined);
    const attained = scores.filter((p) => p >= t.clo_threshold).length;
    const attainmentPct = scores.length ? round((attained / scores.length) * 100) : null;
    return {
      clo,
      assessedBy,
      maxMarks,
      avgPct: scores.length ? round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      attainedCount: attained,
      assessedStudents: scores.length,
      attainmentPct,
      achieved: attainmentPct === null ? null : attainmentPct >= t.clo_target,
    };
  });
}

/**
 * PLO attainment for the course = Σ(weight × CLO attainment%) / Σ weight over the
 * *approved* CLO–PLO mappings, where CLO attainment% is the share of students who
 * met the CLO threshold.
 */
export function computePloAttainment(plos: PLO[], b: Bundle, clos: CloAttainment[], t: Thresholds): PloAttainment[] {
  const approved = b.mappings.filter((m) => m.approved);
  return plos.map((plo) => {
    const maps = approved.filter((m) => m.plo_id === plo.id);
    const contributors = maps.map((m) => {
      const ca = clos.find((c) => c.clo.id === m.clo_id);
      return { cloNumber: ca?.clo.number ?? 0, weight: m.weight, value: ca?.attainmentPct ?? null };
    });
    const valid = contributors.filter((c) => c.value !== null);
    const den = valid.reduce((s, c) => s + c.weight, 0);
    const value = den ? round(valid.reduce((s, c) => s + c.weight * (c.value as number), 0) / den) : null;
    return { plo, value, achieved: value === null ? null : value >= t.plo_target, contributors: contributors.sort((x, y) => x.cloNumber - y.cloNumber) };
  });
}

export function detectGaps(
  b: Bundle,
  plos: PLO[],
  clos: CloAttainment[],
  ploAtt: PloAttainment[],
  weeklyCloNumbers: number[],
  t: Thresholds
): Gap[] {
  const gaps: Gap[] = [];
  const approved = b.mappings.filter((m) => m.approved);
  for (const c of clos) {
    const label = `CLO ${c.clo.number}`;
    if (!c.clo.approved) gaps.push({ severity: 'low', title: `${label} not approved`, detail: 'AI-suggested CLO still waiting for teacher review.', action: 'Review and approve it in CLO/PLO Management.' });
    if (!b.questions.some((q) => q.clo_id === c.clo.id)) {
      gaps.push({ severity: 'high', title: `${label} is not assessed`, detail: 'No assessment question is mapped to this CLO, so it cannot be measured.', action: 'Add or re-map a question in Assessments.' });
    }
    if (!approved.some((m) => m.clo_id === c.clo.id)) {
      gaps.push({ severity: 'medium', title: `${label} not mapped to any PLO`, detail: 'It will not contribute to program-level attainment.', action: 'Map it to at least one PLO and approve the mapping.' });
    }
    if (!weeklyCloNumbers.includes(c.clo.number)) {
      gaps.push({ severity: 'medium', title: `${label} not covered in weekly plan`, detail: 'No week of the teaching plan contributes to this CLO.', action: 'Link at least one week of the plan to it.' });
    }
    if (c.achieved === false) {
      const sev = (c.attainmentPct ?? 0) < t.clo_target - 20 ? 'high' : 'medium';
      gaps.push({
        severity: sev,
        title: `${label} below target (${c.attainmentPct}% of students vs ${t.clo_target}% target)`,
        detail: `Average CLO score ${c.avgPct}%. ${c.assessedStudents - c.attainedCount} student(s) below the ${t.clo_threshold}% threshold.`,
        action: `Revisit "${c.clo.description.slice(0, 70)}…" with remedial sessions, extra practice and a re-assessment opportunity.`,
      });
    }
    const qs = b.questions.filter((q) => q.clo_id === c.clo.id);
    const total = b.questions.reduce((s, q) => s + q.max_marks, 0);
    const share = total ? (qs.reduce((s, q) => s + q.max_marks, 0) / total) * 100 : 0;
    if (qs.length && share < 8 && b.clos.length <= 6) {
      gaps.push({ severity: 'low', title: `${label} under-weighted`, detail: `Only ${round(share)}% of all assessment marks measure this CLO.`, action: 'Increase its weight in upcoming assessments for reliable measurement.' });
    }
  }
  for (const p of ploAtt) {
    if (p.achieved === false) {
      gaps.push({ severity: 'high', title: `PLO ${p.plo.number} (${p.plo.title}) below target`, detail: `Weighted attainment ${p.value}% vs target ${t.plo_target}%.`, action: `Strengthen CLO ${p.contributors.map((c) => c.cloNumber).join(', ')} which feed this PLO.` });
    }
  }
  const mappedPlos = new Set(approved.map((m) => m.plo_id));
  const unmapped = plos.filter((p) => !mappedPlos.has(p.id));
  if (unmapped.length && unmapped.length < plos.length) {
    gaps.push({ severity: 'low', title: `${unmapped.length} PLO(s) not addressed by this course`, detail: unmapped.map((p) => `PLO ${p.number}`).join(', '), action: 'Expected for a single course; check program-level coverage in Reports.' });
  }
  const totalWeight = b.assessments.reduce((s, a) => s + a.weight, 0);
  if (b.assessments.length && Math.abs(totalWeight - 100) > 0.5) {
    gaps.push({ severity: 'medium', title: `Assessment weights sum to ${round(totalWeight)}%`, detail: 'Weights should add up to 100%.', action: 'Adjust weights in Assessments.' });
  }
  for (const a of b.assessments) {
    const qs = b.questions.filter((q) => q.assessment_id === a.id);
    const sum = qs.reduce((s, q) => s + q.max_marks, 0);
    if (qs.length && Math.abs(sum - a.total_marks) > 0.01) {
      gaps.push({ severity: 'low', title: `${a.title}: question marks (${sum}) ≠ total (${a.total_marks})`, detail: 'Question-wise marks do not add up to the assessment total.', action: 'Fix question marks or the total.' });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return gaps.sort((x, y) => order[x.severity] - order[y.severity]);
}

// ============================================================================
// At-risk prediction: logistic regression (gradient descent, L2) on 4 features
//   x1 = current weighted grade, x2 = weakest CLO score, x3 = missing-submission
//   rate, x4 = trend (latest assessment % − earlier average).
// Trained on a reproducible synthetic cohort that encodes typical semester
// dynamics; replaced by real history when completed courses exist.
// ============================================================================

export type Features = [number, number, number, number];
export interface RiskModel {
  w: number[];
  b: number;
  trainedOn: string;
  accuracy: number;
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(f: Features): number[] {
  return [f[0] / 100, f[1] / 100, f[2], f[3] / 50];
}

export function trainLogistic(X: Features[], y: number[], label: string, epochs = 600, lr = 0.8, l2 = 0.001): RiskModel {
  const n = X.length;
  const Xn = X.map(normalize);
  let w = [0, 0, 0, 0];
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = [0, 0, 0, 0];
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = Xn[i].reduce((s, x, k) => s + x * w[k], b);
      const err = sigmoid(z) - y[i];
      for (let k = 0; k < 4; k++) gw[k] += err * Xn[i][k];
      gb += err;
    }
    w = w.map((wk, k) => wk - lr * (gw[k] / n + l2 * wk));
    b -= lr * (gb / n);
  }
  const correct = Xn.filter((x, i) => (sigmoid(x.reduce((s, v, k) => s + v * w[k], b)) >= 0.5 ? 1 : 0) === y[i]).length;
  return { w, b, trainedOn: label, accuracy: round((correct / n) * 100) };
}

let cachedPrior: RiskModel | null = null;

/** Synthetic cohort: latent ability drives formative performance and the final outcome. */
export function priorModel(): RiskModel {
  if (cachedPrior) return cachedPrior;
  const rnd = mulberry32(42);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const X: Features[] = [];
  const y: number[] = [];
  for (let i = 0; i < 1500; i++) {
    const ability = Math.min(98, Math.max(5, 62 + 18 * gauss()));
    const engagement = rnd();
    const missing = engagement < 0.15 ? 0.2 + rnd() * 0.4 : rnd() * 0.12;
    const grade = Math.min(100, Math.max(0, ability * (1 - missing * 0.8) + 6 * gauss()));
    const weakest = Math.max(0, grade - 8 - Math.abs(14 * gauss()));
    const trend = 10 * gauss() + (engagement - 0.5) * 10;
    const final = ability * 0.75 + grade * 0.15 + trend * 0.3 - missing * 25 + 9 * gauss();
    X.push([grade, weakest, missing, trend]);
    y.push(final < 50 ? 1 : 0);
  }
  cachedPrior = trainLogistic(X, y, 'synthetic prior cohort (1,500 students)');
  return cachedPrior;
}

export function predictRisk(model: RiskModel, f: Features): number {
  const x = normalize(f);
  return sigmoid(x.reduce((s, v, k) => s + v * model.w[k], model.b));
}

export function studentFeatures(b: Bundle, r: StudentResult): Features {
  const conducted = conductedAssessmentIds(b);
  const markMap = new Map(b.marks.map((m) => [`${m.student_id}:${m.question_id}`, m.marks]));
  const series = b.assessments
    .filter((a) => conducted.has(a.id))
    .sort((x, y) => (x.week ?? 0) - (y.week ?? 0))
    .map((a) => {
      const qs = b.questions.filter((q) => q.assessment_id === a.id);
      const max = qs.reduce((s, q) => s + q.max_marks, 0);
      const got = qs.reduce((s, q) => s + Math.min(Number(markMap.get(`${r.student.id}:${q.id}`) ?? 0), q.max_marks), 0);
      return max ? (got / max) * 100 : 0;
    });
  const trend =
    series.length >= 2 ? series[series.length - 1] - series.slice(0, -1).reduce((s, x) => s + x, 0) / (series.length - 1) : 0;
  const cloPcts = Object.values(r.clo).map((c) => c.pct).filter((p): p is number => p !== null);
  return [r.grade ?? 0, cloPcts.length ? Math.min(...cloPcts) : r.grade ?? 0, r.missingRate, trend];
}

export interface RiskRow {
  result: StudentResult;
  probability: number;
  tier: RiskTier;
  features: Features;
  weakClos: Array<{ number: number; pct: number }>;
  recommendation: string;
}

export function assessRisk(b: Bundle, results: StudentResult[], t: Thresholds, model: RiskModel = priorModel()): RiskRow[] {
  const cloById = new Map(b.clos.map((c) => [c.id, c]));
  return results
    .filter((r) => r.grade !== null)
    .map((r) => {
      const features = studentFeatures(b, r);
      const probability = predictRisk(model, features);
      const tier: RiskTier = probability >= 0.6 ? 'high' : probability >= 0.3 ? 'medium' : 'low';
      const weakClos = Object.values(r.clo)
        .filter((c) => c.pct !== null && c.pct < t.clo_threshold)
        .map((c) => ({ number: cloById.get(c.clo_id)?.number ?? 0, pct: c.pct as number }))
        .sort((x, y) => x.number - y.number);
      const parts: string[] = [];
      if (weakClos.length) parts.push(`Remedial work on CLO ${weakClos.map((w) => w.number).join(', ')}`);
      if (features[2] > 0.15) parts.push('follow up on missed assessments');
      if (features[3] < -10) parts.push('performance is declining — schedule a counselling meeting');
      if (tier === 'high' && !parts.length) parts.push('one-to-one academic advising');
      return {
        result: r,
        probability: round(probability * 100),
        tier,
        features,
        weakClos,
        recommendation: parts.length ? parts.join('; ') + '.' : 'On track — keep it up.',
      };
    })
    .sort((x, y) => y.probability - x.probability);
}

/** Everything the analytics/report pages need. */
export function analyzeCourse(b: Bundle, plos: PLO[], weeklyCloNumbers: number[], t: Thresholds, model?: RiskModel) {
  const results = computeStudentResults(b);
  const cloAtt = computeCloAttainment(b, results, t);
  const ploAtt = computePloAttainment(plos, b, cloAtt, t);
  const gaps = detectGaps(b, plos, cloAtt, ploAtt, weeklyCloNumbers, t);
  const risk = assessRisk(b, results, t, model);
  const conducted = conductedAssessmentIds(b);
  return { results, cloAtt, ploAtt, gaps, risk, conductedCount: conducted.size };
}
export type CourseAnalysis = ReturnType<typeof analyzeCourse>;
