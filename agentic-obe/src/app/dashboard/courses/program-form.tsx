import { GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ActionForm, SubmitButton } from '@/components/ui/action-form';
import { createProgramAction } from '@/app/actions/mapping';

export function ProgramForm({ firstProgram }: { firstProgram?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-purple-600" /> {firstProgram ? 'Create Your First Program' : 'Add Degree Program'}</CardTitle>
        <CardDescription>Courses belong to a program; the program owns the PLOs that CLOs map to.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={createProgramAction} className="space-y-4" resetOnSuccess>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input name="code" id="p_code" label="Code" placeholder="BSSE" required />
            <Input name="name" id="p_name" label="Name" placeholder="BS Software Engineering" required />
            <Input name="department" id="p_dept" label="Department" placeholder="Computing" />
            <Input name="accreditation_body" id="p_acc" label="Accreditation Body" placeholder="NCEAC / PEC / ABET" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="standard_plos" defaultChecked className="h-4 w-4" /> Start with the 12 standard Washington Accord PLOs (editable later)
          </label>
          <SubmitButton>Create Program</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
