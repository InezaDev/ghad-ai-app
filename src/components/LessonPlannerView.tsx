import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookmarkPlus,
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
import { Lang, LessonPlanData, TeacherProfile } from '../types/ghad';
import { translate } from '../i18n/translations';
import { RebLessonPlanTable } from './RebLessonPlanTable';
import {
  downloadWordDoc,
  lessonPlanToPlainText,
  lessonPlanToWordHtml,
  printOrDownloadHtml,
} from '../utils/export';
import { AiClientError, requestLessonPlan } from '../services/aiClient';

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
  'Social & Religious Studies (SRS)',
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
  onSetActivePlan: (plan: LessonPlanData | null) => void;
  onSavePlan: (plan: LessonPlanData) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onCopy: (text: string) => void;
}

export const LessonPlannerView: React.FC<LessonPlannerViewProps> = ({
  lang,
  profile,
  activePlan,
  prefill,
  onSetActivePlan,
  onSavePlan,
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
  const [mobileTab, setMobileTab] = useState<'setup' | 'preview'>(activePlan ? 'preview' : 'setup');

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
    const chosenSubject = effectiveSubject || 'Mathematics';
    const chosenClass = classLevel || 'P4';
    const rawTopic = cleanTopicLabel(topic);
    const total = Number(duration) || 40;
    const { intro, dev, concl } = splitDurationMinutes(total);
    const localizedTerm = translate(lang, `term_${term.replace(/\s+/g, '_').toLowerCase()}`) || term;
    const activeDate = date || new Date().toISOString().slice(0, 10);
    const activeSen = sen.trim() || 'Slow learners (2), Mild visual impairment (1)';
    const activeSize = learners.trim() || '40';

    const isSrsEquity =
      chosenSubject === 'Social & Religious Studies (SRS)' ||
      /\bequity\b|\bequality\b/i.test(rawTopic);

    const isDefaultMathSample =
      chosenSubject === 'Mathematics' && (!rawTopic || /\bfraction/i.test(rawTopic));

    if (isSrsEquity) {
      const srsTopic = rawTopic || 'Equity and Equality';
      const srsUnit = unitTitle.trim() || 'Human Rights, Equity, and Social Cohesion';
      setSubject('Social & Religious Studies (SRS)');
      setCustomSubject('');
      setTopic(srsTopic);
      setUnitTitle(srsUnit);

      const srsPlan: LessonPlanData = {
        schoolName: schoolName.trim() || profile.schoolName || 'GS Kigali',
        teacherName: teacherName.trim() || profile.teacherName || 'Jean Bosco Mugisha',
        term: localizedTerm,
        date: activeDate,
        subject: 'Social & Religious Studies (SRS)',
        classLevel: chosenClass,
        unitNo: unitNo || '1',
        lessonNo: lessonNo || '1 of 4',
        durationMinutes: total,
        classSize: activeSize,
        sen: activeSen,
        unitTitle: srsUnit,
        keyUnitCompetence: `To be able to explain the principles of ${srsTopic.toLowerCase()}, appreciate fairness in society, and practice respectful treatment of all people regardless of gender or ability.`,
        lessonTitle: srsTopic,
        instructionalObjective: `Given real-life community scenario cards and visual posters in small groups, ${chosenClass} learners will be able to distinguish between equity and equality and give at least 3 practical examples of promoting fairness at school and in the community accurately.`,
        planLocation: 'Inside the classroom — learners seated in mixed-ability groups of 5.',
        learningMaterials:
          'Scenario picture cards, chalkboard, chalk, large-print vocabulary cards (for visual impairment support), REB Social & Religious Studies Learner’s Book.',
        references: `REB (2020) Social & Religious Studies for Rwandan Primary Schools ${chosenClass} Teacher’s Guide & Learner’s Book, Unit ${unitNo || '1'}.`,
        activityOverview: `Through visual scenario analysis, think-pair-share, and group role-play, learners discover the difference between giving everyone the exact same support (equality) and giving each person fair support according to their needs (equity).`,
        stages: [
          {
            id: `sample_intro_${Date.now()}`,
            stageType: 'intro',
            stageName: t('cbc_stage_intro'),
            timingMinutes: intro,
            teacherActivities:
              '1. Greet learners warmly, check attendance, and organize seating so learners with mild visual impairment sit near the chalkboard.\n2. Present a simple classroom situation (three learners of different heights trying to look over a wall using boxes) and ask guiding questions about fairness.\n3. Link learner ideas to prior knowledge on children’s rights and introduce the lesson title: Equity and Equality.',
            learnerActivities:
              '1. Respond to greetings, settle into seats, and listen attentively to the teacher’s scenario.\n2. Observe the illustration, discuss in pairs which box arrangement is fair, and share answers orally.\n3. Read the lesson title aloud and write it neatly in their notebooks.',
            competencesAndIssues:
              'Communication: developed as learners express observations clearly in front of peers.\nInclusive education: reinforced by discussing how different learners need tailored support to succeed.',
          },
          {
            id: `sample_dev_${Date.now()}`,
            stageType: 'development',
            stageName: t('cbc_stage_body'),
            timingMinutes: dev,
            teacherActivities:
              '1. Group Investigation: Distribute two contrasting scenario cards to each mixed-ability group—one showing equal treatment without considering need, and one showing fair support based on need—and guide learners to compare them.\n2. Group Presentation & Harmonization: Invite group representatives to present their findings, clarify the clear definitions of equality and equity, and record key points on the chalkboard.\n3. Applied Role-Play & Guided Support: Assign each group a school or home situation (e.g., sharing textbooks, helping a learner with a disability) to demonstrate equity in action while circulating to assist slow learners.',
            learnerActivities:
              '1. Examine the scenario cards in groups, discuss who receives equal resources versus fair support, and record group notes.\n2. Present group conclusions to the class, compare ideas with peers, and copy the harmonized definitions into notebooks.\n3. Prepare and perform short 1-minute role-plays showing how to practice equity and equality fairly at school.',
            competencesAndIssues:
              'Critical thinking & Cooperation: learners analyze real-life fairness dilemmas collaboratively.\nGender education & Peace and values education: boys and girls participate equally in leadership and promote mutual respect.',
          },
          {
            id: `sample_concl_${Date.now()}`,
            stageType: 'conclusion',
            stageName: t('cbc_stage_concl'),
            timingMinutes: concl,
            teacherActivities:
              '1. Guide learners to summarize the main difference between equity and equality in their own words.\n2. Administer a quick 3-question oral and written check to verify understanding across the class.\n3. Assign a short homework task asking learners to list two ways they can practice equity in their family or village.',
            learnerActivities:
              '1. State one clear difference between equity and equality and give an everyday example.\n2. Answer the 3 exit questions individually in their exercise books and verify corrections.\n3. Write down the homework assignment and ask any clarifying questions.',
            competencesAndIssues:
              'Lifelong learning: learners connect classroom values of fairness to daily community life.\nPeace and values education: learners commit to respectful and inclusive behavior.',
          },
        ],
        teacherSelfEvaluation:
          `Lesson delivered within ${total} minutes using active group discussion and role-play. Approximately ___% of learners correctly distinguished equity from equality in the exit check; targeted remedial follow-up will support the ___ learners needing extra examples.`,
      };

      setPlanFromSelf(srsPlan);
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
          'To be able to compare, add, and subtract fractions with the same denominator in real-life situations.',
        lessonTitle: mathTopic,
        instructionalObjective: `Given folded paper strips and fraction charts in small groups, ${chosenClass} learners will be able to add fractions with the same denominator accurately by solving at least 4 out of 5 exercises correctly.`,
        planLocation: 'Inside the classroom — learners seated in mixed-ability groups of 6.',
        learningMaterials:
          'Folded paper strips, large-print fraction charts (for visually impaired learner), chalkboard, chalk, REB Mathematics Learner’s Book.',
        references: `REB (2020) Mathematics for Rwandan Primary Schools ${chosenClass} Teacher’s Guide & Learner’s Book, Unit ${unitNo || '4'}.`,
        activityOverview:
          'Using hands-on paper folding in mixed-ability groups, learners discover the rule for adding fractions with equal denominators, present findings, and practice individually.',
        stages: [
          {
            id: `sample_intro_${Date.now()}`,
            stageType: 'intro',
            stageName: t('cbc_stage_intro'),
            timingMinutes: intro,
            teacherActivities:
              '1. Greet learners, check attendance, and confirm that learners with visual needs are seated in the front row.\n2. Draw a circle divided into 4 equal parts on the chalkboard, shade 1 part, and ask learners to name the fraction.\n3. Connect the example to sharing an orange equally at home and write the lesson title on the board.',
            learnerActivities:
              '1. Respond to greetings and prepare notebooks and writing tools.\n2. Identify the shaded fraction (1/4) on the chalkboard and share real-life examples of equal sharing.\n3. Read and copy the lesson title into their exercise books.',
            competencesAndIssues:
              'Communication: developed as learners express prior knowledge orally.\nPeace and values education: promoted through respectful turn-taking and sharing.',
          },
          {
            id: `sample_dev_${Date.now()}`,
            stageType: 'development',
            stageName: t('cbc_stage_body'),
            timingMinutes: dev,
            teacherActivities:
              '1. Discovery Activity: Distribute paper strips divided into 4 equal parts. Instruct groups to shade 1/4 in blue and 2/4 in green, then count total shaded parts.\n2. Group Presentation & Synthesis: Invite 2 groups to share results on the board and harmonize the rule—add numerators and keep the denominator unchanged.\n3. Guided Practice: Write 3 practice problems (2/5 + 1/5, 3/8 + 4/8, 1/6 + 4/6) on the chalkboard and circulate to support slow learners.',
            learnerActivities:
              '1. Fold and shade paper strips in groups, count 1/4 + 2/4 = 3/4, and discuss why the denominator remains 4.\n2. Present group findings to the class and record the addition rule neatly in notebooks.\n3. Solve the 3 guided practice problems in pairs and check answers together on the chalkboard.',
            competencesAndIssues:
              'Cooperation & Critical thinking: learners collaborate in groups and deduce why denominators stay the same.\nGender & Inclusive education: boys and girls lead groups equally; large-print strips support the visually impaired learner.',
          },
          {
            id: `sample_concl_${Date.now()}`,
            stageType: 'conclusion',
            stageName: t('cbc_stage_concl'),
            timingMinutes: concl,
            teacherActivities:
              '1. Guide learners to summarize the rule for adding fractions with the same denominator.\n2. Administer a quick 2-question exit check (3/7 + 2/7 = ?, 1/9 + 5/9 = ?) and review answers aloud.\n3. Assign 3 practice exercises from the REB Learner’s Book as homework.',
            learnerActivities:
              '1. State the summary rule in their own words.\n2. Solve the 2 exit check questions individually and verify their solutions.\n3. Copy the homework exercises carefully into their notebooks.',
            competencesAndIssues:
              'Standardization culture: learners apply accurate mathematical fraction notation.\nLifelong learning: independent homework practice reinforces mastery.',
          },
        ],
        teacherSelfEvaluation: `Lesson delivered as planned within ${total} minutes. Approximately ___% of learners answered both exit check questions correctly. Remedial coaching will be provided to the ___ learners who struggled with keeping the denominator unchanged.`,
      };

      setPlanFromSelf(samplePlan);
      onToast(t('toast_sample_loaded'), 'success');
      return;
    }

    // Dynamic REB CBC lesson plan adapted to whichever Subject, Class, Topic, and Duration the teacher selected
    const dynamicTopic = rawTopic || `${chosenSubject} Core Concept`;
    const dynamicUnit = unitTitle.trim() || `${dynamicTopic} Unit`;
    if (!topic.trim()) setTopic(dynamicTopic);
    if (!unitTitle.trim()) setUnitTitle(dynamicUnit);

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
      keyUnitCompetence: `To be able to analyze, explain, and apply the key concepts of ${dynamicTopic} accurately in practical ${chosenClass} ${chosenSubject} contexts.`,
      lessonTitle: dynamicTopic,
      instructionalObjective: `Given visual charts, locally available learning aids, and guided group tasks, ${chosenClass} learners will be able to explain and apply the principles of ${dynamicTopic} accurately by completing at least 80% of the class assessment tasks correctly.`,
      planLocation: 'Inside the classroom — learners arranged in mixed-ability groups.',
      learningMaterials: `REB ${chosenClass} ${chosenSubject} Learner’s Book, chalkboard, chalk, topic charts, large-print summary sheets, and locally available realia.`,
      references: `REB (2020) ${chosenSubject} Curriculum & Teacher’s Guide for ${chosenClass}, Unit ${unitNo || '1'}.`,
      activityOverview: `Through guided inquiry, collaborative group exploration, and structured practice, learners investigate ${dynamicTopic}, synthesize key principles, and apply them to real-life problems.`,
      stages: [
        {
          id: `sample_intro_${Date.now()}`,
          stageType: 'intro',
          stageName: t('cbc_stage_intro'),
          timingMinutes: intro,
          teacherActivities: `1. Greet learners, check attendance, and verify inclusive seating for learners with special educational needs.\n2. Review prerequisite ${chosenSubject} concepts through 2 short oral questions linked to everyday life.\n3. Introduce the lesson title "${dynamicTopic}" and clarify the learning objective.`,
          learnerActivities: `1. Respond to greetings and organize learning materials.\n2. Answer review questions orally and share prior observations connected to ${dynamicTopic}.\n3. Read and write the lesson title in their notebooks.`,
          competencesAndIssues:
            'Communication: learners articulate prior understanding clearly.\nInclusive education: adapted seating and clear verbal explanations ensure every learner participates.',
        },
        {
          id: `sample_dev_${Date.now()}`,
          stageType: 'development',
          stageName: t('cbc_stage_body'),
          timingMinutes: dev,
          teacherActivities: `1. Group Exploration: Distribute structured activity prompts on ${dynamicTopic} to mixed-ability groups and guide their inquiry.\n2. Presentation & Harmonization: Call upon selected groups to share their work, correct misconceptions, and summarize core ${chosenSubject} principles on the chalkboard.\n3. Guided Practice: Provide differentiated practice tasks on ${dynamicTopic} while moving around the room to support slow learners.`,
          learnerActivities: `1. Collaborate in groups to examine the task, discuss ideas respectfully, and record group findings.\n2. Present group solutions to peers and copy the harmonized key notes into notebooks.\n3. Complete the guided practice exercises individually or in pairs and verify corrections.`,
          competencesAndIssues:
            'Critical thinking & Problem solving: learners analyze evidence and draw structured conclusions.\nGender education & Cooperation: mixed-gender groups share responsibilities fairly.',
        },
        {
          id: `sample_concl_${Date.now()}`,
          stageType: 'conclusion',
          stageName: t('cbc_stage_concl'),
          timingMinutes: concl,
          teacherActivities: `1. Facilitate a brief oral recap of the main takeaways on ${dynamicTopic}.\n2. Conduct a 2-to-3 question exit check to evaluate mastery of the instructional objective.\n3. Assign follow-up homework from the REB ${chosenSubject} Learner’s Book.`,
          learnerActivities: `1. Summarize the key ideas of ${dynamicTopic} in their own words.\n2. Complete the exit check questions independently and compare solutions.\n3. Record the homework task in their notebooks.`,
          competencesAndIssues:
            'Lifelong learning: homework reinforces independent study habits.\nStandardization culture: learners use accurate subject terminology.',
        },
      ],
      teacherSelfEvaluation: `Lesson on ${dynamicTopic} (${chosenClass} ${chosenSubject}) delivered within ${total} minutes. Approximately ___% of learners demonstrated mastery during the exit check; remedial support will be scheduled for the ___ learners needing additional practice.`,
    };

    setPlanFromSelf(dynamicPlan);
    onToast(t('toast_sample_loaded'), 'success');
  };

  const handleBlankTemplate = () => {
    setErrorMsg(null);
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

  const runLessonAi = async (mode: 'generate' | 'complete_missing') => {
    const draftPlan = mode === 'complete_missing' ? activePlan || undefined : undefined;
    const resolvedSubject =
      effectiveSubject || (draftPlan?.subject || '').trim();
    const resolvedClass =
      (classLevel || '').trim() || (draftPlan?.classLevel || '').trim();
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
      existingPlan: draftPlan,
      signal: controller.signal,
    };

    try {
      let generated: LessonPlanData;
      try {
        generated = await requestLessonPlan(payload);
      } catch (firstErr) {
        if (firstErr instanceof AiClientError && firstErr.isAborted) return;
        if (firstErr instanceof AiClientError && firstErr.isHighDemand) {
          for (let sec = 4; sec >= 1; sec--) {
            if (controller.signal.aborted) return;
            setRetryCountdown(sec);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setRetryCountdown(null);
          if (controller.signal.aborted) return;
          generated = await requestLessonPlan(payload);
        } else {
          throw firstErr;
        }
      }

      if (controller.signal.aborted) return;
      if (generated.lessonTitle) setTopic(generated.lessonTitle);
      if (generated.unitTitle) setUnitTitle(generated.unitTitle);
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
                  onChange={(e) => setSubject(e.target.value)}
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
                    onChange={(e) => setCustomSubject(e.target.value)}
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
                  onChange={(e) => setClassLevel(e.target.value)}
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
                  onChange={(e) => setTopic(e.target.value)}
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
                disabled={loading}
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
                  disabled={loading}
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
              <div className="no-print holo-glass sticky top-0 z-20 px-4 sm:px-5 py-3 border-b border-[#38bdf8]/25 rounded-t-2xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <strong data-i18n="out_lesson" className="font-display text-sm font-bold text-[var(--text)] truncate">
                    {t('out_lesson')}
                  </strong>
                  <span className="hidden sm:inline text-xs font-mono-tabular text-[#0284C7] dark:text-[#38BDF8] font-semibold">
                    · {activePlan.subject} ({activePlan.classLevel})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleCompleteMissing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 text-amber-800 dark:text-[#FBBF24] hover:bg-[#F59E0B]/20 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>{t('btn_complete_missing')}</span>
                  </button>
                  <button
                    id="saveBtn"
                    type="button"
                    onClick={() => onSavePlan(activePlan)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span data-i18n="btn_save_plan">{t('btn_save_plan')}</span>
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
                        lessonPlanToWordHtml(activePlan, lang)
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#0284C7] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FileDown className="w-3.5 h-3.5 text-[#0284C7] dark:text-[#38BDF8]" />
                    <span data-i18n="download_doc">{t('download_doc')}</span>
                  </button>
                </div>
              </div>

              {hasMissingPlanSections && !loading && (
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

              {planOutOfSyncWithForm && (
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
