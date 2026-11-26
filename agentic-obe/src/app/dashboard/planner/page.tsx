import { Brain } from 'lucide-react';
import { PageHeader } from '@/components/ui/field';
import { requireUser, STAFF_ROLES } from '@/lib/auth';
import { canEditCourse, listCourses, listPrograms, listTeachers } from '@/lib/queries';
import { getGeminiConfig } from '@/lib/settings';
import { parseJson } from '@/lib/db';
import { PlannerWizard } from './planner-wizard';
import { ProgramForm } from '../courses/program-form';

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requireUser(STAFF_ROLES);
  const { course } = await searchParams;
  const programs = await listPrograms();
  const all = await listCourses(user);
  const editable = await Promise.all(all.map((c) => canEditCourse(user, c.id)));
  const courses = all
    .filter((_, i) => editable[i])
    .map((c) => ({
      id: c.id,
      label: `${c.code} — ${c.title} (${c.semester_label})`,
      total_weeks: c.total_weeks,
      has_lab: !!c.lab_day || c.lab_credit_hours > 0,
      outline: c.outline_text ?? '',
      lecture_days: parseJson<string[]>(c.lecture_days, []),
    }));

  return (
    <div className="space-y-8">
      <PageHeader icon={Brain} tone="purple"
        title="AI Course Planner"
        description="Upload a course outline: the AI agent extracts topics, builds a weekly plan, suggests measurable CLOs (Bloom's taxonomy) and recommends CLO→PLO mappings. You review and approve everything."
      />
      {programs.length ? (
        <PlannerWizard
          programs={programs}
          teachers={user.role === 'teacher' ? undefined : await listTeachers()}
          courses={courses}
          initialCourseId={Number(course) || null}
          engine={await getGeminiConfig() ? 'gemini' : 'nlp'}
          userId={user.id}
        />
      ) : (
        <ProgramForm firstProgram />
      )}
    </div>
  );
}
