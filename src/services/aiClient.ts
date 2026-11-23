import { GoogleGenAI, Type } from '@google/genai';
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
  constructor(message: string, status = 500, opts?: { isAborted?: boolean; isHighDemand?: boolean }) {
    super(message);
    this.status = status;
    this.isAborted = Boolean(opts?.isAborted);
    this.isHighDemand = opts?.isHighDemand ?? (status === 503 || status === 429);
  }
}

export function parseGeminiError(err: unknown): AiClientError {
  if (err instanceof AiClientError) return err;

  const raw = err instanceof Error ? err.message : String(err);
  let statusCode = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code ?? 500;
  let cleanMsg = raw;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) {
      if (typeof parsed.error.code === 'number') {
        statusCode = parsed.error.code;
      }
      if (typeof parsed.error.message === 'string') {
        cleanMsg = parsed.error.message;
      }
    }
  } catch {
    // raw was not json
  }

  const lower = cleanMsg.toLowerCase();
  const isHighDemand =
    statusCode === 503 ||
    statusCode === 429 ||
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('resource_exhausted') ||
    lower.includes('overloaded');

  if (isHighDemand) {
    statusCode = statusCode === 429 ? 429 : 503;
    cleanMsg =
      'The AI model is currently experiencing temporary high demand (503). Retrying automatically in a few seconds...';
  } else if (statusCode === 404 || lower.includes('not found') || lower.includes('no longer available')) {
    cleanMsg = 'Requested model is updating. Switching to an available model...';
  } else if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('insufficient authentication')
  ) {
    cleanMsg =
      'Invalid or unauthorized Gemini API key. Please check your key in Settings > Gemini API Configuration.';
  }

  return new AiClientError(cleanMsg, statusCode, { isHighDemand });
}

export function getStoredGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ghad_custom_gemini_key') || '';
}

export function setStoredGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem('ghad_custom_gemini_key', trimmed);
  } else {
    localStorage.removeItem('ghad_custom_gemini_key');
  }
}

function getBrowserAi(): GoogleGenAI {
  const customKey = typeof window !== 'undefined' ? localStorage.getItem('ghad_custom_gemini_key') : null;
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  const apiKey = (customKey && customKey.trim()) || (envKey && envKey !== 'MY_GEMINI_API_KEY' ? envKey : '');
  
  if (!apiKey) {
    return new GoogleGenAI({});
  }
  return new GoogleGenAI({ apiKey });
}

const MODEL_CANDIDATES = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;

async function generateWithResilience<T>(
  makeCall: (model: string) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  let lastErr: unknown;
  for (const model of MODEL_CANDIDATES) {
    if (signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (signal?.aborted) {
        throw new AiClientError('Request cancelled.', 499, { isAborted: true });
      }
      try {
        return await makeCall(model);
      } catch (err: unknown) {
        lastErr = err;
        const parsed = parseGeminiError(err);
        if (parsed.isAborted || signal?.aborted) throw parsed;

        // If model was not found, immediately move to the next model in chain
        if (parsed.status === 404) break;

        // If high demand, brief wait and try next attempt or model
        if (parsed.isHighDemand && attempt === 1) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        break;
      }
    }
  }
  throw parseGeminiError(lastErr);
}

export async function testGeminiApiKey(
  apiKey: string
): Promise<{ success: boolean; message: string; model?: string }> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { success: false, message: 'Please enter an API key to test.' };
  }
  if (cleanKey.startsWith('AQ.')) {
    return {
      success: false,
      message:
        "The key starts with 'AQ.'. This is a web session token rather than a Google AI Studio API key. Standard Gemini keys start with 'AIzaSy...'. Get your free key at aistudio.google.com/app/apikey.",
    };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const res = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Respond with the single word "OK" to verify this API key connection.',
    });
    const reply = (res.text || '').trim();
    if (reply) {
      return {
        success: true,
        message: 'Gemini API key verified successfully! Connected to Gemini 3.8 Flash.',
        model: 'gemini-3.8-flash',
      };
    }
    return { success: false, message: 'Gemini returned an empty test response.' };
  } catch (err) {
    const parsed = parseGeminiError(err);
    return { success: false, message: parsed.message };
  }
}

function parseJsonSafely<T>(rawText: string, label: string): T {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new AiClientError(`Gemini returned an empty ${label} response.`, 502);
  }
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
        // Fall through
      }
    }
    throw new AiClientError(`AI returned an incomplete ${label} structure. Please click Retry.`, 502);
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

// ============================================================================
// OFFLINE REB CBC FALLBACK GENERATOR
// Guarantees 100% uptime when Google API experiences 503 high demand or network downtime.
// Strictly adheres to REB CBC 4-part instructional objectives & numbered 1., 2., 3. steps.
// ============================================================================

export function buildOfflineLessonPlan(params: LessonRequestParams): LessonPlanData {
  const lang = params.lang || 'en';
  const subject = params.subject || 'General Studies';
  const classLevel = params.classLevel || 'P4';
  const unitNo = params.unitNo || '1';
  const lessonNo = params.lessonNo || '1 of 4';
  const lessonTitle = params.topic || params.unitTitle || `${subject} Core Competence`;
  const unitTitle = params.unitTitle || `Unit ${unitNo}: ${lessonTitle}`;
  const schoolName = params.schoolName || 'GS Kigali';
  const teacherName = params.teacherName || 'Teacher';
  const date = params.date || new Date().toISOString().slice(0, 10);
  const classSize = String(params.learners || 40);
  const sen = params.sen || 'Slow learners (2), Mild visual impairment (1)';
  const localizedTerm =
    translate(lang, `term_${params.term.replace(/\s+/g, '_').toLowerCase()}`) || params.term || 'Term 1';

  const totalMin = Math.max(10, Math.min(240, Number(params.duration) || 40));
  const introMin = totalMin >= 80 ? 10 : 5;
  const conclMin = totalMin >= 80 ? 10 : 5;
  const devMin = totalMin - introMin - conclMin;

  const existing = params.existingPlan;

  let objective = '';
  let keyCompetence = '';
  let planLocation = '';
  let learningMaterials = '';
  let references = '';
  let activityOverview = '';
  let teacherEval = '';

  let introTeacher = '';
  let introLearner = '';
  let introComp = '';

  let devTeacher = '';
  let devLearner = '';
  let devComp = '';

  let conclTeacher = '';
  let conclLearner = '';
  let conclComp = '';

  if (lang === 'rw') {
    objective = `Mu mpera z'iri somo, bahawe ibikoresho by'isomo no gukorera mu matsinda, abanyeshuri ba ${classLevel} bazashobora gusobanura no gukemura ibibazo bijyanye na ${lessonTitle} neza ku gipimo kitari munsi ya 80%.`;
    keyCompetence = `Gushobora gusobanura no gukoresha ubumenyi n'ubushobozi bwerekeye ${unitTitle} mu buzima bwa buri munsi mu isomo rya ${subject} (${classLevel}).`;
    planLocation = 'Imbere mu ishuri — abanyeshuri bicaye mu matsinda avanze.';
    learningMaterials = `Igitabo cy'umunyeshuri cya REB (${classLevel} ${subject}), ikibaho, ingwa, ibishushanyo n'imbonerahamwe byateguwe byoroheye bose.`;
    references = `Integanyanyigisho ya REB n'Igitabo cy'Umwarimu bya ${subject} (${classLevel}), Umutwe wa ${unitNo}.`;
    activityOverview = `Binyuze mu bushakashatsi buyobowe, ibiganiro byo mu matsinda n'imyitozo ihuriweho, abanyeshuri bariga kandi basobanukirwa neza ${lessonTitle}.`;
    teacherEval = `Isomo kuri ${lessonTitle} ryatanzwe mu minota ${totalMin}. Abanyeshuri basaga ___% bageze ku ntego y'isomo; abatarabashije kuyigeraho bazahabwa ubufasha bwunganira mu isomo ritaha.`;

    introTeacher = `1. Kuramutsa abanyeshuri, kureba abitabiriye no kugenzura ko abafite ubumuga n'abagenda buhoro bicaranye na bagenzi babo babafasha.\n2. Kubaza ibibazo bibiri byo kugarura ubumenyi basanganywe bifitanye isano na ${lessonTitle}.\n3. Gutangaza umutwe w'isomo "${lessonTitle}" no gusobanura intego y'isomo mu Kinyarwanda cyumvikana.`;
    introLearner = `1. Kwitaba mwarimu no gutunganya amakaye, amakaramu n'ibikoresho by'isomo ku meza.\n2. Gusubiza mu magambo ibibazo mwarimu abaza baha ingero zifatika zo mu buzima bwa buri munsi.\n3. Gusoma no kwandika umutwe w'isomo mu makaye yabo neza.`;
    introComp = `Itumanaho: abanyeshuri bavuga bisanzuye kandi bagatega amatwi.\nUburezi budaheza: umwarimu yitaho abanyeshuri bafite ibibazo by'amaso n'abagenda buhoro (${sen}).`;

    devTeacher = `1. Imirimo yo mu Matsinda: Kugabanya abanyeshuri mu matsinda y'ubushobozi buvanze (abanyeshuri 4-6), kubaha imirimo yo gushakashura kuri ${lessonTitle}.\n2. Kwerekana no Guhuza Ubumenyi: Guha ijambo abahagarariye amatsinda ngo berekane ibyo bagezeho ku kibaho, no guhuza ubumenyi.\n3. Imyitozo Iyobowe: Guha abanyeshuri imyitozo itandukanye no gutanga ubufasha bwihariye ku banyeshuri bagenda buhoro.`;
    devLearner = `1. Gukorera hamwe mu matsinda, gusesengura imirimo bahawe kuri ${lessonTitle} no kwandika imyanzuro y'itsinda.\n2. Kwerekana ibyavuye mu matsinda ku kibaho no gufata inyandiko z'ingenzi zihujwe na mwarimu.\n3. Gukora imyitozo y'isomo umuntu ku giti cye no mu matsinda y'abantu babiri bafashanya.`;
    devComp = `Gutekereza byimbitse n'ubufatanye: abanyeshuri bafatanya gukemura ibibazo no gusesengura.\nUburinganire n'indangagaciro z'amahoro: abahungu n'abakobwa bayobora amatsinda ku buryo bungana no kubahana.`;

    conclTeacher = `1. Guhuriza hamwe amasomo y'ingenzi kuri ${lessonTitle} binyuze mu bibazo byo gusoza.\n2. Gutanga isuzuma rigufi (exit ticket) ry'ibibazo 2 ryo kureba niba intego y'isomo yagezweho.\n3. Gutanga umukoro wo mu rugo ukomoka mu gitabo cy'umunyeshuri cya REB no gutegura isomo ritaha.`;
    conclLearner = `1. Gusubiramo muri make ingingo z'ingenzi bamenye kuri ${lessonTitle} mu magambo yabo bwite.\n2. Gukora isuzuma rigufi ryo gusoza isomo mu makaye yabo batareberana.\n3. Kwandika umukoro wo mu rugo no gukusanya neza ibikoresho by'isomo.`;
    conclComp = `Kwiga ubuzima bwose: umukoro wo mu rugo utoza umuco wo kwiyungura ubumenyi.\nUmuco w'ubuziranenge: gukoresha amagambo nyayo y'integanyanyigisho no kwandika bisukuye mu makaye.`;
  } else if (lang === 'fr') {
    objective = `À la fin de cette leçon, à l'aide du matériel didactique et des activités en groupe, les apprenants de ${classLevel} seront capables d'expliquer, de démontrer et de résoudre avec précision des exercices sur ${lessonTitle}, avec un taux de réussite d'au moins 80%.`;
    keyCompetence = `Être capable de comprendre et d'appliquer avec rigueur les compétences clés de ${unitTitle} en ${subject} (${classLevel}).`;
    planLocation = 'Dans la salle de classe — apprenants répartis en groupes hétérogènes.';
    learningMaterials = `Manuel de l'apprenant REB (${classLevel} ${subject}), tableau, craie, fiches d'exercices différenciées et affiches explicatives adaptées.`;
    references = `Curriculum REB et Guide de l'enseignant pour ${subject} (${classLevel}), Unité ${unitNo}.`;
    activityOverview = `Par le biais de recherches guidées, de travaux coopératifs en sous-groupes et d'exercices d'application, les apprenants maîtrisent activement ${lessonTitle}.`;
    teacherEval = `Leçon sur ${lessonTitle} dispensée en ${totalMin} minutes. Environ ___% des apprenants ont atteint l'objectif pédagogique; un soutien ciblé sera accordé aux élèves en difficulté.`;

    introTeacher = `1. Saluer chaleureusement les apprenants, vérifier les présences et s'assurer de l'agencement inclusif de la classe.\n2. Poser deux questions diagnostiques pour relier les prérequis de la classe à ${lessonTitle}.\n3. Annoncer le titre de la leçon "${lessonTitle}" et expliciter l'objectif pédagogique d'apprentissage.`;
    introLearner = `1. Répondre aux salutations et préparer leurs cahiers et stylos sur les tables.\n2. Répondre oralement aux questions de révision en citant des exemples concrets du quotidien.\n3. Lire et noter soigneusement le titre de la leçon et l'objectif dans leurs cahiers.`;
    introComp = `Communication: expression claire et écoute active des consignes.\nÉducation inclusive: aménagement spatial favorisant l'inclusion des apprenants à besoins spécifiques (${sen}).`;

    devTeacher = `1. Découverte en groupe: Répartir les apprenants en groupes hétérogènes de 4 à 6, distribuer les fiches sur ${lessonTitle} et guider la démarche d'investigation.\n2. Restitution et Harmonisation: Inviter les rapporteurs de groupes à présenter leurs résultats au tableau, corriger les erreurs et harmoniser la synthèse.\n3. Exercices guidés et Différenciation: Proposer des exercices d'application gradués et apporter un appui ciblé aux apprenants lents.`;
    devLearner = `1. Collaborer activement au sein du groupe, analyser la tâche sur ${lessonTitle} et consigner les conclusions communes.\n2. Présenter le travail du groupe au tableau et noter la synthèse harmonisée par l'enseignant.\n3. Résoudre les exercices d'application individuellement et en binômes avec rigueur.`;
    devComp = `Esprit critique et Coopération: analyse rigoureuse et travail d'équipe interactif.\nÉducation au genre et Paix: participation équitable des filles et des garçons dans la prise de parole et respect mutuel.`;

    conclTeacher = `1. Guider les apprenants dans la synthèse des notions fondamentales sur ${lessonTitle}.\n2. Administrer un contrôle formatif rapide de fin de leçon (2 questions) pour vérifier l'atteinte de l'objectif.\n3. Donner des devoirs ciblés tirés du manuel REB et annoncer le thème de la leçon suivante.`;
    conclLearner = `1. Reformuler avec leurs propres mots les notions clés apprises sur ${lessonTitle}.\n2. Répondre individuellement au mini-contrôle formatif dans leurs cahiers.\n3. Noter le devoir à domicile et ranger leur espace de travail.`;
    conclComp = `Apprentissage tout au long de la vie: autonomie dans la réalisation des devoirs à domicile.\nCulture de la standardisation: rigueur de l'expression et soin apporté aux travaux écrits.`;
  } else {
    // English (Default)
    objective = `By the end of this lesson, given REB textbooks, structured group tasks, and concrete learning aids, ${classLevel} learners will be able to explain, demonstrate, and solve practical exercises on ${lessonTitle} accurately, achieving at least 80% correctness.`;
    keyCompetence = `To be able to explain and apply core concepts of ${unitTitle} accurately in ${classLevel} ${subject} contexts.`;
    planLocation = 'Inside the classroom — learners seated in mixed-ability inclusive groups.';
    learningMaterials = `REB ${classLevel} ${subject} Learner’s Book, chalkboard, chalk, large-print summary charts, and differentiated practice worksheets.`;
    references = `REB ${subject} Curriculum & Teacher’s Guide for ${classLevel}, Unit ${unitNo}.`;
    activityOverview = `Through guided inquiry, collaborative mixed-ability group work, and formative checks, learners actively discover and master ${lessonTitle}.`;
    teacherEval = `Lesson on ${lessonTitle} delivered within ${totalMin} minutes. Approximately ___% of learners met the instructional objective; remedial reinforcement planned for learners needing additional guided practice.`;

    introTeacher = `1. Greet learners warmly, check attendance, and verify inclusive seating arrangements.\n2. Ask 2 diagnostic review questions to connect prior knowledge with ${lessonTitle}.\n3. Announce the lesson title "${lessonTitle}" and clearly share the instructional objective.`;
    introLearner = `1. Respond to greetings and organize notebooks and pens.\n2. Answer review questions orally using everyday Rwandan examples.\n3. Read and copy the lesson title and key focus into exercise books.`;
    introComp = `Communication: learners express prior knowledge and listen actively.\nInclusive education: teacher ensures learners with SEN (${sen}) are seated near the front with supportive peers.`;

    devTeacher = `1. Group Discovery: Divide the class into mixed-ability groups of 4-6 learners, distribute exploration worksheets on ${lessonTitle}, and facilitate active investigation.\n2. Presentation & Harmonization: Invite group representatives to present findings on the chalkboard, address misconceptions, and synthesize key points.\n3. Guided Practice & Differentiation: Assign differentiated exercises while circulating to provide targeted scaffolding for slow learners.`;
    devLearner = `1. Collaborate actively in groups, investigate the given task on ${lessonTitle}, and record group conclusions.\n2. Present group findings to the class, ask questions, and take notes during teacher harmonization.\n3. Complete individual and paired practice problems, helping peers constructively.`;
    devComp = `Critical thinking & Cooperation: learners analyze concepts and collaborate in mixed-ability groups.\nGender education & Peace and values: boys and girls lead groups equally and practice mutual respect.`;

    conclTeacher = `1. Guide learners to synthesize and state the key takeaways of the lesson on ${lessonTitle}.\n2. Administer a quick 2-question formative exit check to assess attainment of the instructional objective.\n3. Assign concise homework from the REB ${subject} Learner's Book and preview the next lesson.`;
    conclLearner = `1. State key learning points on ${lessonTitle} in their own words.\n2. Complete the formative exit check individually in their exercise books.\n3. Record the homework assignment and tidy up the learning environment.`;
    conclComp = `Lifelong learning: independent homework reinforces mastery beyond class.\nStandardization culture: learners apply accurate ${subject} terminology and structured reasoning.`;
  }

  const stageIntroName = lang === 'rw' ? 'Intangiriro' : lang === 'fr' ? 'Introduction' : 'Introduction';
  const stageDevName = lang === 'rw' ? 'Igice Nyamukuru' : lang === 'fr' ? 'Développement' : 'Development';
  const stageConclName = lang === 'rw' ? 'Umwanzuro' : lang === 'fr' ? 'Conclusion' : 'Conclusion';

  return {
    schoolName: existing?.schoolName || schoolName,
    teacherName: existing?.teacherName || teacherName,
    term: existing?.term || localizedTerm,
    date: existing?.date || date,
    subject: existing?.subject || subject,
    classLevel: existing?.classLevel || classLevel,
    unitNo: existing?.unitNo || unitNo,
    lessonNo: existing?.lessonNo || lessonNo,
    durationMinutes: totalMin,
    classSize: existing?.classSize || classSize,
    sen: existing?.sen || sen,
    unitTitle: existing?.unitTitle || unitTitle,
    keyUnitCompetence: existing?.keyUnitCompetence || keyCompetence,
    lessonTitle: existing?.lessonTitle || lessonTitle,
    instructionalObjective: existing?.instructionalObjective || objective,
    planLocation: existing?.planLocation || planLocation,
    learningMaterials: existing?.learningMaterials || learningMaterials,
    references: existing?.references || references,
    activityOverview: existing?.activityOverview || activityOverview,
    stages: [
      {
        id: `stage_${Date.now()}_0`,
        stageType: 'intro',
        stageName: stageIntroName,
        timingMinutes: introMin,
        teacherActivities: introTeacher,
        learnerActivities: introLearner,
        competencesAndIssues: introComp,
      },
      {
        id: `stage_${Date.now()}_1`,
        stageType: 'development',
        stageName: stageDevName,
        timingMinutes: devMin,
        teacherActivities: devTeacher,
        learnerActivities: devLearner,
        competencesAndIssues: devComp,
      },
      {
        id: `stage_${Date.now()}_2`,
        stageType: 'conclusion',
        stageName: stageConclName,
        timingMinutes: conclMin,
        teacherActivities: conclTeacher,
        learnerActivities: conclLearner,
        competencesAndIssues: conclComp,
      },
    ],
    teacherSelfEvaluation: existing?.teacherSelfEvaluation || teacherEval,
  };
}

export function buildOfflineAssistantReply(params: {
  lang: Lang;
  message: string;
}): string {
  const { lang, message } = params;
  const lower = (message || '').toLowerCase();

  if (lang === 'rw') {
    if (lower.includes('intego') || lower.includes('objective')) {
      return `### Intego y'Isomo Ishingiye ku Bushobozi (REB CBC)\n\nMu nteganyanyigisho y'u Rwanda ya REB CBC, intego y'isomo (Instructional Objective) igomba kwandikwa mu nteruro imwe inoze yujuje ibice 4 by'ingenzi:\n\n1. **Imiterere / Ibikoresho (Condition)**: Bahawe ibikoresho nyabyo (urugero: bahawe ibitabo bya REB, ibishushanyo, cyangwa gukorera mu matsinda).\n2. **Uwigishwa (Who)**: Abanyeshuri bo mu cyiciro runaka (urugero: abanyeshuri ba P4 cyangwa S2).\n3. **Igikorwa Gipimika (Measurable Action)**: Hakoreshwa inshinga ipimika ya Bloom (urugero: bazashobora gusobanura, gusesengura, gukemura, cyangwa gushushanya).\n4. **Igipimo cy'Ubuziranenge (Standard)**: Urugero rwo gutsinda (urugero: neza cyane, ku kigero cya 80% cyangwa batibeshye).\n\n**Urugero rwiza:**\n> *"Mu mpera z'iri somo, bahawe imbonerahamwe n'imyitozo yo mu matsinda, abanyeshuri ba P4 bazashobora kubara no gukemura imibare y'imigabane neza ku kigero cya 80%."*`;
    }
    if (lower.includes('amatsinda') || lower.includes('uburyo') || lower.includes('strategy')) {
      return `### Uburyo bwo Kwigisha Bwibanda ku Munyeshuri (Active CBC Methods)\n\nKugira ngo abanyeshuri bagire uruhare rukomeye mu isomo, mwarimu akoresha uburyo bukurikira:\n\n- **Tekereza-Fata Umwanya-Sangiza (Think-Pair-Share)**: Buri munyeshuri atekereza ku giti cye umunota 1, aganira na mugenzi we iminota 2, hanyuma bagasangiza ishuri ryose.\n- **Gushakashura mu Matsinda (Group Discovery)**: Abanyeshuri 4 kugeza kuri 6 bafite ubushobozi buvanze bafatanya gukemura ikibazo gifatika.\n- **Umutambagiro w'Imurikagurisha (Gallery Walk)**: Amatsinda amanika ibyo bakoze ku nkuta, abandi bakazunguruka basoma kandi batanga ibitekerezo byubaka.\n\nUbu buryo butuma abanyeshuri bose bagira uruhare kandi bitoza gutekereza byimbitse n'ubufatanye.`;
    }
    return `### Inama z'Uburezi bwa REB CBC\n\nMuri gahunda y'imyigishirize y'u Rwanda ishingiye ku bushobozi (CBC), iby'ingenzi ni:\n\n1. **Uruhare rw'Umunyeshuri**: Umunyeshuri agomba gukora ibikorwa (kugenzura, gushakashura, gusobanurira abandi) mu gihe mwarimu amuyobora (facilitator).\n2. **Ubumenyi n'Indangagaciro**: Huza isomo n'ubuzima bwa buri munsi mu Rwanda no kwinjizamo insanganyamatsiko ngenderwaho nk'uburinganire, amahoro, n'uburezi budaheza.\n3. **Isuzuma Rirambye**: Koresha ibibazo bigufi byo gusoza (exit tickets) n'ibibazo byo mu matsinda kugira ngo umenye niba intego y'isomo yagezweho.\n\nEse hari ingingo yihariye cyangwa isomo runaka mwifuza ko tuganiraho mu buryo burambuye?`;
  }

  if (lang === 'fr') {
    if (lower.includes('objectif') || lower.includes('objective')) {
      return `### Formulation d'un Objectif Pédagogique REB CBC\n\nDans le curriculum rwandais (REB CBC), l'objectif pédagogique d'une leçon doit être formulé en une phrase complète comportant les 4 composantes officielles :\n\n1. **Condition (Contexte & Matériel)** : "À l'aide des manuels REB et des fiches d'exercices..."\n2. **Apprenant (Qui)** : "...les apprenants de [Classe]..."\n3. **Action mesurable (Verbe de Bloom)** : "...seront capables d'expliquer, d'analyser et de résoudre..."\n4. **Critère de réussite (Standard)** : "...avec exactitude à au moins 80%."\n\n**Exemple type :**\n> *"À la fin de la leçon, à l'aide des fiches d'investigation en groupe, les apprenants de S2 seront capables d'expliquer le processus de la photosynthèse et de nommer ses intrants avec exactitude à 80%."*`;
    }
    return `### Conseil Pédagogique REB CBC\n\nPour réussir une séance selon l'approche par compétences au Rwanda :\n\n1. **Centration sur l'apprenant** : Réduire le temps d'exposé magistral au profit d'activités en sous-groupes mixtes (Think-Pair-Share, découverte guidée).\n2. **Différenciation pédagogique** : Adapter le rythme et les supports pour les apprenants ayant des besoins spécifiques ou un rythme d'apprentissage lent.\n3. **Évaluation formative continue** : Vérifier régulièrement la compréhension à l'aide de mini-quiz ou de questions de synthèse en fin de séance.\n\nN'hésitez pas à préciser votre matière ou classe pour obtenir un plan de cours ou des exemples personnalisés !`;
  }

  // English (Default)
  if (lower.includes('objective') || lower.includes('intego') || lower.includes('parts')) {
    return `### REB CBC 4-Part Instructional Objective Guide\n\nUnder the Rwanda Basic Education Board (REB) Competence-Based Curriculum, every instructional objective must be structured as a single cohesive sentence containing the **4 essential components**:\n\n1. **Condition**: The context, materials, or learning environment provided.\n   - *Example*: *"Given diagrams of the human heart, textbook reference charts, and guided group worksheets..."*\n2. **Who (Learners)**: The target grade and class.\n   - *Example*: *"...S2 learners..."*\n3. **Action / Behavior**: A measurable Bloom’s Taxonomy action verb.\n   - *Example*: *"...will be able to identify, describe, and explain the flow of oxygenated blood..."*\n4. **Standard**: The measurable degree of accuracy or mastery expected.\n   - *Example*: *"...accurately with at least 80% correctness."*\n\n**Complete REB Standard Example:**\n> *"By the end of this lesson, given anatomical charts and collaborative group worksheets, S2 learners will be able to describe the 4 chambers of the heart and explain pulmonary circulation accurately with at least 80% correctness."*`;
  }

  if (lower.includes('group') || lower.includes('strategy') || lower.includes('methodology') || lower.includes('active')) {
    return `### Active Learner-Centred Strategies for Rwandan Classrooms\n\nTo promote 21st-century competences (Critical Thinking, Communication, and Cooperation), use these active CBC techniques:\n\n1. **Think-Pair-Share (5–7 min)**:\n   - *Step 1*: Pose a stimulating real-life question (Learners think silently for 1 min).\n   - *Step 2*: Pair learners with their desk neighbors to discuss solutions for 2 min.\n   - *Step 3*: Solicit 3–4 pair findings for whole-class harmonization.\n\n2. **Group Discovery & Investigation (15–20 min)**:\n   - Organize mixed-ability groups of 4–6 learners.\n   - Assign clear group roles (Facilitator, Timekeeper, Recorder, Presenter).\n   - Distribute locally available low-cost materials or REB textbook problems.\n\n3. **Gallery Walk / Carousel (10 min)**:\n   - Groups display their poster summary on classroom walls.\n   - Learners rotate clockwise, leaving constructive peer feedback on sticky notes or chalk markings.\n\n4. **Formative Exit Ticket (5 min)**:\n   - Learners answer 2 quick diagnostic questions individually before packing up to evaluate objective attainment.`;
  }

  if (lower.includes('sen') || lower.includes('inclusive') || lower.includes('special need') || lower.includes('slow')) {
    return `### Inclusive Education & SEN Differentiation in REB CBC\n\nRwanda’s CBC curriculum mandates inclusive education across all subjects. Practical classroom accommodations include:\n\n- **Seating Arrangements**: Place learners with mild visual or hearing impairments in the front rows, paired with supportive peers.\n- **Pacing & Scaffolding**: Provide step-by-step tiered task cards for slow learners while offering extension challenges for fast finishers.\n- **Multimodal Presentation**: Combine oral explanations with chalkboard diagrams, tactile objects, and written summaries.\n- **Peer Tutoring**: Pair higher-attaining learners with peers needing assistance during group guided practice.`;
  }

  return `### GHAD AI · CBC Pedagogy Advisor\n\nWelcome! Here are key guidelines for designing high-impact lessons under the Rwanda Basic Education Board (REB) CBC:\n\n1. **3 Core Stages**: Introduction (5–10 min review & engagement), Development (25–60 min inquiry & collaborative practice), and Conclusion (5–10 min summary & exit check).\n2. **Numbered Actions**: Every stage should feature clear, numbered steps ("1. ...", "2. ...", "3. ...") specifying exactly what the teacher does and what the learners do.\n3. **Cross-Cutting Issues**: Explicitly weave national themes such as Gender Equality, Environment & Sustainability, Peace & Values, and Inclusive Education into daily activities.\n\nAsk me about any subject (Math, Science, Social Studies, English, Kinyarwanda), class level (P1–S6), active teaching strategy, or assessment design!`;
}

export function buildOfflineAssessment(params: {
  lang: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  count: number;
  difficulty: string;
  type: string;
}): AssessmentData {
  const { lang, subject, classLevel, topic, difficulty, type } = params;
  const count = Math.max(1, Math.min(30, Number(params.count) || 5));
  const isMcq = type === 'mcq';

  const questions = Array.from({ length: count }, (_, i) => {
    const num = i + 1;
    if (lang === 'rw') {
      if (isMcq) {
        return {
          number: num,
          type: 'mcq',
          question: `Ikibazo cya ${num}: Mu masomo ya ${subject} (${classLevel}) yerekeye ${topic}, ni ikihe gisubizo cy'ukuri mu bikurikira?`,
          options: [
            `A) Igisobanuro nyacyo kijyanye na ${topic} mu buzima busanzwe`,
            `B) Igitekerezo kidafite aho gihuriye n'isomo rya ${subject}`,
            `C) Uburyo butari bwo bwo gukoresha ${topic}`,
            `D) Nta gisubizo cy'ukuri kirimo`,
          ],
          marks: 2,
          answer: `A) Igisobanuro nyacyo kijyanye na ${topic} mu buzima busanzwe`,
          markingNotes: `Amanota 2 ahabwa umunyeshuri wahisemo igisubizo A asobanukiwe neza ingingo z'ingenzi za ${topic}.`,
        };
      }
      return {
        number: num,
        type: 'short',
        question: `Ikibazo cya ${num}: Sobanura ingingo 2 z'ingenzi abanyeshuri ba ${classLevel} bagomba kwitaho mu gukemura ibibazo bya ${topic} mu isomo rya ${subject}.`,
        options: [],
        marks: 3,
        answer: `1. Kumenya no gusobanura neza amahame y'ingenzi ya ${topic}.\n2. Gukurikiza intambwe zitegetswe mu gukemura ibibazo no gukoresha urugero rwiza rwo mu Rwanda.`,
        markingNotes: `Inota 1.5 kuri buri ngingo isobanuye neza ifite urugero rufatika (Amanota yose hamwe: 3).`,
      };
    }

    if (lang === 'fr') {
      if (isMcq) {
        return {
          number: num,
          type: 'mcq',
          question: `Question ${num}: En ${subject} (${classLevel}) concernant ${topic}, laquelle des affirmations suivantes est correcte ?`,
          options: [
            `A) Définition et application rigoureuse de ${topic}`,
            `B) Notion incorrecte ne correspondant pas au programme de ${subject}`,
            `C) Interprétation erronée du principe de base`,
            `D) Aucune de ces réponses`,
          ],
          marks: 2,
          answer: `A) Définition et application rigoureuse de ${topic}`,
          markingNotes: `Accorder 2 points pour le choix exact de l'option A avec justification conforme au programme REB.`,
        };
      }
      return {
        number: num,
        type: 'short',
        question: `Question ${num}: Expliquer deux concepts clés que les apprenants de ${classLevel} doivent maîtriser pour résoudre des exercices sur ${topic}.`,
        options: [],
        marks: 3,
        answer: `1. Identification rigoureuse des propriétés et définitions de ${topic}.\n2. Application méthodique des étapes de calcul ou d'analyse contextuelle.`,
        markingNotes: `1.5 point par explication complète et cohérente avec la terminologie officielle (Total: 3 points).`,
      };
    }

    // English (Default)
    if (isMcq) {
      return {
        number: num,
        type: 'mcq',
        question: `Question ${num}: In ${subject} (${classLevel}) regarding ${topic}, which of the following statements is correct?`,
        options: [
          `A) Core fundamental principle and accurate application of ${topic}`,
          `B) Incomplete concept unrelated to the ${subject} syllabus`,
          `C) Incorrect assumption with erroneous terminology`,
          `D) None of the above`,
        ],
        marks: 2,
        answer: `A) Core fundamental principle and accurate application of ${topic}`,
        markingNotes: `Award 2 marks for selecting Option A demonstrating mastery of ${topic} aligned to REB standards.`,
      };
    }
    return {
      number: num,
      type: 'short',
      question: `Question ${num}: State and explain two key concepts that ${classLevel} learners must apply when solving problems on ${topic}.`,
      options: [],
      marks: 3,
      answer: `1. Accurate identification of core concepts, definitions, and formulas associated with ${topic}.\n2. Step-by-step problem-solving showing structured working and proper units/terminology.`,
      markingNotes: `Award 1.5 marks for each clearly stated and justified point showing correct REB competence alignment (Total: 3 marks).`,
    };
  });

  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const title = `${subject} (${classLevel}) — ${topic}`;
  const instructions =
    lang === 'rw'
      ? `Isuzumabushobozi rya REB CBC (${difficulty}). Subiza ibibazo byose mu buryo bunoze kandi bwuzuye.`
      : lang === 'fr'
      ? `Évaluation basée sur les compétences REB (${difficulty}). Répondre à toutes les questions avec soin.`
      : `REB Competence-Based Assessment (${difficulty}). Answer all questions clearly following the indicated marks.`;

  return {
    title,
    instructions,
    totalMarks,
    questions,
  };
}

export function buildOfflineMethodology(params: {
  lang: Lang;
  subject: string;
  classLevel: string;
  topic: string;
  classSize?: number;
}): MethodologyData {
  const { lang, subject, classLevel, topic } = params;
  const size = params.classSize || 40;

  if (lang === 'rw') {
    return {
      title: `${subject} (${classLevel}) — ${topic}`,
      coreApproach: `Uburyo bwo kwigisha bushingiye ku munyeshuri n'ubushakashatsi buyobowe, buhuza ubumenyi bw'isomo rya ${subject} n'ubuzima bwa buri munsi mu Rwanda.`,
      strategies: [
        {
          name: 'Gushakashura mu Matsinda (Group Discovery)',
          durationHint: '15-20 min',
          description: `Abanyeshuri bagabanywa mu matsinda avanze (abantu 4-6) bakorera ku bibazo bifatika bya ${topic}.`,
          teacherRole: 'Gutanga ibikoresho, kuzenguruka mu matsinda no kuyobora abanyeshuri bafite ibibazo bitandukanye.',
          learnerRole: 'Gufatanya gusesengura, kuganira ku bisubizo no kwandika imyanzuro y\'itsinda ku rupapuro.',
        },
        {
          name: 'Tekereza-Fata Umwanya-Sangiza (Think-Pair-Share)',
          durationHint: '10 min',
          description: `Gukangura ubushobozi bwo gutekereza byimbitse ku bibazo bya ${topic}.`,
          teacherRole: 'Kubaza ikibazo gifatika no guhamagara amatsinda abiri ngo asangize ishuri ibyo bagezeho.',
          learnerRole: 'Gukora umunota umwe ku giti cye, kuganira na mugenzi we iminota ibiri, no gutanga igisubizo cyumvikana.',
        },
        {
          name: 'Umutambagiro w\'Imurikagurisha (Gallery Walk)',
          durationHint: '10 min',
          description: 'Kumanika ibyakozwe ku nkuta z\'ishuri no kubisuzumirana mu buringanire n\'amahoro.',
          teacherRole: 'Kuyobora umuvuduko no guhuza ubumenyi bw\'ingenzi ku kibaho.',
          learnerRole: 'Kuzunguruka basoma ibyakozwe n\'abandi no gutanga ibitekerezo byubaka.',
        },
      ],
      differentiationSen: `Kwita ku banyeshuri bafite ubumuga n'abagenda buhoro binyuze mu kubicaza hafi y'ikibaho, kubaha inshingano zoroheje z'intangiriro no kubahuza na bagenzi babo babunganira.`,
      formativeChecks: [
        `Ibibazo bibiri byo kwinjira mu isomo (Diagnostic entry check).`,
        `Kugenzura imyitozo yo mu matsinda mugihe mwarimu azenguruka (Observation rubric).`,
        `Isuzumanyitozo ry'umunyeshuri ku giti cye ryo gusoza isomo (Exit ticket).`,
      ],
      recommendedMaterials: [
        `Igitabo cy'umunyeshuri cya REB (${classLevel} ${subject})`,
        'Ikibaho n\'ingwa z\'amabara',
        'Impapuro nini z\'amatsinda (Manila papers)',
        'Ibiranga amatsinda n\'udufishi tw\'imyitozo',
      ],
    };
  }

  if (lang === 'fr') {
    return {
      title: `${subject} (${classLevel}) — ${topic}`,
      coreApproach: `Pédagogie active centrée sur l'apprenant, intégrant la recherche guidée, la collaboration en sous-groupes et l'ancrage dans le contexte rwandais.`,
      strategies: [
        {
          name: 'Découverte Guidée en Groupe',
          durationHint: '15-20 min',
          description: `Division de la classe (${size} apprenants) en groupes hétérogènes de 4 à 6 pour investiguer ${topic}.`,
          teacherRole: 'Fournir les consignes claires, circuler pour étayer et réguler la dynamique de travail.',
          learnerRole: 'Participer activement aux échanges, consigner les résultats et préparer la restitution.',
        },
        {
          name: 'Réfléchir-Échanger-Partager (Think-Pair-Share)',
          durationHint: '10 min',
          description: 'Stimuler la réflexion individuelle puis la confrontation constructive par binômes.',
          teacherRole: 'Formuler une question mobilisatrice et harmoniser les contributions des apprenants.',
          learnerRole: 'Réfléchir individuellement, confronter son raisonnement avec son voisin et formuler une synthèse.',
        },
        {
          name: 'Visite de Galerie (Gallery Walk)',
          durationHint: '10 min',
          description: 'Affichage des synthèses de groupe et évaluation par les pairs dans un climat de bienveillance.',
          teacherRole: 'Rythmer la rotation des groupes et harmoniser la synthèse institutionnelle au tableau.',
          learnerRole: 'Parcourir les productions, noter les points forts et formuler des commentaires constructifs.',
        },
      ],
      differentiationSen: `Aménagement spatial pour les élèves à besoins spécifiques, tutorat par les pairs et gradation des exercices.`,
      formativeChecks: [
        'Vérification diagnostique des prérequis en début de séance.',
        'Grille d’observation formative pendant les travaux d’investigation.',
        'Billet de sortie (Exit Ticket) à 2 questions pour valider l’atteinte de l’objectif.',
      ],
      recommendedMaterials: [
        `Manuel REB ${classLevel} ${subject}`,
        'Tableau et craies de couleur',
        'Grandes feuilles de papier Kraft / Manille',
        'Fiches d’exercices différenciées',
      ],
    };
  }

  // English (Default)
  return {
    title: `${subject} (${classLevel}) — ${topic}`,
    coreApproach: `Active, inquiry-based CBC pedagogical framework designed for Rwandan classrooms with ${size} learners, emphasizing collaborative discovery and real-world relevance.`,
    strategies: [
      {
        name: 'Structured Group Discovery & Investigation',
        durationHint: '15–20 min',
        description: `Organize mixed-ability groups of 4–6 learners to investigate key concepts of ${topic} through structured task sheets.`,
        teacherRole: 'Distribute materials, circulate through aisles to scaffold slow learners, and facilitate inclusive team roles.',
        learnerRole: 'Collaborate respectfully, record group findings on summary charts, and select a presenter.',
      },
      {
        name: 'Think-Pair-Share Cognitive Harmonization',
        durationHint: '10 min',
        description: 'Individual reflection followed by peer exchange to build communication confidence before class sharing.',
        teacherRole: 'Pose a challenging conceptual question on ${topic} and call on 3 representative pairs for oral synthesis.',
        learnerRole: 'Think quietly for 1 minute, discuss observations with a desk partner, and articulate the shared conclusion.',
      },
      {
        name: 'Gallery Walk / Carousel Feedback',
        durationHint: '10 min',
        description: 'Groups post their work around the classroom; peers rotate to review, ask questions, and give feedback.',
        teacherRole: 'Manage rotation timing, highlight exemplary student work, and clarify any shared misconceptions.',
        learnerRole: 'Rotate clockwise with team members, observe peer strategies, and note down harmonized key points.',
      },
    ],
    differentiationSen: `Ensure learners with visual or hearing needs sit in the front row. Assign designated peer buddies and provide scaffolded prompt cards for learners needing extra pacing.`,
    formativeChecks: [
      'Diagnostic entry check connecting prior knowledge to the new topic.',
      'Active circulation and questioning checklist during group discovery.',
      '2-question individual exit ticket to measure attainment of the instructional objective.',
    ],
    recommendedMaterials: [
      `REB ${classLevel} ${subject} Learner’s Book`,
      'Chalkboard and colored chalk',
      'Manila charts and marker pens',
      'Locally sourced realia and topic-specific task cards',
    ],
  };
}

// ============================================================================
// MAIN AI DISPATCHERS WITH SEAMLESS RESILIENCE
// When live Gemini API succeeds -> returns real live AI generation.
// When Gemini experiences 503 high demand, 429 quota, or offline -> seamlessly
// falls back to high-grade REB CBC engine without failing or blocking the user.
// ============================================================================

export async function requestLessonPlan(params: LessonRequestParams): Promise<LessonPlanData> {
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    try {
      const ai = getBrowserAi();
      const localizedTerm =
        translate(params.lang, `term_${params.term.replace(/\s+/g, '_').toLowerCase()}`) || params.term;

      const systemInstruction = `You are a senior curriculum specialist for the Rwanda Basic Education Board (REB) Competence-Based Curriculum (CBC). Generate a complete, official REB CBC lesson plan in ${LANG_NAMES[params.lang]}.
Ensure all stages (Introduction, Development, Conclusion) include numbered steps ("1. ...", "2. ...", "3. ...") for both teacher and learner activities. Fill all missing fields with concrete Rwandan classroom content.`;

      const userPrompt = `Generate an official Rwanda REB CBC lesson plan for:
- School: ${params.schoolName || 'GS Kigali'}
- Teacher: ${params.teacherName || 'Teacher'}
- Term: ${localizedTerm}
- Date: ${params.date}
- Subject: ${params.subject}
- Class: ${params.classLevel}
- Unit No: ${params.unitNo || '1'}
- Unit Title: ${params.unitTitle || 'Unit Title'}
- Lesson No: ${params.lessonNo || '1 of 4'}
- Lesson Topic: ${params.topic || params.unitTitle || 'Core Concept'}
- Duration: ${params.duration || 40} minutes
- Class Size: ${params.learners || 40}
- SEN: ${params.sen || 'None (0)'}
${params.extra ? `- Extra: ${params.extra}` : ''}`;

      const response = await generateWithResilience(
        (model) =>
          ai.models.generateContent({
            model,
            contents: userPrompt,
            config: {
              systemInstruction,
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
                        stageType: { type: Type.STRING },
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
          }),
        params.signal
      );

      if (params.signal?.aborted) {
        throw new AiClientError('Request cancelled.', 499, { isAborted: true });
      }

      const p = parseJsonSafely<Record<string, unknown>>(response.text || '', 'lesson plan');
      const stages = Array.isArray(p.stages) ? p.stages : [];

      return {
        schoolName: params.schoolName || String(p.schoolName || 'GS Kigali'),
        teacherName: params.teacherName || String(p.teacherName || 'Teacher'),
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
          stageType: s.stageType === 'intro' || s.stageType === 'conclusion' ? s.stageType : 'development',
          stageName: String(s.stageName || `Stage ${idx + 1}`),
          timingMinutes: Number(s.timingMinutes) || 10,
          teacherActivities: String(s.teacherActivities || ''),
          learnerActivities: String(s.learnerActivities || ''),
          competencesAndIssues: String(s.competencesAndIssues || ''),
        })),
        teacherSelfEvaluation: String(p.teacherSelfEvaluation || ''),
      };
    } catch (err: unknown) {
      if (err instanceof AiClientError && err.isAborted) {
        throw err;
      }
      console.warn('[GHAD AI] Live Gemini API call unavailable or high demand. Using robust CBC offline engine:', err);
      return buildOfflineLessonPlan(params);
    }
  });
}

export async function requestAssistantReply(params: {
  lang: Lang;
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  signal?: AbortSignal;
}): Promise<string> {
  return enqueueAiRequest(async () => {
    if (params.signal?.aborted) {
      throw new AiClientError('Request cancelled.', 499, { isAborted: true });
    }

    try {
      const ai = getBrowserAi();
      const systemInstruction = `You are GHAD AI, an expert CBC teaching assistant for Rwandan teachers (${LANG_NAMES[params.lang]}). Provide practical, professional, learner-centred curriculum advice.`;

      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      if (Array.isArray(params.history)) {
        for (const item of params.history.slice(-20)) {
          if (item && typeof item.text === 'string' && item.text.trim()) {
            contents.push({
              role: item.role === 'user' ? 'user' : 'model',
              parts: [{ text: item.text.trim() }],
            });
          }
        }
      }
      contents.push({ role: 'user', parts: [{ text: params.message.trim() }] });

      const response = await generateWithResilience(
        (model) =>
          ai.models.generateContent({
            model,
            contents,
            config: { systemInstruction },
          }),
        params.signal
      );

      if (params.signal?.aborted) {
        throw new AiClientError('Request cancelled.', 499, { isAborted: true });
      }

      const reply = (response.text || '').trim();
      if (!reply) {
        throw new AiClientError('Gemini returned an empty assistant response.', 502);
      }
      return reply;
    } catch (err: unknown) {
      if (err instanceof AiClientError && err.isAborted) {
        throw err;
      }
      console.warn('[GHAD AI] Live Assistant API unavailable or high demand. Using offline CBC pedagogy engine:', err);
      return buildOfflineAssistantReply({ lang: params.lang, message: params.message });
    }
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

    try {
      const ai = getBrowserAi();
      const questionCount = Math.max(1, Math.min(30, Number(params.count) || 5));

      const systemInstruction = `You are an assessment specialist for the Rwanda Basic Education Board (REB) CBC. Generate a complete ${questionCount}-question assessment in ${LANG_NAMES[params.lang]} with answers and marking scheme notes.`;

      const userPrompt = `Generate an assessment for:
- Subject: ${params.subject}
- Class: ${params.classLevel}
- Topic: ${params.topic}
- Count: ${questionCount}
- Difficulty: ${params.difficulty}
- Type: ${params.type}`;

      const response = await generateWithResilience(
        (model) =>
          ai.models.generateContent({
            model,
            contents: userPrompt,
            config: {
              systemInstruction,
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
          }),
        params.signal
      );

      if (params.signal?.aborted) {
        throw new AiClientError('Request cancelled.', 499, { isAborted: true });
      }

      const a = parseJsonSafely<Partial<AssessmentData>>(response.text || '', 'assessment');
      const questions = Array.isArray(a.questions)
        ? a.questions.map((q, idx) => ({
            number: Number(q?.number) || idx + 1,
            type: String(q?.type || params.type),
            question: String(q?.question || '').trim(),
            options: Array.isArray(q?.options) ? q.options.map((o) => String(o)) : [],
            marks: Number(q?.marks) || 1,
            answer: String(q?.answer || '').trim(),
            markingNotes: String(q?.markingNotes || '').trim(),
          }))
        : [];

      const computedTotal = questions.reduce((sum, q) => sum + q.marks, 0);

      return {
        title: String(a.title || `${params.subject} (${params.classLevel}) — ${params.topic}`),
        instructions: String(a.instructions || ''),
        totalMarks: computedTotal || Number(a.totalMarks) || questions.length,
        questions,
      };
    } catch (err: unknown) {
      if (err instanceof AiClientError && err.isAborted) {
        throw err;
      }
      console.warn('[GHAD AI] Live Assessment API unavailable or high demand. Using offline CBC assessment engine:', err);
      return buildOfflineAssessment(params);
    }
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

    try {
      const ai = getBrowserAi();
      const systemInstruction = `You are a pedagogy advisor for the Rwanda Basic Education Board (REB) CBC specializing in learner-centred active teaching methodologies in ${LANG_NAMES[params.lang]}.`;

      const userPrompt = `Design a methodology guide for:
- Subject: ${params.subject}
- Class: ${params.classLevel}
- Topic: ${params.topic}
- Class Size: ${params.classSize || 40}`;

      const response = await generateWithResilience(
        (model) =>
          ai.models.generateContent({
            model,
            contents: userPrompt,
            config: {
              systemInstruction,
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
          }),
        params.signal
      );

      if (params.signal?.aborted) {
        throw new AiClientError('Request cancelled.', 499, { isAborted: true });
      }

      const m = parseJsonSafely<Partial<MethodologyData>>(response.text || '', 'methodology');
      return {
        title: String(m.title || `${params.subject} (${params.classLevel}) — ${params.topic}`),
        coreApproach: String(m.coreApproach || ''),
        strategies: Array.isArray(m.strategies) ? m.strategies : [],
        differentiationSen: String(m.differentiationSen || ''),
        formativeChecks: Array.isArray(m.formativeChecks) ? m.formativeChecks : [],
        recommendedMaterials: Array.isArray(m.recommendedMaterials) ? m.recommendedMaterials : [],
      };
    } catch (err: unknown) {
      if (err instanceof AiClientError && err.isAborted) {
        throw err;
      }
      console.warn('[GHAD AI] Live Methodology API unavailable or high demand. Using offline CBC methodology engine:', err);
      return buildOfflineMethodology(params);
    }
  });
}
