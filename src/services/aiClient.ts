import {
  AssessmentData,
  GroundingSource,
  Lang,
  LessonPlanData,
  MethodologyData,
} from '../types/ghad';

export class AiClientError extends Error {
  status: number;
  isAborted: boolean;
  isHighDemand: boolean;
  constructor(message: string, status = 500, opts?: { isAborted?: boolean; isHighDemand?: boolean }) {
    super(message);
    this.status = status;
    this.isAborted = Boolean(opts?.isAborted);
    this.isHighDemand = opts?.isHighDemand ?? (status === 503 || status === 429);
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

    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      const msg = data?.error || `Request failed (${response.status})`;
      throw new AiClientError(msg, response.status, {
        isHighDemand: response.status === 503 || response.status === 429,
      });
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
  existingPlan?: Partial<LessonPlanData>;
  signal?: AbortSignal;
}

export async function requestLessonPlan(params: LessonRequestParams): Promise<LessonPlanData> {
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    const data = await postJson<{ plan?: LessonPlanData }>(
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
        existingPlan: params.existingPlan,
      },
      params.signal
    );

    if (!data?.plan) {
      throw new AiClientError('Server returned an empty lesson plan.', 502);
    }
    const p = data.plan;
    return {
      ...p,
      stages: (Array.isArray(p.stages) ? p.stages : []).map((s, idx) => ({
        ...s,
        id: s.id || `stage_${Date.now()}_${idx}`,
      })),
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
