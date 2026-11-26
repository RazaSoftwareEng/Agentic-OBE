// ============================================================================
// Built-in NLP engine: rule-based extraction + Bloom's taxonomy analysis.
// Used when no Gemini key is configured, and as a fallback when the LLM fails.
// Pure functions — safe on server and client.
// ============================================================================
import type { BloomLevel, ExtractedPlan } from '../types';

export const BLOOM_VERBS: Record<BloomLevel, string[]> = {
  C1: ['define', 'list', 'recall', 'identify', 'name', 'recognize', 'state', 'label', 'memorize', 'outline', 'reproduce'],
  C2: ['describe', 'explain', 'summarize', 'interpret', 'classify', 'compare', 'discuss', 'illustrate', 'paraphrase', 'distinguish', 'contrast', 'represent'],
  C3: ['apply', 'demonstrate', 'implement', 'solve', 'use', 'execute', 'calculate', 'compute', 'operate', 'perform', 'construct', 'model', 'program', 'simulate', 'practice'],
  C4: ['analyze', 'analyse', 'differentiate', 'examine', 'investigate', 'categorize', 'deconstruct', 'debug', 'test', 'compare and contrast', 'diagnose', 'infer'],
  C5: ['evaluate', 'assess', 'critique', 'judge', 'justify', 'defend', 'argue', 'appraise', 'validate', 'recommend', 'select', 'optimize'],
  C6: ['create', 'design', 'develop', 'formulate', 'compose', 'produce', 'propose', 'plan', 'devise', 'build', 'synthesize', 'integrate'],
};

/** Verbs that cannot be measured and should not start a CLO. */
export const NON_MEASURABLE = ['understand', 'know', 'learn', 'appreciate', 'be aware', 'be familiar', 'grasp', 'realize', 'comprehend', 'believe'];

const STOPWORDS = new Set(
  'a an the and or of to in on for with by from as at into using use via its their this that these those be is are was were will can able students student course concepts concept basic basics fundamental fundamentals introduction various different etc including such how what which'.split(
    ' '
  )
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

/** Tiny suffix-stripping stemmer (enough for keyword overlap). */
export function stem(w: string): string {
  return w
    .replace(/(ational|ization|isation)$/, 'ate')
    .replace(/(ings|ing|ies|ied|ions|ion|ments|ment|ness|ers|er|ed|es|s)$/, '')
    .replace(/(e)$/, '');
}

export interface BloomAnalysis {
  level: BloomLevel | null;
  verb: string | null;
  measurable: boolean;
  issues: string[];
}

/** Detect the Bloom level of a CLO statement from its action verb. */
export function analyzeClo(text: string): BloomAnalysis {
  const t = text.toLowerCase().replace(/^(students?|learners?)\s+(will|should)\s+be\s+able\s+to\s+/, '').trim();
  const issues: string[] = [];
  const firstWords = t.split(/\s+/).slice(0, 4).join(' ');
  const nm = NON_MEASURABLE.find((v) => firstWords.startsWith(v) || firstWords.includes(` ${v} `));
  if (nm) issues.push(`"${nm}" is not measurable — use an observable action verb (e.g. explain, apply, analyze).`);

  // the action verb must appear in the opening words (avoids matching nouns like "linked lists")
  const head = t.split(/\s+/).slice(0, 5).join(' ');
  let found: { level: BloomLevel; verb: string; pos: number } | null = null;
  for (const [level, verbs] of Object.entries(BLOOM_VERBS) as [BloomLevel, string[]][]) {
    for (const v of verbs) {
      const m = new RegExp(`\\b${v}(s|d|ed|es)?\\b`).exec(head);
      if (m && (!found || m.index < found.pos || (m.index === found.pos && level > found.level))) {
        found = { level, verb: v, pos: m.index };
      }
    }
  }
  if (!found) issues.push('No Bloom action verb found at the start of the statement.');
  else if (found.pos > 0) issues.push(`Action verb "${found.verb}" should start the statement.`);
  const words = t.split(/\s+/).length;
  if (words < 6) issues.push('Statement is too short — add the content/context being assessed.');
  if (words > 40) issues.push('Statement is long — a CLO should express one outcome.');
  const verbsHit = (Object.values(BLOOM_VERBS).flat() as string[]).filter((v) => new RegExp(`\\b${v}\\b`).test(t));
  if (new Set(verbsHit).size > 2) issues.push('Multiple action verbs — consider splitting into separate CLOs.');

  return { level: found?.level ?? null, verb: found?.verb ?? null, measurable: !nm && !!found, issues };
}

// ---------------------------------------------------------------------------
// Outline parsing
// ---------------------------------------------------------------------------

const META_LINE =
  /^(course\s*(code|title|name|objectives?|description|learning outcomes?)|credit|pre-?requisite|text\s*books?|reference|recommended|assessment|grading|marks|evaluation|instructor|teacher|office|email|semester|clo|plo|week\s*\d*\s*$|total|mid|final|quiz|assignment|lab\s*(work|manual)?\s*$|contact|duration|program)/i;

const SECTION_START = /^\s*(course\s*contents?|contents|topics?\s*(covered)?|syllabus|course\s*outline|outline|detailed\s*contents|catalog(ue)?\s*description)\s*([:\-]|$)/i;
const SECTION_END = /^(text\s*books?|recommended\s*books?|reference|assessment|grading|evaluation|course\s*learning\s*outcomes?|clos?\b|lab\s*(contents|experiments)?\s*[:\-]|teaching\s*methodology)/i;

function cleanTopic(s: string): string {
  return s
    .replace(/^\s*(week\s*\d+\s*[:.\-)]?|lecture\s*\d+\s*[:.\-)]?|unit\s*\d+\s*[:.\-)]?|chapter\s*\d+\s*[:.\-)]?)/i, '')
    .replace(/^\s*([\-–•*●▪◦o]|\d+(\.\d+)*[.)]?|[a-z][.)]|[ivx]+[.)])\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, '')
    .trim();
}

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function extractTopics(text: string): Array<{ title: string; subtopics: string[] }> {
  const lines = text.replace(/\r/g, '').split('\n');

  // 1) prefer the "Course Contents / Topics" section if one exists
  let start = lines.findIndex((l) => SECTION_START.test(l));
  let body: string[] = lines;
  if (start >= 0) {
    const head = /^.*?(contents?|topics?\s*(covered)?|syllabus|outline|description)\s*[:\-]\s*(.*)$/i.exec(lines[start]);
    const inline = head ? head[3].trim() : ''; // a bare heading line carries no topics
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => SECTION_END.test(l.trim()));
    body = [inline, ...(end >= 0 ? rest.slice(0, end) : rest)];
  } else start = 0;

  const topics: Array<{ title: string; subtopics: string[] }> = [];
  const push = (raw: string) => {
    const t = cleanTopic(raw);
    if (t.length < 3 || META_LINE.test(t)) return;
    // "Topic: sub1, sub2" or "Topic - sub1, sub2"
    const m = /^(.{3,80}?)\s*[:–—]\s*(.+)$/.exec(t) || /^(.{3,60}?)\s+-\s+(.+)$/.exec(t);
    if (m) {
      const subs = m[2].split(/[,;]|\band\b(?=[^,]*$)/).map(cleanTopic).filter((x) => x.length > 2);
      topics.push({ title: titleCase(m[1].trim()), subtopics: subs.map(titleCase) });
      return;
    }
    // a long comma list on one line = several topics
    const parts = t.split(/[;,]/).map(cleanTopic).filter((x) => x.length > 2);
    if (parts.length >= 3 && parts.every((p) => p.length < 70)) {
      parts.forEach((p) => topics.push({ title: titleCase(p), subtopics: [] }));
      return;
    }
    // "Arrays (static, dynamic)" -> subtopics from brackets
    const br = /^(.+?)\s*\((.+)\)$/.exec(t);
    if (br && br[2].includes(',')) {
      topics.push({ title: titleCase(br[1]), subtopics: br[2].split(',').map(cleanTopic).filter(Boolean).map(titleCase) });
      return;
    }
    if (t.length <= 120) topics.push({ title: titleCase(t), subtopics: [] });
  };

  // indentation-aware: indented / lettered lines become subtopics of the previous topic
  for (const line of body) {
    if (!line.trim()) continue;
    const indented = /^(\s{2,}|\t)/.test(line) || /^\s*([a-z][.)]|[ivx]+[.)]|◦|o\s)\s*/.test(line);
    const t = cleanTopic(line);
    if (indented && topics.length && t.length > 2 && !META_LINE.test(t)) {
      topics[topics.length - 1].subtopics.push(titleCase(t));
    } else push(line);
  }

  // de-duplicate
  const seen = new Set<string>();
  return topics.filter((t) => {
    const k = t.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function extractMeta(text: string) {
  const code = /\b([A-Z]{2,5})[\s-]?(\d{3,4})\b/.exec(text);
  const titleLine =
    /course\s*(title|name)\s*[:\-]\s*(.+)/i.exec(text)?.[2] ??
    (code ? new RegExp(`${code[1]}[\\s-]?${code[2]}\\s*[:\\-–]?\\s*(.+)`).exec(text)?.[1] : undefined);
  const ch = /credit\s*hours?\s*[:\-]?\s*(\d)/i.exec(text) ?? /\b(\d)\s*\(\s*\d\s*[,+-]\s*\d\s*\)/.exec(text);
  const lab = /\b\d\s*\(\s*\d\s*[,+-]\s*(\d)\s*\)/.exec(text);
  return {
    course_code: code ? `${code[1]}-${code[2]}` : '',
    course_title: titleLine ? titleLine.split(/\n|\||credit/i)[0].replace(/[()\d,]+$/, '').trim().slice(0, 100) : '',
    credit_hours: ch ? Number(ch[1]) : 3,
    lab_credit_hours: lab ? Number(lab[1]) : 0,
  };
}

// ---------------------------------------------------------------------------
// Weekly plan
// ---------------------------------------------------------------------------

/** Weeks reserved for exams: midterm in the middle, final in the last week. */
export function examWeeks(totalWeeks: number) {
  return { mid: Math.ceil(totalWeeks / 2), final: totalWeeks };
}

export function buildWeeklyPlan(
  topics: Array<{ title: string; subtopics: string[] }>,
  totalWeeks: number
): Array<{ week: number; topic: string; subtopics: string[]; topicIndex: number[] }> {
  const { mid, final } = examWeeks(totalWeeks);
  const teachingWeeks = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w !== mid && w !== final);
  const n = teachingWeeks.length;
  if (!topics.length) return [];

  // expand topics into "units" (a topic or a chunk of its subtopics), weighted by size
  type Unit = { title: string; subtopics: string[]; idx: number; size: number };
  const units: Unit[] = topics.map((t, idx) => ({ title: t.title, subtopics: t.subtopics, idx, size: 1 + t.subtopics.length * 0.35 }));

  // too few units -> split the biggest topics into parts
  while (units.length < n) {
    const biggest = units.reduce((b, u, i) => (u.size > units[b].size ? i : b), 0);
    const u = units[biggest];
    if (u.subtopics.length >= 2) {
      const half = Math.ceil(u.subtopics.length / 2);
      const base = u.title.replace(/ \(Part \d+\)$/, '');
      const a: Unit = { ...u, title: `${base} (Part 1)`, subtopics: u.subtopics.slice(0, half), size: u.size / 2 };
      const b: Unit = { ...u, title: `${base} (Part 2)`, subtopics: u.subtopics.slice(half), size: u.size / 2 };
      units.splice(biggest, 1, a, b);
    } else {
      // no subtopics to split: give the topic extra practice/problem-solving week
      const smallestIdx = units.reduce((b, x, i) => (x.size > units[b].size ? i : b), 0);
      const x = units[smallestIdx];
      units.splice(smallestIdx + 1, 0, {
        ...x,
        title: `${x.title.replace(/ \(Part \d+\)$/, '')} — Problem Solving & Applications`,
        subtopics: ['Worked examples', 'Practice problems', 'Case study'],
        size: x.size / 2,
      });
      x.size /= 2;
    }
    if (units.length > 400) break;
  }

  // too many units -> merge adjacent smallest pairs
  while (units.length > n) {
    let best = 0;
    for (let i = 1; i < units.length - 1; i++) {
      if (units[i].size + units[i + 1].size < units[best].size + units[best + 1].size) best = i;
    }
    const a = units[best];
    const b = units[best + 1];
    units.splice(best, 2, {
      title: `${a.title} & ${b.title}`.slice(0, 160),
      subtopics: [...a.subtopics, ...b.subtopics],
      idx: a.idx,
      size: a.size + b.size,
    });
  }

  // relabel split topics so their parts are numbered 1..k in teaching order
  const baseOf = (t: string) => t.replace(/ \(Part \d+\)$/, '');
  const partTotals = new Map<string, number>();
  for (const u of units) if (/ \(Part \d+\)$/.test(u.title)) partTotals.set(baseOf(u.title), (partTotals.get(baseOf(u.title)) ?? 0) + 1);
  const partSeen = new Map<string, number>();
  for (const u of units) {
    if (!/ \(Part \d+\)$/.test(u.title)) continue;
    const b = baseOf(u.title);
    const k = (partSeen.get(b) ?? 0) + 1;
    partSeen.set(b, k);
    u.title = partTotals.get(b)! > 1 ? `${b} (Part ${k})` : b;
  }

  const merged = units as Array<Unit & { idxs?: number[] }>;
  // track all topic indices that landed in each week
  const plan = teachingWeeks.map((week, i) => {
    const u = merged[i];
    const idxs = topics.map((t, k) => (u.title.includes(t.title) ? k : -1)).filter((k) => k >= 0);
    return { week, topic: u.title, subtopics: u.subtopics, topicIndex: idxs.length ? idxs : [u.idx] };
  });
  plan.push({ week: mid, topic: 'Midterm Examination & Revision', subtopics: ['Revision of weeks 1–' + (mid - 1)], topicIndex: [] });
  plan.push({ week: final, topic: 'Final Examination & Course Review', subtopics: ['Comprehensive revision'], topicIndex: [] });
  return plan.sort((a, b) => a.week - b.week);
}

// ---------------------------------------------------------------------------
// CLO generation
// ---------------------------------------------------------------------------

function joinList(items: string[]): string {
  const xs = items.map((s) => s.replace(/ \(Part \d+\)$/, '').toLowerCase()).filter((v, i, a) => a.indexOf(v) === i);
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const TEMPLATES: Record<BloomLevel, (topics: string, course: string) => string> = {
  C1: (t) => `Identify and define the key terminology and principles of ${t}.`,
  C2: (t) => `Explain the fundamental concepts, principles and working of ${t}.`,
  C3: (t, c) => `Apply ${t} techniques to solve well-defined problems in ${c || 'the domain'}.`,
  C4: (t) => `Analyze problems involving ${t} and compare alternative approaches in terms of efficiency and trade-offs.`,
  C5: (t) => `Evaluate and justify the choice of ${t} for a given scenario.`,
  C6: (t) => `Design and develop a solution that integrates ${t} to meet specified requirements.`,
};

/** Suggest 3–5 CLOs: contiguous topic groups with ascending Bloom levels. */
export function generateClos(
  topics: Array<{ title: string }>,
  courseTitle: string,
  hasLab: boolean
): Array<{ number: number; description: string; bloom_level: BloomLevel; topicIdx: number[] }> {
  if (!topics.length) return [];
  const k = Math.max(1, Math.min(hasLab ? 3 : 4, Math.ceil(topics.length / 3)));
  const ladders: Record<number, BloomLevel[]> = {
    1: ['C3'],
    2: ['C2', 'C3'],
    3: ['C2', 'C3', 'C4'],
    4: ['C2', 'C3', 'C4', 'C6'],
  };
  const levels = ladders[k];
  const size = Math.ceil(topics.length / k);
  const clos = levels.map((level, i) => {
    const idx = Array.from({ length: size }, (_, j) => i * size + j).filter((j) => j < topics.length);
    const names = idx.map((j) => topics[j].title).slice(0, 4);
    return { number: i + 1, description: TEMPLATES[level](joinList(names), courseTitle.toLowerCase()), bloom_level: level, topicIdx: idx };
  });
  if (hasLab) {
    clos.push({
      number: clos.length + 1,
      description: `Implement and demonstrate ${joinList(topics.slice(0, 3).map((t) => t.title))} using modern tools in laboratory work.`,
      bloom_level: 'C3',
      topicIdx: topics.map((_, i) => i),
    });
  }
  return clos;
}

/** Full rule-based pipeline: outline text -> topics, weekly plan, CLOs. */
export function nlpExtract(text: string, opts: { totalWeeks: number; hasLab?: boolean }): ExtractedPlan {
  const meta = extractMeta(text);
  const topics = extractTopics(text);
  const hasLab = opts.hasLab ?? meta.lab_credit_hours > 0;
  const clos = generateClos(topics, meta.course_title, hasLab);
  const weekly = buildWeeklyPlan(topics, opts.totalWeeks);
  const { mid } = examWeeks(opts.totalWeeks);
  return {
    course_title: meta.course_title,
    course_code: meta.course_code,
    credit_hours: meta.credit_hours,
    topics,
    weekly_plan: weekly.map((w) => ({
      week: w.week,
      topic: w.topic,
      subtopics: w.subtopics,
      clo_numbers: w.topicIndex.length
        ? clos.filter((c) => c.topicIdx.some((i) => w.topicIndex.includes(i))).map((c) => c.number)
        : w.week === mid
          ? clos.filter((c) => c.topicIdx.some((i) => i < topics.length / 2)).map((c) => c.number)
          : clos.map((c) => c.number),
    })),
    clos: clos.map(({ number, description, bloom_level }) => ({ number, description, bloom_level })),
    engine: 'nlp',
  };
}

// ---------------------------------------------------------------------------
// CLO -> PLO mapping suggestions
// ---------------------------------------------------------------------------

/** Keyword cues for the 12 Washington-Accord-style graduate attributes, keyed by PLO title words. */
const PLO_CUES: Array<{ match: RegExp; cues: RegExp; boost: number }> = [
  { match: /knowledge/i, cues: /\b(explain|describe|define|identify|concept|principle|fundamental|theor)/i, boost: 2 },
  { match: /problem analysis|analy/i, cues: /\b(analy[sz]e|solve|problem|complexity|compare|evaluate|investigate|debug|trade-?off)/i, boost: 2 },
  { match: /design|development of solutions/i, cues: /\b(design|develop|create|construct|build|propose|architect|solution)/i, boost: 2 },
  { match: /investigation/i, cues: /\b(investigate|experiment|research|test|evaluate|measure|data)/i, boost: 1.5 },
  { match: /modern tool|tool usage/i, cues: /\b(tool|software|simulat|implement|program|lab|laborator|ide|framework|matlab|python)/i, boost: 2 },
  { match: /society/i, cues: /\b(societ|legal|safety|health|cultur)/i, boost: 2 },
  { match: /environment|sustainab/i, cues: /\b(environment|sustainab|green|energy)/i, boost: 2 },
  { match: /ethic/i, cues: /\b(ethic|professional|plagiari|integrity)/i, boost: 2 },
  { match: /team/i, cues: /\b(team|group|collaborat)/i, boost: 2 },
  { match: /communication/i, cues: /\b(communicat|present|report|document|write|oral)/i, boost: 2 },
  { match: /management|project/i, cues: /\b(manage|project|cost|schedul|plan)/i, boost: 1.5 },
  { match: /lifelong|life-long/i, cues: /\b(self|independent|lifelong|research|emerging)/i, boost: 1.5 },
];

const BLOOM_PLO_AFFINITY: Record<BloomLevel, RegExp> = {
  C1: /knowledge/i,
  C2: /knowledge/i,
  C3: /knowledge|problem|tool/i,
  C4: /problem|investigation/i,
  C5: /problem|investigation|design/i,
  C6: /design|development/i,
};

export function suggestMappings(
  clos: Array<{ id: number; description: string; bloom_level: BloomLevel }>,
  plos: Array<{ id: number; number: number; title: string; description: string }>
): Array<{ clo_id: number; plo_id: number; weight: 1 | 2 | 3; rationale: string }> {
  const out: Array<{ clo_id: number; plo_id: number; weight: 1 | 2 | 3; rationale: string }> = [];
  for (const clo of clos) {
    const cloTokens = new Set(tokenize(clo.description));
    const scored = plos.map((plo) => {
      const reasons: string[] = [];
      let score = 0;
      const ploText = `${plo.title} ${plo.description}`;
      const ploTokens = new Set(tokenize(ploText));
      const overlap = [...cloTokens].filter((t) => ploTokens.has(t));
      if (overlap.length) {
        score += overlap.length * 0.6;
        reasons.push(`shared terms: ${overlap.slice(0, 4).join(', ')}`);
      }
      for (const cue of PLO_CUES) {
        if (cue.match.test(plo.title) && cue.cues.test(clo.description)) {
          score += cue.boost;
          reasons.push(`CLO wording matches "${plo.title}"`);
        }
      }
      if (BLOOM_PLO_AFFINITY[clo.bloom_level].test(plo.title)) {
        score += 1.5;
        reasons.push(`${clo.bloom_level} level aligns with this attribute`);
      }
      return { plo, score, reasons };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((s) => s.score >= 1.5).slice(0, 3);
    if (!top.length && scored[0]) top.push(scored[0]);
    top.forEach((s, i) => {
      const weight: 1 | 2 | 3 = i === 0 ? 3 : s.score >= 3 ? 2 : 1;
      out.push({ clo_id: clo.id, plo_id: s.plo.id, weight, rationale: s.reasons.join('; ') || 'closest match' });
    });
  }
  return out;
}
