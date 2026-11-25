import dotenv from 'dotenv';
import { GenerateContentParameters, GoogleGenAI, Type } from '@google/genai';
import {
  LessonClarification,
  LessonQualityReport,
  NormalizedLessonPlan,
  buildPostLessonReflectionGuide,
  buildSenAdaptationProfile,
  checkLessonConsistency,
  getCurriculumGroundingContext,
  hasInventedAssessmentResults,
  runLessonQualityCheckAndRepair,
  sanitizeLanguageQuality,
} from './lessonQuality.js';

dotenv.config();

export type SupportedLang = 'en' | 'rw' | 'fr' | 'sw';

const MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'] as const;
const RATE_LIMIT_RETRY_DELAY_MS = 2500;

export class AiServiceHttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.startsWith('YOUR_')) {
    return null;
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

function redactPotentialSecrets(text: string): string {
  return text.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]');
}

function extractErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
    if (parsed?.error?.message) return redactPotentialSecrets(parsed.error.message);
  } catch {
    // Not raw JSON
  }
  return redactPotentialSecrets(raw);
}

function extractErrorStatus(err: unknown): number | undefined {
  const status =
    (err as { status?: number; code?: number; statusCode?: number })?.status ??
    (err as { code?: number })?.code ??
    (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status <= 599) {
    return status;
  }
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number } };
    if (typeof parsed?.error?.code === 'number') return parsed.error.code;
  } catch {
    // Not raw JSON
  }
  return undefined;
}

function extractErrorCode(err: unknown): string | undefined {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { status?: string } };
    if (typeof parsed?.error?.status === 'string') return parsed.error.status;
  } catch {
    // Not raw JSON
  }
  const upper = raw.toUpperCase();
  for (const known of [
    'API_KEY_INVALID',
    'PERMISSION_DENIED',
    'UNAUTHENTICATED',
    'RESOURCE_EXHAUSTED',
    'NOT_FOUND',
    'INVALID_ARGUMENT',
    'UNAVAILABLE',
    'DEADLINE_EXCEEDED',
  ]) {
    if (upper.includes(known)) return known;
  }
  return undefined;
}

function isAuthOrKeyError(err: unknown): boolean {
  const status = extractErrorStatus(err);
  if (status === 401 || status === 403) return true;
  const raw = (err instanceof Error ? err.message : String(err)).toUpperCase();
  return (
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('UNAUTHENTICATED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('API KEY NOT VALID')
  );
}

function isUnavailableOrRateLimitError(err: unknown): boolean {
  const status = extractErrorStatus(err);
  if (status === 503 || status === 429) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
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
  if (model.startsWith('gemini-2.5') && 'thinkingConfig' in nextConfig) {
    delete nextConfig.thinkingConfig;
  }
  return nextConfig;
}

async function generateWithResilience(
  ai: GoogleGenAI | null,
  params: Omit<GenerateContentParameters, 'model'>
) {
  if (!ai) {
    throw new AiServiceHttpError(503, 'GEMINI_API_KEY is not configured on the server. Please configure it in Settings > Secrets.');
  }

  const runWithConfig = async (config: GenerateContentParameters['config']) => {
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
              config: buildConfigForModel(model, config),
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
      }
    }

    if (lastErr && isUnavailableOrRateLimitError(lastErr)) {
      const retryModel = MODEL_CHAIN[0];
      console.warn(`[GHAD AI] Rate limit / busy across models; waiting ${RATE_LIMIT_RETRY_DELAY_MS}ms before final retry on ${retryModel}.`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_DELAY_MS));
      try {
        const retryResult = await ai.models.generateContent({
          model: retryModel,
          contents: params.contents,
          config: buildConfigForModel(retryModel, config),
        });
        delete modelCooldownUntil[retryModel];
        return retryResult;
      } catch (retryErr: unknown) {
        lastErr = retryErr;
        console.warn(`[GHAD AI] Final retry on ${retryModel} failed:`, extractErrorText(retryErr));
      }
    }

    throw lastErr;
  };

  if (params.config?.tools && params.config.tools.length > 0) {
    try {
      const primaryModel = MODEL_CHAIN[0];
      return await ai.models.generateContent({
        model: primaryModel,
        contents: params.contents,
        config: buildConfigForModel(primaryModel, params.config),
      });
    } catch (err: unknown) {
      if (isAuthOrKeyError(err)) {
        throw err;
      }
      console.warn(
        '[GHAD AI] Search grounded call failed or quota reached; falling back to ungrounded generation:',
        extractErrorText(err)
      );
      const ungroundedConfig = { ...params.config };
      delete ungroundedConfig.tools;
      return await runWithConfig(ungroundedConfig);
    }
  }

  return await runWithConfig(params.config);
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

export interface NormalizedAiError {
  status: number;
  message: string;
  code?: string;
  details?: string;
}

export function normalizeError(err: unknown): NormalizedAiError {
  if (err instanceof AiServiceHttpError) {
    return {
      status: err.status,
      message: redactPotentialSecrets(err.message),
      code: err.code || (err.status === 503 ? 'GEMINI_UNAVAILABLE' : 'AI_SERVICE_ERROR'),
    };
  }

  const raw = err instanceof Error ? err.message : String(err);
  const cleanMsg = extractErrorText(err);
  const upstreamStatus = extractErrorStatus(err);
  const code = extractErrorCode(err);
  const upper = raw.toUpperCase();

  if (
    upstreamStatus === 401 ||
    upstreamStatus === 403 ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('UNAUTHENTICATED') ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('API KEY NOT VALID')
  ) {
    return {
      status: upstreamStatus === 401 || upstreamStatus === 403 ? upstreamStatus : 400,
      message: 'Invalid or unauthorized Gemini API key. Check GEMINI_API_KEY in Settings > Secrets or Vercel Environment Variables.',
      code: code || 'API_KEY_INVALID',
      details: cleanMsg,
    };
  }
  if (
    upstreamStatus === 429 ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('QUOTA') ||
    raw.toLowerCase().includes('rate limit')
  ) {
    return {
      status: 429,
      message:
        'The AI service is busy right now (rate limit reached). Please wait a few seconds and try again.',
      code: code || 'RESOURCE_EXHAUSTED',
      details: cleanMsg,
    };
  }
  if (
    upstreamStatus === 503 ||
    upper.includes('UNAVAILABLE') ||
    raw.toLowerCase().includes('high demand')
  ) {
    return {
      status: 503,
      message:
        'The AI service is busy right now. Please wait a few seconds and try again.',
      code: code || 'UNAVAILABLE',
      details: cleanMsg,
    };
  }
  if (upstreamStatus === 404 || upper.includes('NOT_FOUND')) {
    return {
      status: 404,
      message: cleanMsg || 'Requested Gemini model or endpoint was not found.',
      code: code || 'NOT_FOUND',
      details: cleanMsg,
    };
  }
  if (upstreamStatus === 400 || upper.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      message: cleanMsg || 'Invalid request sent to Gemini API.',
      code: code || 'INVALID_ARGUMENT',
      details: cleanMsg,
    };
  }
  return {
    status: upstreamStatus || 500,
    message: cleanMsg || 'Unable to reach Gemini AI service.',
    ...(code ? { code } : {}),
    ...(cleanMsg ? { details: cleanMsg } : {}),
  };
}

export function formatErrorResponse(err: unknown): {
  status: number;
  body: { error: string; status: number; code?: string; details?: string };
} {
  const normalized = normalizeError(err);
  return {
    status: normalized.status,
    body: {
      error: normalized.message,
      status: normalized.status,
      ...(normalized.code ? { code: normalized.code } : {}),
      ...(normalized.details && normalized.details !== normalized.message
        ? { details: normalized.details }
        : {}),
    },
  };
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
    styleRule: string;
  }
> = {
  en: {
    languageName: 'English',
    curriculumHeader: 'Rwanda Basic Education Board (REB) Competence-Based Curriculum (CBC)',
    introName: 'Introduction',
    devName: 'Development',
    conclName: 'Conclusion',
    objectiveGuidance:
      'Instructional Objective MUST be ONE simple, clear REB CBC sentence with 4 parts: (1) Condition ("Given... / Using..."), (2) Who ("learners / P4 learners"), (3) Action ("will be able to solve / explain / show"), and (4) Standard ("correctly, getting at least...").',
    competencesList:
      'Critical thinking, Creativity and innovation, Research and problem solving, Communication, Cooperation and life skills, Lifelong learning.',
    crossCuttingList:
      'Genocide studies, Environment and sustainability, Gender, Comprehensive sexuality education, Peace and values education, Financial education, Standardization culture, Inclusive education.',
    termMap: { 'Term 1': 'Term 1', 'Term 2': 'Term 2', 'Term 3': 'Term 3' },
    difficultyMap: { easy: 'Easy (Recall & Basic Understanding)', medium: 'Medium (Practice & Explaining)', hard: 'Hard (Problem Solving & Creating)' },
    typeMap: {
      mcq: 'Multiple Choice Questions (4 options A, B, C, D)',
      fill_blank: 'Fill in the Blanks Questions (sentences with clear ____ blanks)',
      matching: 'Matching Questions (Column A items matched with Column B items)',
      true_false: 'True / False Questions (clear statements marked True or False)',
      open_ended: 'Open-Ended Questions (questions asking learners to explain, reason, or give examples)',
      short: 'Short Answer Questions (brief 1–3 sentence answers or quick calculations)',
      mixed: 'Mixed Questions (combining Multiple Choice, Fill in the Blanks, Matching, True / False, Open-Ended, and Short Answer questions)',
    },
    defaultLocation: 'Inside the classroom — learners sit in mixed-ability groups.',
    styleRule:
      'SIMPLE ENGLISH RULE: Always write in simple, clear, everyday English that is easy for teachers and students to read and understand. Use short, direct sentences and avoid heavy academic jargon.',
  },
  rw: {
    languageName: 'Ikinyarwanda (Kinyarwanda)',
    curriculumHeader: "Integanyanyigisho Ishingiye ku Bushobozi y'u Rwanda (REB CBC)",
    introName: 'Intangiriro',
    devName: 'Igice Nyamukuru',
    conclName: 'Umwanzuro',
    objectiveGuidance:
      "Intego y'isomo (Instructional Objective) IGOMBA kwandikwa mu nteruro IMWE inoze mu Kinyarwanda cyumvikana neza irimo ibice 4 bya REB CBC: (1) Ibikoresho/Imiterere (Bahawe... / Bakoresheje...), (2) Uwigishwa (abanyeshuri ba...), (3) Igikorwa gipimika (bazashobora gusobanura / gukora / kugaragaza...), na (4) Igipimo cy'ubuziranenge (neza / byibura...).",
    competencesList:
      'Gutekereza byimbitse (Critical thinking), Guhanga udushya (Creativity and innovation), Ubushakashatsi no gukemura ibibazo (Research and problem solving), Itumanaho (Communication), Ubufatanye n’ubumenyi ngiro mu buzima (Cooperation and life skills), Kwiga ubuzima bwose (Lifelong learning).',
    crossCuttingList:
      "Amateka ya Jenoside (Genocide studies), Ibidukikije n'iterambere rirambye (Environment and sustainability), Uburinganire (Gender), Uburezi ku buzima bw'imyororokere (Comprehensive sexuality education), Amahoro n'indangagaciro (Peace and values education), Uburezi ku mafaranga (Financial education), Umuco w'ubuziranenge (Standardization culture), Uburezi budaheza (Inclusive education).",
    termMap: { 'Term 1': 'Igihembwe cya 1', 'Term 2': 'Igihembwe cya 2', 'Term 3': 'Igihembwe cya 3' },
    difficultyMap: { easy: 'Byoroshye (Kwibuka no Gusobanukirwa)', medium: 'Hagati (Gukoresha no Gusesengura)', hard: 'Bikomeye (Gukemura ibibazo no Guhanga)' },
    typeMap: {
      mcq: 'Hitamo Igisubizo Nyacyo (A, B, C, D)',
      fill_blank: 'Uzuza mu Mwanya Ubura (____)',
      matching: 'Huza Ibiri mu Gika cya A n’iby’Igika cya B (Matching)',
      true_false: 'Nibyo cyangwa Sibyo (True / False)',
      open_ended: 'Ibibazo Bisaba Ibisobanuro Birambuye (Open-Ended)',
      short: 'Ibibazo by’Ibisubizo Bigufi (Short Answer)',
      mixed: 'Bivanze (Hitamo Igisubizo, Uzuza mu Mwanya, Huza, Nibyo/Sibyo, Ibisobanuro Birambuye, n’Ibisubizo Bigufi)',
    },
    defaultLocation: 'Imbere mu ishuri — abanyeshuri bicaye mu matsinda avanze.',
    styleRule:
      "KINYARWANDA TEXT PURITY & NATURAL GRAMMAR RULE: Andika mu Kinyarwanda cy'umwimerere, cyumvikana neza kandi gikoresha amasano nyayo y'amazina n'inshinga. Write ONLY in clean, standard, grammatically accurate Kinyarwanda (e.g. 'kuwumva' NOT 'kumyumva', 'cyo gusoma', 'Baza abanyeshuri', 'niba intego yagezweho'). NEVER output stray tokens, random numbers inserted inside words (strictly NO 'is2omo' or 'mu1baza'), or foreign script characters (strictly NO Chinese, Japanese, Korean, Cyrillic, or non-Latin glyphs). Use official REB CBC terms: Intego y'isomo, Ubushobozi ngiro, Ubushobozi rusange n'insanganyamatsiko zambukiranya amasomo, Ibikorwa by'umwarimu n'iby'abanyeshuri, Isuzuma ry'umwarimu.",
  },
  fr: {
    languageName: 'Français (French)',
    curriculumHeader: 'Curriculum basé sur les compétences du Rwanda Basic Education Board (REB CBC)',
    introName: 'Introduction',
    devName: 'Développement',
    conclName: 'Conclusion',
    objectiveGuidance:
      "L'objectif pédagogique DOIT être rédigé en UNE phrase simple, claire et officielle en français contenant les 4 éléments : (1) Condition (À l'aide de...), (2) Qui (les apprenants de...), (3) Action (seront capables de + verbe simple et mesurable) et (4) Critère (avec exactitude / au moins...).",
    competencesList:
      'Esprit critique, Créativité et innovation, Recherche et résolution de problèmes, Communication, Coopération et compétences de vie, Apprentissage tout au long de la vie.',
    crossCuttingList:
      'Études sur le génocide, Environnement et durabilité, Genre, Éducation sexuelle complète, Paix et valeurs, Éducation financière, Culture de la standardisation, Éducation inclusive.',
    termMap: { 'Term 1': 'Trimestre 1', 'Term 2': 'Trimestre 2', 'Term 3': 'Trimestre 3' },
    difficultyMap: { easy: 'Facile (Mémorisation & Compréhension)', medium: 'Moyen (Application & Analyse)', hard: 'Difficile (Résolution & Création)' },
    typeMap: {
      mcq: 'Questions à Choix Multiple (4 options A, B, C, D)',
      fill_blank: 'Questions à Compléter (textes à trous ____)',
      matching: 'Questions d’Appariement (relier Colonne A et Colonne B)',
      true_false: 'Questions Vrai / Faux',
      open_ended: 'Questions Ouvertes (réflexion et explication)',
      short: 'Questions à Réponse Courte (1 à 3 phrases)',
      mixed: 'Mixte (QCM, Textes à trous, Appariement, Vrai/Faux, Questions ouvertes et Réponses courtes)',
    },
    defaultLocation: 'Dans la salle de classe — apprenants répartis en groupes hétérogènes.',
    styleRule:
      'SIMPLE FRENCH RULE: Écrivez toujours dans un français simple, clair et naturel, facile à comprendre pour les enseignants et les élèves.',
  },
  sw: {
    languageName: 'Kiswahili (Swahili)',
    curriculumHeader: 'Mtaala unaozingatia Umahiri wa Bodi ya Elimu ya Msingi Rwanda (REB CBC)',
    introName: 'Utangulizi',
    devName: 'Mwendelezo wa Somo',
    conclName: 'Hitimisho',
    objectiveGuidance:
      'Lengo la Somo (Instructional Objective) LAZIMA liandikwe katika sentensi MOJA rahisi na rasmi ya Kiswahili iliyo na sehemu zote 4 za REB CBC: (1) Hali/Vifaa ("Kwa kutumia..."), (2) Nani ("wanafunzi wa..."), (3) Kitendo kinachopimika ("wataweza kueleza / kutatua / kuonyesha"), na (4) Kiwango ("kwa usahihi usiopungua 80%").',
    competencesList:
      'Fikra tunduizi (Critical thinking), Ubunifu na uvumbuzi (Creativity), Utafiti na utatuzi wa matatizo (Problem solving), Mawasiliano (Communication), Ushirikiano na stadi za maisha (Cooperation), Kujifunza maishani (Lifelong learning).',
    crossCuttingList:
      'Masomo ya Mauaji ya Kimbari, Mazingira na maendeleo endelevu, Usawa wa kijinsia, Elimu kamili ya afya ya uzazi, Amani na maadili, Elimu ya fedha, Utamaduni wa viwango, Elimu jumuishi.',
    termMap: { 'Term 1': 'Muhula wa 1', 'Term 2': 'Muhula wa 2', 'Term 3': 'Muhula wa 3' },
    difficultyMap: { easy: 'Rahisi (Kukumbuka na Kuelewa)', medium: 'Wastani (Kutumia na Kuchambua)', hard: 'Ngumu (Kutatua na Kuunda)' },
    typeMap: {
      mcq: 'Maswali ya Kuchagua Jibu Sahihi (A, B, C, D)',
      fill_blank: 'Maswali ya Kujaza Nafasi (____)',
      matching: 'Maswali ya Kuoanisha (Safu A na Safu B)',
      true_false: 'Maswali ya Kweli / Si kweli',
      open_ended: 'Maswali Wazi (kueleza na kutoa hoja)',
      short: 'Maswali ya Majibu Mafupi (sentensi 1–3)',
      mixed: 'Mchanganyiko (Kuchagua, Kujaza nafasi, Kuoanisha, Kweli/Si kweli, Maswali wazi na Majibu mafupi)',
    },
    defaultLocation: 'Ndani ya darasa — wanafunzi wamekaa katika vikundi mchanganyiko.',
    styleRule:
      'SIMPLE SWAHILI RULE: Tumia Kiswahili rahisi, fasaha na kinachoeleweka kwa urahisi na walimu na wanafunzi.',
  },
};

function resolveLang(lang?: string): SupportedLang {
  if (lang === 'rw' || lang === 'fr' || lang === 'sw') return lang;
  return 'en';
}

const KINYARWANDA_MARKER_RE =
  /\b(ikinyarwanda|kinyarwanda|isomo|inyigisho|ubushobozi|umunyeshuri|abanyeshuri|igihembwe|umwarimu|gusoma|kwandika|imibare|ibidukikije|ubuzima|uburinganire|amahoro|interuro|inshinga|izina|umwandiko|inkuru|ndetse|cyangwa|kugira ngo|kubera|sobanura|vuga|garagaza|tanga|andika|imigenzo|indangagaciro|intego|umwanzuro|intangiriro|igice|umutwe|ishuri|amashuri|abana)\b/i;

function detectTargetLang(
  requestedLang: string | undefined,
  opts: { subject?: string; texts?: Array<string | undefined> }
): SupportedLang {
  const baseLang = resolveLang(requestedLang);
  const combined = [opts.subject || '', ...(opts.texts || [])].join(' ').trim();
  const lower = combined.toLowerCase();

  // Respect explicit language overrides inside the prompt
  if (/\b(in english|mu cyongereza)\b/i.test(lower)) return 'en';
  if (/\b(en français|in french|mu gifaransa)\b/i.test(lower)) return 'fr';
  if (/\b(in kinyarwanda|mu kinyarwanda)\b/i.test(lower)) return 'rw';
  if (/\b(in kiswahili|in swahili|mu giswahili)\b/i.test(lower)) return 'sw';

  // Switch to Kinyarwanda when teaching Kinyarwanda as a subject or when prompt is written in Kinyarwanda
  if (/\b(i?kinyarwanda)\b/i.test(opts.subject || '')) {
    return 'rw';
  }

  const textOnly = (opts.texts || []).filter(Boolean).join(' ').trim();
  if (textOnly && KINYARWANDA_MARKER_RE.test(textOnly)) {
    return 'rw';
  }

  return baseLang;
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
    observations?: string;
  }>;
  assessmentCriteria?: string;
  homework?: string;
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
  confirmOverride?: boolean;
  existingPlan?: ExistingLessonDraft;
}

export type GenerateLessonResult =
  | {
      clarificationRequired: true;
      clarification: LessonClarification;
    }
  | {
      clarificationRequired: false;
      plan: NormalizedLessonPlan;
      qualityReport: LessonQualityReport;
    };

export function sanitizeTextPurity(text: string, lang: SupportedLang): string {
  return sanitizeLanguageQuality(text, lang);
}

function cleanActionText(raw: string): string {
  return raw
    .replace(/\[\s*\d+\s*[-–—]\s*\d+\s*(?:'|min|mins|minutes)?\s*\]/gi, '')
    .replace(/\(\s*\d+\s*[-–—]\s*\d+\s*(?:'|min|mins|minutes)?\s*\)/gi, '')
    .replace(/^\s*\d+\s*[-–—]\s*\d+\s*(?:'|min|mins|minutes)?\s*[:.-]\s*/gim, '')
    .trim();
}

function ensureNumberedActions(raw: string): string {
  const cleaned = cleanActionText(String(raw || ''));
  if (!cleaned || isBlankOrPlaceholder(cleaned)) return '';
  const lines = cleaned
    .split(/\n+/)
    .map((l) => cleanActionText(l.trim()))
    .filter(Boolean);

  if (lines.length >= 2 && /^\d+[.)]\s+/.test(lines[0])) {
    return lines.join('\n');
  }

  const inlineSplit = cleaned
    .split(/(?=\b[1-9]\.\s+)/)
    .map((s) => cleanActionText(s.trim()))
    .filter(Boolean);
  if (inlineSplit.length >= 2 && /^\d+\.\s+/.test(inlineSplit[0])) {
    return inlineSplit.join('\n');
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÿ])/)
    .map((s) => cleanActionText(s.trim()))
    .filter(Boolean);

  if (sentences.length >= 2) {
    return sentences.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`).join('\n');
  }

  return /^\d+[.)]\s+/.test(cleaned) ? cleaned : `1. ${cleaned}`;
}

export async function generateRebLessonPlan(
  input: GenerateLessonInput
): Promise<GenerateLessonResult> {
  const existing = input.existingPlan;

  const subjectInput = String(input.subject || existing?.subject || '').trim();
  const classInput = String(input.classLevel || existing?.classLevel || '').trim();
  const rawTopicInput = sanitizeLanguageQuality(
    String(input.topic || existing?.lessonTitle || '').trim(),
    resolveLang(input.language)
  );
  const unitNoInput = String(input.unitNo || existing?.unitNo || '1').trim();
  const unitTitleInput = String(input.unitTitle || existing?.unitTitle || '').trim();
  const lessonNoInput = String(input.lessonNo || existing?.lessonNo || '1 of 4').trim();
  const schoolInput = String(input.schoolName || existing?.schoolName || '').trim();
  const teacherInput = String(input.teacherName || existing?.teacherName || '').trim();
  const dateInput = String(input.date || existing?.date || new Date().toISOString().slice(0, 10)).trim();

  const lang = detectTargetLang(input.language, {
    subject: subjectInput,
    texts: [rawTopicInput, unitTitleInput, input.extra, existing?.lessonTitle],
  });
  const cbc = CBC_LOCALIZATION[lang];
  const hasPartialDraft = Boolean(existing && (existing.unitTitle || existing.stages?.length));

  if (!input.confirmOverride) {
    const consistency = checkLessonConsistency({
      subject: subjectInput,
      classLevel: classInput,
      topic: rawTopicInput,
      unitTitle: unitTitleInput,
      lang,
    });
    if (!consistency.consistent) {
      return {
        clarificationRequired: true,
        clarification: consistency.clarification,
      };
    }
  }

  const curriculumGrounding = getCurriculumGroundingContext({
    subject: subjectInput,
    classLevel: classInput,
    unitNo: unitNoInput,
    topic: rawTopicInput,
    lang,
  });

  const topicDescriptor =
    rawTopicInput ||
    curriculumGrounding.matchedUnit?.sampleTopics[0] ||
    unitTitleInput ||
    `Unit ${unitNoInput} Lesson ${lessonNoInput}`;

  const defaultSenByLang: Record<SupportedLang, string> = {
    en: 'Slow learners (2), Mild visual impairment (1)',
    rw: 'Abanyeshuri biga buhoro (2), Ufite ikibazo cyo kutabona neza (1)',
    fr: 'Apprenants lents (2), Déficience visuelle légère (1)',
    sw: 'Wanafunzi wanaojifunza polepole (2), Ulemavu mdogo wa macho (1)',
  };
  const senInput = String(input.sen || existing?.sen || defaultSenByLang[lang]).trim();
  const senProfile = buildSenAdaptationProfile(senInput, lang);

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

  const introMin = Math.max(3, Math.round(targetDuration * 0.125));
  const conclMin = Math.max(3, Math.round(targetDuration * 0.125));
  const devMin = Math.max(5, targetDuration - introMin - conclMin);

  const ai = getAiClient();

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

  const isKinyarwandaMode = lang === 'rw' || /\b(i?kinyarwanda)\b/i.test(subjectInput);

  const systemInstruction = [
    `You are a practical curriculum advisor and master teacher trainer for the ${cbc.curriculumHeader}.`,
    cbc.styleRule,
    `STRICT LANGUAGE & GRAMMAR RULE: Write EVERY single field strictly in ${cbc.languageName} with accurate, natural grammar and authentic Rwandan educational terminology. Fix spelling typos in topic/unit input (e.g. "EQULITY" -> "Equality").`,
    isKinyarwandaMode
      ? `KINYARWANDA PURITY & TERMINOLOGY RULE (CRITICAL): Write strictly in natural, grammatically accurate Kinyarwanda. NEVER insert digits inside words (no 'is2omo', no 'mu1baza'), NEVER mix in Swahili/French words (never 'kujadili', 'mwalimu', 'wanafunzi', 'masomo'—use 'kuganira', 'umwarimu', 'abanyeshuri', 'amasomo'), and strictly NO Chinese/Japanese/Cyrillic characters. Use proper noun-class concord (e.g. 'kuwumva', 'cyo gusoma', 'kugira ngo') and official REB CBC terms: Intego y'isomo, Ubushobozi ngiro, Ubushobozi rusange n'insanganyamatsiko zambukiranya amasomo, Ibikorwa by'umwarimu n'iby'abanyeshuri, Isuzuma ry'umwarimu.`
      : '',
    `SUBJECT, TOPIC & SINGLE TITLE LOCK (CRITICAL):`,
    `- Keep the exact Subject "${subjectInput}" and Class "${classInput}". Never silently switch subjects or invent an unrelated topic.`,
    rawTopicInput
      ? `- Use ONE clean canonical lessonTitle matching "${rawTopicInput}" consistently across the entire lesson plan. Never produce two different wordings of the lesson title.`
      : `- Write ONE clear, concise lessonTitle strictly aligned to ${subjectInput} (${classInput}) and keep that exact title consistent everywhere.`,
    `CURRICULUM GROUNDING & NO-FABRICATION RULE: ${curriculumGrounding.promptNote}`,
    `TIMING & TIMESTAMP RULE (STRICT): Timestamps belong ONLY in the timing column (e.g. "Introduction — 5'", "Development (Body) — 30'", "Conclusion — 5'"). NEVER put minute ranges, time intervals, or brackets (such as "[0-10']", "[10-22']", or "(5 mins)") inside individual "teacherActivities" or "learnerActivities" text!`,
    `AUTO-COMPLETE RULE: Teachers often enter only Identification fields or a partial draft. Complete EVERY SINGLE field so there are ZERO blank sections.`,
    hasPartialDraft
      ? `PRESERVE & COMPLETE MODE: Keep complete teacher-provided fields, and richly write every field marked [MISSING - AI MUST WRITE].`
      : '',
    `DYNAMIC TOPIC-SPECIFICITY & NON-REPETITION RULE (CRITICAL):`,
    `- Adapt EVERY section specifically to Subject "${subjectInput}", Grade "${classInput}", and Topic "${topicDescriptor}".`,
    `- NEVER repeat identical activities across Introduction, Development, and Conclusion, and NEVER copy-paste boilerplate sentences within a stage.`,
    `- Every activity and exit assessment question MUST directly practice and measure the stated instructionalObjective.`,
    `PRACTICAL SEN ADAPTATION RULE (CRITICAL — TEACHER SPECIFIED "${senInput}"):`,
    `- Tailor "planLocation", "learningMaterials", and stage actions specifically to "${senInput}".`,
    senProfile.hasSpecificNeeds
      ? `- Required concrete SEN supports to integrate naturally: Location (${senProfile.locationNote}); Materials (${senProfile.materialsNote}); Teacher support (${senProfile.classroomSupportStep}).`
      : `- No specific disability was listed ("${senInput}"), so apply universal inclusive classroom practices without inventing unrequested disabilities.`,
    `DYNAMIC COMPETENCES & CROSS-CUTTING ISSUES RULE (CRITICAL):`,
    `- Available REB Generic Competences: ${cbc.competencesList}`,
    `- Available REB Cross-Cutting Issues: ${cbc.crossCuttingList}`,
    `- Choose ONLY 2–3 Generic Competences and 1–2 Cross-Cutting Issues that naturally fit "${topicDescriptor}" and explain in 1 short sentence HOW learners practice them during each stage.`,
    `EXACT OFFICIAL REB SECTION RULES:`,
    `1. "schoolName": Keep "${schoolInput || 'GS Kigali'}" if given, else "GS Kigali".`,
    `2. "teacherName": Keep "${teacherInput || 'Teacher'}" if given, else "Teacher".`,
    `3. "subject": MUST be "${subjectInput}".`,
    `4. "classLevel": MUST be "${classInput}".`,
    `5. "unitNo": "${unitNoInput}".`,
    `6. "unitTitle": Accurate REB unit title for ${subjectInput} ${classInput}${curriculumGrounding.matchedUnit ? ` ("${curriculumGrounding.matchedUnit.unitTitle}")` : ''}.`,
    `7. "lessonNo": "${lessonNoInput}".`,
    `8. "sen": "${senInput}".`,
    `9. "keyUnitCompetence": Official unit competence in clear ${cbc.languageName}.`,
    `10. "lessonTitle": ONE clean, correctly spelled lesson title in ${cbc.languageName}.`,
    `11. "instructionalObjective": ${cbc.objectiveGuidance}`,
    `12. "planLocation": Seating/grouping arrangement tailored to "${senInput}" in ${cbc.languageName}.`,
    `13. "learningMaterials": Real, low-cost, topic-specific teaching aids including specific adaptations for "${senInput}" in ${cbc.languageName}.`,
    `14. "references": Accurate REB syllabus / Teacher's Guide / Learner's Book reference for ${subjectInput} ${classInput} (indicate verification on elearning.reb.rw if exact unit text is not verified).`,
    `15. "activityOverview": 1–2 simple sentences describing how learners learn "${topicDescriptor}" actively and how understanding will be checked.`,
    `16. "stages": MUST contain EXACTLY 3 distinct, non-repetitive stages:`,
    `    - Stage 1 (stageType: "intro", stageName: "${cbc.introName}", timingMinutes: ${introMin}):`,
    `      * teacherActivities: 4–5 distinct numbered steps without timestamps: greet learners, apply SEN seating/check-in, ask 2 concrete diagnostic questions on prior knowledge, introduce "${topicDescriptor}", and state the instructional objective clearly.`,
    `      * learnerActivities: Matching 4–5 numbered steps describing active learner responses.`,
    `      * competencesAndIssues: Topic-matched Generic Competence + Cross-Cutting Issue and how it occurs in Introduction.`,
    `    - Stage 2 (stageType: "development", stageName: "${cbc.devName}", timingMinutes: ${devMin}):`,
    `      * teacherActivities: 6–7 varied, objective-aligned numbered steps for "${topicDescriptor}" in ${subjectInput} (${classInput}): structured group discovery with real aids, guiding questions, group presentations, clear board summary, guided paired practice, and targeted SEN scaffolding (${senInput}). NEVER include minute tags (like [0-10']).`,
    `      * learnerActivities: Matching 6–7 numbered steps showing active collaboration, manipulation of aids, presentation, note-taking, and paired practice.`,
    `      * competencesAndIssues: Distinct Generic Competences + Cross-Cutting Issues applied in Development.`,
    `    - Stage 3 (stageType: "conclusion", stageName: "${cbc.conclName}", timingMinutes: ${conclMin}):`,
    `      * teacherActivities: 3–4 numbered steps without timestamps — guide learner summary of "${topicDescriptor}", specify the Formative Assessment Method (2–3 concrete exit check questions/tasks aligned directly with the instructional objective), and explain how results will guide next-lesson follow-up.`,
    `      * learnerActivities: Matching 3–4 numbered steps — summarize takeaways in own words, complete the exit check task independently, and note personal focus areas.`,
    `      * competencesAndIssues: Topic-relevant Generic Competence & Cross-Cutting Issue + short explanation.`,
    `17. "teacherSelfEvaluation": NEVER invent mastery percentages (like "85%" or "95%"), NEVER invent student pass/fail counts, and NEVER write past-tense claims that the lesson was already taught! Instead, write a practical 2–3 sentence **Post-Lesson Reflection Guide (To be completed by the teacher after teaching)** in ${cbc.languageName} telling the teacher what evidence to record after teaching (exit-check mastery count, effectiveness of methods/aids and SEN adaptations, and remedial/extension follow-up). NEVER use blank underscores like "___%".`,
    `COMPLETENESS & TIMING RULE: Fill EVERY field 100% in ${cbc.languageName}. Never output blank strings, placeholder underscores ("___"), invented student percentages, or "N/A". Total stage minutes MUST equal ${targetDuration}.`,
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    hasPartialDraft
      ? `Complete all missing sections and produce a full Rwanda REB CBC lesson plan 100% in ${cbc.languageName} from this draft:`
      : `Generate a complete, practical, topic-specific Rwanda REB CBC lesson plan 100% in ${cbc.languageName}:`,
    `- School Name: ${schoolInput || 'GS Kigali'}`,
    `- Teacher Name: ${teacherInput || 'Teacher'}`,
    `- Term: ${localizedTerm}`,
    `- Date: ${dateInput}`,
    `- Subject (LOCKED — do NOT change): ${subjectInput}`,
    `- Class & Level Band (LOCKED): ${levelContext}`,
    `- Unit No.: ${unitNoInput}`,
    `- Unit Title: ${unitTitleInput || curriculumGrounding.matchedUnit?.unitTitle || `[Align with REB ${subjectInput} ${classInput} Unit ${unitNoInput}; mark reference for verification if exact title is unconfirmed]`}`,
    `- Lesson No.: ${lessonNoInput}`,
    `- Lesson Title / Topic (use ONE consistent title): ${topicDescriptor}`,
    `- Curriculum Context: ${curriculumGrounding.promptNote}`,
    `- Duration: ${targetDuration} minutes (Introduction: ${introMin} min, Development: ${devMin} min, Conclusion: ${conclMin} min)`,
    `- Class Size: ${classSize} learners`,
    `- Special Educational Needs (tailor adaptations specifically to these needs): ${senInput}`,
    partialRowsSummary ? `\nCurrent Draft Sections:\n${partialRowsSummary}` : '',
    input.extra ? `- Extra Teacher Notes: ${input.extra}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await generateWithResilience(ai, {
    contents: userPrompt,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
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
  if (rawStages.length === 0) {
    throw new AiServiceHttpError(502, 'AI returned a lesson plan without stages. Please click Retry.');
  }

  const finalSubject = subjectInput || pickMeaningful(existing?.subject, parsed.subject, 'Subject');
  const finalClass = classInput || pickMeaningful(existing?.classLevel, parsed.classLevel, 'P4');
  const finalLessonTitle = rawTopicInput
    ? sanitizeLanguageQuality(rawTopicInput, lang)
    : pickMeaningful(
        existing?.lessonTitle,
        parsed.lessonTitle,
        curriculumGrounding.matchedUnit?.sampleTopics[0] ||
          unitTitleInput ||
          `${finalSubject} Unit ${unitNoInput} Lesson ${lessonNoInput}`
      );
  const finalUnitTitle = pickMeaningful(
    existing?.unitTitle || unitTitleInput || curriculumGrounding.matchedUnit?.unitTitle,
    parsed.unitTitle,
    `${finalSubject} Unit ${unitNoInput}: ${finalLessonTitle}`
  );

  const stageFallback = (type: 'intro' | 'development' | 'conclusion', title: string) => {
    if (lang === 'rw') {
      if (type === 'intro') {
        return {
          teacher: `1. Gusuhuza abanyeshuri, kubara abitabiriye no kureba ko abafite ubumuga bicaye neza imbere.\n2. Kubaza ibibazo 2 byoroshye bihuje n'ibyo basanzwe bazi ku isomo rya ${title}.\n3. Kwandika umutwe w'isomo "${title}" ku kibaho mu nyandiko isobanutse.\n4. Gusobanurira abanyeshuri intego y'isomo n'ubushobozi bwitezwe muri iri somo.`,
          learner: `1. Kwikiriza umwarimu no gutegura amakayi n'amakaramu ku ntebe zabo.\n2. Gusubiza ibibazo by'intangiriro mu magambo yabo bakoresheje ingero zo mu buzima busanzwe.\n3. Gusoma no kwandika umutwe w'isomo mu makayi yabo mu mucyo.\n4. Kugaragaza muri make ibyo biteze kwiga no kunguka muri iri somo.`,
          comp: `Itumanaho: abanyeshuri baravuga ibitekerezo byabo mu Kinyarwanda cyumvikana.\nUburezi budaheza: imyanya myiza y'imbere ifasha buri munyeshuri gukurikira.`,
        };
      }
      if (type === 'development') {
        return {
          teacher: `1. Igikorwa mu matsinda: Guha buri tsinda ry'abanyeshuri 5 umwandiko n'amakarita y'isomo kuri ${title}.\n2. Gusaba abanyeshuri gusesengura ibiri ku makarita no kungurana ibitekerezo mu matsinda.\n3. Gutembera mu ishuri ugenzura ko buri munyeshuri arimo gufashwa kandi atanga igitekerezo.\n4. Gutumira abahagarariye amatsinda kumurika ibyo bagezeho ku kibaho mu buryo busobanutse.\n5. Kunoza no gukosora imyandikire n'imvugo, ugashimangira ingingo z'ingenzi zigize ${title}.\n6. Guha abanyeshuri imyitozo 2 yo gusobanura no gukemura ibibazo mu makayi yabo.`,
          learner: `1. Kwicara mu matsinda y'abanyeshuri 5 no gusesengura amakarita bahawe mu bwubahane.\n2. Kuganira no kungurana ibitekerezo mu matsinda ku bibazo by'ingenzi bya ${title}.\n3. Kwandika imyanzuro n'ibisubizo by'itsinda ku rupapuro rwo kumurika.\n4. Kumurika ibisubizo by'itsinda imbere y'abandi banyeshuri ku kibaho.\n5. Kwandika incamake yemejwe n'umwarimu mu makayi yabo y'isomo.\n6. Gukora imyitozo y'isuzuma mu makayi ku giti cyabo no gukosora amakosa.`,
          comp: `Gutekereza byimbitse n'Ubufatanye: abanyeshuri bafatanya gukemura ibibazo no kungurana ibitekerezo mu matsinda.\nUburinganire n'Amahoro: abahungu n'abakobwa bafatanya kuyobora amatsinda mu bwubahane.`,
        };
      }
      return {
        teacher: `1. Gufasha abanyeshuri kuvuga mu magambo make ibyo bize kuri ${title}.\n2. Kubaza ibibazo 2 byo gusuzuma ko intego y'isomo yagezweho.\n3. Gutanga inama no gushimira abanyeshuri bose ku bwitange bagaragaje.`,
        learner: `1. Gukora incamake y'isomo rya ${title} mu magambo yabo.\n2. Gusubiza ibibazo by'isuzuma rya nyuma mu makayi yabo ku giti cyabo.\n3. Gutega amatwi inama z'umwarimu no gusubiza ibikoresho mu myanya yabyo.`,
        comp: `Kwiga ubuzima bwose: abanyeshuri basobanukirwa agaciro ko kwiga no gukoresha ubumenyi mu buzima.\nUmuco w'ubuziranenge: abanyeshuri bakoresha imvugo n'imyandikire inoze y'Ikinyarwanda.`,
      };
    }

    if (lang === 'fr') {
      if (type === 'intro') {
        return {
          teacher: `1. Saluer les élèves, vérifier la présence et placer les apprenants à besoins spécifiques devant.\n2. Poser 2 questions simples pour réviser les notions préalables liées à ${title}.\n3. Écrire lisiblement le titre de la leçon « ${title} » au tableau.\n4. Expliquer clairement l'objectif d'apprentissage de la séance.`,
          learner: `1. Répondre aux salutations et préparer le matériel de travail sur les pupitres.\n2. Répondre oralement aux questions de révision avec des exemples concrets.\n3. Lire et copier le titre de la leçon dans les cahiers.\n4. Exprimer avec leurs propres mots ce qu'ils vont apprendre aujourd'hui.`,
          comp: `Communication : les apprenants expriment leurs idées clairement.\nÉducation inclusive : le placement adapté permet à chacun de suivre confortablement.`,
        };
      }
      if (type === 'development') {
        return {
          teacher: `1. Travail en groupe : Former des groupes hétérogènes de 5 et distribuer les fiches d'activités sur ${title}.\n2. Guider les groupes dans l'observation et la manipulation des supports didactiques.\n3. Circuler dans la classe pour soutenir les apprenants lents et encourager la prise de parole.\n4. Inviter des représentants de groupes à présenter leurs conclusions au tableau.\n5. Faire la synthèse institutionnelle et clarifier les concepts clés de ${title}.\n6. Proposer 2 exercices d'application individuelle dans les cahiers.`,
          learner: `1. Travailler activement en groupe de 5 sur les supports distribués.\n2. Discuter des questions posées et formuler des hypothèses communes.\n3. Noter les réponses du groupe sur les feuilles de restitution.\n4. Présenter les résultats du groupe à l'ensemble de la classe.\n5. Noter la synthèse validée par l'enseignant dans leurs cahiers.\n6. Résoudre les 2 exercices d'application et participer à l'autocorrection.`,
          comp: `Esprit critique et Coopération : les élèves analysent ensemble et s'entraident.\nGenre et Valeurs de paix : filles et garçons participent et dirigent à égalité.`,
        };
      }
      return {
        teacher: `1. Aider les élèves à résumer les 3 points essentiels de ${title}.\n2. Poser 2 questions rapides de vérification des acquis.\n3. Donner des remarques constructives pour encourager le progrès de chacun.`,
        learner: `1. Résumer ce qu'ils ont appris avec leurs propres mots.\n2. Répondre individuellement aux questions de sortie.\n3. Ranger soigneusement leur matériel de travail.`,
        comp: `Apprentissage tout au long de la vie : consolider la confiance et l'autonomie.\nCulture de standardisation : usage exact des termes de ${finalSubject}.`,
      };
    }

    if (lang === 'sw') {
      if (type === 'intro') {
        return {
          teacher: `1. Kusalimia wanafunzi, kukagua mahudhurio na kuhakikisha wenye mahitaji maalum wamekaa mbele.\n2. Kuuliza maswali 2 rahisi ya kukumbuka yanayohusiana na ${title}.\n3. Kuandika kichwa cha somo "${title}" ubaoni kwa usahihi.\n4. Kueleza lengo kuu la somo la leo kwa wanafunzi.`,
          learner: `1. Kuitikia salamu na kuandaa vifaa vya kujifunzia.\n2. Kujibu maswali ya mwanzo kwa kutoa mifano ya maisha ya kila siku.\n3. Kusoma na kuandika kichwa cha somo katika madaftari.\n4. Kutaja kwa maneno yao wanachotarajia kujifunza leo.`,
          comp: `Mawasiliano: wanafunzi wanaeleza mawazo yao kwa uwazi.\nElimu jumuishi: mpangilio wa viti unamsaidia kila mwanafunzi.`,
        };
      }
      if (type === 'development') {
        return {
          teacher: `1. Kazi ya Vikundi: Kuongoza vikundi mchanganyiko vya wanafunzi 5 kuchunguza ${title}.\n2. Kuongoza majadiliano ya vikundi kwa maswali elekezi na vifaa halisi.\n3. Kuzunguka darasani kutoa msaada kwa wanaojifunza polepole.\n4. Kualika wawakilishi wa vikundi kuwasilisha majibu yao ubaoni.\n5. Kufanya majumuisho na kusisitiza kanuni kuu za ${title}.\n6. Kutoa mazoezi 2 ya vitendo kwa wanafunzi kufanya katika madaftari.`,
          learner: `1. Kushirikiana katika vikundi vya wanafunzi 5 kuchunguza mada ya ${title}.\n2. Kujadili na kubadilishana mawazo kwa heshima na usikivu.\n3. Kuandika muhtasari wa majibu ya kikundi.\n4. Kuwasilisha majibu ya kikundi mbele ya darasa zima.\n5. Kunakili muhtasari uliothibitishwa na mwalimu katika madaftari.\n6. Kufanya mazoezi ya kibinafsi na kusahihisha makosa.`,
          comp: `Fikra tunduizi na Ushirikiano: wanafunzi wanafikiri na kusaidiana katika vikundi.\nUsawa wa kijinsia na Amani: wavulana na wasichana wanashiriki kwa usawa.`,
        };
      }
      return {
        teacher: `1. Kuwaongoza wanafunzi kufanya muhtasari wa mambo makuu ya ${title}.\n2. Kutoa maswali 2 mafupi ya kupima uelewa wa lengo la somo.\n3. Kutoa mrejesho chanya na kuwapongeza wanafunzi kwa ushiriki mzuri.`,
        learner: `1. Kutaja mambo makuu waliyojifunza kwa maneno yao wenyewe.\n2. Kujibu maswali ya tathmini ya mwisho katika madaftari.\n3. Kutunza vifaa vyao vya masomo kwa usahihi.`,
        comp: `Kujifunza maishani : kujenga tabia nzuri ya kujisomea.\nUtamaduni wa viwango: kutumia istilahi sahihi za ${finalSubject}.`,
      };
    }

    // Simple, clear English default
    if (type === 'intro') {
      return {
        teacher: `1. Greet students warmly, check attendance, and ensure learners with special educational needs sit in front.\n2. Ask 2 diagnostic questions linking everyday experiences to ${title}.\n3. Write the lesson title "${title}" clearly on the chalkboard.\n4. Explain today’s competence goal in simple words so every student knows what they will achieve.`,
        learner: `1. Greet the teacher and organize notebooks and pens on desks.\n2. Answer review questions using everyday examples connected to ${title}.\n3. Read the lesson title aloud together and write it in notebooks.\n4. Restate today’s learning objective in their own words.`,
        comp: `Communication: students share their ideas in simple, clear words.\nInclusive education: front-row seating and clear speech help every student join in.`,
      };
    }
    if (type === 'development') {
      return {
        teacher: `1. Group Task: Place students in mixed-ability groups of 5 and distribute real topic materials on ${title}.\n2. Guide each group to examine the materials and discuss key guiding questions.\n3. Circulate among groups, asking probing questions and supporting struggling learners.\n4. Invite group representatives to present findings on the chalkboard.\n5. Summarize the core concepts of ${title} on the chalkboard and address any misconceptions.\n6. Provide 2 guided practice questions for students to complete in pairs with peer checking.`,
        learner: `1. Collaborate in small mixed-ability groups of 5 with the distributed materials.\n2. Discuss observations and work together to solve the assigned group task.\n3. Record group findings clearly in exercise books.\n4. Present group solutions to the class with practical reasoning.\n5. Copy the confirmed chalkboard summary into notebooks.\n6. Complete the 2 guided practice questions in pairs, verifying solutions together.`,
        comp: `Critical thinking and Cooperation: students solve tasks together and compare ideas.\nGender and Peace and values: boys and girls take turns leading groups and listen respectfully.`,
      };
    }
    return {
      teacher: `1. Guide students to synthesize the 3 main takeaways of ${title}.\n2. Ask 2 quick exit check questions to evaluate individual mastery of the lesson goal.\n3. Offer constructive feedback on group participation and lesson engagement.`,
      learner: `1. State the main takeaways of ${title} in their own words.\n2. Answer the 2 exit check questions independently in notebooks.\n3. Reflect on how they will use the lesson concepts in daily life.`,
      comp: `Lifelong learning: students connect lesson insights to daily life.\nStandardization culture: students use correct ${finalSubject} terms and units.`,
    };
  };

  const buildNormalizedStage = (
    type: 'intro' | 'development' | 'conclusion',
    aiStage: Record<string, unknown> | undefined,
    existingStage:
      | {
          id?: string;
          stageName?: string;
          timingMinutes?: number;
          teacherActivities?: string;
          learnerActivities?: string;
          competencesAndIssues?: string;
        }
      | undefined,
    fallbackName: string,
    fallbackMin: number,
    stageIndex = 0
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
      id: existingStage?.id || `stage_${Date.now()}_${type}_${stageIndex}`,
      stageType: type,
      stageName: sanitizeTextPurity(
        pickMeaningful(existingStage?.stageName, aiStage?.stageName, fallbackName),
        lang
      ),
      timingMinutes:
        Number(aiStage?.timingMinutes) > 0
          ? Number(aiStage?.timingMinutes)
          : Number(existingStage?.timingMinutes) > 0
          ? Number(existingStage?.timingMinutes)
          : fallbackMin,
      teacherActivities: sanitizeTextPurity(ensureNumberedActions(teacherRaw) || fb.teacher, lang),
      learnerActivities: sanitizeTextPurity(ensureNumberedActions(learnerRaw) || fb.learner, lang),
      competencesAndIssues: sanitizeTextPurity(compRaw || fb.comp, lang),
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
      perDevFallback,
      idx
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

  const defaultReflection = buildPostLessonReflectionGuide({
    lang,
    lessonTitle: finalLessonTitle,
    durationMinutes: targetDuration,
    sen: senInput,
  });

  const localizedFallbacks: Record<
    SupportedLang,
    {
      competence: string;
      objective: string;
      materials: string;
      references: string;
      overview: string;
      eval: string;
    }
  > = {
    en: {
      competence:
        curriculumGrounding.matchedUnit?.keyUnitCompetence ||
        `To be able to understand and apply key ideas of ${finalUnitTitle} in ${finalClass} ${finalSubject}.`,
      objective: `Using visual charts and guided group tasks, ${finalClass} learners will be able to explain and solve tasks on ${finalLessonTitle} accurately during the exit check.`,
      materials: `REB ${finalClass} ${finalSubject} Learner’s Book, chalkboard, chalk, and ${senProfile.materialsNote || 'simple topic charts'}.`,
      references: curriculumGrounding.referenceText,
      overview: `Learners explore ${finalLessonTitle} step by step through concrete examples, group tasks, and a short formative exit check.`,
      eval: defaultReflection,
    },
    rw: {
      competence:
        curriculumGrounding.matchedUnit?.keyUnitCompetence ||
        `Gushobora gusobanukirwa no gukoresha ubumenyi bw'ingenzi bwa ${finalUnitTitle} mu isomo rya ${finalSubject} (${finalClass}).`,
      objective: `Bakoresheje imfashanyigisho n'imyitozo mu matsinda, abanyeshuri ba ${finalClass} bazashobora gusobanura no gukora neza imyitozo kuri ${finalLessonTitle}.`,
      materials: `Igitabo cy'umunyeshuri cya REB (${finalSubject} ${finalClass}), ikibaho, ingwa, n'${senProfile.materialsNote || 'amakarita yanditse neza'}.`,
      references: curriculumGrounding.referenceText,
      overview: `Abanyeshuri bariga ${finalLessonTitle} binyuze mu biganiro byo mu matsinda, imyitozo n'isuzuma rigufi.`,
      eval: defaultReflection,
    },
    fr: {
      competence:
        curriculumGrounding.matchedUnit?.keyUnitCompetence ||
        `Être capable de comprendre et d'appliquer les notions clés de ${finalUnitTitle} en ${finalSubject} (${finalClass}).`,
      objective: `À l'aide de supports visuels et du travail en groupe, les apprenants de ${finalClass} seront capables d'expliquer et de résoudre des tâches sur ${finalLessonTitle}.`,
      materials: `Manuel de l'élève REB ${finalClass} ${finalSubject}, tableau, craie, ${senProfile.materialsNote || 'et supports visuels'}.`,
      references: curriculumGrounding.referenceText,
      overview: `Les apprenants découvrent ${finalLessonTitle} par l'observation, le travail en petits groupes et une vérification formative finale.`,
      eval: defaultReflection,
    },
    sw: {
      competence:
        curriculumGrounding.matchedUnit?.keyUnitCompetence ||
        `Kuweza kuelewa na kutumia dhana kuu za ${finalUnitTitle} katika somo la ${finalSubject} (${finalClass}).`,
      objective: `Kwa kutumia chati na kazi za vikundi, wanafunzi wa ${finalClass} wataweza kueleza na kufanya mazoezi ya ${finalLessonTitle} kwa usahihi.`,
      materials: `Kitabu cha Mwanafunzi cha REB (${finalSubject} ${finalClass}), ubao, chaki, ${senProfile.materialsNote || 'na chati za somo'}.`,
      references: curriculumGrounding.referenceText,
      overview: `Wanafunzi wanajifunza ${finalLessonTitle} kupitia kazi za vikundi, majadiliano na tathmini fupi ya mwisho.`,
      eval: defaultReflection,
    },
  };
  const lf = localizedFallbacks[lang];

  const draftPlan: NormalizedLessonPlan = {
    schoolName: sanitizeTextPurity(pickMeaningful(schoolInput, parsed.schoolName, 'GS Kigali'), lang),
    teacherName: sanitizeTextPurity(pickMeaningful(teacherInput, parsed.teacherName, 'Teacher'), lang),
    term: sanitizeTextPurity(pickMeaningful(localizedTerm, parsed.term, cbc.termMap['Term 1']), lang),
    date: pickMeaningful(dateInput, parsed.date, new Date().toISOString().slice(0, 10)),
    subject: sanitizeTextPurity(finalSubject, lang),
    classLevel: finalClass,
    unitNo: pickMeaningful(unitNoInput, parsed.unitNo, '1'),
    lessonNo: pickMeaningful(lessonNoInput, parsed.lessonNo, '1 of 4'),
    durationMinutes: targetDuration,
    classSize: String(classSize),
    sen: sanitizeTextPurity(pickMeaningful(senInput, parsed.sen, defaultSenByLang[lang]), lang),
    unitTitle: sanitizeTextPurity(finalUnitTitle, lang),
    keyUnitCompetence: sanitizeTextPurity(
      pickMeaningful(
        existing?.keyUnitCompetence,
        parsed.keyUnitCompetence,
        lf.competence
      ),
      lang
    ),
    lessonTitle: sanitizeTextPurity(finalLessonTitle, lang),
    instructionalObjective: sanitizeTextPurity(
      pickMeaningful(
        existing?.instructionalObjective,
        parsed.instructionalObjective,
        lf.objective
      ),
      lang
    ),
    planLocation: sanitizeTextPurity(
      pickMeaningful(existing?.planLocation, parsed.planLocation, senProfile.locationNote || cbc.defaultLocation),
      lang
    ),
    learningMaterials: sanitizeTextPurity(
      pickMeaningful(
        existing?.learningMaterials,
        parsed.learningMaterials,
        lf.materials
      ),
      lang
    ),
    references: sanitizeTextPurity(
      pickMeaningful(
        existing?.references,
        parsed.references,
        lf.references
      ),
      lang
    ),
    activityOverview: sanitizeTextPurity(
      pickMeaningful(
        existing?.activityOverview,
        parsed.activityOverview,
        lf.overview
      ),
      lang
    ),
    stages: combinedStages.map((s) => ({
      id: s.id,
      stageType: s.stageType,
      stageName: sanitizeTextPurity(s.stageName, lang),
      timingMinutes: s.timingMinutes,
      teacherActivities: sanitizeTextPurity(s.teacherActivities, lang),
      learnerActivities: sanitizeTextPurity(s.learnerActivities, lang),
      competencesAndIssues: sanitizeTextPurity(s.competencesAndIssues, lang),
    })),
    teacherSelfEvaluation: sanitizeTextPurity(
      pickMeaningful(
        existing?.teacherSelfEvaluation &&
          !/_{2,}/.test(existing.teacherSelfEvaluation) &&
          !hasInventedAssessmentResults(existing.teacherSelfEvaluation)
          ? existing.teacherSelfEvaluation
          : undefined,
        typeof parsed.teacherSelfEvaluation === 'string' &&
          !/_{2,}/.test(parsed.teacherSelfEvaluation) &&
          !hasInventedAssessmentResults(parsed.teacherSelfEvaluation)
          ? parsed.teacherSelfEvaluation
          : undefined,
        lf.eval
      ),
      lang
    ),
  };

  const checked = runLessonQualityCheckAndRepair(draftPlan, {
    requestedSubject: finalSubject,
    requestedClass: finalClass,
    requestedTopic: rawTopicInput || undefined,
    lang,
    senInput,
    curriculumVerified: curriculumGrounding.verified,
    verifiedReference: curriculumGrounding.referenceText,
  });

  return {
    clarificationRequired: false,
    plan: checked.plan,
    qualityReport: checked.report,
  };
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AssistantTurnInput {
  language?: string;
  message: string;
  history?: Array<{ role: string; text: string }>;
  useWebSearch?: boolean;
}

export interface AssistantTurnOutput {
  reply: string;
  sources: GroundingSource[];
}

export async function generateAssistantReply(input: AssistantTurnInput): Promise<AssistantTurnOutput> {
  const lang = detectTargetLang(input.language, { texts: [input.message] });
  const cbc = CBC_LOCALIZATION[lang];
  const ai = getAiClient();
  const useWebSearch = input.useWebSearch !== false;
  if (!ai) {
    throw new AiServiceHttpError(503, 'GEMINI_API_KEY is not configured on the server. Please configure it in Settings > Secrets.');
  }

  const systemInstruction = [
    `You are GHAD AI, a helpful teaching assistant for Rwandan teachers (Primary P1–P6 and Secondary S1–S6) aligned with the ${cbc.curriculumHeader}.`,
    cbc.styleRule,
    lang === 'rw'
      ? `KINYARWANDA TEXT PURITY ENFORCEMENT: Write strictly in pure, standard Kinyarwanda Latin text. Never output stray corrupted tokens, numbers embedded inside words (strictly NO 'is2omo' or 'mu1baza'), or foreign script characters (strictly NO Chinese, Japanese, Korean, Cyrillic, or non-Latin glyphs).`
      : '',
    `DIRECT ANSWER RULE: Answer the user's exact question clearly right from the first sentence. Do NOT open with greetings or generic lesson-plan boilerplate unless the user asks for a lesson plan.`,
    `Give accurate, practical answers with real examples teachers and students can use right away.`,
    `STRICT LANGUAGE RULE: Respond 100% in ${cbc.languageName} with clear, natural grammar. If the user writes in Kinyarwanda or asks about Kinyarwanda, use natural, correct Kinyarwanda.`,
    `FORMATTING RULE: Format answers cleanly in Markdown using short headings (###), **bold** labels, numbered lists, and bullet points.`,
  ]
    .filter(Boolean)
    .join('\n');

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  if (Array.isArray(input.history)) {
    for (const item of input.history.slice(-24)) {
      if (item && typeof item.text === 'string' && item.text.trim()) {
        const role: 'user' | 'model' = item.role === 'user' ? 'user' : 'model';
        const text = item.text.trim();
        if (contents.length === 0 && role === 'model') {
          continue;
        }
        const prev = contents[contents.length - 1];
        if (prev && prev.role === role) {
          prev.parts[0].text = `${prev.parts[0].text}\n\n${text}`;
        } else {
          contents.push({ role, parts: [{ text }] });
        }
      }
    }
  }
  while (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents.pop();
  }
  contents.push({ role: 'user', parts: [{ text: input.message.trim() }] });

  let response;
  if (useWebSearch) {
    try {
      response = await generateWithResilience(ai, {
        contents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (err: unknown) {
      if (isAuthOrKeyError(err)) {
        throw err;
      }
      console.warn(
        '[GHAD AI] Google Search grounded call failed; falling back to ungrounded response:',
        extractErrorText(err)
      );
      response = await generateWithResilience(ai, {
        contents,
        config: {
          systemInstruction,
        },
      });
    }
  } else {
    response = await generateWithResilience(ai, {
      contents,
      config: {
        systemInstruction,
      },
    });
  }

  const reply = (response.text || '').trim();
  if (!reply) {
    throw new AiServiceHttpError(502, 'Gemini returned an empty assistant response.');
  }

  const groundingChunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seenUris = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const chunk of groundingChunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || (!uri.startsWith('https://') && !uri.startsWith('http://')) || seenUris.has(uri)) {
      continue;
    }
    seenUris.add(uri);
    let title = chunk?.web?.title?.trim() || '';
    if (!title) {
      try {
        title = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        title = uri;
      }
    }
    sources.push({ title, uri });
    if (sources.length >= 10) break;
  }

  return { reply, sources };
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

function normalizeAssessmentType(raw: string | undefined): string {
  const val = String(raw || 'mcq').trim().toLowerCase();
  if (val === 'fill_blank' || val === 'fill in the blanks' || val === 'fill-in-the-blanks') return 'fill_blank';
  if (val === 'matching') return 'matching';
  if (val === 'true_false' || val === 'true / false' || val === 'true/false') return 'true_false';
  if (val === 'open_ended' || val === 'open-ended' || val === 'open ended') return 'open_ended';
  if (val === 'short' || val === 'short answer' || val === 'short answer questions') return 'short';
  if (val === 'mixed') return 'mixed';
  return 'mcq';
}

export async function generateRebAssessment(input: GenerateAssessmentInput) {
  const lang = detectTargetLang(input.language, {
    subject: input.subject,
    texts: [input.topic],
  });
  const cbc = CBC_LOCALIZATION[lang];
  const questionCount = Math.max(1, Math.min(30, Number(input.count) || 5));
  const diffLabel = cbc.difficultyMap[input.difficulty || 'medium'] || cbc.difficultyMap.medium;
  const requestedType = normalizeAssessmentType(input.type);
  const typeLabel = cbc.typeMap[requestedType] || cbc.typeMap.mcq;
  const levelContext = getLevelBand(input.classLevel);

  const ai = getAiClient();
  if (!ai) {
    throw new AiServiceHttpError(503, 'GEMINI_API_KEY is not configured on the server. Please configure it in Settings > Secrets.');
  }

  const systemInstruction = [
    `You are an assessment writer for the ${cbc.curriculumHeader}.`,
    cbc.styleRule,
    `STRICT LANGUAGE RULE: Write EVERY SINGLE field (title, instructions, questions, options, answers, and marking notes) 100% in clear, natural ${cbc.languageName}.`,
    `Write clear, student-friendly questions matched to ${levelContext} and Rwanda CBC competence goals. Generate ALL ${questionCount} questions with a complete, easy-to-follow Answer Key and Marking Scheme.`,
    `QUESTION TYPE FORMATTING RULES (CRITICAL — FOLLOW EXACTLY):`,
    `- "mcq" (Multiple Choice): Set "type" to "mcq". Give 4 clear choices in "options" starting with "A. ...", "B. ...", "C. ...", "D. ...". Put the correct choice (e.g. "B. ...") in "answer" and a short explanation in "markingNotes".`,
    `- "fill_blank" (Fill in the Blanks): Set "type" to "fill_blank". Write a clear sentence containing a visible blank like "________" in "question". Leave "options" as []. Put the exact missing word(s) in "answer" and accepted variations in "markingNotes".`,
    `- "matching" (Matching): Set "type" to "matching". In "question", give a clear instruction plus Column A (numbered 1, 2, 3...) and Column B (lettered A, B, C... in mixed order) formatted on separate lines using newline characters (\\n). Leave "options" as [] (or list the pairs cleanly if helpful). Put the complete answer key (e.g. "1-C, 2-A, 3-B, 4-D") in "answer" and 1 mark per correct pair in "markingNotes".`,
    `- "true_false" (True / False): Set "type" to "true_false". Write one clear statement in "question". Set "options" to the two choices in ${cbc.languageName} (for English: ["True", "False"]; Kinyarwanda: ["Nibyo", "Sibyo"]; French: ["Vrai", "Faux"]; Swahili: ["Kweli", "Si kweli"]). Put the correct choice in "answer" and a brief 1-sentence reason in "markingNotes".`,
    `- "open_ended" (Open-Ended Questions): Set "type" to "open_ended". Ask a clear question inviting students to explain, compare, or give real-life examples. Leave "options" as []. Put a clear model answer with numbered points in "answer" and how marks are awarded in "markingNotes".`,
    `- "short" (Short Answer Questions): Set "type" to "short". Ask a direct question needing a 1–3 sentence answer or short calculation. Leave "options" as []. Put the exact answer in "answer" and mark breakdown in "markingNotes".`,
    `- "mixed" (Mixed): Distribute the ${questionCount} questions across Multiple Choice ("mcq"), Fill in the Blanks ("fill_blank"), Matching ("matching"), True / False ("true_false"), Open-Ended ("open_ended"), and Short Answer ("short") — covering as many of these 6 types as fit inside ${questionCount} questions — and set each question's "type" field to its exact type key.`,
  ].join('\n');

  const userPrompt = [
    `Generate a complete ${questionCount}-question assessment in ${cbc.languageName}:`,
    `- Subject (write in ${cbc.languageName} if needed): ${input.subject}`,
    `- Class & Level Band: ${levelContext}`,
    `- Topic: ${input.topic}`,
    `- Difficulty Level: ${diffLabel}`,
    `- Requested Question Type (${requestedType}): ${typeLabel}`,
    `Ensure every question is clear and easy to understand, "totalMarks" equals the sum of individual question marks, and every question has an accurate Answer Key and Marking Scheme entry.`,
  ].join('\n');

  const response = await generateWithResilience(ai, {
    contents: userPrompt,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
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
                type: {
                  type: Type.STRING,
                  description:
                    'One of: mcq, fill_blank, matching, true_false, open_ended, short',
                },
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
        type: normalizeAssessmentType(
          String(q?.type || (requestedType === 'mixed' ? 'short' : requestedType))
        ),
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

  const defaultInstructionsByLang: Record<SupportedLang, string> = {
    en: 'Read each question carefully and answer all questions clearly.',
    rw: 'Soma buri kibazo witonze kandi usubize ibibazo byose neza.',
    fr: 'Lisez attentivement chaque question et répondez clairement à toutes les questions.',
    sw: 'Soma kila swali kwa makini na ujibu maswali yote kwa uwazi.',
  };

  return {
    title: String(parsed.title || `${input.subject} (${input.classLevel}) — ${input.topic}`).trim(),
    instructions: String(parsed.instructions || defaultInstructionsByLang[lang]).trim(),
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
  const lang = detectTargetLang(input.language, {
    subject: input.subject,
    texts: [input.topic],
  });
  const cbc = CBC_LOCALIZATION[lang];
  const levelContext = getLevelBand(input.classLevel);
  const classSize = Math.max(1, Math.min(200, Number(input.classSize) || 40));

  const ai = getAiClient();
  if (!ai) {
    throw new AiServiceHttpError(503, 'GEMINI_API_KEY is not configured on the server. Please configure it in Settings > Secrets.');
  }

  const systemInstruction = [
    `You are a practical teaching coach for the ${cbc.curriculumHeader} specializing in active, student-centred classroom methods.`,
    cbc.styleRule,
    `STRICT LANGUAGE RULE: Write EVERY SINGLE field 100% in clear, natural ${cbc.languageName}.`,
    'Focus on simple hands-on discovery, group work, think-pair-share, inclusive support for students with special needs, quick checks for understanding, and low-cost materials easy to find in Rwandan schools.',
  ].join('\n');

  const userPrompt = [
    `Design a clear, practical, student-centred CBC teaching methodology guide in ${cbc.languageName}:`,
    `- Subject (write in ${cbc.languageName} if needed): ${input.subject}`,
    `- Class & Level Band: ${levelContext}`,
    `- Topic: ${input.topic}`,
    `- Typical Class Size: ${classSize} learners`,
  ].join('\n');

  const response = await generateWithResilience(ai, {
    contents: userPrompt,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
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
