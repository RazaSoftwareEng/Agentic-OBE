import { CalendarOff, Globe, Key, Trash2, UserCog, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader, Select, th, td } from '@/components/ui/field';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { all } from '@/lib/db';
import { listHolidays } from '@/lib/queries';
import { getGeminiConfig, getSettings } from '@/lib/settings';
import { addHolidayAction, deleteHolidayAction, saveAiSettingsAction, saveSettingsAction, setUserRoleAction } from '@/app/actions/settings';
import { formatDate } from '@/lib/utils';
import { ProgramForm } from '../courses/program-form';

export default async function SettingsPage() {
  const user = await requireUser(STAFF_ROLES);
  const s = await getSettings();
  const admin = user.role === 'admin' || user.role === 'hod';
  const gemini = await getGeminiConfig();
  const keySource = s.gemini_api_key ? 'Settings' : gemini ? '.env.local' : null;
  const users = user.role === 'admin' ? await all<{ id: number; full_name: string; email: string; role: string }>('SELECT id, full_name, email, role FROM users ORDER BY role, full_name') : [];

  return (
    <div className="space-y-8">
      <PageHeader icon={SlidersHorizontal} tone="slate" title="Settings" description="Institution details, OBE thresholds, AI engine, academic calendar and users." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-purple-600" /> Institution & OBE Thresholds</CardTitle>
          <CardDescription>{admin ? 'Used in every attainment calculation and report header.' : 'Only HOD/Admin can change these.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveSettingsAction} className="space-y-4">
            <fieldset disabled={!admin} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input id="university_name" name="university_name" label="University name" defaultValue={s.university_name} />
              <Input id="department_name" name="department_name" label="Department" defaultValue={s.department_name} />
              <Input id="accreditation_body" name="accreditation_body" label="Accreditation body" defaultValue={s.accreditation_body} />
              <Input id="clo_threshold" name="clo_threshold" type="number" min={0} max={100} label="Student CLO pass mark (%)" defaultValue={s.clo_threshold} />
              <Input id="clo_target" name="clo_target" type="number" min={0} max={100} label="CLO target: % of students attaining" defaultValue={s.clo_target} />
              <Input id="plo_target" name="plo_target" type="number" min={0} max={100} label="PLO target attainment (%)" defaultValue={s.plo_target} />
            </fieldset>
            {admin && <SubmitButton>Save Settings</SubmitButton>}
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-indigo-600" /> AI Engine (Google Gemini)</CardTitle>
            <Badge variant={gemini ? 'success' : 'outline'}>{gemini ? `Gemini active (key from ${keySource})` : 'Built-in NLP engine'}</Badge>
          </div>
          <CardDescription>
            Without a key the platform uses its built-in rule-based NLP engine, which works offline. With a key, outline extraction, CLO writing and CLO→PLO mapping use the Gemini LLM, falling back to NLP on any error.
            Get a free key at aistudio.google.com/apikey.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admin ? (
            <ActionForm action={saveAiSettingsAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input id="gemini_api_key" name="gemini_api_key" type="password" label="Gemini API key" placeholder={s.gemini_api_key ? '•••••••• (saved — leave blank to keep)' : 'AIza…'} autoComplete="off" />
                <Input id="gemini_model" name="gemini_model" label="Model" defaultValue={s.gemini_model} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="clear_key" className="h-4 w-4" /> Remove the saved key</label>
              <SubmitButton>Save AI Settings</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-slate-500">Ask your HOD/Admin to configure the AI key.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5 text-red-600" /> Academic Calendar — Holidays</CardTitle>
          <CardDescription>The scheduler never places lectures or assessments on these dates. Re-run the scheduler on a course after changes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(await listHolidays()).map((h) => (
              <ActionForm key={h.id} action={deleteHolidayAction} inlineMessage>
                <input type="hidden" name="id" value={h.id} />
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm">
                  {formatDate(h.date)} · {h.name}
                  <button type="submit" className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${h.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              </ActionForm>
            ))}
          </div>
          <ActionForm action={addHolidayAction} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <Input id="h_date" name="date" type="date" label="Date" required />
            <Input id="h_name" name="name" label="Holiday" placeholder="Kashmir Solidarity Day" required />
            <SubmitButton size="sm">Add Holiday</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {admin && <ProgramForm />}

      {user.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-slate-700" /> Users & Roles</CardTitle>
            <CardDescription>Grant HOD/Admin access. Self-registration only creates teacher or student accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Role</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={`${u.id}-${u.role}`}>
                    <td className={td}>{u.full_name}</td>
                    <td className={td}>{u.email}</td>
                    <td className={td}>
                      <ActionForm action={setUserRoleAction} inlineMessage className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={u.id} />
                        <Select name="role" defaultValue={u.role} className="h-8 w-36 py-0">
                          <option value="teacher">Teacher</option>
                          <option value="hod">HOD</option>
                          <option value="admin">Admin</option>
                          <option value="student">Student</option>
                        </Select>
                        <SubmitButton size="sm" variant="outline">Update</SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
