import { GenerateContentParameters, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export type SupportedLang = 'en' | 'rw' | 'fr';

const MODEL_CHAIN = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

export class AiServiceHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new AiServiceHttpError(
      500,
      'GEMINI_API_KEY is not configured on the server. Please configure it in Settings > Secrets or .env.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MODEL_COOLDOWN_MS = 15_000;
const modelCooldownUntil: Record<string, number> = {};

function extractErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Not raw JSON
  }
  return raw;
}

function isAuthOrKeyError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toUpperCase();
  return (
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('API KEY NOT VALID')
  );
}

function isUnavailableOrRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  if (status === 503 || status === 429) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted')
  );
}

function isRetryableError(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  if (status === 500 || status === 502 || status === 504) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('socket')
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      // Fast-fail on 503/429/auth errors so we switch fallback model immediately
      if (
        isAuthOrKeyError(err) ||
        isUnavailableOrRateLimitError(err) ||
        !isRetryableError(err) ||
        attempt === maxAttempts
      ) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 140);
      await new Promise((r) => setTimeout(r, 350 * attempt + jitter));
    }
  }
  throw lastError;
}

function buildConfigForModel(
  model: (typeof MODEL_CHAIN)[number],
  baseConfig: GenerateContentParameters['config']
): GenerateContentParameters['config'] {
  if (!baseConfig) return baseConfig;
  const nextConfig = { ...baseConfig };
  if (model === 'gemini-3.1-flash-lite') {
    nextConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
  } else {
    nextConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  return nextConfig;
}

async function generateWithResilience(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, 'model'>
) {
  const now = Date.now();
  const readyModels = MODEL_CHAIN.filter((m) => (modelCooldownUntil[m] || 0) <= now);
  const orderedModels =
    readyModels.length > 0
      ? [...readyModels, ...MODEL_CHAIN.filter((m) => !readyModels.includes(m))]
      : [...MODEL_CHAIN].sort((a, b) => (modelCooldownUntil[a] || 0) - (modelCooldownUntil[b] || 0));

  let lastErr: unknown;
  for (const model of orderedModels) {
    try {
      const result = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: params.contents,
            config: buildConfigForModel(model, params.config),
          }),
        2
      );
      delete modelCooldownUntil[model];
      return result;
    } catch (err: unknown) {
      lastErr = err;
      const msg = extractErrorText(err);
      console.warn(`[GHAD AI] Model ${model} error:`, msg);
      if (isAuthOrKeyError(err)) {
        throw err;
      }
      if (isUnavailableOrRateLimitError(err)) {
        modelCooldownUntil[model] = Date.now() + MODEL_COOLDOWN_MS;
      }
      // Continue to the next model in MODEL_CHAIN on 404, 503, 429, 500, 502, 504, or model config issues
    }
  }
  throw lastErr;
}

function parseJsonSafely<T>(rawText: string, label: string): T {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new AiServiceHttpError(502, `Gemini returned an empty ${label} response.`);
  }

  // Strip optional markdown ```json fences
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced) as T;
  } catch {
    const startIdx = unfenced.indexOf('{');
    const endIdx = unfenced.lastIndexOf('}');
    if (startIdx >= 0 && endIdx > startIdx) {
      try {
        return JSON.parse(unfenced.slice(startIdx, endIdx + 1)) as T;
      } catch {
        // Fall through to clean error
      }
    }
    throw new AiServiceHttpError(
      502,
      `AI returned an incomplete ${label} structure. Please click Retry.`
    );
  }
}

export function normalizeError(err: unknown): { status: number; message: string } {
  if (err instanceof AiServiceHttpError) {
    return { status: err.status, message: err.message };
  }
  const raw = err instanceof Error ? err.message : String(err);
  const cleanMsg = extractErrorText(err);
  if (
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('403')
  ) {
    return {
      status: 400,
      message: 'Invalid or unauthorized Gemini API key. Please check Settings > Secrets.',
    };
  }
  if (raw.includes('UNAVAILABLE') || raw.includes('503') || raw.toLowerCase().includes('high demand')) {
    return {
      status: 503,
      message:
        'The AI service is temporarily experiencing high demand. Please wait a few seconds and click Retry.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'AI rate limit reached temporarily. Please wait a few seconds and retry.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: cleanMsg,
    };
  }
  return { status: 500, message: cleanMsg || 'Unable to reach Gemini AI service.' };
}

const CBC_LOCALIZATION: Record<
  SupportedLang,
  {
    languageName: string;
    curriculumHeader: string;
    introName: string;
    devName: string;
    conclName: string;
    objectiveGuidance: string;
    competencesList: string;
    crossCuttingList: string;
    termMap: Record<string, string>;
    difficultyMap: Record<string, string>;
    typeMap: Record<string, string>;
    defaultLocation: string;
  }
> = {
  en: {
    languageName: 'English',
    curriculumHeader: 'Rwanda Basic Education Board (REB) Competence-Based Curriculum (CBC)',
    introName: 'Introduction',
    devName: 'Development',
    conclName: 'Conclusion',
    objectiveGuidance:
      'Instructional Objective MUST be written as ONE cohesive, grammatical official REB CBC sentence explicitly containing all 4 parts: (1) Condition ("Given... / Using..."), (2) Who ("learners / P4 learners"), (3) Action/Behavior (measurable Bloom verb like "will be able to solve / explain / demonstrate"), and (4) Standard ("accurately / correctly solving at least...").',
    competencesList:
      'Critical thinking, Creativity and innovation, Research and problem solving, Communication, Cooperation / interpersonal management and life skills, Lifelong learning.',
    crossCuttingList:
      'Genocide Studies, Environment and sustainability, Gender education, Comprehensive sexuality education, Peace and values education, Financial education, Standardization culture, Inclusive education.',
    termMap: { 'Term 1': 'Term 1', 'Term 2': 'Term 2', 'Term 3': 'Term 3' },
    difficultyMap: { easy: 'Easy (Remembering & Understanding)', medium: 'Medium (Applying & Analyzing)', hard: 'Hard (Evaluating & Creating)' },
    typeMap: { mcq: 'Multiple Choice Questions (4 options A–D)', short: 'Short Structured Answer Questions', mixed: 'Mixed (Multiple Choice and Structured Short Answer)' },
    defaultLocation: 'Inside the classroom — learners seated in mixed-ability groups.',
  },
  rw: {
    languageName: 'Ikinyarwanda (Kinyarwanda)',
    curriculumHeader: "Integanyanyigisho Ishingiye ku Bushobozi y'u Rwanda (REB CBC)",
    introName: 'Intangiriro',
    devName: 'Igice Nyamukuru',
    conclName: 'Umwanzuro',
    objectiveGuidance:
      "Intego y'isomo (Instructional Objective) IGOMBA kwandikwa mu nteruro IMWE inoze mu Kinyarwanda irimo ibice 4 bya REB CBC: (1) Imiterere/Ibikoresho (Bahawe...), (2) Uwigishwa (abanyeshuri ba...), (3) Igikorwa gipimika (bazashobora...), na (4) Igipimo cy'ubuziranenge (neza / nibura...).",
    competencesList:
      'Gutekereza byimbitse (Critical thinking), Guhanga udushya (Creativity), Gukemura ibibazo (Problem solving), Itumanaho (Communication), Ubufatanye (Cooperation), Kwiga ubuzima bwose (Lifelong learning).',
    crossCuttingList:
      "Amateka ya Jenoside, Ibidukikije n'iterambere rirambye, Uburinganire, Uburezi ku buzima bw'imyororokere, Amahoro n'indangagaciro, Uburezi ku mafaranga, Umuco w'ubuziranenge, Uburezi budaheza.",
    termMap: { 'Term 1': 'Igihembwe cya 1', 'Term 2': 'Igihembwe cya 2', 'Term 3': 'Igihembwe cya 3' },
    difficultyMap: { easy: 'Byoroshye (Kwibuka no Gusobanukirwa)', medium: 'Hagati (Gukoresha no Gusesengura)', hard: 'Bikomeye (Gusuzuma no Guhanga)' },
    typeMap: { mcq: 'Hitamo Igisubizo Nyacyo (A–D)', short: 'Ibibazo by’Ibisubizo Bigufi', mixed: 'Bivanze (Hitamo Igisubizo n’Ibisubizo Bigufi)' },
    defaultLocation: 'Imbere mu ishuri — abanyeshuri bicaye mu matsinda avanze.',
  },
  fr: {
    languageName: 'Français (French)',
    curriculumHeader: 'Curriculum basé sur les compétences du Rwanda Basic Education Board (REB CBC)',
    introName: 'Introduction',
    devName: 'Développement',
    conclName: 'Conclusion',
    objectiveGuidance:
      "L'objectif pédagogique DOIT être rédigé en UNE phrase complète et officielle en français contenant explicitement les 4 éléments : (1) Condition (À l'aide de...), (2) Qui (les apprenants de...), (3) Action (seront capables de + verbe mesurable de Bloom) et (4) Critère/Standard (avec exactitude / au moins...).",
    competencesList:
      'Esprit critique, Créativité et innovation, Recherche et résolution de problèmes, Communication, Coopération et gestion interpersonnelle, Apprentissage tout au long de la vie.',
    crossCuttingList:
      'Études sur le génocide, Environnement et durabilité, Éducation au genre, Éducation sexuelle complète, Paix et valeurs, Éducation financière, Culture de la standardisation, Éducation inclusive.',
    termMap: { 'Term 1': 'Trimestre 1', 'Term 2': 'Trimestre 2', 'Term 3': 'Trimestre 3' },
    difficultyMap: { easy: 'Facile (Mémorisation & Compréhension)', medium: 'Moyen (Application & Analyse)', hard: 'Difficile (Évaluation & Création)' },
    typeMap: { mcq: 'Questions à Choix Multiple (4 options A–D)', short: 'Questions à Réponse Courte', mixed: 'Mixte (QCM et Réponses Courtes)' },
    defaultLocation: 'Dans la salle de classe — apprenants répartis en groupes hétérogènes.',
  },
};

function resolveLang(lang?: string): SupportedLang {
  if (lang === 'rw' || lang === 'fr') return lang;
  return 'en';
}

function getLevelBand(classLevel: string): string {
  const upper = classLevel.trim().toUpperCase();
  if (/^P[1-3]$/.test(upper)) return `${upper} (Lower Primary — Rwanda REB CBC)`;
  if (/^P[4-6]$/.test(upper)) return `${upper} (Upper Primary — Rwanda REB CBC)`;
  if (/^S[1-3]$/.test(upper)) return `${upper} (Ordinary Level Secondary — Rwanda REB CBC)`;
  if (/^S[4-6]$/.test(upper)) return `${upper} (Advanced Level Secondary — Rwanda REB CBC)`;
  return `${classLevel} (Rwanda REB CBC)`;
}

function isBlankOrPlaceholder(val: unknown): boolean {
  const s = String(val ?? '').trim();
  if (!s) return true;
  if (/^[-—–_.]+$/.test(s)) return true;
  if (/^(n\/a|none|tbd|untitled|empty)$/i.test(s)) return true;
  // Detect empty numbered scaffold like "1. \n2. \n3. "
  const stripped = s.replace(/\b\d+[.)]\s*/g, '').replace(/\s+/g, '');
  return stripped.length === 0;
}

function pickMeaningful(
  preferred: unknown,
  aiValue: unknown,
  fallback: string
): string {
  const pref = String(preferred ?? '').trim();
  if (!isBlankOrPlaceholder(pref)) return pref;
  const aiStr = String(aiValue ?? '').trim();
  if (!isBlankOrPlaceholder(aiStr)) return aiStr;
  return fallback;
}

export interface ExistingLessonDraft {
  schoolName?: string;
  teacherName?: string;
  term?: string;
  date?: string;
  subject?: string;
  classLevel?: string;
  unitNo?: string;
  lessonNo?: string;
  durationMinutes?: number;
  classSize?: string;
  sen?: string;
  unitTitle?: string;
  keyUnitCompetence?: string;
  lessonTitle?: string;
  instructionalObjective?: string;
  planLocation?: string;
  learningMaterials?: string;
  references?: string;
  activityOverview?: string;
  stages?: Array<{
    stageType?: string;
    stageName?: string;
    timingMinutes?: number;
    teacherActivities?: string;
    learnerActivities?: string;
    competencesAndIssues?: string;
  }>;
  teacherSelfEvaluation?: string;
}

export interface GenerateLessonInput {
  language?: string;
  subject: string;
  classLevel: string;
  topic?: string;
  duration?: number;
  unitNo?: string;
  unitTitle?: string;
  lessonNo?: string;
  learners?: number;
  term?: string;
  date?: string;
  sen?: string;
  schoolName?: string;
  teacherName?: string;
  extra?: string;
  mode?: 'generate' | 'complete_missing';
  existingPlan?: ExistingLessonDraft;
}

function ensureNumberedActions(raw: string): string {
  const cleaned = String(raw || '').trim();
  if (!cleaned || isBlankOrPlaceholder(cleaned)) return '';
  const lines = cleaned
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length >= 2 && /^\d+[.)]\s+/.test(lines[0])) {
    return lines.join('\n');
  }

  const inlineSplit = cleaned
    .split(/(?=\b[1-9]\.\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (inlineSplit.length >= 2 && /^\d+\.\s+/.test(inlineSplit[0])) {
    return inlineSplit.join('\n');
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÿ])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length >= 2) {
    return sentences.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`).join('\n');
  }

  return /^\d+[.)]\s+/.test(cleaned) ? cleaned : `1. ${cleaned}`;
}

export async function generateRebLessonPlan(input: GenerateLessonInput) {
  const lang = resolveLang(input.language);
  const cbc = CBC_LOCALIZATION[lang];
  const existing = input.existingPlan;

  const subjectInput = String(input.subject || existing?.subject || '').trim();
  const classInput = String(input.classLevel || existing?.classLevel || '').trim();
  const rawTopicInput = String(input.topic || existing?.lessonTitle || '').trim();
  const unitNoInput = String(input.unitNo || existing?.unitNo || '1').trim();
  const unitTitleInput = String(input.unitTitle || existing?.unitTitle || '').trim();
  const lessonNoInput = String(input.lessonNo || existing?.lessonNo || '1 of 4').trim();
  const schoolInput = String(input.schoolName || existing?.schoolName || '').trim();
  const teacherInput = String(input.teacherName || existing?.teacherName || '').trim();
  const dateInput = String(input.date || existing?.date || new Date().toISOString().slice(0, 10)).trim();
  const senInput = String(input.sen || existing?.sen || 'Slow learners (2), Mild visual impairment (1)').trim();

  const targetDuration = Math.max(
    10,
    Math.min(240, Number(input.duration) || Number(existing?.durationMinutes) || 40)
  );
  const classSize = Math.max(1, Math.min(200, Number(input.learners) || Number(existing?.classSize) || 40));
  const localizedTerm =
    cbc.termMap[input.term || existing?.term || 'Term 1'] ||
    input.term ||
    existing?.term ||
    cbc.termMap['Term 1'];
  const levelContext = getLevelBand(classInput);

  // Official REB 3-stage timing split (e.g. 5 / 30 / 5 for 40m; 10 / 60 / 10 for 80m)
  const introMin = Math.max(3, Math.round(targetDuration * 0.125));
  const conclMin = Math.max(3, Math.round(targetDuration * 0.125));
  const devMin = Math.max(5, targetDuration - introMin - conclMin);

  const topicDescriptor =
    rawTopicInput ||
    (unitTitleInput
      ? `Select the exact official REB ${subjectInput} ${classInput} lesson title inside Unit ${unitNoInput}: "${unitTitleInput}" (Lesson ${lessonNoInput})`
      : `Select the official REB ${subjectInput} ${classInput} Unit ${unitNoInput}, Lesson ${lessonNoInput} title`);

  const hasPartialDraft = Boolean(existing) || input.mode === 'complete_missing';

  const partialRowsSummary = existing
    ? [
        `- Existing Unit Title: ${!isBlankOrPlaceholder(existing.unitTitle) ? existing.unitTitle : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Key Unit Competence: ${!isBlankOrPlaceholder(existing.keyUnitCompetence) ? existing.keyUnitCompetence : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Lesson Title: ${!isBlankOrPlaceholder(existing.lessonTitle) ? existing.lessonTitle : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Instructional Objective: ${!isBlankOrPlaceholder(existing.instructionalObjective) ? existing.instructionalObjective : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Plan Location: ${!isBlankOrPlaceholder(existing.planLocation) ? existing.planLocation : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Learning Materials: ${!isBlankOrPlaceholder(existing.learningMaterials) ? existing.learningMaterials : '[MISSING - AI MUST WRITE]'}`,
        `- Existing References: ${!isBlankOrPlaceholder(existing.references) ? existing.references : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Activity Overview: ${!isBlankOrPlaceholder(existing.activityOverview) ? existing.activityOverview : '[MISSING - AI MUST WRITE]'}`,
        `- Existing Teacher Self-Evaluation: ${!isBlankOrPlaceholder(existing.teacherSelfEvaluation) ? existing.teacherSelfEvaluation : '[MISSING - AI MUST WRITE]'}`,
        ...(Array.isArray(existing.stages)
          ? existing.stages.map((st, idx) => {
              const tOk = !isBlankOrPlaceholder(st.teacherActivities);
              const lOk = !isBlankOrPlaceholder(st.learnerActivities);
              const cOk = !isBlankOrPlaceholder(st.competencesAndIssues);
              return `  * Stage ${idx + 1} (${st.stageType || st.stageName || 'stage'}, ${st.timingMinutes || '?'}m): teacherActivities=${tOk ? JSON.stringify(st.teacherActivities) : '[MISSING - AI MUST WRITE]'}, learnerActivities=${lOk ? JSON.stringify(st.learnerActivities) : '[MISSING - AI MUST WRITE]'}, competencesAndIssues=${cOk ? JSON.stringify(st.competencesAndIssues) : '[MISSING - AI MUST WRITE]'}`;
            })
          : []),
      ].join('\n')
    : '';

  const systemInstruction = [
    `You are a senior curriculum specialist and master teacher trainer for the ${cbc.curriculumHeader}.`,
    `STRICT LANGUAGE & GRAMMAR RULE: Translate and generate EVERY single output field strictly in clear, grammatically accurate, natural ${cbc.languageName}. If the teacher's topic or unit input contains spelling typos (for example "EQUITY AND EQULITY"), silently correct the spelling in your generated plan while keeping the exact intended meaning.`,
    `AUTO-COMPLETE FROM TEACHER IDENTIFICATION RULE: Teachers frequently enter only their Identification metadata (School Name, Teacher Name, Subject, Class, Unit Nº, Unit Title, Lesson Nº, Term, Duration, Class Size, SEN) or partially fill a template. You MUST automatically write and complete EVERY SINGLE missing curriculum, objective, resource, teaching/learning stage, competence, and self-evaluation field so there are ZERO blank or incomplete sections.`,
    hasPartialDraft
      ? `PRESERVE & COMPLETE MODE: Keep all accurate teacher-provided Identification and any complete non-empty section text verbatim (fixing only obvious typos if needed), and richly write every field marked [MISSING - AI MUST WRITE].`
      : '',
    `TOPIC-SPECIFICITY RULE: Every field (Unit Title, Key Unit Competence, Instructional Objective, Learning Materials, References, Activity Overview, all 3 Stages, and Self-Evaluation) MUST be specifically tailored to "${subjectInput}" (${classInput}) and the lesson "${rawTopicInput || unitTitleInput || `Unit ${unitNoInput} Lesson ${lessonNoInput}`}". Never copy generic examples from other subjects.`,
    `NUMBERING RULE (MANDATORY FOR ALL STAGES): In BOTH "teacherActivities" AND "learnerActivities" across Introduction, Development, AND Conclusion, you MUST write clearly numbered sequential steps on separate lines ("1. ...", "2. ...", "3. ...") showing the first action, second action, and third action.`,
    `EXACT OFFICIAL REB SECTION RULES:`,
    `1. "schoolName": Use the teacher's provided school name ("${schoolInput || 'GS Kigali'}") if given, else a realistic Rwandan school placeholder like "GS Kigali". Never leave blank or "—".`,
    `2. "teacherName": Use the teacher's provided name ("${teacherInput || 'Teacher Name'}") if given, else "Teacher". Never leave blank or "—".`,
    `3. "unitNo": Unit number ("${unitNoInput}").`,
    `4. "unitTitle": The official REB syllabus unit title for ${subjectInput} ${classInput}.`,
    `5. "lessonNo": Format as "X of Y" ("${lessonNoInput}").`,
    `6. "sen": Special Educational Needs category AND number of learners ("${senInput}").`,
    `7. "keyUnitCompetence": Official broad REB competence for the unit ("To be able to...").`,
    `8. "lessonTitle": Specific, correctly spelled title of this lesson.`,
    `9. "instructionalObjective": ${cbc.objectiveGuidance}`,
    `10. "planLocation": State location ("Inside the classroom" or "Outside the classroom") AND seating/grouping arrangement.`,
    `11. "learningMaterials": Concrete teaching/learning aids FOR ALL LEARNERS (including adapted aids for SEN learners).`,
    `12. "references": Specific REB syllabus, Teacher's Guide, and Learner's Book references for ${subjectInput} ${classInput}.`,
    `13. "activityOverview": Concise 1–2 sentence overview summarizing the learner-centred approach across this lesson.`,
    `14. "stages": MUST contain EXACTLY 3 stages (or match the teacher's existing stage rows if >3):`,
    `    - Stage 1 (stageType: "intro", stageName: "${cbc.introName}", timingMinutes: ${introMin}):`,
    `      * teacherActivities: Numbered steps ("1. ...", "2. ...", "3. ...") — greet learners & verify SEN seating, 2 diagnostic prior-knowledge questions, introduce lesson title.`,
    `      * learnerActivities: Matching numbered steps ("1. ...", "2. ...", "3. ...") — respond, answer prior questions, write lesson title.`,
    `      * competencesAndIssues: Specific Generic Competences + Cross-Cutting Issues + short explanation of how addressed in Introduction.`,
    `    - Stage 2 (stageType: "development", stageName: "${cbc.devName}", timingMinutes: ${devMin}):`,
    `      * teacherActivities: Numbered steps ("1. Discovery / Group Activity: ...", "2. Group Presentation & Synthesis: ...", "3. Guided Practice & Consolidation: ...") adapted for ${devMin} minutes (richer multi-part tasks when duration is 80 min!).`,
    `      * learnerActivities: Matching numbered steps ("1. ...", "2. ...", "3. ...") showing active learner collaboration, presentation, and guided exercises.`,
    `      * competencesAndIssues: Generic Competences (${cbc.competencesList}) + Cross-Cutting Issues (${cbc.crossCuttingList}) + short explanation.`,
    `    - Stage 3 (stageType: "conclusion", stageName: "${cbc.conclName}", timingMinutes: ${conclMin}):`,
    `      * teacherActivities: Numbered steps ("1. Lesson Summary: ...", "2. Formative Evaluation: ...", "3. Feedback & Homework: ...") with 2–3 concrete assessment questions.`,
    `      * learnerActivities: Matching numbered steps ("1. ...", "2. ...", "3. ...") summarizing, answering exit questions, copying homework.`,
    `      * competencesAndIssues: Generic Competences & Cross-Cutting Issues + short explanation.`,
    `15. "teacherSelfEvaluation": Practical post-lesson self-evaluation note aligned to the lesson objective and ${targetDuration}-minute timing.`,
    `COMPLETENESS RULE: Every single field MUST be richly completed with concrete Rwandan CBC classroom content. Never output blank strings, "—", "...", or "N/A".`,
    `TIMING RULE: The sum of timingMinutes across all stages MUST equal EXACTLY ${targetDuration} minutes.`,
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    hasPartialDraft
      ? `Complete all missing sections and produce a full, finalized Rwanda REB CBC lesson plan in ${cbc.languageName} from this Identification & draft:`
      : `Generate a complete, authentic Rwanda REB CBC lesson plan in ${cbc.languageName}:`,
    `- School Name: ${schoolInput || 'GS Kigali (or keep teacher-supplied school)'}`,
    `- Teacher Name: ${teacherInput || 'Teacher'}`,
    `- Term: ${localizedTerm}`,
    `- Date: ${dateInput}`,
    `- Subject (translate to ${cbc.languageName} if needed): ${subjectInput}`,
    `- Class & Level Band: ${levelContext}`,
    `- Unit No.: ${unitNoInput}`,
    `- Unit Title: ${unitTitleInput || `[MISSING - Infer accurate REB ${subjectInput} ${classInput} Unit ${unitNoInput} title]`}`,
    `- Lesson No.: ${lessonNoInput}`,
    `- Lesson Title / Topic: ${topicDescriptor}`,
    `- Duration: ${targetDuration} minutes (Introduction: ${introMin} min, Development: ${devMin} min, Conclusion: ${conclMin} min)`,
    `- Class Size: ${classSize} learners`,
    `- Type of Special Educational Needs & number of learners: ${senInput}`,
    partialRowsSummary ? `\nCurrent Draft Sections:\n${partialRowsSummary}` : '',
    input.extra ? `- Extra Teacher Instructions: ${input.extra}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ai = getAiClient();
  const response = await generateWithResilience(ai, {
    contents: userPrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          schoolName: { type: Type.STRING },
          teacherName: { type: Type.STRING },
          term: { type: Type.STRING },
          date: { type: Type.STRING },
          subject: { type: Type.STRING },
          classLevel: { type: Type.STRING },
          unitNo: { type: Type.STRING },
          lessonNo: { type: Type.STRING },
          durationMinutes: { type: Type.INTEGER },
          classSize: { type: Type.STRING },
          sen: { type: Type.STRING },
          unitTitle: { type: Type.STRING },
          keyUnitCompetence: { type: Type.STRING },
          lessonTitle: { type: Type.STRING },
          instructionalObjective: { type: Type.STRING },
          planLocation: { type: Type.STRING },
          learningMaterials: { type: Type.STRING },
          references: { type: Type.STRING },
          activityOverview: { type: Type.STRING },
          stages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stageType: {
                  type: Type.STRING,
                  description: 'Must be one of: intro, development, conclusion',
                },
                stageName: { type: Type.STRING },
                timingMinutes: { type: Type.INTEGER },
                teacherActivities: { type: Type.STRING },
                learnerActivities: { type: Type.STRING },
                competencesAndIssues: { type: Type.STRING },
              },
              required: [
                'stageType',
                'stageName',
                'timingMinutes',
                'teacherActivities',
                'learnerActivities',
                'competencesAndIssues',
              ],
            },
          },
          teacherSelfEvaluation: { type: Type.STRING },
        },
        required: [
          'schoolName',
          'teacherName',
          'term',
          'date',
          'subject',
          'classLevel',
          'unitNo',
          'unitTitle',
          'lessonNo',
          'durationMinutes',
          'classSize',
          'sen',
          'keyUnitCompetence',
          'lessonTitle',
          'instructionalObjective',
          'planLocation',
          'learningMaterials',
          'references',
          'activityOverview',
          'stages',
          'teacherSelfEvaluation',
        ],
      },
    },
  });

  const parsed = parseJsonSafely<Record<string, unknown>>(response.text || '', 'lesson plan');
  const rawStages = Array.isArray(parsed.stages) ? (parsed.stages as Array<Record<string, unknown>>) : [];

  const finalSubject = pickMeaningful(input.subject, parsed.subject, subjectInput || 'Subject');
  const finalClass = pickMeaningful(input.classLevel, parsed.classLevel, classInput || 'P4');
  const finalLessonTitle = pickMeaningful(
    existing?.lessonTitle,
    parsed.lessonTitle,
    rawTopicInput || unitTitleInput || `${finalSubject} Unit ${unitNoInput} Lesson ${lessonNoInput}`
  );
  const finalUnitTitle = pickMeaningful(
    existing?.unitTitle || unitTitleInput,
    parsed.unitTitle,
    `${finalSubject} Unit ${unitNoInput}: ${finalLessonTitle}`
  );

  const stageFallback = (type: 'intro' | 'development' | 'conclusion', title: string) => {
    if (type === 'intro') {
      return {
        teacher: `1. Greet learners, verify attendance, and confirm inclusive seating.\n2. Ask 2 diagnostic review questions connecting prior knowledge to ${title}.\n3. Introduce the lesson title "${title}" and share the learning goal.`,
        learner: `1. Respond to greetings and organize exercise books.\n2. Answer review questions orally using everyday examples.\n3. Read and copy the lesson title neatly in notebooks.`,
        comp: `Communication: learners express ideas clearly in class.\nInclusive education: adapted seating and verbal clarity support all learners.`,
      };
    }
    if (type === 'development') {
      return {
        teacher: `1. Group Discovery: Organize mixed-ability groups and guide learners through structured investigation tasks on ${title}.\n2. Presentation & Harmonization: Invite groups to share solutions on the chalkboard and clarify key ${finalSubject} concepts.\n3. Guided Practice: Assign differentiated practice items while circulating to support slow learners and SEN needs.`,
        learner: `1. Collaborate respectfully in groups to explore ${title} and record observations.\n2. Present group findings to peers and write down the harmonized key points.\n3. Complete the guided practice exercises in pairs and verify corrections.`,
        comp: `Critical thinking & Cooperation: learners analyze concepts and collaborate in mixed-ability groups.\nGender education & Peace and values: boys and girls lead groups equally and listen respectfully.`,
      };
    }
    return {
      teacher: `1. Guide learners to summarize the main concepts of ${title}.\n2. Administer a 2-question exit check to assess attainment of the instructional objective.\n3. Assign concise homework from the REB ${finalSubject} Learner’s Book.`,
      learner: `1. State key takeaways on ${title} in their own words.\n2. Complete the exit check questions independently and check solutions.\n3. Copy the homework assignment into their notebooks.`,
      comp: `Lifelong learning: independent homework reinforces mastery beyond class.\nStandardization culture: learners apply accurate ${finalSubject} notation and terminology.`,
    };
  };

  const buildNormalizedStage = (
    type: 'intro' | 'development' | 'conclusion',
    aiStage: Record<string, unknown> | undefined,
    existingStage:
      | {
          stageName?: string;
          timingMinutes?: number;
          teacherActivities?: string;
          learnerActivities?: string;
          competencesAndIssues?: string;
        }
      | undefined,
    fallbackName: string,
    fallbackMin: number
  ) => {
    const fb = stageFallback(type, finalLessonTitle);
    const teacherRaw = pickMeaningful(
      existingStage?.teacherActivities,
      aiStage?.teacherActivities,
      fb.teacher
    );
    const learnerRaw = pickMeaningful(
      existingStage?.learnerActivities,
      aiStage?.learnerActivities,
      fb.learner
    );
    const compRaw = pickMeaningful(
      existingStage?.competencesAndIssues,
      aiStage?.competencesAndIssues,
      fb.comp
    );
    return {
      stageType: type,
      stageName: pickMeaningful(existingStage?.stageName, aiStage?.stageName, fallbackName),
      timingMinutes:
        Number(aiStage?.timingMinutes) > 0
          ? Number(aiStage?.timingMinutes)
          : Number(existingStage?.timingMinutes) > 0
          ? Number(existingStage?.timingMinutes)
          : fallbackMin,
      teacherActivities: ensureNumberedActions(teacherRaw) || fb.teacher,
      learnerActivities: ensureNumberedActions(learnerRaw) || fb.learner,
      competencesAndIssues: compRaw || fb.comp,
    };
  };

  const existingStages = Array.isArray(existing?.stages) ? existing.stages : [];
  const introStage = buildNormalizedStage(
    'intro',
    rawStages.find((s) => s.stageType === 'intro'),
    existingStages.find((s) => s.stageType === 'intro'),
    cbc.introName,
    introMin
  );

  const aiDevStages = rawStages.filter((s) => s.stageType === 'development');
  const exDevStages = existingStages.filter((s) => s.stageType === 'development');
  const devCount = Math.max(1, aiDevStages.length, exDevStages.length);
  const perDevFallback = Math.max(5, Math.floor(devMin / devCount));

  const normalizedDevStages = Array.from({ length: devCount }, (_, idx) =>
    buildNormalizedStage(
      'development',
      aiDevStages[idx],
      exDevStages[idx],
      devCount > 1 ? `${cbc.devName} (${idx + 1})` : cbc.devName,
      perDevFallback
    )
  );

  const conclStage = buildNormalizedStage(
    'conclusion',
    rawStages.find((s) => s.stageType === 'conclusion'),
    existingStages.find((s) => s.stageType === 'conclusion'),
    cbc.conclName,
    conclMin
  );

  const combinedStages = [introStage, ...normalizedDevStages, conclStage];
  const stageSum = combinedStages.reduce((acc, s) => acc + s.timingMinutes, 0);
  if (stageSum !== targetDuration) {
    introStage.timingMinutes = introMin;
    conclStage.timingMinutes = conclMin;
    if (normalizedDevStages.length === 1) {
      normalizedDevStages[0].timingMinutes = devMin;
    } else {
      const perDev = Math.max(1, Math.floor(devMin / normalizedDevStages.length));
      normalizedDevStages.forEach((s, i) => {
        s.timingMinutes =
          i === normalizedDevStages.length - 1
            ? Math.max(1, devMin - perDev * (normalizedDevStages.length - 1))
            : perDev;
      });
    }
  }

  return {
    schoolName: pickMeaningful(schoolInput, parsed.schoolName, 'GS Kigali'),
    teacherName: pickMeaningful(teacherInput, parsed.teacherName, 'Teacher'),
    term: pickMeaningful(localizedTerm, parsed.term, cbc.termMap['Term 1']),
    date: pickMeaningful(dateInput, parsed.date, new Date().toISOString().slice(0, 10)),
    subject: pickMeaningful(parsed.subject, finalSubject, finalSubject),
    classLevel: finalClass,
    unitNo: pickMeaningful(unitNoInput, parsed.unitNo, '1'),
    lessonNo: pickMeaningful(lessonNoInput, parsed.lessonNo, '1 of 4'),
    durationMinutes: targetDuration,
    classSize: String(classSize),
    sen: pickMeaningful(senInput, parsed.sen, 'None (0)'),
    unitTitle: finalUnitTitle,
    keyUnitCompetence: pickMeaningful(
      existing?.keyUnitCompetence,
      parsed.keyUnitCompetence,
      `To be able to explain and apply core concepts of ${finalUnitTitle} accurately in ${finalClass} ${finalSubject} contexts.`
    ),
    lessonTitle: finalLessonTitle,
    instructionalObjective: pickMeaningful(
      existing?.instructionalObjective,
      parsed.instructionalObjective,
      `Given visual charts and guided group tasks, ${finalClass} learners will be able to explain and solve tasks on ${finalLessonTitle} accurately, achieving at least 80% correctness.`
    ),
    planLocation: pickMeaningful(existing?.planLocation, parsed.planLocation, cbc.defaultLocation),
    learningMaterials: pickMeaningful(
      existing?.learningMaterials,
      parsed.learningMaterials,
      `REB ${finalClass} ${finalSubject} Learner’s Book, chalkboard, chalk, large-print summary cards, and topic charts.`
    ),
    references: pickMeaningful(
      existing?.references,
      parsed.references,
      `REB ${finalSubject} Curriculum & Teacher’s Guide for ${finalClass}, Unit ${unitNoInput}.`
    ),
    activityOverview: pickMeaningful(
      existing?.activityOverview,
      parsed.activityOverview,
      `Through guided inquiry, collaborative mixed-ability group work, and formative checks, learners actively master ${finalLessonTitle}.`
    ),
    stages: combinedStages,
    teacherSelfEvaluation: pickMeaningful(
      existing?.teacherSelfEvaluation,
      parsed.teacherSelfEvaluation,
      `Lesson on ${finalLessonTitle} delivered within ${targetDuration} minutes. Approximately ___% of learners met the instructional objective; remedial support will target learners needing additional guided practice.`
    ),
  };
}

export interface AssistantTurnInput {
  language?: string;
  message: string;
  history?: Array<{ role: string; text: string }>;
}

export async function generateAssistantReply(input: AssistantTurnInput): Promise<string> {
  const lang = resolveLang(input.language);
  const cbc = CBC_LOCALIZATION[lang];
  const ai = getAiClient();

  const systemInstruction = [
    `You are GHAD AI, an expert teaching assistant built for Rwandan teachers (Primary P1–P6 and Secondary S1–S6) under the ${cbc.curriculumHeader}.`,
    `STRICT LANGUAGE RULE: Respond strictly in ${cbc.languageName}, translating any curriculum terminology accurately for Rwandan classrooms.`,
    'Provide complete, practical, learner-centred answers, clear explanations, examples grounded in Rwandan schools, and actionable classroom steps. Never cut an explanation short.',
    'Format responses cleanly with short headings and bullet points for quick reading.',
  ].join('\n');

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  if (Array.isArray(input.history)) {
    for (const item of input.history.slice(-24)) {
      if (item && typeof item.text === 'string' && item.text.trim()) {
        contents.push({
          role: item.role === 'user' ? 'user' : 'model',
          parts: [{ text: item.text.trim() }],
        });
      }
    }
  }
  contents.push({ role: 'user', parts: [{ text: input.message.trim() }] });

  const response = await generateWithResilience(ai, {
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const reply = (response.text || '').trim();
  if (!reply) {
    throw new AiServiceHttpError(502, 'Gemini returned an empty assistant response.');
  }
  return reply;
}

export interface GenerateAssessmentInput {
  language?: string;
  subject: string;
  classLevel: string;
  topic: string;
  count?: number;
  difficulty?: string;
  type?: string;
}

export async function generateRebAssessment(input: GenerateAssessmentInput) {
  const lang = resolveLang(input.language);
  const cbc = CBC_LOCALIZATION[lang];
  const questionCount = Math.max(1, Math.min(30, Number(input.count) || 5));
  const diffLabel = cbc.difficultyMap[input.difficulty || 'medium'] || cbc.difficultyMap.medium;
  const typeLabel = cbc.typeMap[input.type || 'mcq'] || cbc.typeMap.mcq;
  const levelContext = getLevelBand(input.classLevel);

  const systemInstruction = [
    `You are an assessment specialist for the ${cbc.curriculumHeader}.`,
    `STRICT LANGUAGE RULE: Translate and generate EVERY field (title, instructions, questions, options, answers, and marking notes) strictly in ${cbc.languageName}.`,
    `Align every question to Rwanda CBC competence-based assessment standards and Bloom’s taxonomy. Generate ALL ${questionCount} questions completely with accurate answers and marking scheme notes.`,
  ].join('\n');

  const userPrompt = [
    `Generate a complete ${questionCount}-question assessment in ${cbc.languageName}:`,
    `- Subject (translate to ${cbc.languageName} if needed): ${input.subject}`,
    `- Class & Level Band: ${levelContext}`,
    `- Topic: ${input.topic}`,
    `- Difficulty Level: ${diffLabel}`,
    `- Question Format: ${typeLabel}`,
    'For MCQ questions, include 4 clear labeled options (A, B, C, D). For short answer questions, leave options as an empty array []. Ensure totalMarks equals the sum of individual question marks.',
  ].join('\n');

  const ai = getAiClient();
  const response = await generateWithResilience(ai, {
    contents: userPrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          instructions: { type: Type.STRING },
          totalMarks: { type: Type.INTEGER },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: { type: Type.INTEGER },
                type: { type: Type.STRING },
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                marks: { type: Type.INTEGER },
                answer: { type: Type.STRING },
                markingNotes: { type: Type.STRING },
              },
              required: ['number', 'type', 'question', 'options', 'marks', 'answer', 'markingNotes'],
            },
          },
        },
        required: ['title', 'instructions', 'totalMarks', 'questions'],
      },
    },
  });

  const parsed = parseJsonSafely<{
    title?: string;
    instructions?: string;
    totalMarks?: number;
    questions?: Array<Record<string, unknown>>;
  }>(response.text || '', 'assessment');

  const questions = Array.isArray(parsed.questions)
    ? parsed.questions.map((q, idx) => ({
        number: Number(q?.number) || idx + 1,
        type: String(q?.type || input.type || 'mcq'),
        question: String(q?.question || '').trim(),
        options: Array.isArray(q?.options) ? q.options.map((o) => String(o)) : [],
        marks: Math.max(1, Number(q?.marks) || 1),
        answer: String(q?.answer || '').trim(),
        markingNotes: String(q?.markingNotes || '').trim(),
      }))
    : [];

  if (questions.length === 0) {
    throw new AiServiceHttpError(502, 'AI did not return assessment questions. Please click Retry.');
  }

  const computedTotalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  return {
    title: String(parsed.title || `${input.subject} (${input.classLevel}) — ${input.topic}`).trim(),
    instructions: String(parsed.instructions || 'Answer all questions carefully.').trim(),
    totalMarks: computedTotalMarks || Number(parsed.totalMarks) || questions.length,
    questions,
  };
}

export interface GenerateMethodologyInput {
  language?: string;
  subject: string;
  classLevel: string;
  topic: string;
  classSize?: number;
}

export async function generateRebMethodology(input: GenerateMethodologyInput) {
  const lang = resolveLang(input.language);
  const cbc = CBC_LOCALIZATION[lang];
  const levelContext = getLevelBand(input.classLevel);
  const classSize = Math.max(1, Math.min(200, Number(input.classSize) || 40));

  const systemInstruction = [
    `You are a pedagogy advisor for the ${cbc.curriculumHeader} specializing in learner-centred active teaching methodologies.`,
    `STRICT LANGUAGE RULE: Translate and generate EVERY field strictly in ${cbc.languageName}.`,
    'Focus on active discovery, collaborative group work, think-pair-share, inclusive SEN differentiation, formative checks, and locally available low-cost teaching materials in Rwandan schools.',
  ].join('\n');

  const userPrompt = [
    `Design a complete, practical, learner-centred CBC teaching methodology guide in ${cbc.languageName}:`,
    `- Subject (translate to ${cbc.languageName} if needed): ${input.subject}`,
    `- Class & Level Band: ${levelContext}`,
    `- Topic: ${input.topic}`,
    `- Typical Class Size: ${classSize} learners`,
  ].join('\n');

  const ai = getAiClient();
  const response = await generateWithResilience(ai, {
    contents: userPrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          coreApproach: { type: Type.STRING },
          strategies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                durationHint: { type: Type.STRING },
                description: { type: Type.STRING },
                teacherRole: { type: Type.STRING },
                learnerRole: { type: Type.STRING },
              },
              required: ['name', 'durationHint', 'description', 'teacherRole', 'learnerRole'],
            },
          },
          differentiationSen: { type: Type.STRING },
          formativeChecks: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          recommendedMaterials: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          'title',
          'coreApproach',
          'strategies',
          'differentiationSen',
          'formativeChecks',
          'recommendedMaterials',
        ],
      },
    },
  });

  const parsed = parseJsonSafely<Record<string, unknown>>(response.text || '', 'methodology');
  return {
    title: String(parsed.title || `${input.subject} (${input.classLevel}) — ${input.topic}`).trim(),
    coreApproach: String(parsed.coreApproach || '').trim(),
    strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
    differentiationSen: String(parsed.differentiationSen || '').trim(),
    formativeChecks: Array.isArray(parsed.formativeChecks) ? parsed.formativeChecks : [],
    recommendedMaterials: Array.isArray(parsed.recommendedMaterials) ? parsed.recommendedMaterials : [],
  };
}
