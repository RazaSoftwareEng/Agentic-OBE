import 'server-only';
import { parseJson } from '../db';
import { listPlos, listWeeklyPlan, loadCourseBundle } from '../queries';
import { getSettings } from '../settings';
import { analyzeCourse, type RiskModel } from './analytics';
import { getRiskModel } from './service';

/** Load + analyze one course (attainment, gaps, risk) with current settings. */
export async function runCourseAnalysis(course: { id: number; program_id: number }, model?: RiskModel) {
  const [settings, bundle, plos, weekly] = await Promise.all([
    getSettings(),
    loadCourseBundle(course.id),
    listPlos(course.program_id),
    listWeeklyPlan(course.id),
  ]);
  const weeklyClos = [...new Set(weekly.flatMap((w) => parseJson<number[]>(w.clo_numbers, [])))];
  const m = model ?? await getRiskModel();
  const analysis = analyzeCourse(bundle, plos, weeklyClos, settings, m);
  return { settings, bundle, plos, weekly, analysis, model: m };
}
