export type Lang = 'en' | 'rw' | 'fr' | 'sw';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type GraphicsQuality = 'ultra' | 'low';
export type ViewName =
  | 'dashboard'
  | 'lesson'
  | 'assistant'
  | 'assessment'
  | 'methodology'
  | 'library'
  | 'resources'
  | 'settings'
  | 'admin';

export type StageType = 'intro' | 'development' | 'conclusion';

export type PrintOrientation = 'portrait' | 'landscape';

export interface LessonStageRow {
  id: string;
  stageType: StageType;
  stageName: string;
  timingMinutes: number;
  teacherActivities: string;
  learnerActivities: string;
  competencesAndIssues: string;
  observations?: string;
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
  assessmentCriteria?: string;
  homework?: string;
  teacherSelfEvaluation: string;
}

export interface SavedPlan {
  id: string;
  createdAt: string;
  updatedAt: string;
  language: Lang;
  plan: LessonPlanData;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
  sources?: GroundingSource[];
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

export interface SiteSettings {
  bannerText: string;
  bannerActive: boolean;
  maintenanceMode: boolean;
  toolLesson: boolean;
  toolAssistant: boolean;
  toolAssessment: boolean;
  toolMethodology: boolean;
}

export interface DeveloperProfile {
  name: string;
  title: string;
  school: string;
  bio: string;
  photoUrl: string;
  phone: string;
  email: string;
  github: string;
  localizedTitles?: Partial<Record<Lang, string>>;
  localizedBios?: Partial<Record<Lang, string>>;
}

export interface LessonClarification {
  issueType: 'subject_topic_mismatch' | 'subject_level_mismatch' | 'unit_topic_mismatch';
  title: string;
  message: string;
  selectedSubject: string;
  selectedClass: string;
  enteredTopic: string;
  suggestedSubject?: string;
  suggestedClass?: string;
  questions: string[];
}

export interface LessonQualityReport {
  passed: boolean;
  curriculumVerified: boolean;
  checks: {
    subjectTopicConsistent: boolean;
    singleCleanTitle: boolean;
    grammarAndPurityCleaned: boolean;
    objectivesActivitiesAligned: boolean;
    durationMatches: boolean;
    senAdapted: boolean;
    noInventedResults: boolean;
    completeStructure: boolean;
  };
  correctionsApplied: string[];
}
