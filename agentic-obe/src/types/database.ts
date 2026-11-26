// ============================================================================
// Agentic OBE - Core Database Types
// These types mirror the Supabase PostgreSQL schema
// ============================================================================

export type UserRole = 'admin' | 'hod' | 'teacher' | 'student';

export type BloomLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';

export type BloomDomain = 'cognitive' | 'psychomotor' | 'affective';

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

export type MappingWeight = 1 | 2 | 3; // 1=Low, 2=Medium, 3=High

// ============================================================================
// Core Entities
// ============================================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  name: string;
  code: string; // e.g. "BSCS", "BSSE"
  department: string;
  total_credit_hours: number;
  accreditation_body?: string; // "PEC", "ABET", "NBA"
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PLO {
  id: string;
  program_id: string;
  number: number; // 1-12 (Washington Accord)
  title: string; // e.g. "Engineering Knowledge"
  description: string;
  domain: BloomDomain;
  created_at: string;
}

export interface Course {
  id: string;
  program_id: string;
  title: string;
  code: string; // e.g. "CS301"
  credit_hours: number;
  contact_hours_per_week: number;
  semester: number;
  description?: string;
  prerequisites?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CourseOffering {
  id: string;
  course_id: string;
  teacher_id: string;
  semester_label: string; // e.g. "Fall 2026"
  start_date: string;
  end_date: string;
  lecture_days: string[]; // e.g. ["Monday", "Wednesday"]
  lecture_time?: string;
  lab_day?: string;
  lab_time?: string;
  total_weeks: number;
  status: 'draft' | 'active' | 'completed';
  syllabus_file_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CLO {
  id: string;
  course_offering_id: string;
  number: number; // CLO 1, 2, 3...
  description: string;
  bloom_level: BloomLevel;
  bloom_domain: BloomDomain;
  is_approved: boolean;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface CLOPLOMapping {
  id: string;
  clo_id: string;
  plo_id: string;
  weight: MappingWeight;
  ai_suggested: boolean;
  is_approved: boolean;
  created_at: string;
}

export interface WeeklyPlan {
  id: string;
  course_offering_id: string;
  week_number: number;
  topic: string;
  subtopics?: string[];
  learning_objectives?: string[];
  teaching_method?: string;
  lecture_date?: string;
  is_holiday?: boolean;
  holiday_name?: string;
  clo_ids: string[]; // CLOs covered this week
  created_at: string;
}

export interface Assessment {
  id: string;
  course_offering_id: string;
  title: string;
  type: AssessmentType;
  total_marks: number;
  weight_percentage: number; // e.g. 10 means 10%
  scheduled_date?: string;
  week_number?: number;
  instructions?: string;
  created_at: string;
  updated_at: string;
}

export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  question_number: number;
  description?: string;
  max_marks: number;
  clo_id: string;
  bloom_level: BloomLevel;
  created_at: string;
}

export interface Enrollment {
  id: string;
  course_offering_id: string;
  student_id: string;
  roll_number: string;
  status: 'active' | 'dropped' | 'withdrawn';
  created_at: string;
}

export interface StudentMark {
  id: string;
  enrollment_id: string;
  assessment_question_id: string;
  marks_obtained: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Computed / Aggregated Types (not stored, but calculated)
// ============================================================================

export interface CLOAttainment {
  clo_id: string;
  clo_number: number;
  clo_description: string;
  bloom_level: BloomLevel;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  students_above_threshold: number;
  total_students: number;
  attainment_percentage: number; // % of students meeting threshold
  threshold: number; // e.g. 50
}

export interface PLOAttainment {
  plo_id: string;
  plo_number: number;
  plo_title: string;
  weighted_attainment: number;
  contributing_clos: Array<{
    clo_id: string;
    clo_number: number;
    weight: MappingWeight;
    attainment: number;
  }>;
}

export interface StudentRiskAssessment {
  student_id: string;
  student_name: string;
  roll_number: string;
  overall_percentage: number;
  risk_tier: RiskTier;
  weak_clos: Array<{
    clo_id: string;
    clo_number: number;
    percentage: number;
  }>;
  recommendation: string;
}

// ============================================================================
// AI Agent Types
// ============================================================================

export interface AISyllabusExtraction {
  course_title: string;
  course_code: string;
  credit_hours: number;
  textbooks: string[];
  topics: Array<{
    title: string;
    subtopics: string[];
    estimated_lectures: number;
  }>;
  weekly_plan: Array<{
    week: number;
    topic: string;
    subtopics: string[];
    teaching_method: string;
  }>;
  suggested_clos: Array<{
    number: number;
    description: string;
    bloom_level: BloomLevel;
    bloom_domain: BloomDomain;
  }>;
}

export interface AICLOPLOSuggestion {
  clo_id: string;
  plo_id: string;
  suggested_weight: MappingWeight;
  reasoning: string;
}
