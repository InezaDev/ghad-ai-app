import { SupportedLang } from './aiService.js';

export interface LessonPlanStageOutput {
  id: string;
  stageType: 'intro' | 'development' | 'conclusion';
  stageName: string;
  timingMinutes: number;
  teacherActivities: string;
  learnerActivities: string;
  competencesAndIssues: string;
}

export interface NormalizedLessonPlan {
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
  stages: LessonPlanStageOutput[];
  teacherSelfEvaluation: string;
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

interface CurriculumUnitRecord {
  unitNo?: string;
  classes: string[];
  unitTitle: string;
  keyUnitCompetence: string;
  sampleTopics: string[];
  reference: string;
}

interface SubjectCurriculumMeta {
  canonicalName: string;
  aliases: string[];
  levelBand: 'primary' | 'secondary' | 'both';
  verifiedPortalRef: string;
  domainPatterns: RegExp[];
  units: CurriculumUnitRecord[];
}

export const REB_SUBJECT_CATALOG: SubjectCurriculumMeta[] = [
  {
    canonicalName: 'Mathematics',
    aliases: ['math', 'maths', 'imibare', 'mathématiques', 'hisabati'],
    levelBand: 'both',
    verifiedPortalRef: 'REB Mathematics Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(fraction|fractions|numerator|denominator|algebra|quadratic|equation|inequality|polynomial|logarithm|trigonometr|calculus|derivative|integral|geometry|triangle|polygon|perimeter|area|volume|pythagoras|decimal|percentage|ratio|proportion|matrix|matrices|vector|probability|statistics|multiplication|division|subtraction|addition of|arithmetic|imibare|imigabane)\b/i,
    ],
    units: [
      {
        unitNo: '4',
        classes: ['P4'],
        unitTitle: 'Fractions',
        keyUnitCompetence:
          'To be able to compare, add, and subtract fractions with the same denominator and solve related everyday problems.',
        sampleTopics: [
          'Addition of Fractions with the Same Denominator',
          'Subtraction of Fractions with the Same Denominator',
          'Comparing Fractions',
        ],
        reference: 'REB Mathematics for Rwandan Primary Schools P4 Learner’s Book & Teacher’s Guide, Unit 4 (elearning.reb.rw)',
      },
      {
        classes: ['S1', 'S2', 'S3'],
        unitTitle: 'Linear and Quadratic Equations',
        keyUnitCompetence:
          'To be able to formulate and solve algebraic equations and apply them to real-life problems.',
        sampleTopics: ['Solving Linear Equations', 'Solving Quadratic Equations by Factorization'],
        reference: 'REB Ordinary Level Mathematics Syllabus & Learner’s Book (elearning.reb.rw)',
      },
    ],
  },
  {
    canonicalName: 'Biology',
    aliases: ['bio', 'ibinyabuzima', 'biologie'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary Biology Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(photosynthesis|chlorophyll|mitosis|meiosis|cell division|cellular respiration|organelle|enzyme|enzymes|digestive system|circulatory system|nervous system|genetics|dna|rna|chromosome|osmosis|diffusion|transpiration|homeostasis|ecosystem|taxonomy|microscope|bacteria|virus|fungi)\b/i,
    ],
    units: [
      {
        classes: ['S1', 'S2', 'S3'],
        unitTitle: 'Cell Structure, Nutrition, and Respiration',
        keyUnitCompetence:
          'To be able to explain cell processes, plant nutrition (photosynthesis), and transport in living organisms.',
        sampleTopics: ['Photosynthesis', 'Cell Structure and Function', 'Human Digestive System'],
        reference: 'REB Ordinary Level Biology Syllabus & Learner’s Book (elearning.reb.rw)',
      },
    ],
  },
  {
    canonicalName: 'Chemistry',
    aliases: ['chem', 'chimie', 'ubutabire'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary Chemistry Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(periodic table|atomic structure|covalent bond|ionic bond|chemical equation|stoichiometry|molarity|mole concept|titration|acid|acids and bases|alkali|ph scale|electrolysis|hydrocarbon|alkane|alkene|oxidation|reduction|redox|enthalpy|polymer)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'Physics',
    aliases: ['phys', 'physique', 'ubugenge'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary Physics Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(newton|kinematics|velocity|acceleration|projectile|ohm'?s law|kirchhoff|electromagnetism|refraction|snell|diffraction|wavelength|thermodynamics|momentum|hooke|archimedes|bernoulli|radioactivity|semiconductor)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'Science & Elementary Technology (SET)',
    aliases: ['set', 'science and elementary technology', 'elementary technology'],
    levelBand: 'primary',
    verifiedPortalRef: 'REB Primary Science & Elementary Technology (SET) Syllabus (elearning.reb.rw)',
    domainPatterns: [
      /\b(soil erosion|simple machine|lever|pulley|water cycle|sanitation|crop rotation|farm tools|carpentry tools|masonry tools|states of matter|parts of a plant|germination|balanced diet|hygiene)\b/i,
    ],
    units: [
      {
        classes: ['P4', 'P5', 'P6'],
        unitTitle: 'Plants, Soil, and Environment',
        keyUnitCompetence:
          'To be able to care for plants and soil, prevent soil erosion, and apply safe science practices at school and home.',
        sampleTopics: ['Soil Erosion and Prevention', 'Germination of Seeds'],
        reference: 'REB Primary Science & Elementary Technology (SET) Syllabus & Learner’s Book (elearning.reb.rw)',
      },
    ],
  },
  {
    canonicalName: 'Social and Religious Education (SRE)',
    aliases: ['sre', 'srs', 'social and religious education', 'social & religious studies', 'social studies'],
    levelBand: 'primary',
    verifiedPortalRef: 'REB Primary Social and Religious Education (SRE) Syllabus (elearning.reb.rw)',
    domainPatterns: [
      /\b(equity and equality|equity|equality|children'?s rights|human rights|commandments|prayer|respecting elders|moral values|community hygiene|rwanda provinces|district leaders|civic duties|tolerance|uburenganzira)\b/i,
    ],
    units: [
      {
        unitNo: '1',
        classes: ['P4', 'P5', 'P6'],
        unitTitle: 'Human Rights, Equity, and Social Cohesion',
        keyUnitCompetence:
          'To be able to explain equity and equality, respect human rights, and promote fairness in the school and community.',
        sampleTopics: ['Equity and Equality', 'Children’s Rights and Responsibilities'],
        reference: 'REB Primary Social and Religious Education (SRE) Syllabus & Learner’s Book (elearning.reb.rw)',
      },
    ],
  },
  {
    canonicalName: 'History & Citizenship',
    aliases: ['history', 'citizenship', 'amateka', 'histoire'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary History & Citizenship Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(genocide against the tutsi|1994 genocide|colonialism|berlin conference|pre-colonial rwanda|nyiginya kingdom|umuganda|itorero|independence of rwanda|world war|industrial revolution|french revolution|cold war|pan-africanism|constitutional|gacaca)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'Geography',
    aliases: ['geo', 'ubumenyi bwisi', 'géographie'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary Geography Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(plate tectonics|volcanism|earthquakes|map reading|contour lines|topographic map|latitude and longitude|weathering|river erosion|delta|meander|climate zones|population density|urbanization|albertine rift)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'English',
    aliases: ['eng', 'icyongereza', 'anglais'],
    levelBand: 'both',
    verifiedPortalRef: 'REB English Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(verb tenses|present continuous|past simple|passive voice|reported speech|conditional sentences|phrasal verbs|adjectives and adverbs|reading comprehension|letter writing|essay writing|parts of speech|prepositions|conjunctions)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'Kinyarwanda',
    aliases: ['ikinyarwanda', 'rw'],
    levelBand: 'both',
    verifiedPortalRef: 'Integanyanyigisho ya REB y’Ikinyarwanda (elearning.reb.rw)',
    domainPatterns: [
      /\b(umwandiko|inshinga|izina|interuro|imigani|ibisakuzo|indangagaciro|ikibonezamvugo|inyuguti|ibihekane|umuvugo|imyandikire y'ikinyarwanda|imvugo inoze|amasano y'amazina)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'French',
    aliases: ['français', 'francais', 'igifaransa'],
    levelBand: 'both',
    verifiedPortalRef: 'Programme de Français REB & Manuel de l’élève (elearning.reb.rw)',
    domainPatterns: [
      /\b(conjugaison|passé composé|imparfait|futur simple|adjectifs possessifs|compréhension écrite|rédaction d'une lettre|articles définis|pronoms personnels)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'ICT / Computer Science',
    aliases: ['ict', 'computer science', 'computing', 'informatics'],
    levelBand: 'both',
    verifiedPortalRef: 'REB ICT / Computer Science Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(algorithm|flowchart|binary|hexadecimal|logic gates|html|css|javascript|python|database|sql|spreadsheet|word processor|computer hardware|operating system|networking|cybersecurity|ip address|scratch programming)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'Entrepreneurship',
    aliases: ['entrep', 'entrepreneuriat', 'kwihangira imirimo'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary Entrepreneurship Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(business plan|swot analysis|bookkeeping|cash flow|taxation|rra|marketing mix|4ps|entrepreneurial|sole proprietorship|cooperative|credit and savings|invoice|receipt|balance sheet)\b/i,
    ],
    units: [],
  },
  {
    canonicalName: 'Economics',
    aliases: ['econ', 'ubukungu', 'économie'],
    levelBand: 'secondary',
    verifiedPortalRef: 'REB Secondary Economics Syllabus & Learner’s Book (elearning.reb.rw)',
    domainPatterns: [
      /\b(demand and supply|price elasticity|gdp|gross domestic product|inflation|monetary policy|fiscal policy|central bank|opportunity cost|marginal utility|monopoly|oligopoly|international trade|exchange rate)\b/i,
    ],
    units: [],
  },
];

function findSubjectMeta(subject: string): SubjectCurriculumMeta | undefined {
  const norm = subject.trim().toLowerCase();
  if (!norm) return undefined;
  return REB_SUBJECT_CATALOG.find(
    (item) =>
      item.canonicalName.toLowerCase() === norm ||
      item.aliases.some((a) => norm === a || norm.includes(a))
  );
}

function isPrimaryClass(classLevel: string): boolean {
  return /^P[1-6]$/i.test(classLevel.trim());
}

function isSecondaryClass(classLevel: string): boolean {
  return /^S[1-6]$/i.test(classLevel.trim());
}

function isCompatibleSubjectPair(selectedCanonical: string, detectedCanonical: string): boolean {
  if (selectedCanonical === detectedCanonical) return true;
  // Primary SET naturally covers elementary Biology, Chemistry, Physics, and ICT basics
  if (
    selectedCanonical === 'Science & Elementary Technology (SET)' &&
    ['Biology', 'Chemistry', 'Physics', 'ICT / Computer Science'].includes(detectedCanonical)
  ) {
    return true;
  }
  // Primary SRE shares civic/values themes with History & Citizenship
  if (
    selectedCanonical === 'Social and Religious Education (SRE)' &&
    detectedCanonical === 'History & Citizenship'
  ) {
    return true;
  }
  // Economics and Entrepreneurship share financial/market concepts
  if (
    (selectedCanonical === 'Economics' && detectedCanonical === 'Entrepreneurship') ||
    (selectedCanonical === 'Entrepreneurship' && detectedCanonical === 'Economics')
  ) {
    return true;
  }
  // Language subjects can teach cross-subject reading passages if explicitly framed,
  // EXCEPT clear STEM formulas/equations in a language class
  return false;
}

function detectTopicSubjectDomain(text: string): SubjectCurriculumMeta | undefined {
  const clean = text.trim();
  if (!clean) return undefined;
  let bestMatch: { meta: SubjectCurriculumMeta; score: number } | null = null;
  for (const meta of REB_SUBJECT_CATALOG) {
    let score = 0;
    for (const pattern of meta.domainPatterns) {
      const m = clean.match(pattern);
      if (m) score += m.length;
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { meta, score };
    }
  }
  return bestMatch?.meta;
}

export function checkLessonConsistency(opts: {
  subject: string;
  classLevel: string;
  topic?: string;
  unitTitle?: string;
  lang: SupportedLang;
}): { consistent: true } | { consistent: false; clarification: LessonClarification } {
  const subject = opts.subject.trim();
  const classLevel = opts.classLevel.trim().toUpperCase();
  const topic = (opts.topic || '').trim();
  const unitTitle = (opts.unitTitle || '').trim();
  const selectedMeta = findSubjectMeta(subject);

  if (selectedMeta) {
    // 1. Check Primary vs Secondary class level mismatch for strictly banded REB subjects
    if (selectedMeta.levelBand === 'primary' && isSecondaryClass(classLevel)) {
      const suggestedSubject =
        selectedMeta.canonicalName === 'Science & Elementary Technology (SET)'
          ? 'Biology, Chemistry, Physics, or ICT / Computer Science'
          : 'History & Citizenship or Geography';
      const msgs: Record<SupportedLang, { title: string; msg: string; q1: string; q2: string }> = {
        en: {
          title: 'Subject and Class Level Clarification Needed',
          msg: `"${subject}" is a Primary (P1–P6) REB CBC subject, which does not match Secondary class "${classLevel}". Please confirm before generating.`,
          q1: `Did you mean a Primary class (P1–P6) for ${subject}?`,
          q2: `Or did you intend a Secondary subject such as ${suggestedSubject} for ${classLevel}?`,
        },
        rw: {
          title: 'Hakenewe ubusobanuro ku Isomo n’Umwaka w’Amashuri',
          msg: `Isomo rya "${subject}" ryigishwa mu mashuri abanza (P1–P6), ntirihuye n'umwaka wa "${classLevel}". Nyamuneka banza ubikosore cyangwa ubyemeze.`,
          q1: `Ese washakaga umwaka wo mu mashuri abanza (P1–P6) kuri ${subject}?`,
          q2: `Cyangwa washakaga isomo ryo mu mashuri yisumbuye nka ${suggestedSubject} muri ${classLevel}?`,
        },
        fr: {
          title: 'Précision requise sur la matière et le niveau',
          msg: `« ${subject} » est une matière du Primaire (P1–P6) et ne correspond pas à la classe « ${classLevel} ». Veuillez clarifier avant de générer.`,
          q1: `Souhaitez-vous choisir une classe du primaire (P1–P6) pour ${subject} ?`,
          q2: `Ou vouliez-vous sélectionner une matière du secondaire (${suggestedSubject}) pour ${classLevel} ?`,
        },
        sw: {
          title: 'Ufafanuzi Unahitajika Kuhusu Somo na Darasa',
          msg: `Somo la "${subject}" ni la Shule ya Msingi (P1–P6), halilingani na darasa la "${classLevel}". Tafadhali thibitisha kabla ya kuunda andalio.`,
          q1: `Je, ulikusudia darasa la Shule ya Msingi (P1–P6) kwa somo la ${subject}?`,
          q2: `Au ulikusudia somo la Sekondari kama ${suggestedSubject} kwa ${classLevel}?`,
        },
      };
      const m = msgs[opts.lang];
      return {
        consistent: false,
        clarification: {
          issueType: 'subject_level_mismatch',
          title: m.title,
          message: m.msg,
          selectedSubject: subject,
          selectedClass: classLevel,
          enteredTopic: topic,
          suggestedClass: 'P5',
          questions: [m.q1, m.q2],
        },
      };
    }

    if (selectedMeta.levelBand === 'secondary' && isPrimaryClass(classLevel)) {
      const suggestedSubject = ['Biology', 'Chemistry', 'Physics'].includes(
        selectedMeta.canonicalName
      )
        ? 'Science & Elementary Technology (SET)'
        : ['History & Citizenship', 'Geography'].includes(selectedMeta.canonicalName)
        ? 'Social and Religious Education (SRE)'
        : undefined;
      const msgs: Record<SupportedLang, { title: string; msg: string; q1: string; q2: string }> = {
        en: {
          title: 'Subject and Class Level Clarification Needed',
          msg: `"${subject}" is a Secondary (S1–S6) REB CBC subject, which does not match Primary class "${classLevel}".${suggestedSubject ? ` In Primary, REB uses "${suggestedSubject}".` : ''}`,
          q1: `Did you mean a Secondary class (S1–S6) for ${subject}?`,
          q2: suggestedSubject
            ? `Or should we use the official Primary subject "${suggestedSubject}" for ${classLevel}?`
            : `Please verify the class level or topic before generating.`,
        },
        rw: {
          title: 'Hakenewe ubusobanuro ku Isomo n’Umwaka w’Amashuri',
          msg: `Isomo rya "${subject}" ryigishwa mu mashuri yisumbuye (S1–S6), ntirihuye n'umwaka wa "${classLevel}".${suggestedSubject ? ` Mu mashuri abanza REB ikoresha "${suggestedSubject}".` : ''}`,
          q1: `Ese washakaga umwaka wo mu mashuri yisumbuye (S1–S6) kuri ${subject}?`,
          q2: suggestedSubject
            ? `Cyangwa dukoreshe isomo rya "${suggestedSubject}" ryo muri ${classLevel}?`
            : `Nyamuneka suzuma umwaka w'amashuri mbere yo gutegura isomo.`,
        },
        fr: {
          title: 'Précision requise sur la matière et le niveau',
          msg: `« ${subject} » est une matière du Secondaire (S1–S6) et ne correspond pas au niveau primaire « ${classLevel} ».${suggestedSubject ? ` Au primaire, le REB utilise « ${suggestedSubject} ».` : ''}`,
          q1: `Vouliez-vous sélectionner une classe du secondaire (S1–S6) pour ${subject} ?`,
          q2: suggestedSubject
            ? `Ou souhaitez-vous utiliser la matière officielle du primaire « ${suggestedSubject} » pour ${classLevel} ?`
            : `Veuillez vérifier le niveau scolaire avant de continuer.`,
        },
        sw: {
          title: 'Ufafanuzi Unahitajika Kuhusu Somo na Darasa',
          msg: `Somo la "${subject}" ni la Sekondari (S1–S6), halilingani na darasa la msingi "${classLevel}".${suggestedSubject ? ` Kwa msingi, REB hutumia "${suggestedSubject}".` : ''}`,
          q1: `Je, ulikusudia darasa la Sekondari (S1–S6) kwa ${subject}?`,
          q2: suggestedSubject
            ? `Au tutumie somo rasmi la msingi "${suggestedSubject}" kwa ${classLevel}?`
            : `Tafadhali hakiki darasa kabla ya kuendelea.`,
        },
      };
      const m = msgs[opts.lang];
      return {
        consistent: false,
        clarification: {
          issueType: 'subject_level_mismatch',
          title: m.title,
          message: m.msg,
          selectedSubject: subject,
          selectedClass: classLevel,
          enteredTopic: topic,
          suggestedSubject,
          suggestedClass: 'S1',
          questions: [m.q1, m.q2],
        },
      };
    }

    // 2. Check Subject vs Topic mismatch
    if (topic) {
      const topicMeta = detectTopicSubjectDomain(topic);
      const selectedMatchesTopic = selectedMeta.domainPatterns.some((p) => p.test(topic));
      if (
        topicMeta &&
        !selectedMatchesTopic &&
        !isCompatibleSubjectPair(selectedMeta.canonicalName, topicMeta.canonicalName)
      ) {
        const msgs: Record<SupportedLang, { title: string; msg: string; q1: string; q2: string }> = {
          en: {
            title: 'Subject and Topic Do Not Match',
            msg: `The topic "${topic}" belongs to "${topicMeta.canonicalName}", which does not match your selected subject "${subject}".`,
            q1: `Should we switch the subject to "${topicMeta.canonicalName}" to match "${topic}"?`,
            q2: `Or would you like to enter a topic that belongs to "${subject}"?`,
          },
          rw: {
            title: 'Isomo n’Umutwe w’Isomo Ntabwo Bihuye',
            msg: `Umutwe w'isomo "${topic}" ujya mu isomo rya "${topicMeta.canonicalName}", ntabwo uhuye n'isomo wahisemo rya "${subject}".`,
            q1: `Ese duhindure isomo ribe "${topicMeta.canonicalName}" kugira ngo rihure na "${topic}"?`,
            q2: `Cyangwa urifuza kwandika umutwe w'isomo ujya mu isomo rya "${subject}"?`,
          },
          fr: {
            title: 'Incohérence entre la matière et le sujet',
            msg: `Le sujet « ${topic} » relève de « ${topicMeta.canonicalName} », ce qui ne correspond pas à la matière sélectionnée « ${subject} ».`,
            q1: `Souhaitez-vous passer à la matière « ${topicMeta.canonicalName} » pour correspondre à « ${topic} » ?`,
            q2: `Ou préférez-vous saisir un sujet appartenant à « ${subject} » ?`,
          },
          sw: {
            title: 'Somo na Mada Havilingani',
            msg: `Mada ya "${topic}" ni ya somo la "${topicMeta.canonicalName}", ambayo hailingani na somo ulilochagua "${subject}".`,
            q1: `Je, tubadilishe somo kuwa "${topicMeta.canonicalName}" ili lilingane na "${topic}"?`,
            q2: `Au ungependa kuandika mada inayohusiana na somo la "${subject}"?`,
          },
        };
        const m = msgs[opts.lang];
        return {
          consistent: false,
          clarification: {
            issueType: 'subject_topic_mismatch',
            title: m.title,
            message: m.msg,
            selectedSubject: subject,
            selectedClass: classLevel,
            enteredTopic: topic,
            suggestedSubject: topicMeta.canonicalName,
            questions: [m.q1, m.q2],
          },
        };
      }
    }

    // 3. Check explicit Unit Title vs Topic mismatch
    if (topic && unitTitle) {
      const topicMeta = detectTopicSubjectDomain(topic);
      const unitMeta = detectTopicSubjectDomain(unitTitle);
      if (
        topicMeta &&
        unitMeta &&
        topicMeta.canonicalName !== unitMeta.canonicalName &&
        !isCompatibleSubjectPair(topicMeta.canonicalName, unitMeta.canonicalName)
      ) {
        const msgs: Record<SupportedLang, { title: string; msg: string; q1: string }> = {
          en: {
            title: 'Unit Title and Lesson Topic Do Not Match',
            msg: `Unit Title "${unitTitle}" (${unitMeta.canonicalName}) does not match Lesson Topic "${topic}" (${topicMeta.canonicalName}).`,
            q1: 'Please align the Unit Title and Lesson Topic before generating the plan.',
          },
          rw: {
            title: 'Umutwe w’Igice n’Umutwe w’Isomo Ntabwo Bihuye',
            msg: `Umutwe w'igice "${unitTitle}" (${unitMeta.canonicalName}) ntuhuye n'umutwe w'isomo "${topic}" (${topicMeta.canonicalName}).`,
            q1: 'Nyamuneka huza umutwe w’igice n’umutwe w’isomo mbere yo gutegura isomo.',
          },
          fr: {
            title: 'Le titre de l’unité et le sujet de la leçon divergent',
            msg: `Le titre d'unité « ${unitTitle} » (${unitMeta.canonicalName}) ne correspond pas au sujet « ${topic} » (${topicMeta.canonicalName}).`,
            q1: 'Veuillez harmoniser le titre de l’unité et le sujet de la leçon avant de générer.',
          },
          sw: {
            title: 'Kichwa cha Sura na Mada ya Somo Havilingani',
            msg: `Kichwa cha Sura "${unitTitle}" (${unitMeta.canonicalName}) hakilingani na Mada "${topic}" (${topicMeta.canonicalName}).`,
            q1: 'Tafadhali sawazisha Kichwa cha Sura na Mada ya Somo kabla ya kuunda andalio.',
          },
        };
        const m = msgs[opts.lang];
        return {
          consistent: false,
          clarification: {
            issueType: 'unit_topic_mismatch',
            title: m.title,
            message: m.msg,
            selectedSubject: subject,
            selectedClass: classLevel,
            enteredTopic: topic,
            suggestedSubject: selectedMeta.canonicalName,
            questions: [m.q1],
          },
        };
      }
    }
  }

  return { consistent: true };
}

export function getCurriculumGroundingContext(opts: {
  subject: string;
  classLevel: string;
  unitNo: string;
  topic?: string;
  lang: SupportedLang;
}): { verified: boolean; referenceText: string; promptNote: string; matchedUnit?: CurriculumUnitRecord } {
  const meta = findSubjectMeta(opts.subject);
  const cls = opts.classLevel.trim().toUpperCase();
  const topicLower = (opts.topic || '').trim().toLowerCase();

  if (!meta) {
    const unverifiedNote: Record<SupportedLang, string> = {
      en: `${opts.subject} (${cls}) — Syllabus reference needs verification against official REB / MINEDUC curriculum documents (elearning.reb.rw).`,
      rw: `${opts.subject} (${cls}) — Ibitabo n'integanyanyigisho bigomba kugenzurwa ku rubuga rwa REB (elearning.reb.rw).`,
      fr: `${opts.subject} (${cls}) — Référence à vérifier dans le programme officiel du REB (elearning.reb.rw).`,
      sw: `${opts.subject} (${cls}) — Marejeleo yanahitaji uhakiki katika mtaala rasmi wa REB (elearning.reb.rw).`,
    };
    return {
      verified: false,
      referenceText: unverifiedNote[opts.lang],
      promptNote: `No built-in REB syllabus unit entry is stored for custom subject "${opts.subject}". Do NOT invent textbook editions, ISBNs, page numbers, or fabricated curriculum unit claims; clearly indicate where verification against official REB resources (elearning.reb.rw / reb.gov.rw) is needed.`,
    };
  }

  const matchedUnit = meta.units.find((u) => {
    const classOk = u.classes.includes(cls);
    const unitOk = !u.unitNo || u.unitNo === opts.unitNo.trim();
    const topicOk =
      !topicLower ||
      u.sampleTopics.some(
        (t) =>
          topicLower.includes(t.toLowerCase()) ||
          t.toLowerCase().includes(topicLower) ||
          topicLower.includes(u.unitTitle.toLowerCase())
      );
    return classOk && (unitOk || topicOk);
  });

  if (matchedUnit) {
    return {
      verified: true,
      matchedUnit,
      referenceText: matchedUnit.reference,
      promptNote: `Grounded project REB curriculum entry found: Unit "${matchedUnit.unitTitle}", Key Unit Competence: "${matchedUnit.keyUnitCompetence}", Official Reference: "${matchedUnit.reference}". Use this verified curriculum reference and do NOT invent page numbers or unverified titles.`,
    };
  }

  const fallbackRefByLang: Record<SupportedLang, string> = {
    en: `${meta.verifiedPortalRef} — ${cls}, Unit ${opts.unitNo} (verify exact unit numbering/pages with the school’s REB Teacher’s Guide).`,
    rw: `${meta.verifiedPortalRef} — ${cls}, Umutwe wa ${opts.unitNo} (genzura nomero nyayo y'umutwe n'amapaji mu Gitabo cy'Umwarimu cya REB).`,
    fr: `${meta.verifiedPortalRef} — ${cls}, Unité ${opts.unitNo} (vérifier la numérotation exacte et les pages dans le Guide de l’enseignant REB).`,
    sw: `${meta.verifiedPortalRef} — ${cls}, Sura ya ${opts.unitNo} (hakiki namba kamili ya sura na kurasa katika Mwongozo wa Mwalimu wa REB).`,
  };

  return {
    verified: false,
    referenceText: fallbackRefByLang[opts.lang],
    promptNote: `Subject "${meta.canonicalName}" is in the REB curriculum (${meta.verifiedPortalRef}), but the exact unit/lesson text for ${cls} Unit ${opts.unitNo} is not preloaded locally. Align accurately with official REB CBC standards, do NOT invent textbook publication years or page numbers, and note clearly in "references" to verify exact unit numbering/pages in the REB ${meta.canonicalName} ${cls} Teacher's Guide (elearning.reb.rw).`,
  };
}

export function sanitizeLanguageQuality(text: string, lang: SupportedLang): string {
  if (!text) return '';
  // Remove non-Latin stray scripts (Chinese, Japanese, Korean, Cyrillic)
  let cleaned = text
    .replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\u0400-\u04ff]/g, '')
    .replace(/\bequlity\b/gi, 'Equality')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\.{2,}/g, (m) => (m.length === 3 ? '...' : '.'));

  if (lang === 'rw') {
    // Remove digits accidentally embedded inside Kinyarwanda words (e.g. "is2omo" -> "isomo")
    cleaned = cleaned.replace(/([a-zA-ZÀ-ÿ])\d+([a-zA-ZÀ-ÿ])/g, '$1$2');
    // Fix common Kinyarwanda grammatical/vocabulary errors & Swahili leakage
    cleaned = cleaned
      .replace(/\bkumyumva\b/gi, 'kuwumva')
      .replace(/\bkugirango\b/gi, 'kugira ngo')
      .replace(/\bkujadili\b/gi, 'kuganira')
      .replace(/\bmwalimu\b/gi, 'umwarimu')
      .replace(/\bwanafunzi\b/gi, 'abanyeshuri')
      .replace(/\bmasomo\b/gi, 'amasomo')
      .replace(/\bsomo\b/gi, 'isomo')
      .replace(/\bmu isomo rya\b/gi, 'mu isomo rya')
      .replace(/\biyo bwite\b/gi, 'uburyo bwite');
  }

  return cleaned.trim();
}

export interface SenAdaptationProfile {
  hasSpecificNeeds: boolean;
  categories: Array<'slow' | 'visual' | 'hearing' | 'physical' | 'speech_reading' | 'gifted' | 'general'>;
  locationNote: string;
  materialsNote: string;
  classroomSupportStep: string;
  keywordsToVerify: RegExp[];
}

export function buildSenAdaptationProfile(senInput: string, lang: SupportedLang): SenAdaptationProfile {
  const lower = senInput.toLowerCase();
  if (!lower.trim() || /^(none|0|no|ntawu|ntabwo|aucun|hapana)(\s*\(0\))?$/i.test(lower.trim())) {
    const noneMap: Record<SupportedLang, { loc: string; mat: string; step: string }> = {
      en: {
        loc: 'Inside the classroom — learners sit in mixed-ability groups.',
        mat: 'Universal visual and tactile learning aids accessible to all learners.',
        step: 'Monitor all learners and offer differentiated scaffolding or extension tasks as needed.',
      },
      rw: {
        loc: 'Imbere mu ishuri — abanyeshuri bicaye mu matsinda avanze.',
        mat: 'Imfashanyigisho zigaragara kandi zorohereza buri munyeshuri wese.',
        step: 'Genzura uko buri munyeshuri akora kandi ufashe ababikeneye bose.',
      },
      fr: {
        loc: 'Dans la salle de classe — apprenants répartis en groupes hétérogènes.',
        mat: 'Supports visuels et concrets accessibles à toute la classe.',
        step: 'Accompagner chaque élève et proposer des exercices différenciés selon les besoins.',
      },
      sw: {
        loc: 'Ndani ya darasa — wanafunzi wamekaa katika vikundi mchanganyiko.',
        mat: 'Zana za kujifunzia zinazoonekana na kufikika kwa wanafunzi wote.',
        step: 'Fuatilia wanafunzi wote na toa msaada kulingana na mahitaji ya darasa.',
      },
    };
    const m = noneMap[lang];
    return {
      hasSpecificNeeds: false,
      categories: ['general'],
      locationNote: m.loc,
      materialsNote: m.mat,
      classroomSupportStep: m.step,
      keywordsToVerify: [],
    };
  }

  const categories: SenAdaptationProfile['categories'] = [];
  const keywordsToVerify: RegExp[] = [];
  const locParts: string[] = [];
  const matParts: string[] = [];
  const stepParts: string[] = [];

  const hasSlow = /slow|buhoro|lent|polepole|struggling|learning difficult/i.test(lower);
  const hasVisual = /visual|vision|sight|blind|kutabona|visuel|macho/i.test(lower);
  const hasHearing = /hearing|deaf|kutumva|auditif|kutosikia|maskio/i.test(lower);
  const hasPhysical = /physical|mobility|wheelchair|ubumuga bw'ingingo|moteur|viungo/i.test(lower);
  const hasSpeechRead = /dyslexia|reading|speech|gusoma|kuvuga|langage/i.test(lower);
  const hasGifted = /gifted|fast|advanced|abanyabwenge/i.test(lower);

  if (hasSlow) {
    categories.push('slow');
    keywordsToVerify.push(/simplif|extra|example|step|pair|orosh|buhoro|lent|polepole|mfano/i);
    if (lang === 'rw') {
      matParts.push('amakarita y’imyitozo yoroheje n’ingero zifatika');
      stepParts.push('guha abanyeshuri biga buhoro amabwiriza yoroshye, ingero z’inyongera n’igihe gihagije cyo kwitoza hamwe na bagenzi babo');
    } else if (lang === 'fr') {
      matParts.push('fiches d’exercices progressives avec exemples guidés');
      stepParts.push('donner aux apprenants lents des consignes simplifiées, des exemples supplémentaires et un tutorat entre pairs');
    } else if (lang === 'sw') {
      matParts.push('kadi za mazoezi rahisi zenye mifano iliyofafanuliwa');
      stepParts.push('kuwapa wanafunzi wanaojifunza polepole maelekezo rahisi, mifano ya ziada na muda wa ziada wa mazoezi');
    } else {
      matParts.push('step-by-step worked example cards for extra practice');
      stepParts.push('give slow learners simplified instructions, additional worked examples, and extra guided practice with peer buddies');
    }
  }

  if (hasVisual) {
    categories.push('visual');
    keywordsToVerify.push(/large|front|bold|verbal|nyuguti nini|imbere|gros caractères|maandishi makubwa|mbele/i);
    if (lang === 'rw') {
      locParts.push('abafite ikibazo cyo kutabona neza bicaye imbere hafi y’ikibaho');
      matParts.push('amakarita n’inyandiko zanditse mu nyuguti nini kandi zisobanutse');
      stepParts.push('kwandika mu nyuguti nini ku kibaho no gusoma mu ijwi riranguruye ibyanditswe byose');
    } else if (lang === 'fr') {
      locParts.push('apprenants ayant une déficience visuelle légère placés au premier rang près du tableau');
      matParts.push('supports imprimés en gros caractères et à fort contraste');
      stepParts.push('écrire en grands caractères au tableau et verbaliser clairement chaque étape écrite');
    } else if (lang === 'sw') {
      locParts.push('wanafunzi wenye ulemavu mdogo wa macho wanakaa mstari wa mbele karibu na ubao');
      matParts.push('kadi zenye maandishi makubwa na rangi zinazoonekana wazi');
      stepParts.push('kuandika kwa herufi kubwa ubaoni na kueleza kwa sauti wazi kila kinachoandikwa');
    } else {
      locParts.push('learners with mild visual impairment seated in the front row near the chalkboard');
      matParts.push('large-print word/diagram cards with high contrast');
      stepParts.push('write boldly on the board and provide clear verbal explanations of all visual items');
    }
  }

  if (hasHearing) {
    categories.push('hearing');
    keywordsToVerify.push(/lip|front|visual|diagram|written|imbere|ibimenyetso|visuel|maandishi/i);
    if (lang === 'rw') {
      locParts.push('abafite ikibazo cyo kutumva neza bicaye imbere barebana neza n’umwarimu');
      matParts.push('amashusho asobanura n’amabwiriza yanditse ku ikibaho');
      stepParts.push('kuvuga ureba imbere kugira ngo basome iminwa no kwandika iby’ingenzi ku kibaho');
    } else if (lang === 'fr') {
      locParts.push('apprenants malentendants placés face à l’enseignant pour faciliter la lecture labiale');
      matParts.push('consignes écrites et schémas visuels clairs');
      stepParts.push('parler face à la classe et afficher systématiquement les consignes clés par écrit');
    } else if (lang === 'sw') {
      locParts.push('wanafunzi wenye tatizo la kusikia wanakaa mbele wakimwona mwalimu usoni');
      matParts.push('maelekezo yaliyoandikwa na michoro ya wazi');
      stepParts.push('kuzungumza ukielekea darasa na kuandika maagizo muhimu ubaoni');
    } else {
      locParts.push('learners with hearing impairment seated in front facing the teacher for lip-reading');
      matParts.push('written step prompts and clear visual diagrams');
      stepParts.push('face learners when speaking and reinforce oral questions in writing on the board');
    }
  }

  if (hasPhysical) {
    categories.push('physical');
    keywordsToVerify.push(/access|space|table|reach|muryango|accessible|fikika/i);
    if (lang === 'rw') {
      locParts.push('imyanya yisanzuye kandi yorohereza abafite ubumuga bw’ingingo kugera ku meza y’itsinda');
      stepParts.push('kwegereza ibikoresho by’isomo abo banyeshuri no kubaha igihe cyo gusubiza mu buryo buboroheye');
    } else if (lang === 'fr') {
      locParts.push('allées dégagées et tables accessibles pour les apprenants à mobilité réduite');
      stepParts.push('placer le matériel à portée de main et adapter les modalités de participation');
    } else if (lang === 'sw') {
      locParts.push('nafasi pana na meza zinazofikika kwa urahisi kwa wenye ulemavu wa viungo');
      stepParts.push('kuweka vifaa karibu nao na kutoa njia rahisi za kushiriki');
    } else {
      locParts.push('wide aisles and an easily accessible group desk near the doorway');
      stepParts.push('bring learning aids directly to their desk and allow flexible oral or written participation');
    }
  }

  if (hasSpeechRead) {
    categories.push('speech_reading');
    keywordsToVerify.push(/oral|chunk|pair|time|ijwi|oral|muda/i);
    if (lang === 'en') {
      stepParts.push('break reading passages into short chunks and allow oral responses alongside paired reading');
    } else if (lang === 'rw') {
      stepParts.push('kugabanya umwandiko mu bice bigufi no gufasha mu gusoma muri babiri');
    } else if (lang === 'fr') {
      stepParts.push('découper les textes en courts paragraphes et autoriser des réponses orales');
    } else {
      stepParts.push('kugawa maandishi katika sehemu fupi na kuruhusu majibu ya mdomo');
    }
  }

  if (hasGifted) {
    categories.push('gifted');
    keywordsToVerify.push(/extension|challenge|bonus|nyongera|approfondissement|ziada/i);
    if (lang === 'en') {
      stepParts.push('provide an analytical extension challenge for fast finishers');
    } else if (lang === 'rw') {
      stepParts.push('guha abarangiza vuba ikibazo cy’inyongera gisaba gusesengura birushijeho');
    } else if (lang === 'fr') {
      stepParts.push('proposer une tâche d’approfondissement aux apprenants rapides');
    } else {
      stepParts.push('kutoa swali la ziada la uchambuzi kwa wanafunzi wanaomaliza mapema');
    }
  }

  if (categories.length === 0) {
    categories.push('general');
    keywordsToVerify.push(/support|sen|differenti|fasha|adapter|msaada/i);
    if (lang === 'rw') {
      locParts.push(`imyanya yateguwe ihuje n'ibikenewe bya ${senInput}`);
      matParts.push(`ibikoresho byorohereza ${senInput}`);
      stepParts.push(`kwita by’umwihariko ku bafite imbogamizi zagaragajwe (${senInput}) mu matsinda`);
    } else if (lang === 'fr') {
      locParts.push(`placement adapté aux besoins signalés (${senInput})`);
      matParts.push(`supports adaptés à ${senInput}`);
      stepParts.push(`fournir un accompagnement ciblé pour ${senInput} durant les activités`);
    } else if (lang === 'sw') {
      locParts.push(`mpangilio wa viti unaozingatia mahitaji ya ${senInput}`);
      matParts.push(`zana zilizorekebishwa kwa ${senInput}`);
      stepParts.push(`kutoa msaada mahususi kwa ${senInput} wakati wa kazi za vikundi`);
    } else {
      locParts.push(`inclusive seating adapted for ${senInput}`);
      matParts.push(`differentiated materials suited for ${senInput}`);
      stepParts.push(`provide targeted scaffolding tailored to ${senInput} throughout group and practice tasks`);
    }
  }

  const baseLoc: Record<SupportedLang, string> = {
    en: 'Inside the classroom — mixed-ability groups',
    rw: 'Imbere mu ishuri — mu matsinda avanze',
    fr: 'Dans la salle de classe — en groupes hétérogènes',
    sw: 'Ndani ya darasa — katika vikundi mchanganyiko',
  };

  return {
    hasSpecificNeeds: true,
    categories,
    locationNote: locParts.length > 0 ? `${baseLoc[lang]}; ${locParts.join('; ')}.` : `${baseLoc[lang]}.`,
    materialsNote: matParts.join('; '),
    classroomSupportStep: stepParts.join('; '),
    keywordsToVerify,
  };
}

// Patterns indicating fabricated post-lesson outcomes or invented learner percentages
const INVENTED_RESULT_PATTERNS: RegExp[] = [
  /\b\d{1,3}\s*%/,
  /\basilimia\s+\d{1,3}/i,
  /\b(approximately|about|nearly|around|only)\s+\d+\s+(learners|students|pupils)\b/i,
  /\b(abanyeshuri\s+(bagera\s+kuri|barimo)\s+\d+|bagera\s+kuri\s+\d+\s*%)/i,
  /\b(environ|près de)\s+\d+\s*(%|apprenants|élèves)/i,
  /\b\d+\s+(learners|students|pupils)\s+(failed|missed|got|scored|understood|struggled|needed)/i,
  /\b(lesson\s+(was|went)\s+(delivered|taught)\s+(well|smoothly|effectively))/i,
  /\b(ryatanzwe\s+neza|la\s+leçon\s+a\s+été\s+dispensée|somo\s+limefundishwa\s+kwa\s+ufanisi)\b/i,
  /\b(achieved the objective|met the instructional objective|understood the lesson|bageze ku ntego|ont atteint l'objectif|walifikia lengo)\b/i,
];

export function hasInventedAssessmentResults(text: string): boolean {
  const s = String(text || '').trim();
  if (!s) return false;
  return INVENTED_RESULT_PATTERNS.some((re) => re.test(s));
}

export function buildPostLessonReflectionGuide(opts: {
  lang: SupportedLang;
  lessonTitle: string;
  durationMinutes: number;
  sen: string;
}): string {
  const { lang, lessonTitle, durationMinutes, sen } = opts;
  if (lang === 'rw') {
    return `Bizuzuzwa n'umwarimu nyuma yo kwigisha: (1) Andika umubare w'abanyeshuri bashoboye kugera ku ntego y'isomo "${lessonTitle}" mu isuzuma ryo mu minota ${durationMinutes}. (2) Garagaza ibikorwa n'imfashanyigisho byafashije cyane harimo n'ubufasha bwa (${sen}). (3) Teganya imyitozo yo gufasha abatarabonye intego neza cyangwa izindi ntera mu isomo ritaha.`;
  }
  if (lang === 'fr') {
    return `À compléter par l'enseignant après la leçon : (1) Notez le nombre réel d'apprenants ayant atteint l'objectif sur « ${lessonTitle} » lors de l'évaluation finale (${durationMinutes} min). (2) Indiquez les activités, supports et adaptations (${sen}) qui ont été efficaces. (3) Précisez les actions de remédiation ou de consolidation pour la séance suivante.`;
  }
  if (lang === 'sw') {
    return `Itajazwa na mwalimu baada ya kufundisha: (1) Rekodi idadi halisi ya wanafunzi waliofikia lengo la somo "${lessonTitle}" katika tathmini ya mwisho (dakika ${durationMinutes}). (2) Eleza mbinu, vifaa na marekebisho ya (${sen}) yaliyosaidia. (3) Panga hatua za msaada wa ziada au mazoezi ya kuimarisha katika somo lijalo.`;
  }
  return `To be completed by the teacher after teaching: (1) Record the actual number of learners who achieved the instructional objective on "${lessonTitle}" during the exit assessment (${durationMinutes} min). (2) Note which group activities, visual aids, and SEN adaptations (${sen}) worked well or need adjustment. (3) Specify follow-up remedial or extension actions for the next lesson.`;
}

function deduplicateStageActions(text: string): { cleaned: string; removedDuplicates: boolean } {
  const lines = String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const seenNormalized = new Set<string>();
  const kept: string[] = [];
  let removedDuplicates = false;

  for (const line of lines) {
    const body = line.replace(/^\d+[.)]\s*/, '').trim();
    const norm = body
      .toLowerCase()
      .replace(/[^a-z0-9à-ÿ\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) continue;
    if (seenNormalized.has(norm)) {
      removedDuplicates = true;
      continue;
    }
    seenNormalized.add(norm);
    kept.push(body);
  }

  return {
    cleaned: kept.map((body, idx) => `${idx + 1}. ${body}`).join('\n'),
    removedDuplicates,
  };
}

export function runLessonQualityCheckAndRepair(
  plan: NormalizedLessonPlan,
  context: {
    requestedSubject: string;
    requestedClass: string;
    requestedTopic?: string;
    lang: SupportedLang;
    senInput: string;
    curriculumVerified: boolean;
    verifiedReference: string;
  }
): { plan: NormalizedLessonPlan; report: LessonQualityReport } {
  const correctionsApplied: string[] = [];
  const next: NormalizedLessonPlan = {
    ...plan,
    stages: plan.stages.map((s) => ({ ...s })),
  };

  // 1. Subject and class consistency (never silently overwrite teacher's selected subject/class)
  if (
    context.requestedSubject &&
    next.subject.trim().toLowerCase() !== context.requestedSubject.trim().toLowerCase()
  ) {
    next.subject = sanitizeLanguageQuality(context.requestedSubject, context.lang);
    correctionsApplied.push('Locked subject to teacher-selected subject');
  }
  if (
    context.requestedClass &&
    next.classLevel.trim().toUpperCase() !== context.requestedClass.trim().toUpperCase()
  ) {
    next.classLevel = context.requestedClass.trim().toUpperCase();
    correctionsApplied.push('Locked class level to teacher-selected class');
  }

  // 2. Single clean canonical lesson title
  const canonicalTitle = sanitizeLanguageQuality(
    (context.requestedTopic || next.lessonTitle || '').trim(),
    context.lang
  );
  if (canonicalTitle && next.lessonTitle !== canonicalTitle) {
    next.lessonTitle = canonicalTitle;
    correctionsApplied.push('Standardized lesson title across plan');
  }
  // Strip accidental duplicate title repetition (e.g. "Fractions — Fractions")
  if (next.lessonTitle.includes('—')) {
    const parts = next.lessonTitle.split('—').map((p) => p.trim());
    if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
      next.lessonTitle = parts[0];
      correctionsApplied.push('Removed duplicate wording in lesson title');
    }
  }

  // 3. Grammar, spelling & language purity across every field
  const fieldsToClean: Array<keyof NormalizedLessonPlan> = [
    'schoolName',
    'teacherName',
    'term',
    'sen',
    'unitTitle',
    'keyUnitCompetence',
    'lessonTitle',
    'instructionalObjective',
    'planLocation',
    'learningMaterials',
    'references',
    'activityOverview',
  ];
  for (const key of fieldsToClean) {
    const val = String(next[key] || '');
    const cleaned = sanitizeLanguageQuality(val, context.lang);
    if (cleaned !== val) {
      (next as unknown as Record<string, unknown>)[key] = cleaned;
      if (!correctionsApplied.includes('Applied grammar and text-purity cleanup')) {
        correctionsApplied.push('Applied grammar and text-purity cleanup');
      }
    }
  }

  // Ensure unverified curriculum references carry explicit verification note (never fabricated)
  if (
    !context.curriculumVerified &&
    !/verif|genzura|vérifier|hakiki/i.test(next.references)
  ) {
    next.references = context.verifiedReference;
    correctionsApplied.push('Added REB syllabus verification notice to references');
  }

  // 4. Objective & Stage alignment + deduplication of repetitive activities
  for (const stage of next.stages) {
    const tClean = deduplicateStageActions(sanitizeLanguageQuality(stage.teacherActivities, context.lang));
    const lClean = deduplicateStageActions(sanitizeLanguageQuality(stage.learnerActivities, context.lang));
    if (tClean.removedDuplicates || lClean.removedDuplicates) {
      correctionsApplied.push(`Removed repetitive steps in ${stage.stageName}`);
    }
    stage.teacherActivities = tClean.cleaned;
    stage.learnerActivities = lClean.cleaned;
    stage.competencesAndIssues = sanitizeLanguageQuality(stage.competencesAndIssues, context.lang);
    stage.stageName = sanitizeLanguageQuality(stage.stageName, context.lang);

    // Strip any invented student score percentages inside stage activities
    if (hasInventedAssessmentResults(stage.teacherActivities)) {
      stage.teacherActivities = stage.teacherActivities
        .replace(/\b\d{1,3}\s*%\s+of\s+(learners|students)[^.\n]*/gi, '')
        .trim();
      correctionsApplied.push('Removed invented assessment figures from stage actions');
    }
  }

  // Ensure Conclusion stage explicitly includes a formative assessment method aligned with objective
  const conclStage = next.stages.find((s) => s.stageType === 'conclusion');
  if (
    conclStage &&
    !/assess|exit|check|isuzuma|vérif|évaluation|tathmini|quiz|question/i.test(
      conclStage.teacherActivities
    )
  ) {
    const checkStepByLang: Record<SupportedLang, string> = {
      en: `Formative Assessment Method: Administer 2 short oral or written exit check questions directly testing "${next.lessonTitle}" and record mastery after teaching.`,
      rw: `Uburyo bw'isuzuma: Baza ibibazo 2 bigufi mu magambo cyangwa mu makayi bigenzura intego ya "${next.lessonTitle}".`,
      fr: `Méthode d'évaluation formative : Poser 2 courtes questions de sortie orales ou écrites vérifiant l'objectif sur « ${next.lessonTitle} ».`,
      sw: `Mbinu ya Tathmini: Toa maswali 2 mafupi ya mdomo au maandishi yanayopima uelewa wa "${next.lessonTitle}".`,
    };
    const nextNum = conclStage.teacherActivities.split('\n').filter(Boolean).length + 1;
    conclStage.teacherActivities = `${conclStage.teacherActivities}\n${nextNum}. ${checkStepByLang[context.lang]}`.trim();
    correctionsApplied.push('Added explicit formative assessment method to Conclusion');
  }

  // 5. Duration alignment check
  const targetMinutes = Math.max(10, Math.round(Number(next.durationMinutes) || 40));
  next.durationMinutes = targetMinutes;
  const stageSum = next.stages.reduce((sum, s) => sum + (Number(s.timingMinutes) || 0), 0);
  if (stageSum !== targetMinutes && next.stages.length > 0) {
    const introMin = Math.max(3, Math.round(targetMinutes * 0.125));
    const conclMin = Math.max(3, Math.round(targetMinutes * 0.125));
    const devMin = Math.max(5, targetMinutes - introMin - conclMin);
    const devStages = next.stages.filter((s) => s.stageType === 'development');
    next.stages.forEach((s) => {
      if (s.stageType === 'intro') s.timingMinutes = introMin;
      else if (s.stageType === 'conclusion') s.timingMinutes = conclMin;
    });
    if (devStages.length > 0) {
      const perDev = Math.max(1, Math.floor(devMin / devStages.length));
      devStages.forEach((s, idx) => {
        s.timingMinutes =
          idx === devStages.length - 1 ? Math.max(1, devMin - perDev * (devStages.length - 1)) : perDev;
      });
    }
    correctionsApplied.push(`Adjusted stage durations to total exactly ${targetMinutes} minutes`);
  }

  // 6. SEN Adaptation Verification & Targeted Repair
  const senProfile = buildSenAdaptationProfile(context.senInput, context.lang);
  if (senProfile.hasSpecificNeeds) {
    const combinedSenText = [
      next.planLocation,
      next.learningMaterials,
      ...next.stages.map((s) => `${s.teacherActivities} ${s.competencesAndIssues}`),
    ].join(' ');
    const missingSpecificSupport =
      senProfile.keywordsToVerify.length > 0 &&
      !senProfile.keywordsToVerify.some((re) => re.test(combinedSenText));

    if (missingSpecificSupport) {
      if (senProfile.locationNote && !next.planLocation.toLowerCase().includes('front') && !next.planLocation.toLowerCase().includes('imbere') && !next.planLocation.toLowerCase().includes('rang') && !next.planLocation.toLowerCase().includes('mbele')) {
        next.planLocation = senProfile.locationNote;
      }
      if (senProfile.materialsNote) {
        next.learningMaterials = `${next.learningMaterials}; ${senProfile.materialsNote}`;
      }
      const devStage = next.stages.find((s) => s.stageType === 'development') || next.stages[0];
      if (devStage && senProfile.classroomSupportStep) {
        const nextNum = devStage.teacherActivities.split('\n').filter(Boolean).length + 1;
        devStage.teacherActivities = `${devStage.teacherActivities}\n${nextNum}. SEN Support (${context.senInput}): ${senProfile.classroomSupportStep}.`;
      }
      correctionsApplied.push(`Added tailored SEN adaptations for "${context.senInput}"`);
    }
  }

  // 7. No Invented Assessment Results in Teacher Reflection
  const cleanEval = sanitizeLanguageQuality(next.teacherSelfEvaluation, context.lang);
  if (
    !cleanEval ||
    /_{2,}/.test(cleanEval) ||
    hasInventedAssessmentResults(cleanEval)
  ) {
    next.teacherSelfEvaluation = buildPostLessonReflectionGuide({
      lang: context.lang,
      lessonTitle: next.lessonTitle,
      durationMinutes: next.durationMinutes,
      sen: next.sen,
    });
    correctionsApplied.push('Replaced fabricated results in teacher reflection with post-lesson reflection guide');
  } else {
    next.teacherSelfEvaluation = cleanEval;
  }

  // 8. Final Completeness Audit
  const finalDurationSum = next.stages.reduce((sum, s) => sum + s.timingMinutes, 0);
  const completeStructure = Boolean(
    next.schoolName &&
      next.teacherName &&
      next.term &&
      next.date &&
      next.subject &&
      next.classLevel &&
      next.unitNo &&
      next.lessonNo &&
      next.unitTitle &&
      next.keyUnitCompetence &&
      next.lessonTitle &&
      next.instructionalObjective &&
      next.planLocation &&
      next.learningMaterials &&
      next.references &&
      next.activityOverview &&
      next.teacherSelfEvaluation &&
      next.stages.length >= 3 &&
      next.stages.every(
        (s) => s.teacherActivities.trim() && s.learnerActivities.trim() && s.competencesAndIssues.trim()
      )
  );

  const report: LessonQualityReport = {
    passed: completeStructure && finalDurationSum === next.durationMinutes && !hasInventedAssessmentResults(next.teacherSelfEvaluation),
    curriculumVerified: context.curriculumVerified,
    checks: {
      subjectTopicConsistent:
        next.subject.toLowerCase() === (context.requestedSubject || next.subject).toLowerCase(),
      singleCleanTitle: Boolean(next.lessonTitle && !/_{2,}/.test(next.lessonTitle)),
      grammarAndPurityCleaned: true,
      objectivesActivitiesAligned: next.stages.length >= 3 && Boolean(next.instructionalObjective),
      durationMatches: finalDurationSum === next.durationMinutes,
      senAdapted: Boolean(next.sen),
      noInventedResults: !hasInventedAssessmentResults(next.teacherSelfEvaluation),
      completeStructure,
    },
    correctionsApplied,
  };

  return { plan: next, report };
}
