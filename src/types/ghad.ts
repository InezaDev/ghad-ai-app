export type Lang = 'en' | 'rw' | 'fr';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type ViewName =
  | 'dashboard'
  | 'lesson'
  | 'assistant'
  | 'assessment'
  | 'methodology'
  | 'library'
  | 'resources'
  | 'settings';

export type StageType = 'intro' | 'development' | 'conclusion';

export interface LessonStageRow {
  id: string;
  stageType: StageType;
  stageName: string;
  timingMinutes: number;
  teacherActivities: string;
  learnerActivities: string;
  competencesAndIssues: string;
}

export interface LessonPlanData {
  schoolName: string;
  teacherName: string;
  term: string;
  date: string;
  subject: string;
  classLevel: string;
  unitNo: string;
  lessonNo: string;
  durationMinutes: number;
  classSize: string;
  sen: string;
  unitTitle: string;
  keyUnitCompetence: string;
  lessonTitle: string;
  instructionalObjective: string;
  planLocation: string;
  learningMaterials: string;
  references: string;
  activityOverview: string;
  stages: LessonStageRow[];
  teacherSelfEvaluation: string;
}

export interface SavedPlan {
  id: string;
  createdAt: string;
  updatedAt: string;
  language: Lang;
  plan: LessonPlanData;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface AssessmentQuestion {
  number: number;
  type: string;
  question: string;
  options: string[];
  marks: number;
  answer: string;
  markingNotes: string;
}

export interface AssessmentData {
  title: string;
  instructions: string;
  totalMarks: number;
  questions: AssessmentQuestion[];
}

export interface SavedAssessment {
  id: string;
  createdAt: string;
  language: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  difficulty: string;
  assessmentType: string;
  data: AssessmentData;
}

export interface MethodologyStrategy {
  name: string;
  durationHint: string;
  description: string;
  teacherRole: string;
  learnerRole: string;
}

export interface MethodologyData {
  title: string;
  coreApproach: string;
  strategies: MethodologyStrategy[];
  differentiationSen: string;
  formativeChecks: string[];
  recommendedMaterials: string[];
}

export interface SavedMethodology {
  id: string;
  createdAt: string;
  language: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  data: MethodologyData;
}

export interface TeacherProfile {
  schoolName: string;
  teacherName: string;
  defaultTerm: string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface AppBackup {
  version: number;
  exportedAt: string;
  lang: Lang;
  theme: ThemeMode;
  profile: TeacherProfile;
  plans: SavedPlan[];
  chats: ChatThread[];
  assessments: SavedAssessment[];
  methodologies: SavedMethodology[];
}
