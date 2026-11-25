import {
  AssessmentData,
  Lang,
  LessonPlanData,
  MethodologyData,
  PrintOrientation,
} from '../types/ghad';
import { translate } from '../i18n/translations';

function escHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

export function isEmbeddedSandbox(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function downloadPrintableHtml(
  filename: string,
  title: string,
  innerHtml: string,
  orientation: PrintOrientation = 'portrait'
): void {
  const pageSize = orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  <style>
    @page { size: ${pageSize}; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111827; margin: 18pt; }
    .print-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; margin-bottom: 14pt; background: #edf4ef; border: 1px solid #1f7a4d; border-radius: 8px; }
    .print-btn { background: #1f7a4d; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 10.5pt; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 6pt 0; page-break-inside: auto; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #111827; padding: 5pt 6pt; vertical-align: top; text-align: left; }
    th { background-color: #edf4ef; font-weight: bold; }
    .section-box { border: 1px solid #111827; padding: 8pt; margin: 8pt 0; }
    @media print { .print-toolbar { display: none !important; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span><strong>${escHtml(title)}</strong> — Ready to print or save as PDF</span>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${innerHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printOrDownloadHtml(options: {
  filename: string;
  title: string;
  innerHtml: string;
  orientation?: PrintOrientation;
  onNotify?: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}): void {
  const orientation: PrintOrientation =
    options.orientation === 'landscape' ? 'landscape' : 'portrait';
  if (isEmbeddedSandbox()) {
    downloadPrintableHtml(options.filename, options.title, options.innerHtml, orientation);
    options.onNotify?.(
      'Print dialog is restricted in embedded preview — downloaded a print-ready HTML file instead (open it in a tab to Print / Save as PDF, or use Download Word .doc).',
      'info'
    );
    return;
  }

  let pageStyle = document.getElementById('ghad-print-page-style') as HTMLStyleElement | null;
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'ghad-print-page-style';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`;
  window.print();
}

export function downloadWordDoc(
  filename: string,
  title: string,
  innerHtml: string,
  orientation: PrintOrientation = 'portrait'
): void {
  const pageRule =
    orientation === 'landscape'
      ? 'size: 297mm 210mm; mso-page-orientation: landscape; margin: 12mm;'
      : 'size: 210mm 297mm; mso-page-orientation: portrait; margin: 12mm;';
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  <style>
    @page WordSection1 { ${pageRule} }
    div.WordSection1 { page: WordSection1; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111827; margin: 18pt; }
    h1, h2, h3 { color: #111827; margin: 8pt 0 6pt; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 6pt 0; page-break-inside: auto; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #111827; padding: 5pt 6pt; vertical-align: top; text-align: left; }
    th { background-color: #edf4ef; font-weight: bold; }
    .section-box { border: 1px solid #111827; padding: 8pt; margin: 8pt 0; }
  </style>
</head>
<body>
<div class="WordSection1">
${innerHtml}
</div>
</body>
</html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.doc') ? filename : `${filename}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatQuestionMarks(marks: number, lang: Lang = 'en'): string {
  const count = Number(marks) || 0;
  if (lang === 'rw') {
    return count === 1 ? 'inota 1' : `amanota ${count}`;
  }
  if (lang === 'fr') {
    return count === 1 ? '1 point' : `${count} points`;
  }
  if (lang === 'sw') {
    return count === 1 ? 'alama 1' : `alama ${count}`;
  }
  return count === 1 ? '1 mark' : `${count} marks`;
}

export function lessonPlanToPlainText(plan: LessonPlanData, lang: Lang): string {
  const t = (k: string) => translate(lang, k);
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  const lines = [
    `${t('cbc_school')}: ${plan.schoolName || '—'}    ${t('cbc_teacher')}: ${plan.teacherName || '—'}`,
    `========================================`,
    `${t('cbc_term')}: ${plan.term || '—'} | ${t('cbc_date')}: ${plan.date || '—'} | ${t('cbc_subject')}: ${plan.subject} | ${t('cbc_class')}: ${plan.classLevel}`,
    `${t('cbc_unit')}: ${plan.unitNo || '—'} | ${t('cbc_lessonno')}: ${plan.lessonNo || '—'} | ${t('cbc_duration')}: ${plan.durationMinutes} min | ${t('cbc_size')}: ${plan.classSize}`,
    `${t('cbc_sen')}: ${plan.sen || 'None (0)'}`,
    `${t('cbc_unit_title')}: ${plan.unitTitle || '—'}`,
    `${t('cbc_competence')}: ${plan.keyUnitCompetence || '—'}`,
    `${t('cbc_title')}: ${plan.lessonTitle || '—'}`,
    `${t('cbc_objective')}: ${plan.instructionalObjective || '—'}`,
    `${t('cbc_location')}: ${plan.planLocation || '—'}`,
    `${t('cbc_materials')}: ${plan.learningMaterials || '—'}`,
    `${t('cbc_references')}: ${plan.references || '—'}`,
    ``,
    `${t('cbc_desc')}: ${plan.activityOverview || '—'}`,
    `----------------------------------------`,
    ...stages.map(
      (s) =>
        `[${s.stageName} — ${s.timingMinutes}']\n` +
        `${t('cbc_desc')}:\n` +
        `• ${t('cbc_teacher_act')}:\n${s.teacherActivities || '—'}\n` +
        `• ${t('cbc_learner_act')}:\n${s.learnerActivities || '—'}\n` +
        `• ${t('cbc_generic')}:\n${s.competencesAndIssues || '—'}\n`
    ),
    `${t('cbc_eval')}: ${plan.teacherSelfEvaluation || '—'}`,
  ];
  return lines.join('\n');
}

export function lessonPlanToWordHtml(plan: LessonPlanData, lang: Lang): string {
  const t = (k: string) => translate(lang, k);
  const stages = Array.isArray(plan.stages) ? plan.stages : [];

  return `
    <p style="font-weight:bold;margin-bottom:8pt;">
      ${escHtml(t('cbc_school'))}: <span style="font-weight:normal;">${escHtml(plan.schoolName)}</span>
      &nbsp;&nbsp;&nbsp;&nbsp;
      ${escHtml(t('cbc_teacher'))}: <span style="font-weight:normal;">${escHtml(plan.teacherName)}</span>
    </p>
    <table>
      <tr>
        <th style="text-align:center;">${escHtml(t('cbc_term'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_date'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_subject'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_class'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_unit'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_lessonno'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_duration'))}</th>
        <th style="text-align:center;">${escHtml(t('cbc_size'))}</th>
      </tr>
      <tr>
        <td style="text-align:center;">${escHtml(plan.term)}</td>
        <td style="text-align:center;">${escHtml(plan.date)}</td>
        <td style="text-align:center;">${escHtml(plan.subject)}</td>
        <td style="text-align:center;">${escHtml(plan.classLevel)}</td>
        <td style="text-align:center;">${escHtml(plan.unitNo)}</td>
        <td style="text-align:center;">${escHtml(plan.lessonNo)}</td>
        <td style="text-align:center;">${plan.durationMinutes} min</td>
        <td style="text-align:center;">${escHtml(plan.classSize)}</td>
      </tr>
      <tr>
        <th colspan="4">${escHtml(t('cbc_sen'))}</th>
        <td colspan="4">${escHtml(plan.sen)}</td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_unit_title'))}</th>
        <td colspan="6">${escHtml(plan.unitTitle)}</td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_competence'))}</th>
        <td colspan="6">${escHtml(plan.keyUnitCompetence)}</td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_title'))}</th>
        <td colspan="6"><strong>${escHtml(plan.lessonTitle)}</strong></td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_objective'))}</th>
        <td colspan="6">${escHtml(plan.instructionalObjective)}</td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_location'))}</th>
        <td colspan="6">${escHtml(plan.planLocation)}</td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_materials'))}</th>
        <td colspan="6">${escHtml(plan.learningMaterials)}</td>
      </tr>
      <tr>
        <th colspan="2">${escHtml(t('cbc_references'))}</th>
        <td colspan="6">${escHtml(plan.references)}</td>
      </tr>
    </table>
    <p style="margin:4pt 0;font-size:1pt;line-height:4pt;">&nbsp;</p>
    <table style="margin-top:0;">
      <thead style="display:table-header-group;">
        <tr style="mso-yfti-irow:0;mso-yfti-firstrow:yes;">
          <th rowspan="2" style="width:15%;text-align:center;vertical-align:middle;">${escHtml(t('cbc_stages'))}</th>
          <th colspan="2" style="width:55%;text-align:center;">${escHtml(t('cbc_desc'))}</th>
          <th rowspan="2" style="width:30%;vertical-align:middle;">${escHtml(t('cbc_generic'))}</th>
        </tr>
        <tr style="mso-yfti-irow:1;">
          <th style="width:27.5%;">${escHtml(t('cbc_teacher_act'))}</th>
          <th style="width:27.5%;">${escHtml(t('cbc_learner_act'))}</th>
        </tr>
      </thead>
      <tbody>
        ${
          plan.activityOverview
            ? `<tr>
            <td style="text-align:center;font-weight:bold;background:#f8faf9;">${escHtml(t('cbc_overview'))}</td>
            <td colspan="2" style="font-style:italic;background:#fff;">${escHtml(plan.activityOverview)}</td>
            <td style="background:#f8faf9;"></td>
          </tr>`
            : ''
        }
        ${stages
          .map(
            (s) => `
          <tr>
            <td style="text-align:center;vertical-align:middle;">
              <strong>${escHtml(s.stageName)}</strong><br/><br/>
              <strong>${s.timingMinutes}'</strong>
            </td>
            <td>${escHtml(s.teacherActivities)}</td>
            <td>${escHtml(s.learnerActivities)}</td>
            <td>${escHtml(s.competencesAndIssues)}</td>
          </tr>`
          )
          .join('')}
        <tr>
          <th style="text-align:center;vertical-align:middle;">${escHtml(t('cbc_eval'))}</th>
          <td colspan="3">${escHtml(plan.teacherSelfEvaluation)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

export interface AssessmentExportMeta {
  subject?: string;
  classLevel?: string;
  assessmentType?: string;
}

export interface NumberedAssessmentQuestion {
  number: number;
  displayNumber: number;
  type: string;
  question: string;
  options: string[];
  marks: number;
  answer: string;
  markingNotes: string;
}

export interface AssessmentSectionGroup {
  title: string | null;
  questions: NumberedAssessmentQuestion[];
}

function getBucketForType(qType: string): 'A' | 'B' | 'C' {
  const norm = (qType || '').toLowerCase();
  if (norm === 'mcq') return 'A';
  if (norm === 'fill_blank' || norm === 'matching' || norm === 'true_false') return 'B';
  return 'C';
}

function getBucketSubtitle(bucket: 'A' | 'B' | 'C', typesInBucket: Set<string>, lang: Lang): string {
  if (bucket === 'A') {
    if (lang === 'rw') return 'Hitamo igisubizo cy’ukuri';
    if (lang === 'fr') return 'Questions à choix multiple (Choisissez la bonne réponse)';
    if (lang === 'sw') return 'Maswali ya kuchagua jibu sahihi';
    return 'Multiple Choice Questions (Choose the correct answer)';
  }
  if (bucket === 'B') {
    const parts: string[] = [];
    if (typesInBucket.has('fill_blank')) {
      parts.push(
        lang === 'rw'
          ? 'Uzuza ahantu hasigaye'
          : lang === 'fr'
          ? 'Complétez les blancs'
          : lang === 'sw'
          ? 'Jaza nafasi zilizo wazi'
          : 'Fill in the Blanks'
      );
    }
    if (typesInBucket.has('matching')) {
      parts.push(
        lang === 'rw'
          ? 'Huza ibijyanye'
          : lang === 'fr'
          ? 'Appariement'
          : lang === 'sw'
          ? 'Oanisha'
          : 'Matching'
      );
    }
    if (typesInBucket.has('true_false')) {
      parts.push(
        lang === 'rw'
          ? 'Ni ukuri cyangwa Si ukuri'
          : lang === 'fr'
          ? 'Vrai ou Faux'
          : lang === 'sw'
          ? 'Kweli au Si kweli'
          : 'True / False'
      );
    }
    return parts.join(' & ') || 'Structured Questions';
  }
  const hasShort = typesInBucket.has('short');
  const hasOpen = typesInBucket.has('open_ended');
  if (hasShort && hasOpen) {
    if (lang === 'rw') return 'Ibibazo bigufi n’ibisaba gusobanura';
    if (lang === 'fr') return 'Questions courtes et questions ouvertes';
    if (lang === 'sw') return 'Maswali mafupi na ya maelezo';
    return 'Short & Open-Ended Questions';
  }
  if (hasOpen) {
    if (lang === 'rw') return 'Ibibazo bisaba gusobanura birambuye';
    if (lang === 'fr') return 'Questions ouvertes';
    if (lang === 'sw') return 'Maswali ya maelezo';
    return 'Open-Ended Questions';
  }
  if (lang === 'rw') return 'Ibibazo bigufi';
  if (lang === 'fr') return 'Questions à réponse courte';
  if (lang === 'sw') return 'Maswali mafupi';
  return 'Short Answer Questions';
}

export function groupAssessmentQuestions(
  data: AssessmentData,
  assessmentType?: string,
  lang: Lang = 'en'
): {
  sections: AssessmentSectionGroup[];
  orderedQuestions: NumberedAssessmentQuestion[];
} {
  const rawQuestions = Array.isArray(data?.questions) ? data.questions : [];
  const distinctTypes = new Set(rawQuestions.map((q) => (q.type || 'short').toLowerCase()));
  const shouldGroup = assessmentType === 'mixed' || distinctTypes.size > 1;

  if (!shouldGroup) {
    const ordered: NumberedAssessmentQuestion[] = rawQuestions.map((q, idx) => ({
      ...q,
      displayNumber: Number(q.number) || idx + 1,
    }));
    return {
      sections: [{ title: null, questions: ordered }],
      orderedQuestions: ordered,
    };
  }

  const buckets: Record<'A' | 'B' | 'C', typeof rawQuestions> = { A: [], B: [], C: [] };
  for (const q of rawQuestions) {
    buckets[getBucketForType(q.type)].push(q);
  }

  const nonEmptyOrder = (['A', 'B', 'C'] as const).filter((k) => buckets[k].length > 0);
  if (nonEmptyOrder.length <= 1) {
    const ordered: NumberedAssessmentQuestion[] = rawQuestions.map((q, idx) => ({
      ...q,
      displayNumber: Number(q.number) || idx + 1,
    }));
    return {
      sections: [{ title: null, questions: ordered }],
      orderedQuestions: ordered,
    };
  }

  const sectionLetters = ['A', 'B', 'C'];
  const sections: AssessmentSectionGroup[] = [];
  const orderedQuestions: NumberedAssessmentQuestion[] = [];
  let counter = 1;

  nonEmptyOrder.forEach((bucketKey, bucketIdx) => {
    const list = buckets[bucketKey];
    const typeSet = new Set(list.map((q) => (q.type || 'short').toLowerCase()));
    const sectionPrefix =
      lang === 'rw'
        ? `IGICE CYA ${sectionLetters[bucketIdx]}`
        : lang === 'sw'
        ? `SEHEMU YA ${sectionLetters[bucketIdx]}`
        : `SECTION ${sectionLetters[bucketIdx]}`;
    const title = `${sectionPrefix}: ${getBucketSubtitle(bucketKey, typeSet, lang)}`;
    const numbered: NumberedAssessmentQuestion[] = list.map((q) => {
      const item: NumberedAssessmentQuestion = {
        ...q,
        displayNumber: counter++,
      };
      orderedQuestions.push(item);
      return item;
    });
    sections.push({ title, questions: numbered });
  });

  return { sections, orderedQuestions };
}

export function assessmentToPlainText(
  data: AssessmentData,
  includeAnswers: boolean,
  lang: Lang = 'en',
  meta?: AssessmentExportMeta
): string {
  const t = (k: string) => translate(lang, k);
  const { sections, orderedQuestions } = groupAssessmentQuestions(data, meta?.assessmentType, lang);

  const headerLines = [
    data.title,
    ...(meta?.subject ? [`${t('cbc_subject')}: ${meta.subject}${meta.classLevel ? ` | ${t('cbc_class')}: ${meta.classLevel}` : ''}`] : []),
    `${t('assess_total_marks')}: ${data.totalMarks}`,
    `${t('assess_instructions')}: ${data.instructions}`,
    '',
  ];

  const questionLines: string[] = [];
  for (const sec of sections) {
    if (sec.title) {
      questionLines.push(sec.title);
    }
    for (const q of sec.questions) {
      const opts = q.options.length ? '\n' + q.options.map((o) => `   ${o}`).join('\n') : '';
      questionLines.push(`${q.displayNumber}. ${q.question} (${formatQuestionMarks(q.marks, lang)})${opts}`);
    }
    if (sec.title) questionLines.push('');
  }

  const lines = [...headerLines, ...questionLines];

  if (includeAnswers) {
    lines.push('', t('assess_answer_key_title').toUpperCase(), '========================================');
    orderedQuestions.forEach((q) => {
      lines.push(`${q.displayNumber}. ${t('assess_col_answer')}: ${q.answer} (${formatQuestionMarks(q.marks, lang)})`);
      if (q.markingNotes) lines.push(`   ${t('assess_col_notes')}: ${q.markingNotes}`);
    });
  }
  return lines.join('\n');
}

export function assessmentToWordHtml(
  data: AssessmentData,
  includeAnswers: boolean,
  lang: Lang = 'en',
  meta?: AssessmentExportMeta
): string {
  const t = (k: string) => translate(lang, k);
  const subjectName = (meta?.subject || '').trim() || '—';
  const classNameText = (meta?.classLevel || '').trim() || '....................';
  const { sections, orderedQuestions } = groupAssessmentQuestions(data, meta?.assessmentType, lang);

  const renderQuestion = (q: NumberedAssessmentQuestion) => {
    const isMatching = q.type === 'matching';
    const isShortOrOpen = q.type === 'short' || q.type === 'open_ended';
    const linesCount = (Number(q.marks) || 1) >= 3 ? 4 : 2;
    const writingLines =
      '<div style="color: #666; font-family: monospace; letter-spacing: -1px; margin-top: 8px; line-height: 1.5;">' +
      Array(linesCount).fill('................................................................................').join('<br/>') +
      '</div>';

    return `
    <div style="margin-bottom: 14pt; page-break-inside: avoid;">
      <p style="margin: 4px 0;"><strong>${q.displayNumber}.</strong> ${escHtml(q.question)} <span style="float: right; font-weight: bold;">(${escHtml(formatQuestionMarks(q.marks, lang))})</span></p>
      ${
        isMatching
          ? `<div style="margin-left: 15pt; font-size: 10pt; color: #333;"><em>(Match items in Column A with Column B)</em></div>`
          : ''
      }
      ${
        q.options.length
          ? `<ul style="list-style: ${isMatching ? 'none' : 'disc'}; padding-left: ${isMatching ? '0' : '18pt'}; margin: 6px 0;">${q.options
              .map(
                (o) =>
                  `<li style="margin: 3px 0; ${isMatching ? 'display:inline-block; width:48%; vertical-align:top;' : ''}">${escHtml(o)}</li>`
              )
              .join('')}</ul>`
          : ''
      }
      ${isShortOrOpen ? writingLines : ''}
    </div>`;
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #000;">
      <div style="text-align: center; border: 2px solid #000; padding: 12px; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 14pt;">REPUBLIC OF RWANDA</h3>
        <p style="margin: 3px 0; font-size: 11pt; font-weight: bold;">MINISTRY OF EDUCATION — REB CBC ASSESSMENT</p>
        <hr style="border: 1px solid #000; margin: 8px 0;" />
        <table style="width: 100%; border: none; font-size: 10pt; text-align: left; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px; border: none;"><strong>School:</strong> ........................................</td>
            <td style="padding: 4px; border: none;"><strong>Class:</strong> ${escHtml(classNameText)}</td>
          </tr>
          <tr>
            <td style="padding: 4px; border: none;"><strong>Pupil's Name:</strong> ........................................</td>
            <td style="padding: 4px; border: none;"><strong>Date:</strong> ....................</td>
          </tr>
          <tr>
            <td style="padding: 4px; border: none;"><strong>Subject:</strong> ${escHtml(subjectName)}</td>
            <td style="padding: 4px; border: none;"><strong>Total Marks:</strong> ... / ${data.totalMarks}</td>
          </tr>
        </table>
      </div>
      
      <h2 style="text-align: center; font-size: 13pt; margin-bottom: 5px;">${escHtml(data.title)}</h2>
      <p style="text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 20px;"><strong>Instructions:</strong> ${escHtml(data.instructions)}</p>
      
      ${sections
        .map(
          (sec) => `
          ${
            sec.title
              ? `<h3 style="font-size: 11pt; margin: 16pt 0 8pt; padding-bottom: 3pt; border-bottom: 1.5px solid #000; text-transform: uppercase;">${escHtml(sec.title)}</h3>`
              : ''
          }
          ${sec.questions.map(renderQuestion).join('')}
        `
        )
        .join('')}
      
      ${
        includeAnswers
          ? `
        <br/><hr/><br/>
        <h3>${escHtml(t('assess_answer_key_title'))}</h3>
        <table border="1" style="width: 100%; border-collapse: collapse; font-size: 10pt;">
          <thead>
            <tr style="background: #eee;">
              <th style="padding: 6px; text-align: left;">#</th>
              <th style="padding: 6px; text-align: left;">${escHtml(t('assess_col_answer'))}</th>
              <th style="padding: 6px; text-align: left;">${escHtml(t('assess_col_marks'))}</th>
              <th style="padding: 6px; text-align: left;">${escHtml(t('assess_col_notes'))}</th>
            </tr>
          </thead>
          <tbody>
            ${orderedQuestions
              .map(
                (q) => `
              <tr>
                <td style="padding: 6px;">${q.displayNumber}</td>
                <td style="padding: 6px;">${escHtml(q.answer)}</td>
                <td style="padding: 6px;">${q.marks}</td>
                <td style="padding: 6px;">${escHtml(q.markingNotes)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`
          : ''
      }
    </div>
  `;
}

export function methodologyToPlainText(data: MethodologyData, lang: Lang = 'en'): string {
  const t = (k: string) => translate(lang, k);
  return [
    data.title,
    `${t('method_core_approach')}: ${data.coreApproach}`,
    '',
    `${t('method_col_strategy')}:`,
    ...data.strategies.map(
      (s, i) =>
        `${i + 1}. ${s.name} (${s.durationHint})\n` +
        `   ${t('method_col_desc')}: ${s.description}\n` +
        `   ${t('method_col_teacher')}: ${s.teacherRole}\n` +
        `   ${t('method_col_learner')}: ${s.learnerRole}`
    ),
    '',
    `${t('method_sen_title')}: ${data.differentiationSen}`,
    '',
    `${t('method_formative_title')}:`,
    ...data.formativeChecks.map((f) => `- ${f}`),
    '',
    `${t('method_materials_title')}:`,
    ...data.recommendedMaterials.map((m) => `- ${m}`),
  ].join('\n');
}

export function methodologyToWordHtml(data: MethodologyData, lang: Lang = 'en'): string {
  const t = (k: string) => translate(lang, k);
  return `
    <h2>${escHtml(data.title)}</h2>
    <p><strong>${escHtml(t('method_core_approach'))}:</strong> ${escHtml(data.coreApproach)}</p>
    <table>
      <thead>
        <tr>
          <th>${escHtml(t('method_col_strategy'))}</th>
          <th>${escHtml(t('method_col_timing'))}</th>
          <th>${escHtml(t('method_col_desc'))}</th>
          <th>${escHtml(t('method_col_teacher'))}</th>
          <th>${escHtml(t('method_col_learner'))}</th>
        </tr>
      </thead>
      <tbody>
        ${data.strategies
          .map(
            (s) => `
          <tr>
            <td><strong>${escHtml(s.name)}</strong></td>
            <td>${escHtml(s.durationHint)}</td>
            <td>${escHtml(s.description)}</td>
            <td>${escHtml(s.teacherRole)}</td>
            <td>${escHtml(s.learnerRole)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div class="section-box">
      <strong>${escHtml(t('method_sen_title'))}:</strong><br/>${escHtml(data.differentiationSen)}
    </div>
    <p><strong>${escHtml(t('method_formative_title'))}:</strong></p>
    <ul>${data.formativeChecks.map((f) => `<li>${escHtml(f)}</li>`).join('')}</ul>
    <p><strong>${escHtml(t('method_materials_title'))}:</strong></p>
    <ul>${data.recommendedMaterials.map((m) => `<li>${escHtml(m)}</li>`).join('')}</ul>
  `;
}
