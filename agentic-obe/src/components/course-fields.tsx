import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface CourseDefaults {
  program_id?: number;
  teacher_id?: number | null;
  code?: string;
  title?: string;
  credit_hours?: number;
  lab_credit_hours?: number;
  semester_label?: string;
  start_date?: string;
  total_weeks?: number;
  lecture_days?: string[];
  lab_day?: string | null;
  status?: string;
}

/** Hook-free so it can render inside server or client forms. */
export function CourseFields({
  programs,
  teachers,
  defaults = {},
  showStatus,
}: {
  programs: Array<{ id: number; code: string; name: string }>;
  teachers?: Array<{ id: number; full_name: string }>;
  defaults?: CourseDefaults;
  showStatus?: boolean;
}) {
  const days = defaults.lecture_days ?? ['Monday', 'Wednesday'];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Input id="code" name="code" label="Course Code" placeholder="CS-201" defaultValue={defaults.code} required />
      <div className="md:col-span-1 lg:col-span-2">
        <Input id="title" name="title" label="Course Title" placeholder="Data Structures and Algorithms" defaultValue={defaults.title} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="program_id">Program</Label>
        <Select id="program_id" name="program_id" defaultValue={defaults.program_id ?? programs[0]?.id} required>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </Select>
      </div>
      <Input id="credit_hours" name="credit_hours" type="number" min={1} max={6} label="Theory Credit Hours" defaultValue={defaults.credit_hours ?? 3} />
      <Input id="lab_credit_hours" name="lab_credit_hours" type="number" min={0} max={3} label="Lab Credit Hours" defaultValue={defaults.lab_credit_hours ?? 0} />
      <Input id="semester_label" name="semester_label" label="Semester" placeholder="Fall 2026" defaultValue={defaults.semester_label ?? 'Fall 2026'} />
      <Input id="start_date" name="start_date" type="date" label="Semester Start Date" defaultValue={defaults.start_date ?? new Date().toISOString().slice(0, 10)} required />
      <Input id="total_weeks" name="total_weeks" type="number" min={8} max={20} label="Total Weeks" defaultValue={defaults.total_weeks ?? 16} />
      <div className="space-y-1 md:col-span-2">
        <Label>Lecture Days</Label>
        <div className="flex flex-wrap gap-3 pt-1">
          {WEEKDAYS.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" name="lecture_days" value={d} defaultChecked={days.includes(d)} className="h-4 w-4 rounded border-slate-300" />
              {d.slice(0, 3)}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lab_day">Lab Day</Label>
        <Select id="lab_day" name="lab_day" defaultValue={defaults.lab_day ?? ''}>
          <option value="">No lab</option>
          {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
      </div>
      {teachers && (
        <div className="space-y-1">
          <Label htmlFor="teacher_id">Instructor</Label>
          <Select id="teacher_id" name="teacher_id" defaultValue={defaults.teacher_id ?? undefined}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
        </div>
      )}
      {showStatus && (
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={defaults.status ?? 'active'}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed (used to train the risk model)</option>
          </Select>
        </div>
      )}
    </div>
  );
}
