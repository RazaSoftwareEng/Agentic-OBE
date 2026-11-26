// ============================================================================
// Agentic OBE — shared domain types (mirror the SQLite schema in lib/db.ts)
// ============================================================================

export type UserRole = 'admin' | 'hod' | 'teacher' | 'student';
export type BloomLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
export type AssessmentType =
  | 'quiz'
  | 'assignment'
  | 'midterm'
  | 'final_exam'
  | 'lab'
  | 'project'
  | 'presentation'
  | 'viva';
export type RiskTier = 'high' | 'medium' | 'low';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  department: string | null;
}

export interface Program {
  id: number;
  name: string;
  code: string;
  department: string | null;
  accreditation_body: string | null;
}

export interface PLO {
  id: number;
  program_id: number;
  number: number;
  title: string;
  description: string;
}

export interface Course {
  id: number;
  program_id: number;
  teacher_id: number | null;
  code: string;
  title: string;
  credit_hours: number;
  lab_credit_hours: number;
  semester_label: string;
  start_date: string;
  total_weeks: number;
  lecture_days: string; // JSON string[]
  lab_day: string | null;
  outline_text: string | null;
  status: 'draft' | 'active' | 'completed';
}

export interface CLO {
  id: number;
  course_id: number;
  number: number;
  description: string;
  bloom_level: BloomLevel;
  domain: string;
  approved: number;
  ai_generated: number;
}

export interface CloPlo {
  clo_id: number;
  plo_id: number;
  weight: 1 | 2 | 3;
  approved: number;
  ai_suggested: number;
  rationale: string | null;
}

export interface WeeklyPlan {
  id: number;
  course_id: number;
  week: number;
  topic: string;
  subtopics: string; // JSON string[]
  clo_numbers: string; // JSON number[]
}

export interface SessionPlan {
  id: number;
  course_id: number;
  week: number;
  date: string;
  kind: string;
  title: string;
  details: string | null;
}

export interface Assessment {
  id: number;
  course_id: number;
  title: string;
  type: AssessmentType;
  total_marks: number;
  weight: number;
  week: number | null;
  date: string | null;
  is_formative: number;
}

export interface Question {
  id: number;
  assessment_id: number;
  number: number;
  text: string | null;
  max_marks: number;
  clo_id: number | null;
}

export interface Student {
  id: number;
  course_id: number;
  roll_no: string;
  name: string;
  email: string | null;
}

export interface Mark {
  student_id: number;
  question_id: number;
  marks: number | null;
}

// ---------- AI planner output ----------

export interface ExtractedPlan {
  course_title: string;
  course_code: string;
  credit_hours: number;
  topics: Array<{ title: string; subtopics: string[] }>;
  weekly_plan: Array<{ week: number; topic: string; subtopics: string[]; clo_numbers: number[] }>;
  clos: Array<{ number: number; description: string; bloom_level: BloomLevel }>;
  engine: 'gemini' | 'nlp';
  notes?: string;
}

export interface MappingSuggestion {
  clo_id: number;
  plo_id: number;
  weight: 1 | 2 | 3;
  rationale: string;
}
