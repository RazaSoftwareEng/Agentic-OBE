import 'server-only';
import { getGeminiConfig } from '../settings';
import type { BloomLevel, ExtractedPlan, MappingSuggestion } from '../types';
import { analyzeClo, examWeeks, nlpExtract, suggestMappings } from './nlp';

// ============================================================================
// AI agent layer: Gemini (LLM) when configured, built-in NLP otherwise.
// Every result is a *suggestion* — the teacher reviews and approves it in the UI.
// ============================================================================

async function callGemini<T>(prompt: string): Promise<T> {
  const cfg = await getGeminiConfig();
  if (!cfg) throw new Error('Gemini not configured');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()) as T;
}

const BLOOMS: BloomLevel[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

export async function extractPlan(
  text: string,
  opts: { totalWeeks: number; hasLab?: boolean }
): Promise<ExtractedPlan> {
  const fallback = () => nlpExtract(text, opts);
  if (!await getGeminiConfig()) return fallback();

  const { mid, final } = examWeeks(opts.totalWeeks);
  const prompt = `You are an Outcome-Based Education (OBE) academic planning assistant for a university.
Read the course outline below and return ONLY JSON with this exact shape:
{
  "course_title": string, "course_code": string, "credit_hours": number,
  "topics": [{"title": string, "subtopics": string[]}],
  "clos": [{"number": number, "description": string, "bloom_level": "C1"|"C2"|"C3"|"C4"|"C5"|"C6"}],
  "weekly_plan": [{"week": number, "topic": string, "subtopics": string[], "clo_numbers": number[]}]
}
Rules:
- Extract the real topics in the order they appear in the outline. Do not invent unrelated topics.
- Write 3 to 5 CLOs. Each must start with ONE measurable Bloom's taxonomy action verb (never "understand", "know", "learn"), name the content, and be one sentence. Use ascending cognitive levels.${opts.hasLab ? ' Include one CLO for laboratory/practical work.' : ''}
- weekly_plan must have exactly ${opts.totalWeeks} weeks (1..${opts.totalWeeks}). Week ${mid} is "Midterm Examination & Revision" and week ${final} is "Final Examination & Course Review". Spread topics over the other weeks in a logical teaching order.
- clo_numbers lists the CLOs each week's topic contributes to.

COURSE OUTLINE:
"""
${text.slice(0, 20000)}
"""`;

  try {
    const r = await callGemini<Omit<ExtractedPlan, 'engine'>>(prompt);
    if (!Array.isArray(r.topics) || !Array.isArray(r.clos) || !Array.isArray(r.weekly_plan) || !r.clos.length) {
      throw new Error('Incomplete response');
    }
    const clos = r.clos.map((c, i) => ({
      number: i + 1,
      description: String(c.description),
      bloom_level: BLOOMS.includes(c.bloom_level) ? c.bloom_level : analyzeClo(String(c.description)).level ?? 'C2',
    }));
    const weekly = Array.from({ length: opts.totalWeeks }, (_, i) => {
      const w = r.weekly_plan.find((x) => Number(x.week) === i + 1);
      return {
        week: i + 1,
        topic: w?.topic ? String(w.topic) : 'Revision / Problem solving',
        subtopics: Array.isArray(w?.subtopics) ? w!.subtopics.map(String) : [],
        clo_numbers: Array.isArray(w?.clo_numbers) ? w!.clo_numbers.map(Number).filter((n) => n >= 1 && n <= clos.length) : [],
      };
    });
    return {
      course_title: String(r.course_title ?? ''),
      course_code: String(r.course_code ?? ''),
      credit_hours: Number(r.credit_hours) || 3,
      topics: r.topics.map((t) => ({ title: String(t.title), subtopics: (t.subtopics ?? []).map(String) })),
      clos,
      weekly_plan: weekly,
      engine: 'gemini',
    };
  } catch (e) {
    const plan = fallback();
    plan.notes = `Gemini request failed (${(e as Error).message.slice(0, 120)}); used the built-in NLP engine instead.`;
    return plan;
  }
}

export async function suggestCloPloMappings(
  clos: Array<{ id: number; number: number; description: string; bloom_level: BloomLevel }>,
  plos: Array<{ id: number; number: number; title: string; description: string }>
): Promise<{ suggestions: MappingSuggestion[]; engine: 'gemini' | 'nlp'; notes?: string }> {
  const nlp = () => suggestMappings(clos, plos);
  if (!await getGeminiConfig()) return { suggestions: nlp(), engine: 'nlp' };

  const prompt = `You are an OBE accreditation expert. Map each Course Learning Outcome (CLO) to the Program Learning Outcomes (PLOs) it genuinely contributes to.
Return ONLY JSON: {"mappings":[{"clo":number,"plo":number,"weight":1|2|3,"rationale":string}]}
weight: 3 = strong/primary, 2 = moderate, 1 = slight. Map each CLO to 1-3 PLOs; exactly one should be weight 3. Keep rationale under 20 words.

CLOs:
${clos.map((c) => `CLO${c.number} (${c.bloom_level}): ${c.description}`).join('\n')}

PLOs:
${plos.map((p) => `PLO${p.number} ${p.title}: ${p.description}`).join('\n')}`;
  try {
    const r = await callGemini<{ mappings: Array<{ clo: number; plo: number; weight: number; rationale: string }> }>(prompt);
    const suggestions: MappingSuggestion[] = [];
    for (const m of r.mappings ?? []) {
      const clo = clos.find((c) => c.number === Number(m.clo));
      const plo = plos.find((p) => p.number === Number(m.plo));
      const w = Number(m.weight);
      if (clo && plo && [1, 2, 3].includes(w)) {
        suggestions.push({ clo_id: clo.id, plo_id: plo.id, weight: w as 1 | 2 | 3, rationale: String(m.rationale ?? '') });
      }
    }
    if (!suggestions.length) throw new Error('No valid mappings returned');
    return { suggestions, engine: 'gemini' };
  } catch (e) {
    return { suggestions: nlp(), engine: 'nlp', notes: `Gemini failed (${(e as Error).message.slice(0, 100)}); used NLP engine.` };
  }
}
