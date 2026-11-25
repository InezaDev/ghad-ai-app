import {
  AssessmentData,
  GroundingSource,
  Lang,
  LessonClarification,
  LessonPlanData,
  LessonQualityReport,
  MethodologyData,
} from '../types/ghad';

export class AiClientError extends Error {
  status: number;
  isAborted: boolean;
  isHighDemand: boolean;
  isMaintenance: boolean;
  constructor(
    message: string,
    status = 500,
    opts?: { isAborted?: boolean; isHighDemand?: boolean; isMaintenance?: boolean }
  ) {
    super(message);
    this.status = status;
    this.isAborted = Boolean(opts?.isAborted);
    this.isMaintenance = Boolean(opts?.isMaintenance);
    this.isHighDemand = opts?.isMaintenance
      ? false
      : opts?.isHighDemand ?? (status === 503 || status === 429);
  }
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    const rawText = await response.text();
    let data: (T & {
      error?: string;
      message?: string;
      details?: string;
      status?: number;
      code?: string;
      maintenanceMode?: boolean;
    }) | null = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText) as T & {
          error?: string;
          message?: string;
          details?: string;
          status?: number;
          code?: string;
          maintenanceMode?: boolean;
        };
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const baseMsg =
        data?.message ||
        data?.error ||
        (rawText && !rawText.trim().startsWith('<') ? rawText.trim().slice(0, 300) : '') ||
        `Request failed (${response.status})`;
      const detail =
        data?.details || (data?.error && data.error !== baseMsg ? data.error : undefined);
      const isMaintenance = Boolean(data?.maintenanceMode || data?.code === 'MAINTENANCE_MODE');
      const isHighDemand = !isMaintenance && (response.status === 503 || response.status === 429);
      if (detail && detail !== baseMsg) {
        console.warn(`[GHAD AI] ${url} (${response.status}):`, detail);
      }
      const msg = !isHighDemand && !isMaintenance && detail && detail !== baseMsg ? `${baseMsg} (${detail})` : baseMsg;
      throw new AiClientError(msg, response.status, {
        isHighDemand,
        isMaintenance,
      });
    }

    if (!data) {
      throw new AiClientError(
        `Server returned an unexpected non-JSON response (${response.status}).`,
        502
      );
    }
    return data;
  } catch (err: unknown) {
    if (
      signal?.aborted ||
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }
    if (err instanceof AiClientError) throw err;
    throw new AiClientError(err instanceof Error ? err.message : 'Network error', 503, {
      isHighDemand: true,
    });
  }
}

let aiQueuePromise = Promise.resolve();

async function enqueueAiRequest<T>(task: () => Promise<T>): Promise<T> {
  const previous = aiQueuePromise;
  let resolveCurrent!: () => void;
  aiQueuePromise = new Promise((resolve) => {
    resolveCurrent = resolve;
  });
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    resolveCurrent();
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
  confirmOverride?: boolean;
  existingPlan?: Partial<LessonPlanData>;
  signal?: AbortSignal;
}

export type LessonPlanApiResult =
  | {
      clarificationRequired: true;
      clarification: LessonClarification;
    }
  | {
      clarificationRequired: false;
      plan: LessonPlanData;
      qualityReport?: LessonQualityReport;
    };

export async function requestLessonPlan(params: LessonRequestParams): Promise<LessonPlanApiResult> {
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    const data = await postJson<{
      clarificationRequired?: boolean;
      clarification?: LessonClarification;
      plan?: LessonPlanData;
      qualityReport?: LessonQualityReport;
    }>(
      '/api/lesson',
      {
        language: params.lang,
        subject: params.subject,
        classLevel: params.classLevel,
        topic: params.topic,
        duration: params.duration,
        unitNo: params.unitNo,
        unitTitle: params.unitTitle,
        lessonNo: params.lessonNo,
        learners: params.learners,
        term: params.term,
        date: params.date,
        sen: params.sen,
        schoolName: params.schoolName,
        teacherName: params.teacherName,
        extra: params.extra,
        mode: params.mode,
        confirmOverride: params.confirmOverride,
        existingPlan: params.existingPlan,
      },
      params.signal
    );

    if (data?.clarificationRequired && data.clarification) {
      return {
        clarificationRequired: true,
        clarification: data.clarification,
      };
    }

    if (!data?.plan) {
      throw new AiClientError('Server returned an empty lesson plan.', 502);
    }
    const p = data.plan;
    return {
      clarificationRequired: false,
      plan: {
        ...p,
        stages: (Array.isArray(p.stages) ? p.stages : []).map((s, idx) => ({
          ...s,
          id: s.id || `stage_${Date.now()}_${idx}`,
        })),
      },
      qualityReport: data.qualityReport,
    };
  });
}

export interface AssistantReplyResult {
  reply: string;
  sources: GroundingSource[];
}

export async function requestAssistantReply(params: {
  lang: Lang;
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  useWebSearch?: boolean;
  signal?: AbortSignal;
}): Promise<AssistantReplyResult> {
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    const data = await postJson<{ reply?: string; sources?: GroundingSource[] }>(
      '/api/assistant',
      {
        language: params.lang,
        message: params.message,
        history: params.history,
        useWebSearch: params.useWebSearch ?? true,
      },
      params.signal
    );

    const reply = (data?.reply || '').trim();
    if (!reply) {
      throw new AiClientError('Assistant returned an empty response.', 502);
    }

    const sources = Array.isArray(data?.sources)
      ? data.sources.filter(
          (s): s is GroundingSource =>
            Boolean(s && typeof s.uri === 'string' && typeof s.title === 'string')
        )
      : [];

    return { reply, sources };
  });
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
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    const data = await postJson<{ assessment?: AssessmentData }>(
      '/api/assessment',
      {
        language: params.lang,
        subject: params.subject,
        classLevel: params.classLevel,
        topic: params.topic,
        count: params.count,
        difficulty: params.difficulty,
        type: params.type,
      },
      params.signal
    );

    if (!data?.assessment) {
      throw new AiClientError('Server returned an empty assessment.', 502);
    }
    return data.assessment;
  });
}

export async function requestMethodology(params: {
  lang: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  classSize?: number;
  signal?: AbortSignal;
}): Promise<MethodologyData> {
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    const data = await postJson<{ methodology?: MethodologyData }>(
      '/api/methodology',
      {
        language: params.lang,
        subject: params.subject,
        classLevel: params.classLevel,
        topic: params.topic,
        classSize: params.classSize,
      },
      params.signal
    );

    if (!data?.methodology) {
      throw new AiClientError('Server returned an empty methodology guide.', 502);
    }
    return data.methodology;
  });
}
