import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NormalizedLessonPlan,
  buildPostLessonReflectionGuide,
  buildSenAdaptationProfile,
  checkLessonConsistency,
  getCurriculumGroundingContext,
  hasInventedAssessmentResults,
  runLessonQualityCheckAndRepair,
  sanitizeLanguageQuality,
} from './lessonQuality.js';
import { generateRebLessonPlan } from './aiService.js';
import { I18N, translate } from '../src/i18n/translations.js';

test('checkLessonConsistency catches subject-topic and primary/secondary level mismatches without altering inputs', () => {
  const mathPhoto = checkLessonConsistency({
    subject: 'Mathematics',
    classLevel: 'S2',
    topic: 'Photosynthesis',
    lang: 'en',
  });
  assert.equal(mathPhoto.consistent, false);
  if (!mathPhoto.consistent) {
    assert.equal(mathPhoto.clarification.issueType, 'subject_topic_mismatch');
    assert.equal(mathPhoto.clarification.selectedSubject, 'Mathematics');
    assert.equal(mathPhoto.clarification.suggestedSubject, 'Biology');
  }

  const histFrac = checkLessonConsistency({
    subject: 'History & Citizenship',
    classLevel: 'S1',
    topic: 'Addition of Fractions',
    lang: 'en',
  });
  assert.equal(histFrac.consistent, false);
  if (!histFrac.consistent) {
    assert.equal(histFrac.clarification.issueType, 'subject_topic_mismatch');
    assert.equal(histFrac.clarification.suggestedSubject, 'Mathematics');
  }

  const setS5 = checkLessonConsistency({
    subject: 'Science & Elementary Technology (SET)',
    classLevel: 'S5',
    topic: 'Simple Machines',
    lang: 'en',
  });
  assert.equal(setS5.consistent, false);
  if (!setS5.consistent) {
    assert.equal(setS5.clarification.issueType, 'subject_level_mismatch');
    assert.equal(setS5.clarification.selectedSubject, 'Science & Elementary Technology (SET)');
  }

  const validMathP4 = checkLessonConsistency({
    subject: 'Mathematics',
    classLevel: 'P4',
    topic: 'Addition of Fractions with the Same Denominator',
    lang: 'en',
  });
  assert.equal(validMathP4.consistent, true);
});

test('generateRebLessonPlan returns clarificationRequired before calling AI on inconsistent inputs', async () => {
  const result = await generateRebLessonPlan({
    language: 'en',
    subject: 'Mathematics',
    classLevel: 'S2',
    topic: 'Photosynthesis',
    duration: 40,
  });
  assert.equal(result.clarificationRequired, true);
  if (result.clarificationRequired) {
    assert.equal(result.clarification.selectedSubject, 'Mathematics');
    assert.equal(result.clarification.suggestedSubject, 'Biology');
    assert.ok(result.clarification.questions.length >= 1);
  }
});

test('getCurriculumGroundingContext distinguishes verified REB catalog entries from unverified units', () => {
  const verified = getCurriculumGroundingContext({
    subject: 'Mathematics',
    classLevel: 'P4',
    unitNo: '4',
    topic: 'Addition of Fractions with the Same Denominator',
    lang: 'en',
  });
  assert.equal(verified.verified, true);
  assert.ok(verified.referenceText.includes('elearning.reb.rw'));
  assert.ok(verified.matchedUnit?.unitTitle === 'Fractions');

  const unverified = getCurriculumGroundingContext({
    subject: 'Robotics & Coding Club',
    classLevel: 'S2',
    unitNo: '2',
    topic: 'Sensor Calibration',
    lang: 'en',
  });
  assert.equal(unverified.verified, false);
  assert.ok(/verif/i.test(unverified.referenceText));
});

test('sanitizeLanguageQuality repairs Kinyarwanda Swahili leakage, typos, and stray digits inside words', () => {
  const dirtyRw =
    'Umwarimu arasaba wanafunzi kujadili is2omo rya masomo kugirango bashobore kumyumva neza.';
  const cleanRw = sanitizeLanguageQuality(dirtyRw, 'rw');
  assert.equal(/\b(kujadili|wanafunzi|masomo|kumyumva|kugirango)\b/i.test(cleanRw), false);
  assert.equal(/\bis2omo\b/i.test(cleanRw), false);
  assert.ok(cleanRw.includes('abanyeshuri'));
  assert.ok(cleanRw.includes('kuganira'));
  assert.ok(cleanRw.includes('isomo'));
  assert.ok(cleanRw.includes('amasomo'));
  assert.ok(cleanRw.includes('kugira ngo'));
  assert.ok(cleanRw.includes('kuwumva'));

  assert.equal(sanitizeLanguageQuality('EQULITY', 'en'), 'Equality');
});

test('buildSenAdaptationProfile creates distinct, practical adaptations per SEN category', () => {
  const visual = buildSenAdaptationProfile('Mild visual impairment (1)', 'en');
  assert.equal(visual.hasSpecificNeeds, true);
  assert.ok(visual.categories.includes('visual'));
  assert.ok(/front row|large-print/i.test(`${visual.locationNote} ${visual.materialsNote}`));

  const hearing = buildSenAdaptationProfile('Hearing impairment (1)', 'en');
  assert.equal(hearing.hasSpecificNeeds, true);
  assert.ok(hearing.categories.includes('hearing'));
  assert.ok(/lip-reading|written/i.test(`${hearing.locationNote} ${hearing.materialsNote}`));

  const slow = buildSenAdaptationProfile('Slow learners (2)', 'rw');
  assert.equal(slow.hasSpecificNeeds, true);
  assert.ok(slow.categories.includes('slow'));
  assert.ok(/buhoro|yoroheje/i.test(`${slow.materialsNote} ${slow.classroomSupportStep}`));

  const none = buildSenAdaptationProfile('None (0)', 'en');
  assert.equal(none.hasSpecificNeeds, false);
});

test('runLessonQualityCheckAndRepair audits and auto-repairs a concrete lesson plan example', () => {
  const brokenExample: NormalizedLessonPlan = {
    schoolName: 'GS Muhanga',
    teacherName: 'Alice Uwimana',
    term: 'Term 1',
    date: '2026-11-25',
    subject: 'Biology', // Wrongly drifted by AI when teacher requested SRE
    classLevel: 'P5',
    unitNo: '1',
    lessonNo: '1 of 4',
    durationMinutes: 40,
    classSize: '42',
    sen: 'Mild visual impairment (1), Slow learners (2)',
    unitTitle: 'Human Rights, Equlity and Social Cohesion',
    keyUnitCompetence: 'To practice fairness in daily school life.',
    lessonTitle: 'Equlity and Equity — Equlity and Equity',
    instructionalObjective: 'Using picture cards, P5 learners will explain equity and equlity.',
    planLocation: 'Inside the classroom.',
    learningMaterials: 'Chalkboard, chalk, picture cards.',
    references: 'REB SRE P5 Textbook p. 12',
    activityOverview: 'Group discussion and short role-play.',
    stages: [
      {
        id: 'st_1',
        stageType: 'intro',
        stageName: 'Introduction',
        timingMinutes: 10, // Sums to 50 instead of 40
        teacherActivities: '1. Greet learners.\n2. Ask 2 warm-up questions.',
        learnerActivities: '1. Greet teacher.\n2. Answer questions.',
        competencesAndIssues: 'Communication: learners express ideas clearly.',
      },
      {
        id: 'st_2',
        stageType: 'development',
        stageName: 'Development (Body)',
        timingMinutes: 30,
        teacherActivities:
          '1. Distribute cards.\n2. Guide group discussion.\n2. Guide group discussion.', // Duplicate step & missing SEN specifics
        learnerActivities: '1. Discuss cards.\n2. Discuss cards.\n3. Share answers.',
        competencesAndIssues: 'Cooperation and Peace and values education.',
      },
      {
        id: 'st_3',
        stageType: 'conclusion',
        stageName: 'Conclusion',
        timingMinutes: 10,
        teacherActivities: '1. Summarize the lesson.\n2. Thank learners.', // Missing formative assessment method
        learnerActivities: '1. Listen and pack books.',
        competencesAndIssues: 'Lifelong learning.',
      },
    ],
    teacherSelfEvaluation:
      'Lesson went very smoothly and 95% of learners understood the lesson objective completely.', // Fabricated 95% result!
  };

  assert.equal(hasInventedAssessmentResults(brokenExample.teacherSelfEvaluation), true);

  const { plan, report } = runLessonQualityCheckAndRepair(brokenExample, {
    requestedSubject: 'Social and Religious Education (SRE)',
    requestedClass: 'P5',
    requestedTopic: 'Equity and Equality',
    lang: 'en',
    senInput: 'Mild visual impairment (1), Slow learners (2)',
    curriculumVerified: false,
    verifiedReference:
      'REB Primary Social and Religious Education (SRE) Syllabus (elearning.reb.rw) — P5, Unit 1 (verify exact unit numbering/pages with the school’s REB Teacher’s Guide).',
  });

  assert.equal(report.passed, true);
  assert.equal(plan.subject, 'Social and Religious Education (SRE)');
  assert.equal(plan.classLevel, 'P5');
  assert.equal(plan.lessonTitle, 'Equity and Equality');
  assert.equal(/\bequlity\b/i.test(JSON.stringify(plan)), false);
  assert.equal(
    plan.stages.reduce((s, st) => s + st.timingMinutes, 0),
    40
  );
  assert.equal(hasInventedAssessmentResults(plan.teacherSelfEvaluation), false);
  assert.ok(plan.teacherSelfEvaluation.toLowerCase().includes('to be completed by the teacher after teaching'));
  assert.ok(/front row|large-print|worked example/i.test(`${plan.planLocation} ${plan.learningMaterials} ${plan.stages[1].teacherActivities}`));
  assert.ok(/assess|exit check/i.test(plan.stages[2].teacherActivities));
  assert.ok(report.correctionsApplied.length >= 4);

  const sampleGuideRw = buildPostLessonReflectionGuide({
    lang: 'rw',
    lessonTitle: 'Gusoma Umwandiko',
    durationMinutes: 40,
    sen: 'None (0)',
  });
  assert.equal(hasInventedAssessmentResults(sampleGuideRw), false);
});

test('developer profile and teacher feedback suggestions localize cleanly across all 4 languages', () => {
  for (const lang of ['en', 'rw', 'fr', 'sw'] as const) {
    assert.ok(I18N[lang].dev_default_title && I18N[lang].dev_default_title.length > 10);
    assert.ok(I18N[lang].dev_default_bio && I18N[lang].dev_default_bio.length > 50);
    assert.ok(I18N[lang].fb_title && I18N[lang].fb_sub && I18N[lang].fb_send);
  }
  assert.notEqual(translate('rw', 'dev_default_title'), translate('en', 'dev_default_title'));
  assert.notEqual(translate('fr', 'fb_title'), translate('en', 'fb_title'));
  assert.notEqual(translate('sw', 'fb_send'), translate('en', 'fb_send'));
});
