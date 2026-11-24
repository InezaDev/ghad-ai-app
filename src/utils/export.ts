import {
  AssessmentData,
  Lang,
  LessonPlanData,
  MethodologyData,
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

export function downloadPrintableHtml(filename: string, title: string, innerHtml: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
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
  onNotify?: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}): void {
  if (isEmbeddedSandbox()) {
    downloadPrintableHtml(options.filename, options.title, options.innerHtml);
    options.onNotify?.(
      'Print dialog is restricted in embedded preview — downloaded a print-ready HTML file instead (open it in a tab to Print / Save as PDF, or use Download Word .doc).',
      'info'
    );
    return;
  }
  window.print();
}

export function downloadWordDoc(filename: string, title: string, innerHtml: string): void {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  <style>
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
${innerHtml}
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
          <th colspan="2" style="width:57%;text-align:center;">${escHtml(t('cbc_desc'))}</th>
          <th rowspan="2" style="width:28%;vertical-align:middle;">${escHtml(t('cbc_generic'))}</th>
        </tr>
        <tr style="mso-yfti-irow:1;">
          <th style="width:28.5%;">${escHtml(t('cbc_teacher_act'))}</th>
          <th style="width:28.5%;">${escHtml(t('cbc_learner_act'))}</th>
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

export function assessmentToPlainText(
  data: AssessmentData,
  includeAnswers: boolean,
  lang: Lang = 'en'
): string {
  const t = (k: string) => translate(lang, k);
  const lines = [
    data.title,
    `${t('assess_total_marks')}: ${data.totalMarks}`,
    `${t('assess_instructions')}: ${data.instructions}`,
    '',
    ...data.questions.map((q) => {
      const opts = q.options.length ? '\n' + q.options.map((o) => `   ${o}`).join('\n') : '';
      return `${q.number}. ${q.question} (${q.marks} ${t('assess_marks_unit')})${opts}`;
    }),
  ];

  if (includeAnswers) {
    lines.push('', t('assess_answer_key_title').toUpperCase(), '========================================');
    data.questions.forEach((q) => {
      lines.push(`${q.number}. ${t('assess_col_answer')}: ${q.answer} (${q.marks} ${t('assess_marks_unit')})`);
      if (q.markingNotes) lines.push(`   ${t('assess_col_notes')}: ${q.markingNotes}`);
    });
  }
  return lines.join('\n');
}

export function assessmentToWordHtml(
  data: AssessmentData,
  includeAnswers: boolean,
  lang: Lang = 'en'
): string {
  const t = (k: string) => translate(lang, k);
  return `
    <h2>${escHtml(data.title)}</h2>
    <p><strong>${escHtml(t('assess_total_marks'))}:</strong> ${data.totalMarks}</p>
    <p><strong>${escHtml(t('assess_instructions'))}:</strong> ${escHtml(data.instructions)}</p>
    <hr/>
    ${data.questions
      .map(
        (q) => `
      <div style="margin-bottom:10pt;">
        <p><strong>${q.number}. ${escHtml(q.question)}</strong> <em>(${q.marks} ${escHtml(t('assess_marks_unit'))})</em></p>
        ${
          q.options.length
            ? `<ul style="list-style:none;padding-left:14pt;">${q.options
                .map((o) => `<li>${escHtml(o)}</li>`)
                .join('')}</ul>`
            : ''
        }
      </div>`
      )
      .join('')}
    ${
      includeAnswers
        ? `
      <hr/>
      <h3>${escHtml(t('assess_answer_key_title'))}</h3>
      <table>
        <thead><tr><th>#</th><th>${escHtml(t('assess_col_answer'))}</th><th>${escHtml(t('assess_col_marks'))}</th><th>${escHtml(t('assess_col_notes'))}</th></tr></thead>
        <tbody>
          ${data.questions
            .map(
              (q) => `
            <tr>
              <td>${q.number}</td>
              <td>${escHtml(q.answer)}</td>
              <td>${q.marks}</td>
              <td>${escHtml(q.markingNotes)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`
        : ''
    }
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
