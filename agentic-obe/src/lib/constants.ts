// ============================================================================
// Agentic OBE - Application Constants
// ============================================================================

export const APP_NAME = 'Agentic OBE';
export const APP_DESCRIPTION = 'AI-Based OBE Academic Planning Platform';

// Bloom's Taxonomy Levels
export const BLOOM_LEVELS = {
  C1: { label: 'Remember', color: '#6366f1', verbs: ['Define', 'List', 'Recall', 'Identify', 'Name', 'Recognize', 'State'] },
  C2: { label: 'Understand', color: '#8b5cf6', verbs: ['Describe', 'Explain', 'Summarize', 'Interpret', 'Classify', 'Compare', 'Discuss'] },
  C3: { label: 'Apply', color: '#a855f7', verbs: ['Apply', 'Demonstrate', 'Implement', 'Solve', 'Use', 'Execute', 'Calculate'] },
  C4: { label: 'Analyze', color: '#d946ef', verbs: ['Analyze', 'Differentiate', 'Examine', 'Investigate', 'Categorize', 'Deconstruct'] },
  C5: { label: 'Evaluate', color: '#ec4899', verbs: ['Evaluate', 'Assess', 'Critique', 'Judge', 'Justify', 'Defend', 'Argue'] },
  C6: { label: 'Create', color: '#f43f5e', verbs: ['Create', 'Design', 'Develop', 'Formulate', 'Construct', 'Produce', 'Propose'] },
} as const;

// Standard PLOs (Washington Accord / PEC Graduate Attributes)
export const STANDARD_PLOS = [
  { number: 1, title: 'Engineering Knowledge', description: 'Apply knowledge of mathematics, science, engineering fundamentals, and an engineering specialization as specified in K1-K4.' },
  { number: 2, title: 'Problem Analysis', description: 'Identify, formulate, research literature, and analyze complex engineering problems reaching substantiated conclusions.' },
  { number: 3, title: 'Design/Development of Solutions', description: 'Design solutions for complex engineering problems and design systems, components, or processes that meet specified needs.' },
  { number: 4, title: 'Investigation', description: 'Conduct investigations of complex engineering problems using research-based knowledge and methods.' },
  { number: 5, title: 'Modern Tool Usage', description: 'Create, select, and apply appropriate techniques, resources, and modern engineering and IT tools.' },
  { number: 6, title: 'The Engineer and Society', description: 'Apply reasoning informed by contextual knowledge to assess societal, health, safety, legal, and cultural issues.' },
  { number: 7, title: 'Environment and Sustainability', description: 'Understand the impact of professional engineering solutions in societal and environmental contexts.' },
  { number: 8, title: 'Ethics', description: 'Apply ethical principles and commit to professional ethics, responsibilities, and norms of engineering practice.' },
  { number: 9, title: 'Individual and Teamwork', description: 'Function effectively as an individual, and as a member or leader in diverse teams and multidisciplinary settings.' },
  { number: 10, title: 'Communication', description: 'Communicate effectively on complex engineering activities with the engineering community and society at large.' },
  { number: 11, title: 'Project Management', description: 'Demonstrate knowledge and understanding of engineering management principles and economic decision-making.' },
  { number: 12, title: 'Lifelong Learning', description: 'Recognize the need for and have the preparation and ability to engage in independent and lifelong learning.' },
] as const;

// Assessment type configuration
export const ASSESSMENT_TYPES = {
  quiz: { label: 'Quiz', icon: 'ClipboardCheck', defaultWeight: 10 },
  assignment: { label: 'Assignment', icon: 'FileText', defaultWeight: 10 },
  midterm: { label: 'Midterm Exam', icon: 'BookOpen', defaultWeight: 25 },
  final_exam: { label: 'Final Exam', icon: 'GraduationCap', defaultWeight: 40 },
  lab: { label: 'Lab/Practical', icon: 'FlaskConical', defaultWeight: 15 },
  project: { label: 'Project', icon: 'FolderKanban', defaultWeight: 20 },
  presentation: { label: 'Presentation', icon: 'Presentation', defaultWeight: 5 },
  viva: { label: 'Viva Voce', icon: 'Mic', defaultWeight: 5 },
} as const;

// CLO attainment threshold (percentage)
export const CLO_ATTAINMENT_THRESHOLD = 50;

// Risk tier thresholds
export const RISK_THRESHOLDS = {
  high: 40,   // Below 40% = High Risk
  medium: 60, // 40-60% = Medium Risk
  // Above 60% = Low Risk (On Track)
} as const;

// Colors for charts
export const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#6366f1',
  muted: '#94a3b8',
} as const;
