import 'server-only';
import { notFound } from 'next/navigation';
import { all, get } from './db';
import type {
  Assessment,
  CLO,
  CloPlo,
  Course,
  Mark,
  PLO,
  Program,
  Question,
  SessionPlan,
  Student,
  User,
  WeeklyPlan,
} from './types';

export type CourseRow = Course & { program_code: string; program_name: string; teacher_name: string | null };

const COURSE_SELECT = `
  SELECT c.*, p.code AS program_code, p.name AS program_name, u.full_name AS teacher_name
    FROM courses c
    JOIN programs p ON p.id = c.program_id
    LEFT JOIN users u ON u.id = c.teacher_id`;

/** Courses visible to a user: admin/HOD see all, teachers their own, students where enrolled. */
export async function listCourses(user: User): Promise<CourseRow[]> {
  if (user.role === 'admin' || user.role === 'hod') {
    return all<CourseRow>(`${COURSE_SELECT} ORDER BY c.id DESC`);
  }
  if (user.role === 'teacher') {
    return all<CourseRow>(`${COURSE_SELECT} WHERE c.teacher_id = ? ORDER BY c.id DESC`, user.id);
  }
  return all<CourseRow>(
    `${COURSE_SELECT} WHERE c.id IN (SELECT course_id FROM students WHERE lower(email) = lower(?)) ORDER BY c.id DESC`,
    user.email
  );
}

export async function canAccessCourse(user: User, courseId: number): Promise<boolean> {
  return (await listCourses(user)).some((c) => c.id === courseId);
}

export async function canEditCourse(user: User, courseId: number): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'hod') return true;
  if (user.role !== 'teacher') return false;
  const c = await get<{ teacher_id: number | null }>('SELECT teacher_id FROM courses WHERE id = ?', courseId);
  return !!c && c.teacher_id === user.id;
}

/** Resolve ?course= for module pages (falls back to the user's latest course). */
export async function resolveCourse(user: User, param: string | string[] | undefined): Promise<CourseRow | null> {
  const courses = await listCourses(user);
  const id = Number(Array.isArray(param) ? param[0] : param);
  return courses.find((c) => c.id === id) ?? courses[0] ?? null;
}

export async function getCourseOr404(user: User, id: number): Promise<CourseRow> {
  const c = (await listCourses(user)).find((x) => x.id === id);
  if (!c) notFound();
  return c;
}

export const listPrograms = () => all<Program>('SELECT * FROM programs ORDER BY code');
export const getProgram = (id: number) => get<Program>('SELECT * FROM programs WHERE id = ?', id);
export const listPlos = (programId: number) =>
  all<PLO>('SELECT * FROM plos WHERE program_id = ? ORDER BY number', programId);
export const listClos = (courseId: number) =>
  all<CLO>('SELECT * FROM clos WHERE course_id = ? ORDER BY number', courseId);
export const listMappings = (courseId: number) =>
  all<CloPlo>('SELECT m.* FROM clo_plo m JOIN clos c ON c.id = m.clo_id WHERE c.course_id = ?', courseId);
export const listWeeklyPlan = (courseId: number) =>
  all<WeeklyPlan>('SELECT * FROM weekly_plans WHERE course_id = ? ORDER BY week', courseId);
export const listSessions = (courseId: number) =>
  all<SessionPlan>('SELECT * FROM sessions_plan WHERE course_id = ? ORDER BY date, id', courseId);
export const listAssessments = (courseId: number) =>
  all<Assessment>('SELECT * FROM assessments WHERE course_id = ? ORDER BY COALESCE(week, 99), id', courseId);
export const listQuestions = (courseId: number) =>
  all<Question>(
    `SELECT q.* FROM questions q JOIN assessments a ON a.id = q.assessment_id
      WHERE a.course_id = ? ORDER BY q.assessment_id, q.number`,
    courseId
  );
export const listStudents = (courseId: number) =>
  all<Student>('SELECT * FROM students WHERE course_id = ? ORDER BY roll_no', courseId);
export const listMarks = (courseId: number) =>
  all<Mark>('SELECT m.* FROM marks m JOIN students s ON s.id = m.student_id WHERE s.course_id = ?', courseId);
export const listHolidays = () => all<{ id: number; date: string; name: string }>('SELECT * FROM holidays ORDER BY date');

export function listTeachers() {
  return all<{ id: number; full_name: string }>(
    "SELECT id, full_name FROM users WHERE role IN ('teacher','hod','admin') ORDER BY full_name"
  );
}

/** Everything analytics/reports need for one course (queries run in parallel). */
export async function loadCourseBundle(courseId: number) {
  const [clos, mappings, assessments, questions, students, marks] = await Promise.all([
    listClos(courseId),
    listMappings(courseId),
    listAssessments(courseId),
    listQuestions(courseId),
    listStudents(courseId),
    listMarks(courseId),
  ]);
  return { clos, mappings, assessments, questions, students, marks };
}
export type CourseBundle = Awaited<ReturnType<typeof loadCourseBundle>>;
