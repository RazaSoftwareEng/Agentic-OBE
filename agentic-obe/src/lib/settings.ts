import 'server-only';
import { all, run } from './db';

export interface AppSettings {
  university_name: string;
  department_name: string;
  accreditation_body: string;
  /** a student "attains" a CLO when their CLO score is >= this % */
  clo_threshold: number;
  /** a CLO is "achieved" for the class when >= this % of students attain it */
  clo_target: number;
  /** a PLO is "achieved" when its weighted attainment is >= this % */
  plo_target: number;
  gemini_api_key: string;
  gemini_model: string;
}

const DEFAULTS: AppSettings = {
  university_name: 'Your University',
  department_name: 'Department of Computer Science',
  accreditation_body: 'PEC / NCEAC',
  clo_threshold: 50,
  clo_target: 60,
  plo_target: 50,
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash',
};

const NUMERIC: (keyof AppSettings)[] = ['clo_threshold', 'clo_target', 'plo_target'];

export async function getSettings(): Promise<AppSettings> {
  const rows = await all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) {
    if (!(r.key in DEFAULTS)) continue;
    s[r.key] = NUMERIC.includes(r.key as keyof AppSettings) ? Number(r.value) : r.value;
  }
  return s as unknown as AppSettings;
}

export async function saveSettings(values: Partial<AppSettings>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in DEFAULTS) || value === undefined) continue;
    await run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      String(value)
    );
  }
}

/** Gemini key from Settings page first, then from .env.local. Placeholders are ignored. */
export async function getGeminiConfig(): Promise<{ key: string; model: string } | null> {
  const s = await getSettings();
  const candidates = [s.gemini_api_key, process.env.GEMINI_API_KEY ?? ''];
  const key = candidates.map((k) => k.trim()).find((k) => k && !/^your[_-]/i.test(k));
  if (!key) return null;
  return { key, model: s.gemini_model || process.env.GEMINI_MODEL || DEFAULTS.gemini_model };
}
