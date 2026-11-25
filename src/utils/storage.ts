import {
  AppBackup,
  ChatThread,
  GraphicsQuality,
  Lang,
  LessonPlanData,
  SavedAssessment,
  SavedMethodology,
  SavedPlan,
  TeacherProfile,
  ThemeMode,
} from '../types/ghad';
import { normalizeGraphicsQuality } from './assistantHistory';

const KEYS = {
  lang: 'ghad_lang',
  theme: 'ghad_theme',
  graphics: 'ghad_graphics_quality',
  profile: 'ghad_profile',
  plans: 'ghad_plans',
  activePlanDraft: 'ghad_active_plan_draft',
  chats: 'ghad_chats',
  activeChat: 'ghad_active_chat',
  assessments: 'ghad_assessments',
  methodologies: 'ghad_methodologies',
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors silently
  }
}

export function loadLang(): Lang {
  try {
    const v = localStorage.getItem(KEYS.lang);
    if (v === 'en' || v === 'rw' || v === 'fr' || v === 'sw') return v;
  } catch {
    // ignore
  }
  return 'en';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(KEYS.lang, lang);
  } catch {
    // ignore
  }
}

export function loadTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEYS.theme);
    if (v === 'auto' || v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'dark';
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(KEYS.theme, theme);
  } catch {
    // ignore
  }
}

export function loadGraphicsQuality(): GraphicsQuality {
  try {
    return normalizeGraphicsQuality(localStorage.getItem(KEYS.graphics));
  } catch {
    return 'ultra';
  }
}

export function saveGraphicsQuality(quality: GraphicsQuality): void {
  try {
    localStorage.setItem(KEYS.graphics, normalizeGraphicsQuality(quality));
  } catch {
    // ignore
  }
}

export function loadProfile(): TeacherProfile {
  const raw = readJson<Partial<TeacherProfile>>(KEYS.profile, {});
  return {
    schoolName: typeof raw?.schoolName === 'string' ? raw.schoolName : '',
    teacherName: typeof raw?.teacherName === 'string' ? raw.teacherName : '',
    defaultTerm: typeof raw?.defaultTerm === 'string' && raw.defaultTerm ? raw.defaultTerm : 'Term 1',
  };
}

export function saveProfile(profile: TeacherProfile): void {
  writeJson(KEYS.profile, profile);
}

export function loadPlans(): SavedPlan[] {
  const rawList = readJson<SavedPlan[]>(KEYS.plans, []);
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item) => item && typeof item === 'object' && item.plan && typeof item.plan === 'object')
    .map((item) => {
      const p = item.plan as unknown as Record<string, unknown>;
      const rawObj = p.instructionalObjective;
      const objectiveText =
        typeof rawObj === 'string'
          ? rawObj
          : rawObj && typeof rawObj === 'object'
          ? [
              (rawObj as Record<string, string>).condition,
              (rawObj as Record<string, string>).who,
              (rawObj as Record<string, string>).action,
              (rawObj as Record<string, string>).standard,
            ]
              .filter(Boolean)
              .join(' ')
          : '';

      const dur = Math.max(10, Number(p.durationMinutes) || 40);
      const introM = Math.max(3, Math.round(dur * 0.125));
      const conclM = Math.max(3, Math.round(dur * 0.125));
      const devM = Math.max(5, dur - introM - conclM);
      const existingStages = Array.isArray(p.stages) && p.stages.length > 0 ? item.plan.stages : [
        {
          id: `st_${Date.now()}_intro`,
          stageType: 'intro' as const,
          stageName: 'Introduction',
          timingMinutes: introM,
          teacherActivities: '',
          learnerActivities: '',
          competencesAndIssues: '',
        },
        {
          id: `st_${Date.now()}_dev`,
          stageType: 'development' as const,
          stageName: 'Development',
          timingMinutes: devM,
          teacherActivities: '',
          learnerActivities: '',
          competencesAndIssues: '',
        },
        {
          id: `st_${Date.now()}_concl`,
          stageType: 'conclusion' as const,
          stageName: 'Conclusion',
          timingMinutes: conclM,
          teacherActivities: '',
          learnerActivities: '',
          competencesAndIssues: '',
        },
      ];

      return {
        ...item,
        plan: {
          ...item.plan,
          unitTitle: typeof p.unitTitle === 'string' ? p.unitTitle : '',
          activityOverview: typeof p.activityOverview === 'string' ? p.activityOverview : '',
          instructionalObjective: objectiveText,
          ...(typeof p.assessmentCriteria === 'string'
            ? { assessmentCriteria: p.assessmentCriteria }
            : {}),
          ...(typeof p.homework === 'string' ? { homework: p.homework } : {}),
          stages: existingStages,
        },
      };
    });
}

export function savePlans(plans: SavedPlan[]): void {
  writeJson(KEYS.plans, plans);
}

export function loadActivePlanDraft(): LessonPlanData | null {
  const raw = readJson<LessonPlanData | null>(KEYS.activePlanDraft, null);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.stages)) return null;
  return raw;
}

export function saveActivePlanDraft(plan: LessonPlanData | null): void {
  try {
    if (plan) {
      localStorage.setItem(KEYS.activePlanDraft, JSON.stringify(plan));
    } else {
      localStorage.removeItem(KEYS.activePlanDraft);
    }
  } catch {
    // ignore storage quota errors silently
  }
}

export function loadChats(): ChatThread[] {
  const raw = readJson<ChatThread[]>(KEYS.chats, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((th) => th && typeof th === 'object' && typeof th.id === 'string')
    .map((th) => ({
      ...th,
      title: typeof th.title === 'string' && th.title ? th.title : 'Conversation',
      messages: Array.isArray(th.messages)
        ? th.messages.filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
        : [],
    }));
}

export function saveChats(chats: ChatThread[]): void {
  writeJson(KEYS.chats, chats);
}

export function loadActiveChatId(): string | null {
  try {
    return localStorage.getItem(KEYS.activeChat);
  } catch {
    return null;
  }
}

export function saveActiveChatId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEYS.activeChat, id);
    else localStorage.removeItem(KEYS.activeChat);
  } catch {
    // ignore
  }
}

export function loadAssessments(): SavedAssessment[] {
  const raw = readJson<SavedAssessment[]>(KEYS.assessments, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && item.data && typeof item.data === 'object')
    .map((item) => ({
      ...item,
      data: {
        title: String(item.data.title || item.topic || 'Assessment'),
        instructions: String(item.data.instructions || ''),
        totalMarks: Number(item.data.totalMarks) || 0,
        questions: Array.isArray(item.data.questions)
          ? item.data.questions.map((q, idx) => ({
              number: Number(q?.number) || idx + 1,
              type: String(q?.type || 'short'),
              question: String(q?.question || ''),
              options: Array.isArray(q?.options) ? q.options : [],
              marks: Number(q?.marks) || 1,
              answer: String(q?.answer || ''),
              markingNotes: String(q?.markingNotes || ''),
            }))
          : [],
      },
    }));
}

export function saveAssessments(items: SavedAssessment[]): void {
  writeJson(KEYS.assessments, items);
}

export function loadMethodologies(): SavedMethodology[] {
  const raw = readJson<SavedMethodology[]>(KEYS.methodologies, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && item.data && typeof item.data === 'object')
    .map((item) => ({
      ...item,
      data: {
        title: String(item.data.title || item.topic || 'Methodology Guide'),
        coreApproach: String(item.data.coreApproach || ''),
        strategies: Array.isArray(item.data.strategies) ? item.data.strategies : [],
        differentiationSen: String(item.data.differentiationSen || ''),
        formativeChecks: Array.isArray(item.data.formativeChecks) ? item.data.formativeChecks : [],
        recommendedMaterials: Array.isArray(item.data.recommendedMaterials)
          ? item.data.recommendedMaterials
          : [],
      },
    }));
}

export function saveMethodologies(items: SavedMethodology[]): void {
  writeJson(KEYS.methodologies, items);
}

export function buildBackupPayload(): AppBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    lang: loadLang(),
    theme: loadTheme(),
    profile: loadProfile(),
    plans: loadPlans(),
    chats: loadChats(),
    assessments: loadAssessments(),
    methodologies: loadMethodologies(),
  };
}

export function clearAllStoredHistory(): void {
  savePlans([]);
  saveActivePlanDraft(null);
  saveChats([]);
  saveActiveChatId(null);
  saveAssessments([]);
  saveMethodologies([]);
}
