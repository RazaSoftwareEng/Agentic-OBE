# Agentic OBE — AI-Based OBE Academic Planning

A web platform that connects course planning, CLO/PLO mapping, assessment design, attainment analysis and accreditation reporting in one workflow. All AI output is a suggestion that the teacher reviews and approves.

## Run it

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite`; no database server needed).

```bash
npm install
npm run dev          # http://localhost:3000
```

On first visit to `/login` the app creates `data/obe.db` with demo data:

| Account | Password | Role |
|---|---|---|
| admin@obe.edu | admin123 | Admin / HOD |
| teacher@obe.edu | teacher123 | Teacher (owns CS-201) |
| student@obe.edu | student123 | Student (enrolled in CS-201) |

The demo includes a completed Fall 2025 offering of CS-201 (used to train the risk model) and a running Fall 2026 offering with marks entered up to week 11.

To start over, stop the server and delete the `data/` folder.

### Optional: Gemini LLM

Without a key, a built-in NLP engine does all AI work offline. To use Google Gemini, add a key in **Settings → AI Engine** (or `GEMINI_API_KEY=...` in `.env.local`). If a Gemini call fails, the app falls back to the NLP engine.

## Deploy to Vercel (with Supabase)

Vercel's serverless filesystem does not persist data, so production needs a hosted database. The app uses **Supabase Postgres** when `DATABASE_URL` is set.

1. **Create a Supabase project** at https://supabase.com and save the database password you choose.
2. **Copy the connection string.** Click **Connect** (top of the project), choose **Transaction pooler** (port `6543`), copy the URI and replace `[YOUR-PASSWORD]` with your password:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
3. **Import the GitHub repo in Vercel.** Under *Settings → General*:
   - **Root Directory:** `agentic-obe` (the app is in this sub-folder; with the wrong root, every page returns 404)
   - **Framework Preset:** Next.js. Do not set an Output Directory.
4. **Environment variables** (*Settings → Environment Variables*):
   - `DATABASE_URL` = the connection string
   - `GEMINI_API_KEY` *(optional)*
5. **Redeploy**, then open `/login`. The tables and demo accounts are created automatically on first visit.

The app creates its own tables and turns on Row Level Security for them, so Supabase's public API (anon key) cannot read them. Only the server, connecting with `DATABASE_URL`, has access.

Alternatives: Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) also works. With no database variable at all, the app stores data in `/tmp`, which Vercel wipes, and the login page shows a warning.

## Modules

| Module | Where | What it does |
|---|---|---|
| **AI Course Planner** | `/dashboard/planner` | Upload PDF/DOCX/TXT or paste an outline → extracts topics, builds the weekly plan, writes Bloom-aligned CLOs with a measurability checker → teacher edits → Approve & Save |
| **Scheduler** | course page | Constraint-based: daily lecture/lab plan that skips holidays; places quizzes/assignments with a backtracking CSP (no exam weeks, ≤1 per week, ≥2-week gap per type, only CLOs already taught) |
| **CLO/PLO Management** | `/dashboard/mapping` | Edit/approve CLOs, AI-suggested CLO→PLO matrix (weights 1–3), program PLOs |
| **Assessment Mapping** | `/dashboard/assessments` | Question-level CLO mapping, coverage matrix, weights |
| **Students & Marks** | `/dashboard/students` | Enrolment, CSV import, marks grid, marks CSV import |
| **CLO/PLO Analytics** | `/dashboard/analytics` | CLO & PLO attainment, gap detection, logistic-regression at-risk prediction, corrective-action log |
| **Reports** | `/dashboard/reports` | Printable course file / CQI report, program PLO report, student report, CSV exports |

## How attainment is calculated

- **Student CLO score** = marks obtained ÷ maximum marks across all questions mapped to that CLO, using only assessments that have marks entered. A missing mark in such an assessment counts as 0.
- **CLO attainment** = % of students whose CLO score ≥ the pass mark (default 50%). A CLO is *achieved* when this is ≥ the target (default 60%).
- **PLO attainment** = Σ(weight × CLO attainment) ÷ Σ weight, over **approved** CLO–PLO mappings only.
- **Program PLO** = mean of course-level PLO attainment across offerings that measure it.

You can change the thresholds in Settings.

## At-risk model

This is a logistic regression on four features: current weighted grade, weakest CLO score, missed-assessment rate, and performance trend. It trains on completed courses (label: final grade < 50%) once there are at least 30 such students. Until then it uses a prior trained on a reproducible synthetic cohort. The analytics page shows the training source and accuracy.

## Code map

```
src/lib/db.ts               schema + drivers (Postgres/Supabase, Turso, local SQLite)
src/lib/auth.ts             scrypt passwords, cookie sessions, role checks
src/lib/ai/nlp.ts           NLP engine: outline parsing, Bloom analysis, CLO generation, mapping heuristics
src/lib/ai/index.ts         Gemini client with NLP fallback
src/lib/obe/scheduler.ts    constraint-based scheduler
src/lib/obe/analytics.ts    attainment, gaps, logistic regression
src/lib/obe/service.ts      plan/schedule persistence, risk-model training
src/lib/obe/seed.ts         demo data
src/app/actions/*           server actions (all permission-checked)
src/app/dashboard/*         module pages
src/app/report/*            printable reports
```

Roles: **admin/HOD** can see and edit all courses, PLOs, settings and users. **Teachers** can see and edit only their own courses. **Students** can see only their own results.
