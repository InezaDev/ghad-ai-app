import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Copy,
  FileDown,
  FilePlus2,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Zap,
  X,
} from 'lucide-react';
import {
  Lang,
  LessonClarification,
  LessonPlanData,
  LessonQualityReport,
  PrintOrientation,
  TeacherProfile,
} from '../types/ghad';
import { translate } from '../i18n/translations';
import { RebLessonPlanTable } from './RebLessonPlanTable';
import {
  downloadWordDoc,
  lessonPlanToPlainText,
  lessonPlanToWordHtml,
  printOrDownloadHtml,
} from '../utils/export';
import { AiClientError, LessonPlanApiResult, requestLessonPlan } from '../services/aiClient';
import { MaintenanceNotice } from './MaintenanceNotice';

const RWANDA_SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'Kinyarwanda',
  'French',
  'Geography',
  'History & Citizenship',
  'ICT / Computer Science',
  'Entrepreneurship',
  'Economics',
  'Science & Elementary Technology (SET)',
  'Social and Religious Education (SRE)',
  'Other',
];

const RWANDA_CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

function cleanTopicLabel(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const fixedEqulity = trimmed.replace(/\bequlity\b/gi, 'Equality');
  if (fixedEqulity === fixedEqulity.toUpperCase() && fixedEqulity.length > 3) {
    return fixedEqulity
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .replace(/\bAnd\b/g, 'and')
      .replace(/\bOf\b/g, 'of')
      .replace(/\bIn\b/g, 'in')
      .replace(/\bThe\b/g, 'the');
  }
  return fixedEqulity;
}

function splitDurationMinutes(total: number): { intro: number; dev: number; concl: number } {
  const clamped = Math.max(10, Math.min(240, Math.round(total) || 40));
  const intro = Math.max(3, Math.round(clamped * 0.125));
  const concl = Math.max(3, Math.round(clamped * 0.125));
  const dev = Math.max(5, clamped - intro - concl);
  return { intro, dev, concl };
}

interface LessonPlannerViewProps {
  lang: Lang;
  profile: TeacherProfile;
  activePlan: LessonPlanData | null;
  prefill?: { subject: string; classLevel: string; nonce: number } | null;
  hasUnsavedChanges?: boolean;
  maintenanceMode?: boolean;
  onSetActivePlan: (plan: LessonPlanData | null) => void;
  onSavePlan: (plan: LessonPlanData) => void;
  onCreateAssessmentFromPlan?: (plan: LessonPlanData) => void;
  onCreateMethodologyFromPlan?: (plan: LessonPlanData) => void;
  onBackHome?: () => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onCopy: (text: string) => void;
}

export const LessonPlannerView: React.FC<LessonPlannerViewProps> = ({
  lang,
  profile,
  activePlan,
  prefill,
  hasUnsavedChanges = false,
  maintenanceMode = false,
  onSetActivePlan,
  onSavePlan,
  onCreateAssessmentFromPlan,
  onCreateMethodologyFromPlan,
  onBackHome,
  onToast,
  onCopy,
}) => {
  const t = (k: string) => translate(lang, k);

  const [schoolName, setSchoolName] = useState(profile.schoolName || '');
  const [teacherName, setTeacherName] = useState(profile.teacherName || '');
  const [subject, setSubject] = useState('Mathematics');
  const [customSubject, setCustomSubject] = useState('');
  const [classLevel, setClassLevel] = useState('P4');
  const [topic, setTopic] = useState('');
  const [durationStr, setDurationStr] = useState('40');
  const [unitNo, setUnitNo] = useState('1');
  const [unitTitle, setUnitTitle] = useState('');
  const [lessonNo, setLessonNo] = useState('1 of 4');
  const [learners, setLearners] = useState('40');
  const [term, setTerm] = useState(profile.defaultTerm || 'Term 1');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sen, setSen] = useState('Slow learners (2), Mild visual impairment (1)');
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clarification, setClarification] = useState<LessonClarification | null>(null);
  const [qualityReport, setQualityReport] = useState<LessonQualityReport | null>(null);
  const [mobileTab, setMobileTab] = useState<'setup' | 'preview'>(activePlan ? 'preview' : 'setup');
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>('portrait');

  const abortRef = useRef<AbortController | null>(null);
  const selfUpdatedPlanRef = useRef<LessonPlanData | null>(null);

  const setPlanFromSelf = (plan: LessonPlanData | null, switchMobilePreview = true) => {
    selfUpdatedPlanRef.current = plan;
    onSetActivePlan(plan);
    if (plan && switchMobilePreview) {
      setMobileTab('preview');
    }
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Apply Quick-Try prefill from LandingPage
  useEffect(() => {
    if (!prefill) return;
    if (RWANDA_SUBJECTS.includes(prefill.subject)) {
      setSubject(prefill.subject);
      setCustomSubject('');
    } else if (prefill.subject) {
      setSubject('Other');
      setCustomSubject(prefill.subject);
    }
    if (RWANDA_CLASSES.includes(prefill.classLevel)) {
      setClassLevel(prefill.classLevel);
    }
    setMobileTab('setup');
  }, [prefill?.nonce]);

  // Sync form inputs when a saved plan is opened from My Plans
  useEffect(() => {
    if (!activePlan) return;
    if (selfUpdatedPlanRef.current === activePlan) return;

    if (activePlan.schoolName) setSchoolName(activePlan.schoolName);
    if (activePlan.teacherName) setTeacherName(activePlan.teacherName);
    const matchedSubject = RWANDA_SUBJECTS.includes(activePlan.subject);
    if (matchedSubject) {
      setSubject(activePlan.subject);
      setCustomSubject('');
    } else if (activePlan.subject) {
      setSubject('Other');
      setCustomSubject(activePlan.subject);
    }
    if (RWANDA_CLASSES.includes(activePlan.classLevel)) {
      setClassLevel(activePlan.classLevel);
    }
    if (activePlan.lessonTitle) setTopic(activePlan.lessonTitle);
    if (activePlan.unitNo) setUnitNo(activePlan.unitNo);
    setUnitTitle(activePlan.unitTitle || '');
    if (activePlan.lessonNo) setLessonNo(activePlan.lessonNo);
    if (activePlan.durationMinutes) setDurationStr(String(activePlan.durationMinutes));
    if (activePlan.classSize) setLearners(String(activePlan.classSize));
    if (activePlan.date) setDate(activePlan.date);
    if (activePlan.sen) setSen(activePlan.sen);
    setMobileTab('preview');
  }, [activePlan]);

  const duration = Math.max(10, Math.min(240, parseInt(durationStr, 10) || 40));

  const applyDurationMinutes = (mins: number) => {
    const clamped = Math.max(10, Math.min(240, Math.round(mins)));
    setDurationStr(String(clamped));
    if (activePlan) {
      const oldTotal =
        activePlan.stages.reduce((s, st) => s + (Number(st.timingMinutes) || 0), 0) ||
        activePlan.durationMinutes ||
        40;
      const scaledStages = activePlan.stages.map((st, idx) => {
        if (idx === activePlan.stages.length - 1) return st;
        const ratio = (Number(st.timingMinutes) || 0) / oldTotal;
        return { ...st, timingMinutes: Math.max(2, Math.round(clamped * ratio)) };
      });
      const usedBeforeLast = scaledStages
        .slice(0, -1)
        .reduce((s, st) => s + st.timingMinutes, 0);
      if (scaledStages.length > 0) {
        const lastIdx = scaledStages.length - 1;
        scaledStages[lastIdx] = {
          ...scaledStages[lastIdx],
          timingMinutes: Math.max(1, clamped - usedBeforeLast),
        };
      }
      setPlanFromSelf(
        {
          ...activePlan,
          durationMinutes: clamped,
          stages: scaledStages,
        },
        false
      );
    }
  };

  useEffect(() => {
    if (profile.defaultTerm) setTerm(profile.defaultTerm);
    if (profile.schoolName && !schoolName) setSchoolName(profile.schoolName);
    if (profile.teacherName && !teacherName) setTeacherName(profile.teacherName);
  }, [profile.defaultTerm, profile.schoolName, profile.teacherName]);

  const effectiveSubject = subject === 'Other' ? customSubject.trim() : subject;

  const handleSampleLesson = () => {
    setErrorMsg(null);
    setClarification(null);
    setQualityReport(null);
    const chosenSubject = effectiveSubject || 'Mathematics';
    const chosenClass = classLevel || 'P4';
    const rawTopic = cleanTopicLabel(topic);
    const total = Number(duration) || 40;
    const { intro, dev, concl } = splitDurationMinutes(total);
    const localizedTerm = translate(lang, `term_${term.replace(/\s+/g, '_').toLowerCase()}`) || term;
    const activeDate = date || new Date().toISOString().slice(0, 10);
    const activeSen = sen.trim() || 'Slow learners (2), Mild visual impairment (1)';
    const activeSize = learners.trim() || '40';

    const isKinyarwandaSample =
      lang === 'rw' || /\b(i?kinyarwanda)\b/i.test(chosenSubject);

    if (isKinyarwandaSample) {
      // Never silently switch the teacher's selected subject
      const rwSubject = chosenSubject;
      const rwTopic =
        rawTopic ||
        (rwSubject.toLowerCase().includes('kinyarwanda')
          ? 'Gusoma no gusesengura umwandiko'
          : `${rwSubject} — Isomo ry'ifatizo`);
      const rwUnit = unitTitle.trim() || `Umutwe wa ${unitNo || '1'}: ${rwTopic}`;
      if (!topic.trim()) setTopic(rwTopic);
      if (!unitTitle.trim()) setUnitTitle(rwUnit);

      const rwPlan: LessonPlanData = {
        schoolName: schoolName.trim() || profile.schoolName || 'GS Kigali',
        teacherName: teacherName.trim() || profile.teacherName || 'Jean Bosco Mugisha',
        term: localizedTerm,
        date: activeDate,
        subject: rwSubject,
        classLevel: chosenClass,
        unitNo: unitNo || '1',
        lessonNo: lessonNo || '1 of 4',
        durationMinutes: total,
        classSize: activeSize,
        sen: activeSen,
        unitTitle: rwUnit,
        keyUnitCompetence: `Gushobora gusoma neza, gusobanura igitekerezo nyamukuru no gukoresha imvugo inoze kuri ${rwTopic.toLowerCase()} mu isomo rya ${rwSubject} (${chosenClass}).`,
        lessonTitle: rwTopic,
        instructionalObjective: `Bahawe umwandiko n'amakarita y'amagambo mu matsinda, abanyeshuri ba ${chosenClass} bazashobora gusoma no gusubiza ibibazo kuri "${rwTopic}" neza (byibura ibibazo 4 kuri 5).`,
        planLocation: 'Imbere mu ishuri — abanyeshuri bicaye mu matsinda avanze y’abanyeshuri 5.',
        learningMaterials: `Igitabo cy'umunyeshuri cya REB (${rwSubject} ${chosenClass}), ikibaho, ingwa, amakarita yanditse mu nyuguti nini, n'amafoto ajyanye n'isomo.`,
        references: `Integanyanyigisho ya REB n'Igitabo cy'Umwarimu bya ${rwSubject} (${chosenClass}), Umutwe wa ${unitNo || '1'} — genzura amapaji kuri elearning.reb.rw.`,
        activityOverview: `Abanyeshuri barasoma mu matsinda, bungurane ibitekerezo ku magambo mashya kandi bakore imyitozo kuri "${rwTopic}" mu buryo buri wese yibonamo.`,
        stages: [
          {
            id: `sample_intro_${Date.now()}`,
            stageType: 'intro',
            stageName: t('cbc_stage_intro'),
            timingMinutes: intro,
            teacherActivities: `1. Gusuhuza abanyeshuri, kubara abitabiriye no kureba ko abafite ibyihariye (${activeSen}) bafashijwe mu myanya myiza.\n2. Kubaza ibibazo 2 byoroshye bihuje ubuzima busanzwe n'isomo rya "${rwTopic}".\n3. Kwandika umutwe w'isomo ku kibaho mu nyandiko isobanutse.\n4. Gusobanurira abanyeshuri intego y'isomo n'ubushobozi bwitezwe muri iri somo.`,
            learnerActivities: `1. Kwikiriza umwarimu neza no gutegura amakayi n'amakaramu.\n2. Gusubiza ibibazo by'umwarimu bakoresheje ingero zo mu buzima busanzwe.\n3. Gusoma umutwe w'isomo mu ijwi riranguruye no kuwandika mu makayi.\n4. Kugaragaza muri make ibyo biteze kwiga no kunguka muri iri somo.`,
            competencesAndIssues:
              'Itumanaho: abanyeshuri batanga ibitekerezo mu Kinyarwanda cyumvikana.\nUburezi budaheza: imyanya y’imbere n’amakarita yanditse mu nyuguti nini bifasha buri munyeshuri.',
          },
          {
            id: `sample_dev_${Date.now()}`,
            stageType: 'development',
            stageName: t('cbc_stage_body'),
            timingMinutes: dev,
            teacherActivities: `1. Igikorwa mu matsinda: Guha buri tsinda ry'abanyeshuri 5 umwandiko n'amakarita y'amagambo kuri "${rwTopic}".\n2. Gusaba abanyeshuri gusoma bucece no gushakira hamwe ibisobanuro by'amagambo mashya.\n3. Gutembera mu ishuri ugenzura ko buri munyeshuri arimo gufashwa kandi atanga igitekerezo.\n4. Gutumira abahagarariye amatsinda kumurika ibyo bagezeho ku kibaho mu buryo busobanutse.\n5. Kunoza no gukosora imyandikire n'imvugo, ugashimangira iby'ingenzi bigize isomo.\n6. Guha abanyeshuri imyitozo 3 yo gusobanura no gusesengura mu makayi yabo.`,
            learnerActivities: `1. Kwicara mu matsinda y'abanyeshuri 5 no gusoma umwandiko bahawe bucece.\n2. Gusesengura amagambo mashya no kungurana ibitekerezo mu bwubahane.\n3. Kwandika imyanzuro n'ibisubizo by'itsinda ku rupapuro rwo kumurika.\n4. Kumurika ibisubizo by'itsinda imbere y'abandi banyeshuri.\n5. Kwandika incamake yemejwe n'umwarimu mu makayi yabo.\n6. Gukora imyitozo 3 y'isuzuma mu makayi ku giti cyabo no gukosora amakosa.`,
            competencesAndIssues:
              'Gutekereza byimbitse n’Ubufatanye: abanyeshuri basesengura umwandiko mu matsinda.\nAmahoro n’indangagaciro n’Uburinganire: abahungu n’abakobwa bahabwa ijambo mu buryo bungana kandi bakumvana mu bwubahane.',
          },
          {
            id: `sample_concl_${Date.now()}`,
            stageType: 'conclusion',
            stageName: t('cbc_stage_concl'),
            timingMinutes: concl,
            teacherActivities: `1. Gufasha abanyeshuri kuvuga mu nteruro ngufi ibyo bize n'isomo rikomeye bakuyemo.\n2. Uburyo bw'isuzuma: Kubaza ibibazo 2 by'isuzuma rya nyuma mu makayi kugira ngo umwarimu amenye niba intego y'isomo yagezweho.\n3. Gutanga inama no gushimira abanyeshuri bose ku bwitange n'ubufatanye bagaragaje.`,
            learnerActivities: `1. Kuvuga mu magambo yabo amasomo akomeye bakuye muri iri somo.\n2. Gusubiza ibibazo 2 by'isuzuma rya nyuma mu makayi ku giti cyabo.\n3. Gutega amatwi inama z'umwarimu no gutunganya ibikoresho by'ishuri.`,
            competencesAndIssues:
              'Kwiga ubuzima bwose: abanyeshuri basobanukirwa agaciro ko kwisomera umwandiko.\nUmuco w’ubuziranenge: kwandika no kuvuga Ikinyarwanda cy’umwimerere kitagira amakosa.',
          },
        ],
        teacherSelfEvaluation: `Bizuzuzwa n'umwarimu nyuma yo kwigisha: (1) Andika umubare w'abanyeshuri bashoboye kugera ku ntego y'isomo "${rwTopic}" mu isuzuma ryo mu minota ${total}. (2) Garagaza ibikorwa n'imfashanyigisho byafashije cyane harimo n'ubufasha bwa (${activeSen}). (3) Teganya imyitozo yo gufasha abatarabonye intego neza mu isomo ritaha.`,
      };

      setPlanFromSelf(rwPlan);
      onToast(t('toast_sample_loaded'), 'success');
      return;
    }

    const isSreEquity =
      chosenSubject === 'Social and Religious Education (SRE)' ||
      chosenSubject === 'Social & Religious Studies (SRS)' ||
      (!effectiveSubject && /\bequity\b|\bequality\b/i.test(rawTopic));

    const isDefaultMathSample =
      chosenSubject === 'Mathematics' && (!rawTopic || /\bfraction/i.test(rawTopic));

    if (isSreEquity) {
      const sreTopic = rawTopic || 'Equity and Equality';
      const sreUnit = unitTitle.trim() || 'Human Rights, Equity, and Social Cohesion';
      if (!topic.trim()) setTopic(sreTopic);
      if (!unitTitle.trim()) setUnitTitle(sreUnit);

      const srePlan: LessonPlanData = {
        schoolName: schoolName.trim() || profile.schoolName || 'GS Kigali',
        teacherName: teacherName.trim() || profile.teacherName || 'Jean Bosco Mugisha',
        term: localizedTerm,
        date: activeDate,
        subject: 'Social and Religious Education (SRE)',
        classLevel: chosenClass,
        unitNo: unitNo || '1',
        lessonNo: lessonNo || '1 of 4',
        durationMinutes: total,
        classSize: activeSize,
        sen: activeSen,
        unitTitle: sreUnit,
        keyUnitCompetence: `To be able to explain ${sreTopic.toLowerCase()}, value fairness in the community, and treat all people with respect.`,
        lessonTitle: sreTopic,
        instructionalObjective: `Using real-life picture cards in small groups, ${chosenClass} students will be able to explain the difference between equity and equality and give at least 3 ways to practice fairness at school and at home.`,
        planLocation: 'Inside the classroom — students sit in mixed-ability groups of 5.',
        learningMaterials:
          'Picture cards, chalkboard, chalk, large-print word cards (for visual support), REB Social and Religious Education Learner’s Book.',
        references: `REB (2020) Social and Religious Education for Rwandan Primary Schools ${chosenClass} Teacher’s Guide & Learner’s Book, Unit ${unitNo || '1'}.`,
        activityOverview: `Students look at simple pictures, talk in pairs, and act out short role-plays to understand the difference between giving everyone the exact same thing (equality) and giving each person what they need to succeed (equity).`,
        stages: [
          {
            id: `sample_intro_${Date.now()}`,
            stageType: 'intro',
            stageName: t('cbc_stage_intro'),
            timingMinutes: intro,
            teacherActivities:
              '1. Greet students warmly, check attendance, and seat students who need visual support near the chalkboard.\n2. Show a picture of children of different heights trying to watch a match over a fence using wooden boxes.\n3. Ask students: "If we give each child one box, can the shortest child see over the fence? What is fair?"\n4. Connect their ideas to fairness and write the lesson title: Equity and Equality.',
            learnerActivities:
              '1. Greet the teacher and settle into mixed-ability groups of 5.\n2. Observe the picture card carefully and think about what each child needs.\n3. Discuss in pairs which box arrangement is fair and share responses with the whole class.\n4. Read the lesson title aloud together and write it in notebooks.',
            competencesAndIssues:
              'Communication: students explain their ideas in simple, clear words.\nInclusive education: students discuss why some learners need different support to succeed.',
          },
          {
            id: `sample_dev_${Date.now()}`,
            stageType: 'development',
            stageName: t('cbc_stage_body'),
            timingMinutes: dev,
            teacherActivities:
              '1. Distribute two case study cards to each group: Card A shows giving the exact same book to every student, while Card B shows providing large-print to a student with low vision.\n2. Guide each group to examine both cards and answer: "Which card shows equal treatment? Which card shows fair support (equity)?"\n3. Move from group to group, prompting students to explain their reasoning and supporting struggling learners.\n4. Invite group leaders to share findings and write the two key definitions on the chalkboard.\n5. Clarify that equality means giving everyone the same, while equity means giving each person what they need to succeed.\n6. Assign each group a practical school scenario (sharing library books, taking turns cleaning, supporting an injured classmate) to role-play.\n7. Observe student role-plays, ensuring boys and girls participate equally and treat each other respectfully.',
            learnerActivities:
              '1. Read and examine Card A and Card B together in small groups of 5.\n2. Discuss why giving everyone the exact same resource is not always fair when learners have different needs.\n3. Record group ideas and arguments in exercise books.\n4. Present group findings to the class with concrete reasons.\n5. Copy the confirmed definitions of equality and equity into notebooks.\n6. Practice short 1-minute role-plays demonstrating fairness in daily school situations.\n7. Provide respectful, constructive feedback on other groups’ role-plays.',
            competencesAndIssues:
              'Critical thinking and Cooperation: students compare real-life cases together.\nGender and Peace and values education: boys and girls lead equally and show respect.',
          },
          {
            id: `sample_concl_${Date.now()}`,
            stageType: 'conclusion',
            stageName: t('cbc_stage_concl'),
            timingMinutes: concl,
            teacherActivities:
              '1. Guide learners to synthesize the main difference between equity and equality in simple words.\n2. Ask 2 quick oral exit check questions to verify understanding of fairness in school.\n3. Provide positive summary feedback celebrating inclusive class teamwork.',
            learnerActivities:
              '1. State one clear real-life difference between equity and equality in their own words.\n2. Answer the exit check questions thoughtfully.\n3. State one concrete way they will practice fairness with their peers today.',
            competencesAndIssues:
              'Lifelong learning: students connect fairness lessons to life outside school.\nPeace and values education: students practice kindness and fairness daily.',
          },
        ],
        teacherSelfEvaluation:
          `To be completed by the teacher after teaching: (1) Record the actual number of learners who explained equity vs. equality and gave 3 school/home fairness examples during the ${total}-minute lesson. (2) Note which picture cards, role-play tasks, and SEN adaptations (${activeSen}) worked effectively. (3) Plan remedial coaching or extension work for the next lesson.`,
      };

      setPlanFromSelf(srePlan);
      onToast(t('toast_sample_loaded'), 'success');
      return;
    }

    if (isDefaultMathSample) {
      const mathTopic = rawTopic || 'Addition of Fractions with the Same Denominator';
      const mathUnit = unitTitle.trim() || 'Fractions';
      setSubject('Mathematics');
      setCustomSubject('');
      setUnitNo(unitNo || '4');
      setUnitTitle(mathUnit);
      setLessonNo(lessonNo || '2 of 6');
      setTopic(mathTopic);

      const samplePlan: LessonPlanData = {
        schoolName: schoolName.trim() || profile.schoolName || 'GS Kigali',
        teacherName: teacherName.trim() || profile.teacherName || 'Jean Bosco Mugisha',
        term: localizedTerm,
        date: activeDate,
        subject: 'Mathematics',
        classLevel: chosenClass,
        unitNo: unitNo || '4',
        lessonNo: lessonNo || '2 of 6',
        durationMinutes: total,
        classSize: activeSize,
        sen: activeSen,
        unitTitle: mathUnit,
        keyUnitCompetence:
          'To be able to compare, add, and subtract fractions with the same denominator in everyday life.',
        lessonTitle: mathTopic,
        instructionalObjective: `Using folded paper strips and fraction charts in small groups, ${chosenClass} students will be able to add fractions with the same denominator and get at least 4 out of 5 questions right.`,
        planLocation: 'Inside the classroom — students sit in mixed-ability groups of 6.',
        learningMaterials:
          'Folded paper strips, large-print fraction charts (for visually impaired student), chalkboard, chalk, REB Mathematics Learner’s Book.',
        references: `REB (2020) Mathematics for Rwandan Primary Schools ${chosenClass} Teacher’s Guide & Learner’s Book, Unit ${unitNo || '4'}.`,
        activityOverview:
          'Students fold paper strips in groups to discover how to add fractions with the same bottom number (denominator), share answers, and practice on their own.',
        stages: [
          {
            id: `sample_intro_${Date.now()}`,
            stageType: 'intro',
            stageName: t('cbc_stage_intro'),
            timingMinutes: intro,
            teacherActivities:
              '1. Greet students, check attendance, and seat students who need clear vision in the front row.\n2. Draw a circle cut into 4 equal parts on the board, shade 1 part, and ask students to name the fraction.\n3. Connect this to sharing an orange at home and write the lesson title on the board: Addition of Fractions with the Same Denominator.\n4. Explain today’s lesson objective: adding fractions with the same bottom number without adding the denominators.',
            learnerActivities:
              '1. Greet the teacher and take out notebooks and pens.\n2. Name the shaded fraction (1/4) and share everyday examples of equal sharing.\n3. Read and copy the lesson title into notebooks.\n4. State the main goal they want to accomplish during the lesson.',
            competencesAndIssues:
              'Communication: students explain what they remember clearly.\nPeace and values education: students take turns and listen politely.',
          },
          {
            id: `sample_dev_${Date.now()}`,
            stageType: 'development',
            stageName: t('cbc_stage_body'),
            timingMinutes: dev,
            teacherActivities:
              '1. Group Discovery: Give each group a paper strip divided into 4 equal parts. Ask them to color 1/4 blue and 2/4 green, then count all colored parts.\n2. Guide learners to observe what happened to the denominator (bottom number) versus numerator (top number).\n3. Ask 2 groups to present their strips on the chalkboard and share what they notice.\n4. Explain and write the clear mathematical rule: add the top numbers (numerators) and keep the bottom number (denominator) the same.\n5. Write 3 practice questions (2/5 + 1/5, 3/8 + 4/8, 1/6 + 4/6) on the board and guide paired practice.\n6. Walk around the room providing individual support to struggling learners and giving a bonus question (3/10 + 4/10 + 1/10) to fast finishers.',
            learnerActivities:
              '1. Fold and color paper strips in groups, count 1/4 + 2/4 = 3/4, and discuss why the strip still has 4 parts in total.\n2. Compare findings with neighboring peers and formulate the addition pattern.\n3. Present group solutions on the board clearly explaining the steps.\n4. Copy the addition rule and diagrams neatly into mathematics exercise books.\n5. Solve the 3 practice questions in pairs, taking turns calculating and verifying answers.\n6. Check final solutions against the chalkboard and explain any errors found.',
            competencesAndIssues:
              'Cooperation and Critical thinking: students work together and notice why the bottom number does not change.\nGender and Inclusive education: boys and girls lead groups equally; large-print strips help everyone follow.',
          },
          {
            id: `sample_concl_${Date.now()}`,
            stageType: 'conclusion',
            stageName: t('cbc_stage_concl'),
            timingMinutes: concl,
            teacherActivities:
              '1. Ask students to state the rule for adding fractions with the same denominator in simple words.\n2. Give a 2-question exit check (3/7 + 2/7 = ?, 1/9 + 5/9 = ?) and check answers together.\n3. Summarize key takeaways, praise active participation, and remind learners not to add denominators.',
            learnerActivities:
              '1. Say the rule aloud in their own words: add numerators, keep denominator unchanged.\n2. Solve the 2 exit questions independently in exercise books.\n3. Verify results and note personal areas for extra practice.',
            competencesAndIssues:
              'Standardization culture: students write fractions neatly and correctly.\nLifelong learning: students connect fractions to daily household measurements.',
          },
        ],
        teacherSelfEvaluation: `To be completed by the teacher after teaching: (1) Record the actual number of learners who correctly solved both exit questions without adding denominators during the ${total}-minute lesson. (2) Evaluate how well the folded paper strips and SEN adaptations (${activeSen}) supported learner mastery. (3) Specify follow-up remedial practice with fraction strips for learners who need support.`,
      };

      setPlanFromSelf(samplePlan);
      onToast(t('toast_sample_loaded'), 'success');
      return;
    }

    // Dynamic REB CBC lesson plan adapted to Subject, Class, Topic, and Duration
    const dynamicTopic = rawTopic || `${chosenSubject} Core Lesson`;
    const dynamicUnit = unitTitle.trim() || `${dynamicTopic} Unit`;
    if (!topic.trim()) setTopic(dynamicTopic);
    if (!unitTitle.trim()) setUnitTitle(dynamicUnit);

    const subjLower = `${chosenSubject} ${dynamicTopic}`.toLowerCase();
    const topicCompetencePair = /bio|chem|phys|science|set|env|water|plant|forest|soil/.test(subjLower)
      ? {
          devComp:
            'Research and problem solving & Critical thinking: students observe real examples and explain how the concept works.\nEnvironment and sustainability: students discuss how to care for nature and resources safely.',
          conclComp:
            'Standardization culture: students use correct scientific words and units.\nLifelong learning: students apply science habits at home.',
        }
      : /entrep|econ|busin|money|budget|tax|math/.test(subjLower)
      ? {
          devComp:
            'Critical thinking and Problem solving: students solve practical everyday problems step by step.\nFinancial education & Gender: boys and girls share leadership equally and link ideas to wise money use.',
          conclComp:
            'Standardization culture: students check accuracy in their answers.\nLifelong learning: students build confidence for daily life.',
        }
      : /hist|sre|srs|relig|peace|right|genocide|citizen/.test(subjLower)
      ? {
          devComp:
            'Critical thinking and Cooperation: students discuss community stories respectfully in groups.\nPeace and values education & Gender: students value fairness, unity, and equal participation.',
          conclComp:
            'Lifelong learning: students apply positive values at school and home.\nInclusive education: every student’s voice is respected.',
        }
      : {
          devComp:
            'Creativity and innovation & Cooperation: students share original examples and work well in groups.\nGender & Peace and values education: boys and girls take equal turns speaking and listening.',
          conclComp:
            'Communication: students summarize key points clearly.\nLifelong learning: students practice skills independently.',
        };

    const dynamicPlan: LessonPlanData = {
      schoolName: schoolName.trim() || profile.schoolName || 'GS Kigali',
      teacherName: teacherName.trim() || profile.teacherName || 'Jean Bosco Mugisha',
      term: localizedTerm,
      date: activeDate,
      subject: chosenSubject,
      classLevel: chosenClass,
      unitNo: unitNo || '1',
      lessonNo: lessonNo || '1 of 4',
      durationMinutes: total,
      classSize: activeSize,
      sen: activeSen,
      unitTitle: dynamicUnit,
      keyUnitCompetence: `To be able to understand, explain, and use key ideas of ${dynamicTopic} in daily ${chosenClass} ${chosenSubject} tasks.`,
      lessonTitle: dynamicTopic,
      instructionalObjective: `Using simple charts, everyday examples, and group work, ${chosenClass} students will be able to explain and apply ${dynamicTopic} correctly, getting at least 4 out of 5 questions right.`,
      planLocation: 'Inside the classroom — students sit in mixed-ability groups.',
      learningMaterials: `REB ${chosenClass} ${chosenSubject} Learner’s Book, chalkboard, chalk, simple topic charts, large-print cards, and local materials.`,
      references: `REB (2020) ${chosenSubject} Syllabus & Teacher’s Guide for ${chosenClass}, Unit ${unitNo || '1'}.`,
      activityOverview: `Students learn ${dynamicTopic} step by step through simple examples, group discussion, and guided class practice.`,
      stages: [
        {
          id: `sample_intro_${Date.now()}`,
          stageType: 'intro',
          stageName: t('cbc_stage_intro'),
          timingMinutes: intro,
          teacherActivities: `1. Greet students warmly, check attendance, and ensure learners with special educational needs sit in front.\n2. Ask 2 diagnostic questions linking everyday life to ${dynamicTopic}.\n3. Write the lesson title "${dynamicTopic}" clearly on the chalkboard.\n4. Share today’s competence goal so students know what they will achieve.`,
          learnerActivities: `1. Greet the teacher and organize learning materials at their desks.\n2. Answer review questions using everyday examples connected to ${dynamicTopic}.\n3. Read and copy the lesson title into notebooks.\n4. Restate today’s lesson objective in their own words.`,
          competencesAndIssues:
            'Communication: students share ideas in simple, clear words.\nInclusive education: good seating and clear speech help every student participate.',
        },
        {
          id: `sample_dev_${Date.now()}`,
          stageType: 'development',
          stageName: t('cbc_stage_body'),
          timingMinutes: dev,
          teacherActivities: `1. Group Task: Give mixed-ability groups of 5 a structured task on ${dynamicTopic} with concrete examples.\n2. Circulate among groups to guide discussions, prompt critical thinking, and support struggling learners.\n3. Invite group representatives to present findings and record key observations on the board.\n4. Synthesize class contributions and clearly explain core concepts of ${dynamicTopic}.\n5. Provide 2–3 guided practice questions for students to solve in pairs.\n6. Review paired responses on the board, address common misconceptions, and provide positive reinforcement.`,
          learnerActivities: `1. Work collaboratively in groups of 5 on the assigned task and record observations.\n2. Discuss key questions actively, ensuring all group members contribute.\n3. Present group findings to the class and answer questions from peers.\n4. Copy the confirmed summary of ${dynamicTopic} into notebooks.\n5. Solve the guided practice questions in pairs, verifying each step together.\n6. Self-correct their work based on the class review and teacher feedback.`,
          competencesAndIssues: topicCompetencePair.devComp,
        },
        {
          id: `sample_concl_${Date.now()}`,
          stageType: 'conclusion',
          stageName: t('cbc_stage_concl'),
          timingMinutes: concl,
          teacherActivities: `1. Guide students to summarize the 3 main takeaways of ${dynamicTopic}.\n2. Ask 2 quick exit check questions to evaluate individual mastery of the lesson objective.\n3. Offer constructive feedback on group participation and lesson engagement.`,
          learnerActivities: `1. State the main takeaways of ${dynamicTopic} in their own words.\n2. Answer the exit check questions independently in exercise books.\n3. Reflect on how they will use the lesson concepts in daily life.`,
          competencesAndIssues: topicCompetencePair.conclComp,
        },
      ],
      teacherSelfEvaluation: `To be completed by the teacher after teaching: (1) Record the actual number of learners who achieved the instructional objective on ${dynamicTopic} (${chosenClass} ${chosenSubject}) during the ${total}-minute exit assessment. (2) Note which group activities, learning aids, and SEN adaptations (${activeSen}) were effective. (3) Specify remedial or extension follow-up actions for the next session.`,
    };

    setPlanFromSelf(dynamicPlan);
    onToast(t('toast_sample_loaded'), 'success');
  };

  const handleBlankTemplate = () => {
    setErrorMsg(null);
    setClarification(null);
    setQualityReport(null);
    const total = Number(duration) || 40;
    const { intro, dev, concl } = splitDurationMinutes(total);

    const blank: LessonPlanData = {
      schoolName: schoolName.trim() || profile.schoolName || '',
      teacherName: teacherName.trim() || profile.teacherName || '',
      term: translate(lang, `term_${term.replace(/\s+/g, '_').toLowerCase()}`) || term,
      date: date || new Date().toISOString().slice(0, 10),
      subject: effectiveSubject || 'Subject',
      classLevel: classLevel || 'P4',
      unitNo: unitNo || '1',
      lessonNo: lessonNo || '1 of 4',
      durationMinutes: total,
      classSize: learners || '40',
      sen: sen || 'None (0)',
      unitTitle: unitTitle || '',
      keyUnitCompetence: '',
      lessonTitle: cleanTopicLabel(topic) || '',
      instructionalObjective: '',
      planLocation: 'Inside the classroom',
      learningMaterials: '',
      references: '',
      activityOverview: '',
      stages: [
        {
          id: 'blank_intro',
          stageType: 'intro',
          stageName: t('cbc_stage_intro'),
          timingMinutes: intro,
          teacherActivities: '1. \n2. \n3. ',
          learnerActivities: '1. \n2. \n3. ',
          competencesAndIssues: '',
        },
        {
          id: 'blank_dev',
          stageType: 'development',
          stageName: t('cbc_stage_body'),
          timingMinutes: dev,
          teacherActivities: '1. \n2. \n3. ',
          learnerActivities: '1. \n2. \n3. ',
          competencesAndIssues: '',
        },
        {
          id: 'blank_concl',
          stageType: 'conclusion',
          stageName: t('cbc_stage_concl'),
          timingMinutes: concl,
          teacherActivities: '1. \n2. \n3. ',
          learnerActivities: '1. \n2. \n3. ',
          competencesAndIssues: '',
        },
      ],
      teacherSelfEvaluation: '',
    };
    setPlanFromSelf(blank);
    onToast(t('toast_blank_created'), 'info');
  };

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRetryCountdown(null);
    setLoading(false);
    onToast(t('toast_gen_cancelled'), 'info');
  };

  const runLessonAi = async (
    mode: 'generate' | 'complete_missing',
    overrides?: { subject?: string; classLevel?: string; confirmOverride?: boolean }
  ) => {
    if (maintenanceMode) {
      const msg = 'GHAD AI is currently in maintenance mode. AI lesson generation is temporarily paused.';
      setErrorMsg(msg);
      onToast(msg, 'warning');
      return;
    }
    const draftPlan = mode === 'complete_missing' ? activePlan || undefined : undefined;
    const resolvedSubject =
      (overrides?.subject ?? effectiveSubject) || (draftPlan?.subject || '').trim();
    const resolvedClass =
      (overrides?.classLevel ?? classLevel).trim() || (draftPlan?.classLevel || '').trim();
    const cleanedTopic = cleanTopicLabel(topic || draftPlan?.lessonTitle || '');
    const resolvedUnitTitle = (unitTitle || draftPlan?.unitTitle || '').trim();
    const resolvedUnitNo = (unitNo || draftPlan?.unitNo || '').trim();

    if (
      !resolvedSubject ||
      !resolvedClass ||
      (!cleanedTopic && !resolvedUnitTitle && !resolvedUnitNo && !draftPlan)
    ) {
      const msg = t('toast_fill');
      setErrorMsg(msg);
      onToast(msg, 'error');
      return;
    }

    if (cleanedTopic && cleanedTopic !== topic) {
      setTopic(cleanedTopic);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setErrorMsg(null);
    setClarification(null);
    setQualityReport(null);
    setRetryCountdown(null);
    setLoading(true);

    const payload = {
      lang,
      subject: resolvedSubject,
      classLevel: resolvedClass,
      topic: cleanedTopic,
      duration: Number(duration) || Number(draftPlan?.durationMinutes) || 40,
      unitNo: resolvedUnitNo,
      unitTitle: resolvedUnitTitle,
      lessonNo: (lessonNo || draftPlan?.lessonNo || '').trim(),
      learners: Number(learners) || Number(draftPlan?.classSize) || 40,
      term: (term || draftPlan?.term || 'Term 1').trim(),
      date: (date || draftPlan?.date || '').trim(),
      sen: (sen || draftPlan?.sen || '').trim(),
      schoolName: (schoolName || draftPlan?.schoolName || profile?.schoolName || '').trim(),
      teacherName: (teacherName || draftPlan?.teacherName || profile?.teacherName || '').trim(),
      extra: (extra || '').trim(),
      mode,
      confirmOverride: Boolean(overrides?.confirmOverride),
      existingPlan: draftPlan,
      signal: controller.signal,
    };

    try {
      let result: LessonPlanApiResult;
      try {
        result = await requestLessonPlan(payload);
      } catch (firstErr) {
        if (firstErr instanceof AiClientError && firstErr.isAborted) return;
        if (firstErr instanceof AiClientError && firstErr.isHighDemand) {
          for (let sec = 3; sec >= 1; sec--) {
            if (controller.signal.aborted) return;
            setRetryCountdown(sec);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setRetryCountdown(null);
          if (controller.signal.aborted) return;
          result = await requestLessonPlan(payload);
        } else {
          throw firstErr;
        }
      }

      if (controller.signal.aborted) return;
      if (result.clarificationRequired) {
        setClarification(result.clarification);
        setMobileTab('setup');
        onToast(result.clarification.title, 'warning');
        return;
      }

      const generated = result.plan;
      setQualityReport(result.qualityReport || null);
      if (!cleanedTopic && generated.lessonTitle) setTopic(generated.lessonTitle);
      if (!resolvedUnitTitle && generated.unitTitle) setUnitTitle(generated.unitTitle);
      if (generated.schoolName && !schoolName) setSchoolName(generated.schoolName);
      if (generated.teacherName && !teacherName) setTeacherName(generated.teacherName);
      setPlanFromSelf(generated);
      onToast(mode === 'complete_missing' ? t('toast_completed') : t('toast_lesson'), 'success');
    } catch (err) {
      if (err instanceof AiClientError && err.isAborted) return;
      const msg = err instanceof Error ? err.message : t('toast_net');
      setErrorMsg(msg);
      onToast(`${t('toast_net')}: ${msg}`, 'error');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setRetryCountdown(null);
      setLoading(false);
    }
  };

  const handleGenerate = () => runLessonAi('generate');
  const handleCompleteMissing = () => runLessonAi('complete_missing');

  const applyClarificationFix = (opts: { subject?: string; classLevel?: string; confirmOverride?: boolean }) => {
    if (opts.subject) {
      if (RWANDA_SUBJECTS.includes(opts.subject)) {
        setSubject(opts.subject);
        setCustomSubject('');
      } else {
        setSubject('Other');
        setCustomSubject(opts.subject);
      }
    }
    if (opts.classLevel && RWANDA_CLASSES.includes(opts.classLevel)) {
      setClassLevel(opts.classLevel);
    }
    void runLessonAi('generate', opts);
  };

  const hasMissingPlanSections = Boolean(
    activePlan &&
      (!activePlan.unitTitle.trim() ||
        !activePlan.keyUnitCompetence.trim() ||
        !activePlan.lessonTitle.trim() ||
        !activePlan.instructionalObjective.trim() ||
        !activePlan.learningMaterials.trim() ||
        !activePlan.references.trim() ||
        !activePlan.activityOverview.trim() ||
        !activePlan.teacherSelfEvaluation.trim() ||
        /_{2,}/.test(activePlan.teacherSelfEvaluation) ||
        activePlan.stages.some(
          (st) =>
            !st.teacherActivities.replace(/\d+[.)]\s*/g, '').trim() ||
            !st.learnerActivities.replace(/\d+[.)]\s*/g, '').trim() ||
            !st.competencesAndIssues.trim()
        ))
  );

  const formTopicNorm = cleanTopicLabel(topic).toLowerCase();
  const activeTopicNorm = cleanTopicLabel(activePlan?.lessonTitle || '').toLowerCase();
  const planOutOfSyncWithForm = Boolean(
    activePlan &&
      !loading &&
      ((effectiveSubject &&
        activePlan.subject &&
        effectiveSubject.toLowerCase() !== activePlan.subject.toLowerCase()) ||
        (classLevel && activePlan.classLevel && classLevel !== activePlan.classLevel) ||
        (formTopicNorm && activeTopicNorm && formTopicNorm !== activeTopicNorm))
  );

  return (
    <section id="view-lesson" className="view-animate space-y-5">
      {/* Header */}
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 data-i18n="lesson_title" className="font-display text-2xl font-bold text-[var(--text)]">
            {t('lesson_title')}
          </h1>
          <p data-i18n="lesson_sub" className="text-sm text-[var(--muted)] mt-1">
            {t('lesson_sub')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleSampleLesson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#F59E0B] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span data-i18n="btn_sample">{t('btn_sample')}</span>
          </button>
          <button
            id="newBtn"
            type="button"
            disabled={loading}
            onClick={handleBlankTemplate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" />
            <span data-i18n="btn_blank">{t('btn_blank')}</span>
          </button>
        </div>
      </div>

      {maintenanceMode && (
        <MaintenanceNotice variant="workspace" onReturnHome={onBackHome} />
      )}

      {/* Mobile Stacked Tabs */}
      <div className="no-print holo-glass xl:hidden flex items-center gap-1 p-1 rounded-xl border border-[#38bdf8]/25">
        <button
          type="button"
          onClick={() => setMobileTab('setup')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            mobileTab === 'setup'
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{t('tab_setup')}</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            mobileTab === 'preview'
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('tab_sheet')} {activePlan ? `(${activePlan.durationMinutes}m)` : ''}</span>
        </button>
      </div>

      {/* Responsive Split-Screen Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Input Form & Generation Controls */}
        <div
          className={`no-print xl:col-span-5 space-y-4 ${
            mobileTab === 'setup' ? 'block' : 'hidden xl:block'
          }`}
        >
          <form
            id="lessonForm"
            className="holo-glass holo-reticle p-5 sm:p-6 rounded-2xl border border-[#38bdf8]/30 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="cbc_school">{t('cbc_school')}</span>
                <input
                  id="schoolNameInput"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_school')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="cbc_teacher">{t('cbc_teacher')}</span>
                <input
                  id="teacherNameInput"
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_teacher')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_subject">{t('f_subject')} *</span>
                <select
                  id="subject"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setClarification(null);
                  }}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                >
                  {RWANDA_SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {/* Smoothly reveal #subjo when #subject is "Other" */}
              <div
                id="subjo"
                className={`transition-all duration-200 overflow-hidden ${
                  subject === 'Other' ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0 pointer-events-none hidden'
                }`}
              >
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                  <span data-i18n="f_subject_other">{t('f_subject_other')} *</span>
                  <input
                    id="lessonSubject"
                    type="text"
                    value={customSubject}
                    onChange={(e) => {
                      setCustomSubject(e.target.value);
                      setClarification(null);
                    }}
                    disabled={loading}
                    placeholder={t('lesson_ph_other_subj')}
                    className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_class">{t('f_class')} *</span>
                <select
                  id="lessonClass"
                  value={classLevel}
                  onChange={(e) => {
                    setClassLevel(e.target.value);
                    setClarification(null);
                  }}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                >
                  {RWANDA_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_topic">{t('f_topic')}</span>
                <input
                  id="lessonTopic"
                  type="text"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setClarification(null);
                  }}
                  disabled={loading}
                  placeholder={t('lesson_ph_topic')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_unit">{t('f_unit')}</span>
                <input
                  id="lessonUnit"
                  type="text"
                  value={unitNo}
                  onChange={(e) => setUnitNo(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_unit')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_lesson_no">{t('f_lesson_no')}</span>
                <input
                  type="text"
                  value={lessonNo}
                  onChange={(e) => setLessonNo(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_lesson_no')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_unit_title">{t('f_unit_title')}</span>
                <input
                  type="text"
                  value={unitTitle}
                  onChange={(e) => setUnitTitle(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_unit_title')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <div className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="dur" data-i18n="f_duration">
                    {t('f_duration')}
                  </label>
                  <div className="inline-flex items-center gap-1">
                    {[40, 80].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={loading}
                        onClick={() => applyDurationMinutes(preset)}
                        className={`px-2 py-0.5 text-[11px] font-mono-tabular rounded border transition-colors cursor-pointer ${
                          duration === preset
                            ? 'bg-[#15803D] text-white border-[#15803D]'
                            : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-[#15803D]'
                        }`}
                      >
                        {preset}m
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  id="dur"
                  type="number"
                  min={10}
                  max={240}
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(durationStr, 10);
                    if (!parsed || parsed < 10 || parsed > 240) {
                      setDurationStr(String(duration));
                    }
                  }}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-normal font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_learners">{t('f_learners')}</span>
                <input
                  id="lessonLearners"
                  type="number"
                  min={1}
                  max={200}
                  value={learners}
                  onChange={(e) => setLearners(e.target.value)}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-normal font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_term">{t('f_term')}</span>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                >
                  <option value="Term 1">{t('term_term_1')}</option>
                  <option value="Term 2">{t('term_term_2')}</option>
                  <option value="Term 3">{t('term_term_3')}</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_date">{t('f_date')}</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-normal font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_sen">{t('f_sen')}</span>
                <input
                  type="text"
                  value={sen}
                  onChange={(e) => setSen(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_sen')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="f_extra">{t('f_extra')}</span>
                <input
                  id="lessonExtra"
                  type="text"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  disabled={loading}
                  placeholder={t('lesson_ph_extra')}
                  className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </label>
            </div>

            <div className="pt-2 space-y-2.5 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted)]">
                {t('lesson_autofill_hint')}
              </p>
              <button
                id="generateLesson"
                type="submit"
                disabled={loading || maintenanceMode}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#15803D] hover:bg-[#166534] disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('toast_busy')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#FBBF24]" />
                    <span data-i18n="btn_lesson">{t('btn_lesson')}</span>
                  </>
                )}
              </button>
              {activePlan && (
                <button
                  type="button"
                  disabled={loading || maintenanceMode}
                  onClick={handleCompleteMissing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border border-[#0284C7]/40 bg-[#0284C7]/10 text-[#0284C7] dark:text-[#38BDF8] hover:bg-[#0284C7]/15 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span data-i18n="btn_complete_missing">{t('btn_complete_missing')}</span>
                </button>
              )}
            </div>
          </form>

          {/* Inline Loading State */}
          {loading && (
            <div
              role="status"
              className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text)]"
            >
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[#15803D] shrink-0" />
                <div>
                  <div className="font-semibold">
                    {retryCountdown !== null
                      ? `${t('loading_retry_busy')} ${retryCountdown}s…`
                      : t('loading_lesson')}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">
                    {effectiveSubject} · {classLevel} · {cleanTopicLabel(topic) || topic} ({duration} min)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelGenerate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-red-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                {t('cancel_btn')}
              </button>
            </div>
          )}

          {/* Inline Consistency Clarification Request */}
          {clarification && !loading && (
            <div
              role="alert"
              className="p-4 sm:p-5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/35 space-y-3 text-sm text-amber-950 dark:text-amber-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-display font-bold text-sm">{clarification.title}</h3>
                    <p className="text-xs sm:text-sm mt-1 leading-relaxed">{clarification.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClarification(null)}
                  aria-label="Dismiss clarification"
                  className="p-1 text-amber-700 dark:text-amber-300 hover:opacity-75 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {clarification.questions.length > 0 && (
                <ul className="list-disc pl-6 space-y-1 text-xs opacity-90">
                  {clarification.questions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {clarification.suggestedSubject && (
                  <button
                    type="button"
                    onClick={() => applyClarificationFix({ subject: clarification.suggestedSubject })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('clarify_switch_subject')} {clarification.suggestedSubject}
                  </button>
                )}
                {clarification.suggestedClass && (
                  <button
                    type="button"
                    onClick={() => applyClarificationFix({ classLevel: clarification.suggestedClass })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0284C7] text-white hover:bg-[#0369A1] transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('clarify_switch_class')} {clarification.suggestedClass}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => applyClarificationFix({ confirmOverride: true })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-400 dark:border-amber-700 bg-white/80 dark:bg-black/20 text-amber-900 dark:text-amber-200 hover:bg-white dark:hover:bg-black/30 transition-colors cursor-pointer"
                >
                  {t('clarify_keep_override')}
                </button>
              </div>
            </div>
          )}

          {/* Inline Error Alert with Retry */}
          {errorMsg && !loading && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-3 text-sm text-red-800 dark:text-red-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('retry')}
                </button>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  aria-label="Dismiss error"
                  className="p-1 text-red-700 dark:text-red-300 hover:opacity-75 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: Official Paper REB Output Area */}
        <div
          className={`xl:col-span-7 ${
            mobileTab === 'preview' ? 'block' : 'hidden xl:block'
          }`}
        >
          {activePlan ? (
            <div
              id="lessonOutput"
              className="print-only-area holo-glass holo-reticle rounded-2xl border border-[#38bdf8]/30 overflow-visible"
            >
              {/* Sticky Top Toolbar */}
              <div className="no-print holo-glass sticky top-0 z-20 px-4 sm:px-5 py-3 border-b border-[#38bdf8]/25 rounded-t-2xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <strong data-i18n="out_lesson" className="font-display text-sm font-bold text-[var(--text)] truncate">
                      {t('out_lesson')}
                    </strong>
                    <span className="hidden sm:inline text-xs font-mono-tabular text-[#0284C7] dark:text-[#38BDF8] font-semibold">
                      · {activePlan.subject} ({activePlan.classLevel})
                    </span>
                    {hasUnsavedChanges ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 whitespace-nowrap">
                        {t('unsaved_changes')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-[#15803D]/12 text-[#15803D] dark:text-[#4ADE80] border border-[#15803D]/30 whitespace-nowrap">
                        {t('saved_synced_badge')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={loading || maintenanceMode}
                      onClick={handleCompleteMissing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 text-amber-800 dark:text-[#FBBF24] hover:bg-[#F59E0B]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                      <span>{t('btn_complete_missing')}</span>
                    </button>
                    <button
                      id="saveBtn"
                      type="button"
                      onClick={() => onSavePlan(activePlan)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap ${
                        hasUnsavedChanges ? 'ring-2 ring-[#F59E0B]/70 shadow-sm' : ''
                      }`}
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span data-i18n="btn_save_plan">{t('btn_save_plan')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPrintOrientation((o) => (o === 'portrait' ? 'landscape' : 'portrait'))
                      }
                      aria-pressed={printOrientation === 'landscape'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#0284C7] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>
                        {printOrientation === 'landscape' ? t('print_landscape') : t('print_portrait')}
                      </span>
                    </button>
                    <button
                      id="printLesson"
                      type="button"
                      onClick={() =>
                        printOrDownloadHtml({
                          filename: `REB_${activePlan.subject}_${activePlan.classLevel}_${activePlan.lessonTitle}`.replace(
                            /[^a-zA-Z0-9_-]+/g,
                            '_'
                          ),
                          title: activePlan.lessonTitle || 'REB CBC Lesson Plan',
                          innerHtml: lessonPlanToWordHtml(activePlan, lang),
                          orientation: printOrientation,
                          onNotify: onToast,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span data-i18n="print">{t('print')}</span>
                    </button>
                    <button
                      id="copyLesson"
                      type="button"
                      onClick={() => onCopy(lessonPlanToPlainText(activePlan, lang))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span data-i18n="copy">{t('copy')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadWordDoc(
                          `REB_${activePlan.subject}_${activePlan.classLevel}_${activePlan.lessonTitle}`.replace(
                            /[^a-zA-Z0-9_-]+/g,
                            '_'
                          ),
                          activePlan.lessonTitle,
                          lessonPlanToWordHtml(activePlan, lang),
                          printOrientation
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#0284C7] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <FileDown className="w-3.5 h-3.5 text-[#0284C7] dark:text-[#38BDF8]" />
                      <span data-i18n="download_doc">{t('download_doc')}</span>
                    </button>
                  </div>
                </div>

                {(onCreateAssessmentFromPlan || onCreateMethodologyFromPlan) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[var(--border)]/60">
                    {onCreateAssessmentFromPlan && (
                      <button
                        type="button"
                        onClick={() => onCreateAssessmentFromPlan(activePlan)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-amber-800 dark:text-[#FBBF24] hover:bg-[#F59E0B]/20 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>{t('btn_create_assess')}</span>
                      </button>
                    )}
                    {onCreateMethodologyFromPlan && (
                      <button
                        type="button"
                        onClick={() => onCreateMethodologyFromPlan(activePlan)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#0284C7]/40 bg-[#0284C7]/10 text-[#0284C7] dark:text-[#38BDF8] hover:bg-[#0284C7]/20 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>{t('btn_create_method')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {hasMissingPlanSections && !loading && !maintenanceMode && (
                <div className="no-print px-5 py-2.5 border-b border-[#0284C7]/30 bg-[#0284C7]/10 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text)]">
                  <span>{t('lesson_missing_banner')}</span>
                  <button
                    type="button"
                    onClick={handleCompleteMissing}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-[#0284C7] text-white hover:bg-[#0369A1] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3" />
                    {t('btn_complete_missing')}
                  </button>
                </div>
              )}

              {planOutOfSyncWithForm && !maintenanceMode && (
                <div className="no-print px-5 py-2.5 border-b border-amber-200 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/25 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                  <span>
                    {t('lesson_sync_showing')}{' '}
                    <strong>
                      {activePlan.subject} ({activePlan.classLevel}) — {activePlan.lessonTitle || t('lib_untitled')}
                    </strong>
                    . {t('lesson_sync_update_to')}{' '}
                    <strong>
                      {effectiveSubject} ({classLevel}) — {cleanTopicLabel(topic) || t('f_topic')}
                    </strong>
                    ?
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-[#F59E0B] text-white hover:bg-[#D97706] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3 h-3" />
                    {t('lesson_update_btn')}
                  </button>
                </div>
              )}

              {qualityReport && !qualityReport.curriculumVerified && !loading && (
                <div className="no-print px-5 py-2.5 border-b border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {t('curriculum_verify_note_pre')}{' '}
                    <strong>
                      {activePlan.subject} ({activePlan.classLevel})
                    </strong>{' '}
                    {t('curriculum_verify_note_post')}{' '}
                    <strong>elearning.reb.rw</strong>.
                  </span>
                </div>
              )}

              <div id="lessonBody" className="p-3 sm:p-5 bg-[var(--surface-subtle)] rounded-b-2xl">
                <RebLessonPlanTable plan={activePlan} lang={lang} onChange={(p) => setPlanFromSelf(p, false)} />
              </div>
            </div>
          ) : (
            <div className="no-print holo-glass holo-reticle p-8 sm:p-10 rounded-2xl border border-dashed border-[#38bdf8]/35 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#15803D]/10 text-[#15803D] dark:text-[#4ADE80] grid place-items-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h2 className="font-display text-lg font-bold text-[var(--text)]">
                  {t('lesson_empty_title')}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {t('lesson_empty_desc_pre')}{' '}
                  <strong className="text-[var(--text)]">{t('btn_lesson')}</strong>{' '}
                  {t('lesson_empty_desc_post')}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleSampleLesson}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-[#FBBF24]" />
                  {t('btn_sample')}
                </button>
                <button
                  type="button"
                  onClick={handleBlankTemplate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  {t('btn_blank')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
