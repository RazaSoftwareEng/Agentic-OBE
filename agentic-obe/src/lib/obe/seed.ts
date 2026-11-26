import 'server-only';
import { all, batch, get, run, type Statement } from '../db';
import { hashPassword } from '../auth';
import { STANDARD_PLOS } from '../constants';
import { nlpExtract, suggestMappings } from '../ai/nlp';
import type { BloomLevel } from '../types';
import { generateSchedule, replaceClos, replaceWeeklyPlan } from './service';

export const DEMO_OUTLINE = `Course Code: CS-201
Course Title: Data Structures and Algorithms
Credit Hours: 4 (3,1)
Pre-requisite: Programming Fundamentals

Course Contents:
1. Introduction to Data Structures: abstract data types, algorithm analysis, asymptotic notation
2. Arrays: static arrays, dynamic arrays, multi-dimensional arrays
3. Linked Lists: singly linked list, doubly linked list, circular linked list
4. Stacks: array and linked implementation, expression evaluation, recursion
5. Queues: circular queue, priority queue, deque
6. Trees: binary trees, tree traversals, binary search trees
7. Balanced Trees: AVL trees, rotations, B-trees
8. Heaps: binary heap, heap sort, priority queues
9. Hashing: hash functions, collision resolution, open addressing
10. Graphs: representation, BFS, DFS, topological sort
11. Graph Algorithms: shortest paths (Dijkstra), minimum spanning trees (Prim, Kruskal)
12. Sorting: bubble, insertion, merge sort, quick sort, comparison of sorting algorithms
13. Searching: linear search, binary search, interpolation search

Text Books:
- Data Structures and Algorithm Analysis in C++, Mark Allen Weiss
- Introduction to Algorithms, Cormen et al.
`;

const FIRST = ['Ahmed', 'Ayesha', 'Bilal', 'Fatima', 'Hamza', 'Hira', 'Usman', 'Zainab', 'Ali', 'Maryam', 'Saad', 'Sana', 'Omar', 'Iqra', 'Hassan', 'Amna', 'Taha', 'Noor', 'Daniyal', 'Mehwish', 'Fahad', 'Rabia', 'Hamid', 'Khadija', 'Zeeshan', 'Laiba', 'Asad', 'Areeba', 'Shoaib', 'Kiran'];
const LAST = ['Khan', 'Malik', 'Raza', 'Hussain', 'Butt', 'Sheikh', 'Qureshi', 'Siddiqui', 'Chaudhry', 'Iqbal', 'Javed', 'Akhtar', 'Mirza', 'Anwar', 'Rehman'];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function isSeeded(): Promise<boolean> {
  return !!(await get('SELECT id FROM users LIMIT 1'));
}

async function ensureUser(email: string, password: string, name: string, role: string, dept: string): Promise<number> {
  const ex = await get<{ id: number }>('SELECT id FROM users WHERE email = ?', email);
  if (ex) return ex.id;
  return (await run('INSERT INTO users (email, password_hash, full_name, role, department) VALUES (?, ?, ?, ?, ?)', email, hashPassword(password), name, role, dept)).id;
}

async function createCourse(opts: {
  programId: number;
  teacherId: number;
  semester: string;
  start: string;
  status: 'active' | 'completed';
  marksUpToWeek: number;
  seed: number;
  studentEmail?: string;
}) {
  const plan = nlpExtract(DEMO_OUTLINE, { totalWeeks: 16, hasLab: true });
  const { id: courseId } = await run(
    `INSERT INTO courses (program_id, teacher_id, code, title, credit_hours, lab_credit_hours, semester_label, start_date, total_weeks, lecture_days, lab_day, outline_text, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 16, '["Monday","Wednesday"]', 'Thursday', ?, ?)`,
    opts.programId, opts.teacherId, 'CS-201', 'Data Structures and Algorithms', 3, 1, opts.semester, opts.start, DEMO_OUTLINE, opts.status
  );
  await replaceClos(courseId, plan.clos as Array<{ description: string; bloom_level: BloomLevel }>, true);
  await run('UPDATE clos SET approved = 1 WHERE course_id = ?', courseId);
  await replaceWeeklyPlan(courseId, plan.weekly_plan);

  const clos = await all<{ id: number; number: number; description: string; bloom_level: BloomLevel }>('SELECT * FROM clos WHERE course_id = ? ORDER BY number', courseId);
  const plos = await all<{ id: number; number: number; title: string; description: string }>('SELECT * FROM plos WHERE program_id = ?', opts.programId);
  await batch(
    suggestMappings(clos, plos).map((m): Statement => [
      'INSERT INTO clo_plo (clo_id, plo_id, weight, approved, ai_suggested, rationale) VALUES (?, ?, ?, 1, 1, ?) ON CONFLICT (clo_id, plo_id) DO UPDATE SET weight = excluded.weight, approved = excluded.approved, ai_suggested = excluded.ai_suggested, rationale = excluded.rationale',
      [m.clo_id, m.plo_id, m.weight, m.rationale],
    ])
  );
  await generateSchedule(courseId, { quizzes: 4, assignments: 3, project: true, labExam: true }, true);

  // students
  const r = rng(opts.seed);
  const profiles: Array<{ roll: string; ability: number; diligence: number }> = [];
  const studentStmts: Statement[] = [];
  for (let i = 0; i < 32; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const roll = `${opts.semester.includes('2025') ? '24' : '25'}-CS-${String(i + 1).padStart(3, '0')}`;
    const email = i === 0 && opts.studentEmail ? opts.studentEmail : null;
    studentStmts.push(['INSERT INTO students (course_id, roll_no, name, email) VALUES (?, ?, ?, ?)', [courseId, roll, name, email]]);
    const ability = Math.min(0.97, Math.max(0.15, 0.64 + (r() + r() + r() - 1.5) * 0.36));
    profiles.push({ roll, ability, diligence: r() });
  }
  await batch(studentStmts);
  const idByRoll = new Map((await all<{ id: number; roll_no: string }>('SELECT id, roll_no FROM students WHERE course_id = ?', courseId)).map((s) => [s.roll_no, s.id]));

  // marks for assessments already conducted; CLO 3 (analysis) is deliberately harder
  const qs = await all<{ id: number; max_marks: number; clo_number: number | null; week: number }>(
    `SELECT q.id, q.max_marks, c.number AS clo_number, a.week FROM questions q
       JOIN assessments a ON a.id = q.assessment_id LEFT JOIN clos c ON c.id = q.clo_id
      WHERE a.course_id = ? AND a.week <= ?`,
    courseId,
    opts.marksUpToWeek
  );
  const difficulty: Record<number, number> = { 1: 0.06, 2: 0, 3: -0.17, 4: -0.04, 5: 0.05 };
  const markStmts: Statement[] = [];
  for (const s of profiles) {
    for (const q of qs) {
      if (s.diligence < 0.08 && r() < 0.5) continue; // occasionally absent
      const fade = s.diligence < 0.2 ? -0.012 * q.week : 0;
      const p = Math.min(1, Math.max(0, s.ability + (difficulty[q.clo_number ?? 0] ?? 0) + fade + (r() - 0.5) * 0.25));
      markStmts.push(['INSERT INTO marks (student_id, question_id, marks) VALUES (?, ?, ?)', [idByRoll.get(s.roll)!, q.id, Math.round(p * q.max_marks * 2) / 2]]);
    }
  }
  await batch(markStmts);
  return courseId;
}

/**
 * Create demo users, program, PLOs, holidays and two course offerings with marks.
 * Safe to call concurrently (e.g. several serverless instances): only one claims the seed.
 */
export async function seedDemo(): Promise<void> {
  const claim = await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', 'demo_seeded', new Date().toISOString());
  if (!claim.changes) return;
  try {
    await ensureUser('admin@obe.edu', 'admin123', 'Dr. Admin (HOD)', 'admin', 'Computer Science');
    const teacherId = await ensureUser('teacher@obe.edu', 'teacher123', 'Dr. Sara Ahmed', 'teacher', 'Computer Science');
    await ensureUser('student@obe.edu', 'student123', 'Ahmed Khan', 'student', 'Computer Science');

    let program = await get<{ id: number }>("SELECT id FROM programs WHERE code = 'BSCS'");
    if (!program) {
      program = { id: (await run("INSERT INTO programs (name, code, department, accreditation_body) VALUES ('BS Computer Science', 'BSCS', 'Computer Science', 'NCEAC')")).id };
      await batch(STANDARD_PLOS.map((p): Statement => ['INSERT INTO plos (program_id, number, title, description) VALUES (?, ?, ?, ?)', [program!.id, p.number, p.title, p.description]]));
    }
    await batch(
      [
        ['2025-11-10', 'Iqbal Day (observed)'],
        ['2025-12-25', 'Quaid-e-Azam Day'],
        ['2026-11-09', 'Iqbal Day'],
        ['2026-12-25', 'Quaid-e-Azam Day'],
      ].map(([date, name]): Statement => ['INSERT INTO holidays (date, name) VALUES (?, ?) ON CONFLICT DO NOTHING', [date, name]])
    );

    // a completed past offering (full marks incl. final) -> training data for the risk model
    await createCourse({ programId: program.id, teacherId, semester: 'Fall 2025', start: '2025-09-08', status: 'completed', marksUpToWeek: 16, seed: 7 });
    // the current offering, marks entered up to week 11
    await createCourse({ programId: program.id, teacherId, semester: 'Fall 2026', start: '2026-09-07', status: 'active', marksUpToWeek: 11, seed: 2026, studentEmail: 'student@obe.edu' });
  } catch (e) {
    await run("DELETE FROM settings WHERE key = 'demo_seeded'");
    throw e;
  }
}
