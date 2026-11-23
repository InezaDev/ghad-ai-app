import {
  AssessmentData,
  Lang,
  LessonPlanData,
  MethodologyData,
} from '../types/ghad';
import { LANG_NAMES, translate } from '../i18n/translations';

export class AiClientError extends Error {
  status: number;
  isAborted: boolean;
  isHighDemand: boolean;
  constructor(message: string, status = 500, opts?: { isAborted?: boolean }) {
    super(message);
    this.status = status;
    this.isAborted = Boolean(opts?.isAborted);
    this.isHighDemand = status === 503 || status === 429;
  }
}

const REQUEST_TIMEOUT_MS = 120_000;
const ASSISTANT_TIMEOUT_MS = 90_000;

function extractCleanErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Plain error string
  }
  return raw;
}

async function postAiJson<T>(
  url: string,
  payload: Record<string, unknown>,
  lang: Lang,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON response fallback
    }

    if (!response.ok) {
      const errMsg =
        typeof data.error === 'string' && data.error.trim()
          ? extractCleanErrorMessage(data.error.trim())
          : `${translate(lang, 'toast_net')} (${response.status})`;
      throw new AiClientError(errMsg, response.status);
    }

    return data as T;
  } catch (err) {
    if (err instanceof AiClientError) throw err;
    if (options?.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }
    if (timedOut || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new AiClientError(translate(lang, 'err_timeout'), 408);
    }
    const msg = err instanceof Error ? err.message : translate(lang, 'toast_net');
    throw new AiClientError(msg, 500);
  } finally {
    clearTimeout(timer);
    if (options?.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export interface LessonRequestParams {
  lang: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  duration: number;
  unitNo: string;
  unitTitle: string;
  lessonNo: string;
  learners: number;
  term: string;
  date: string;
  sen: string;
  schoolName: string;
  teacherName: string;
  extra: string;
  mode?: 'generate' | 'complete_missing';
  existingPlan?: Partial<LessonPlanData>;
  signal?: AbortSignal;
}

export async function requestLessonPlan(params: LessonRequestParams): Promise<LessonPlanData> {
  const localizedTerm =
    translate(params.lang, `term_${params.term.replace(/\s+/g, '_').toLowerCase()}`) || params.term;

  const res = await postAiJson<{ plan: Record<string, unknown> }>(
    '/api/lesson',
    {
      language: params.lang,
      langName: LANG_NAMES[params.lang],
      subject: params.subject,
      classLevel: params.classLevel,
      topic: params.topic,
      duration: params.duration,
      unitNo: params.unitNo,
      unitTitle: params.unitTitle,
      lessonNo: params.lessonNo,
      learners: params.learners,
      term: localizedTerm,
      date: params.date,
      sen: params.sen,
      schoolName: params.schoolName,
      teacherName: params.teacherName,
      extra: params.extra,
      mode: params.mode || 'generate',
      existingPlan: params.existingPlan,
    },
    params.lang,
    { signal: params.signal }
  );

  const p = res.plan || {};
  const stages = Array.isArray(p.stages) ? p.stages : [];

  return {
    schoolName: params.schoolName || String(p.schoolName || ''),
    teacherName: params.teacherName || String(p.teacherName || ''),
    term: String(p.term || localizedTerm),
    date: params.date || String(p.date || new Date().toISOString().slice(0, 10)),
    subject: String(p.subject || params.subject),
    classLevel: String(p.classLevel || params.classLevel),
    unitNo: String(p.unitNo || params.unitNo || '1'),
    lessonNo: String(p.lessonNo || params.lessonNo || '1 of 4'),
    durationMinutes: Number(params.duration) || Number(p.durationMinutes) || 40,
    classSize: String(params.learners || p.classSize || '40'),
    sen: String(p.sen || params.sen || 'None (0)'),
    unitTitle: String(p.unitTitle || params.unitTitle || ''),
    keyUnitCompetence: String(p.keyUnitCompetence || ''),
    lessonTitle: String(p.lessonTitle || params.topic || params.unitTitle || ''),
    instructionalObjective: String(p.instructionalObjective || ''),
    planLocation: String(p.planLocation || 'Inside the classroom'),
    learningMaterials: String(p.learningMaterials || ''),
    references: String(p.references || ''),
    activityOverview: String(p.activityOverview || ''),
    stages: stages.map((s: Record<string, unknown>, idx: number) => ({
      id: `stage_${Date.now()}_${idx}`,
      stageType:
        s.stageType === 'intro' || s.stageType === 'conclusion' ? s.stageType : 'development',
      stageName: String(s.stageName || `Stage ${idx + 1}`),
      timingMinutes: Number(s.timingMinutes) || 0,
      teacherActivities: String(s.teacherActivities || ''),
      learnerActivities: String(s.learnerActivities || ''),
      competencesAndIssues: String(s.competencesAndIssues || ''),
    })),
    teacherSelfEvaluation: String(p.teacherSelfEvaluation || ''),
  };
}

export async function requestAssistantReply(params: {
  lang: Lang;
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await postAiJson<{ reply: string }>(
    '/api/assistant',
    {
      language: params.lang,
      langName: LANG_NAMES[params.lang],
      message: params.message,
      history: params.history,
    },
    params.lang,
    { signal: params.signal, timeoutMs: ASSISTANT_TIMEOUT_MS }
  );
  return typeof res.reply === 'string' ? res.reply : '';
}

export async function requestAssessment(params: {
  lang: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  count: number;
  difficulty: string;
  type: string;
  signal?: AbortSignal;
}): Promise<AssessmentData> {
  const res = await postAiJson<{ assessment: Partial<AssessmentData> }>(
    '/api/assessment',
    {
      language: params.lang,
      langName: LANG_NAMES[params.lang],
      subject: params.subject,
      classLevel: params.classLevel,
      topic: params.topic,
      count: params.count,
      difficulty: params.difficulty,
      type: params.type,
    },
    params.lang,
    { signal: params.signal }
  );
  const a = res.assessment || {};
  return {
    title: String(a.title || `${params.subject} (${params.classLevel}) — ${params.topic}`),
    instructions: String(a.instructions || ''),
    totalMarks: Number(a.totalMarks) || 0,
    questions: Array.isArray(a.questions)
      ? a.questions.map((q, idx) => ({
          number: Number(q?.number) || idx + 1,
          type: String(q?.type || params.type),
          question: String(q?.question || ''),
          options: Array.isArray(q?.options) ? q.options : [],
          marks: Number(q?.marks) || 1,
          answer: String(q?.answer || ''),
          markingNotes: String(q?.markingNotes || ''),
        }))
      : [],
  };
}

export async function requestMethodology(params: {
  lang: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  classSize?: number;
  signal?: AbortSignal;
}): Promise<MethodologyData> {
  const res = await postAiJson<{ methodology: Partial<MethodologyData> }>(
    '/api/methodology',
    {
      language: params.lang,
      langName: LANG_NAMES[params.lang],
      subject: params.subject,
      classLevel: params.classLevel,
      topic: params.topic,
      classSize: params.classSize || 40,
    },
    params.lang,
    { signal: params.signal }
  );
  const m = res.methodology || {};
  return {
    title: String(m.title || `${params.subject} (${params.classLevel}) — ${params.topic}`),
    coreApproach: String(m.coreApproach || ''),
    strategies: Array.isArray(m.strategies) ? m.strategies : [],
    differentiationSen: String(m.differentiationSen || ''),
    formativeChecks: Array.isArray(m.formativeChecks) ? m.formativeChecks : [],
    recommendedMaterials: Array.isArray(m.recommendedMaterials) ? m.recommendedMaterials : [],
  };
}
