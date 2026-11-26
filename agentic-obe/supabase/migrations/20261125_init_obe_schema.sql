-- ############################################################################
-- OBSOLETE — DO NOT RUN. Early prototype schema; the app no longer uses it.
-- Use 20261126_agentic_obe_schema.sql instead (it also cleans this one up).
-- ############################################################################
-- ============================================================================
-- Agentic OBE - PostgreSQL Schema for Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES (extends Supabase Auth users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'hod', 'teacher', 'student')),
  department TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'teacher')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. PROGRAMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  total_credit_hours INTEGER DEFAULT 130,
  accreditation_body TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. PROGRAM LEARNING OUTCOMES (PLOs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  domain TEXT DEFAULT 'cognitive' CHECK (domain IN ('cognitive', 'psychomotor', 'affective')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, number)
);

-- ============================================================================
-- 4. COURSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  credit_hours INTEGER NOT NULL DEFAULT 3,
  contact_hours_per_week INTEGER NOT NULL DEFAULT 3,
  semester INTEGER,
  description TEXT,
  prerequisites TEXT[],
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, code)
);

-- ============================================================================
-- 5. COURSE OFFERINGS (a specific semester instance of a course)
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_offerings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id),
  semester_label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  lecture_days TEXT[] NOT NULL DEFAULT '{"Monday","Wednesday"}',
  lecture_time TEXT,
  lab_day TEXT,
  lab_time TEXT,
  total_weeks INTEGER DEFAULT 16,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  syllabus_file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. COURSE LEARNING OUTCOMES (CLOs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  description TEXT NOT NULL,
  bloom_level TEXT NOT NULL CHECK (bloom_level IN ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')),
  bloom_domain TEXT DEFAULT 'cognitive' CHECK (bloom_domain IN ('cognitive', 'psychomotor', 'affective')),
  is_approved BOOLEAN DEFAULT FALSE,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_offering_id, number)
);

-- ============================================================================
-- 7. CLO-PLO MAPPING (Many-to-Many with weight)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clo_plo_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clo_id UUID NOT NULL REFERENCES clos(id) ON DELETE CASCADE,
  plo_id UUID NOT NULL REFERENCES plos(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL CHECK (weight IN (1, 2, 3)),
  ai_suggested BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clo_id, plo_id)
);

-- ============================================================================
-- 8. WEEKLY PLAN
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  topic TEXT NOT NULL,
  subtopics TEXT[],
  learning_objectives TEXT[],
  teaching_method TEXT DEFAULT 'Lecture',
  lecture_date DATE,
  is_holiday BOOLEAN DEFAULT FALSE,
  holiday_name TEXT,
  clo_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_offering_id, week_number)
);

-- ============================================================================
-- 9. ASSESSMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('quiz', 'assignment', 'midterm', 'final_exam', 'lab', 'project', 'presentation', 'viva')),
  total_marks NUMERIC NOT NULL,
  weight_percentage NUMERIC NOT NULL DEFAULT 10,
  scheduled_date DATE,
  week_number INTEGER,
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. ASSESSMENT QUESTIONS (each mapped to a CLO)
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessment_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  description TEXT,
  max_marks NUMERIC NOT NULL,
  clo_id UUID NOT NULL REFERENCES clos(id),
  bloom_level TEXT NOT NULL CHECK (bloom_level IN ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assessment_id, question_number)
);

-- ============================================================================
-- 11. ENROLLMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id),
  roll_number TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dropped', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_offering_id, student_id)
);

-- ============================================================================
-- 12. STUDENT MARKS (per question per student)
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  assessment_question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  marks_obtained NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enrollment_id, assessment_question_id)
);

-- ============================================================================
-- 13. VIEWS FOR CLO ATTAINMENT CALCULATION
-- ============================================================================

-- View: Per-student, per-CLO marks aggregation
CREATE OR REPLACE VIEW clo_student_scores AS
SELECT
  e.student_id,
  e.id AS enrollment_id,
  e.roll_number,
  p.full_name AS student_name,
  co.id AS course_offering_id,
  c.id AS clo_id,
  c.number AS clo_number,
  c.description AS clo_description,
  c.bloom_level,
  COALESCE(SUM(sm.marks_obtained), 0) AS total_obtained,
  COALESCE(SUM(aq.max_marks), 0) AS total_max,
  CASE
    WHEN COALESCE(SUM(aq.max_marks), 0) = 0 THEN 0
    ELSE ROUND((COALESCE(SUM(sm.marks_obtained), 0) / SUM(aq.max_marks)) * 100, 2)
  END AS percentage
FROM enrollments e
JOIN profiles p ON p.id = e.student_id
JOIN course_offerings co ON co.id = e.course_offering_id
JOIN clos c ON c.course_offering_id = co.id
JOIN assessment_questions aq ON aq.clo_id = c.id
LEFT JOIN student_marks sm ON sm.enrollment_id = e.id AND sm.assessment_question_id = aq.id
GROUP BY e.student_id, e.id, e.roll_number, p.full_name, co.id, c.id, c.number, c.description, c.bloom_level;

-- View: CLO attainment summary (cohort level)
CREATE OR REPLACE VIEW clo_attainment_summary AS
SELECT
  course_offering_id,
  clo_id,
  clo_number,
  clo_description,
  bloom_level,
  COUNT(*) AS total_students,
  COUNT(*) FILTER (WHERE percentage >= 50) AS students_above_threshold,
  ROUND(AVG(percentage), 2) AS average_percentage,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND((COUNT(*) FILTER (WHERE percentage >= 50)::NUMERIC / COUNT(*)) * 100, 2)
  END AS attainment_percentage
FROM clo_student_scores
GROUP BY course_offering_id, clo_id, clo_number, clo_description, bloom_level;

-- ============================================================================
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE plos ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clo_plo_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_marks ENABLE ROW LEVEL SECURITY;

-- For development: allow all authenticated users to read/write
-- (In production, replace with role-based policies)
CREATE POLICY "Allow authenticated users full access to profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to programs"
  ON programs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to plos"
  ON plos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to courses"
  ON courses FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to course_offerings"
  ON course_offerings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to clos"
  ON clos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to clo_plo_mappings"
  ON clo_plo_mappings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to weekly_plans"
  ON weekly_plans FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to assessments"
  ON assessments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to assessment_questions"
  ON assessment_questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to enrollments"
  ON enrollments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to student_marks"
  ON student_marks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Done! Your Agentic OBE database schema is ready.
-- ============================================================================
