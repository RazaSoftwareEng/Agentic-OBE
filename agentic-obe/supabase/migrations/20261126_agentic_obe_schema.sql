-- ============================================================================
-- Agentic OBE — Supabase / PostgreSQL schema (matches src/lib/db.ts)
--
-- You normally DO NOT need to run this: the app creates these tables itself on
-- first start when DATABASE_URL points at Supabase. Run it in Supabase → SQL
-- Editor only if you want to create the tables manually, or to clean up after
-- running the obsolete 20261125_init_obe_schema.sql.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: remove the OBSOLETE early-prototype schema (UUID ids, profiles,
-- course_offerings, ...). Runs ONLY if that old schema is detected, so it never
-- touches the app's real tables.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'course_offerings')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'contact_hours_per_week')
  THEN
    RAISE NOTICE 'Obsolete prototype schema found - removing it';
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    DROP FUNCTION IF EXISTS public.handle_new_user();
    DROP VIEW IF EXISTS public.clo_attainment_summary;
    DROP VIEW IF EXISTS public.clo_student_scores;
    DROP TABLE IF EXISTS public.student_marks, public.enrollments, public.assessment_questions,
      public.assessments, public.weekly_plans, public.clo_plo_mappings, public.clos,
      public.course_offerings, public.courses, public.plos, public.programs, public.profiles CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 2: the Agentic OBE schema
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','hod','teacher','student')),
  department TEXT,
  created_at TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS programs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  department TEXT,
  accreditation_body TEXT,
  created_at TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS plos (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE(program_id, number)
);
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  credit_hours INTEGER NOT NULL DEFAULT 3,
  lab_credit_hours INTEGER NOT NULL DEFAULT 0,
  semester_label TEXT NOT NULL DEFAULT 'Fall 2026',
  start_date TEXT NOT NULL,
  total_weeks INTEGER NOT NULL DEFAULT 16,
  lecture_days TEXT NOT NULL DEFAULT '["Monday","Wednesday"]',
  lab_day TEXT,
  outline_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed')),
  created_at TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clos (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  description TEXT NOT NULL,
  bloom_level TEXT NOT NULL CHECK (bloom_level IN ('C1','C2','C3','C4','C5','C6')),
  domain TEXT NOT NULL DEFAULT 'cognitive',
  approved INTEGER NOT NULL DEFAULT 0,
  ai_generated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS clo_plo (
  clo_id INTEGER NOT NULL REFERENCES clos(id) ON DELETE CASCADE,
  plo_id INTEGER NOT NULL REFERENCES plos(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL CHECK (weight IN (1,2,3)),
  approved INTEGER NOT NULL DEFAULT 0,
  ai_suggested INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  PRIMARY KEY (clo_id, plo_id)
);
CREATE TABLE IF NOT EXISTS weekly_plans (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  topic TEXT NOT NULL,
  subtopics TEXT NOT NULL DEFAULT '[]',
  clo_numbers TEXT NOT NULL DEFAULT '[]',
  UNIQUE(course_id, week)
);
CREATE TABLE IF NOT EXISTS sessions_plan (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT
);
CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  total_marks DOUBLE PRECISION NOT NULL DEFAULT 0,
  weight DOUBLE PRECISION NOT NULL DEFAULT 10,
  week INTEGER,
  date TEXT,
  is_formative INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  text TEXT,
  max_marks DOUBLE PRECISION NOT NULL,
  clo_id INTEGER REFERENCES clos(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  roll_no TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  UNIQUE(course_id, roll_no)
);
CREATE TABLE IF NOT EXISTS marks (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  marks DOUBLE PRECISION,
  PRIMARY KEY (student_id, question_id)
);
CREATE TABLE IF NOT EXISTS actions_log (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  clo_id INTEGER REFERENCES clos(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_clos_course ON clos(course_id);
CREATE INDEX IF NOT EXISTS idx_assess_course ON assessments(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_assess ON questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions_plan(course_id);

-- ---------------------------------------------------------------------------
-- STEP 3: Row Level Security ON with no policies -> Supabase's public REST API
-- (anon / authenticated keys) cannot read or write these tables. The Next.js
-- server connects with DATABASE_URL as the table owner, which bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE plos ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE clos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clo_plo ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_log ENABLE ROW LEVEL SECURITY;
