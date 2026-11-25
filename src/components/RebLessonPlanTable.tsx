import React from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Lang, LessonPlanData, LessonStageRow } from '../types/ghad';
import { translate } from '../i18n/translations';

interface RebLessonPlanTableProps {
  plan: LessonPlanData;
  lang: Lang;
  onChange: (updated: LessonPlanData) => void;
}

export const RebLessonPlanTable: React.FC<RebLessonPlanTableProps> = ({ plan, lang, onChange }) => {
  const t = (k: string) => translate(lang, k);

  const totalMinutes = plan.stages.reduce((sum, s) => sum + (Number(s.timingMinutes) || 0), 0);
  const targetMinutes = Number(plan.durationMinutes) || 0;
  const durationMatches = totalMinutes === targetMinutes;

  const updateField = <K extends keyof LessonPlanData>(field: K, value: LessonPlanData[K]) => {
    onChange({ ...plan, [field]: value });
  };

  const updateStage = (id: string, field: keyof LessonStageRow, value: string | number) => {
    const nextStages = plan.stages.map((s) => (s.id === id ? { ...s, [field]: value } : s));
    onChange({ ...plan, stages: nextStages });
  };

  const parseMinutesInput = (raw: string): number => {
    const match = raw.match(/\d+/);
    return match ? Math.max(0, parseInt(match[0], 10)) : 0;
  };

  const addDevelopmentStep = () => {
    const devCount = plan.stages.filter((s) => s.stageType === 'development').length;
    const newRow: LessonStageRow = {
      id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stageType: 'development',
      stageName: `${t('cbc_stage_body')} (${devCount + 1})`,
      timingMinutes: 10,
      teacherActivities: '',
      learnerActivities: '',
      competencesAndIssues: '',
    };

    const conclusionIndex = plan.stages.findIndex((s) => s.stageType === 'conclusion');
    const nextStages = [...plan.stages];
    if (conclusionIndex >= 0) {
      nextStages.splice(conclusionIndex, 0, newRow);
    } else {
      nextStages.push(newRow);
    }
    onChange({ ...plan, stages: nextStages });
  };

  const removeStage = (id: string) => {
    if (plan.stages.length <= 1) return;
    onChange({ ...plan, stages: plan.stages.filter((s) => s.id !== id) });
  };

  const autoFitStagesToTarget = () => {
    const target = Math.max(10, Number(plan.durationMinutes) || 40);
    const currentSum = plan.stages.reduce((sum, s) => sum + (Number(s.timingMinutes) || 0), 0);
    if (plan.stages.length === 0) return;
    const baseSum = currentSum > 0 ? currentSum : target;
    const next = plan.stages.map((s) => ({
      ...s,
      timingMinutes:
        currentSum > 0
          ? Math.max(1, Math.round(((Number(s.timingMinutes) || 0) / baseSum) * target))
          : s.stageType === 'development'
          ? Math.max(5, target - Math.max(3, Math.round(target * 0.125)) * 2)
          : Math.max(3, Math.round(target * 0.125)),
    }));
    const usedBeforeLast = next.slice(0, -1).reduce((sum, s) => sum + s.timingMinutes, 0);
    next[next.length - 1] = {
      ...next[next.length - 1],
      timingMinutes: Math.max(1, target - usedBeforeLast),
    };
    onChange({ ...plan, durationMinutes: target, stages: next });
  };

  return (
    <div className="space-y-3">
      {/* Stage Time Checker & Live Total-Minutes Indicator */}
      <div className="no-print holo-glass flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[#38bdf8]/25 text-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {durationMatches ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#15803D] dark:text-[#4ADE80]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t('lesson_stage_aligned')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('lesson_stage_mismatch')}</span>
            </span>
          )}
          <span
            className={`px-2.5 py-0.5 rounded-md font-mono-tabular text-xs font-bold border ${
              durationMatches
                ? 'bg-[#15803D]/10 text-[#15803D] dark:text-[#4ADE80] border-[#15803D]/30'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
            }`}
          >
            <span id="tot">{totalMinutes}</span> / <span id="durDisplay">{targetMinutes}</span> min
          </span>
          {!durationMatches && (
            <button
              type="button"
              onClick={autoFitStagesToTarget}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#F59E0B] text-white hover:bg-[#D97706] transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('lesson_autofit')} {targetMinutes} min
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--muted)] hidden sm:inline">{t('lesson_click_edit')}</span>
          <button
            type="button"
            onClick={addDevelopmentStep}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('add_step')}
          </button>
        </div>
      </div>

      {/* Official REB CBC Lesson Plan Paper Sheet */}
      <div className="reb-table-wrap">
        <div id="plan" className="reb-sheet p-4 sm:p-6 bg-white text-[#0F172A]">
          {/* Top Line above bordered table: School name & Teacher's name */}
          <div className="flex flex-wrap items-baseline justify-between gap-4 pb-3 text-sm font-semibold text-[#111827]">
            <div className="flex items-baseline gap-1.5 flex-1 min-w-[220px]">
              <span className="whitespace-nowrap">{t('cbc_school')}:</span>
              <span
                className="flex-1 border-b border-dotted border-[#1f2937] px-1 font-normal min-w-[120px]"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateField('schoolName', e.currentTarget.textContent || '')}
              >
                {plan.schoolName}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 flex-1 min-w-[220px]">
              <span className="whitespace-nowrap">{t('cbc_teacher')}:</span>
              <span
                className="flex-1 border-b border-dotted border-[#1f2937] px-1 font-normal min-w-[120px]"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => updateField('teacherName', e.currentTarget.textContent || '')}
              >
                {plan.teacherName}
              </span>
            </div>
          </div>

          {/* 8-Column Metadata Grid + Curriculum Rows */}
          <table className="w-full border-collapse">
            <tbody>
              {/* Row 1: 8 Column Headers */}
              <tr>
                <th style={{ width: '10%', textAlign: 'center' }}>{t('cbc_term')}</th>
                <th style={{ width: '13%', textAlign: 'center' }}>{t('cbc_date')}</th>
                <th style={{ width: '15%', textAlign: 'center' }}>{t('cbc_subject')}</th>
                <th style={{ width: '9%', textAlign: 'center' }}>{t('cbc_class')}</th>
                <th style={{ width: '10%', textAlign: 'center' }}>{t('cbc_unit')}</th>
                <th style={{ width: '13%', textAlign: 'center' }}>{t('cbc_lessonno')}</th>
                <th style={{ width: '15%', textAlign: 'center' }}>{t('cbc_duration')}</th>
                <th style={{ width: '15%', textAlign: 'center' }}>{t('cbc_size')}</th>
              </tr>
              {/* Row 2: 8 Column Values */}
              <tr>
                <td
                  style={{ textAlign: 'center' }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('term', e.currentTarget.textContent || '')}
                >
                  {plan.term}
                </td>
                <td
                  style={{ textAlign: 'center' }}
                  className="font-mono-tabular"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('date', e.currentTarget.textContent || '')}
                >
                  {plan.date}
                </td>
                <td
                  style={{ textAlign: 'center' }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('subject', e.currentTarget.textContent || '')}
                >
                  {plan.subject}
                </td>
                <td
                  style={{ textAlign: 'center' }}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('classLevel', e.currentTarget.textContent || '')}
                >
                  {plan.classLevel}
                </td>
                <td
                  style={{ textAlign: 'center' }}
                  className="font-mono-tabular"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('unitNo', e.currentTarget.textContent || '')}
                >
                  {plan.unitNo}
                </td>
                <td
                  style={{ textAlign: 'center' }}
                  className="font-mono-tabular"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('lessonNo', e.currentTarget.textContent || '')}
                >
                  {plan.lessonNo}
                </td>
                <td style={{ textAlign: 'center' }} className="font-mono-tabular">
                  <div className="no-print inline-flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={240}
                      aria-label={t('cbc_duration')}
                      value={plan.durationMinutes || ''}
                      onChange={(e) =>
                        updateField('durationMinutes', parseMinutesInput(e.target.value))
                      }
                      onBlur={() => {
                        if (!plan.durationMinutes || plan.durationMinutes < 1) {
                          updateField('durationMinutes', 40);
                        }
                      }}
                      className="w-12 text-center font-mono-tabular text-xs font-semibold px-1 py-0.5 rounded border border-[#cbd5e1] bg-[#f8fafc] text-[#111827] focus:outline-none focus:border-[#1f7a4d]"
                    />
                    <span className="text-xs">min</span>
                  </div>
                  <span className="hidden print:inline">{plan.durationMinutes} min</span>
                </td>
                <td
                  style={{ textAlign: 'center' }}
                  className="font-mono-tabular"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('classSize', e.currentTarget.textContent || '')}
                >
                  {plan.classSize}
                </td>
              </tr>

              {/* Row 3: SEN (split 4 cols / 4 cols) */}
              <tr>
                <th colSpan={4}>{t('cbc_sen')}</th>
                <td
                  colSpan={4}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('sen', e.currentTarget.textContent || '')}
                >
                  {plan.sen}
                </td>
              </tr>

              {/* Rows 4-10: Label (2 cols = ~23%) / Content (6 cols = ~77%) */}
              <tr>
                <th colSpan={2}>{t('cbc_unit_title')}</th>
                <td
                  colSpan={6}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('unitTitle', e.currentTarget.textContent || '')}
                >
                  {plan.unitTitle}
                </td>
              </tr>
              <tr>
                <th colSpan={2}>{t('cbc_competence')}</th>
                <td
                  colSpan={6}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('keyUnitCompetence', e.currentTarget.textContent || '')}
                >
                  {plan.keyUnitCompetence}
                </td>
              </tr>
              <tr>
                <th colSpan={2}>{t('cbc_title')}</th>
                <td
                  colSpan={6}
                  className="font-semibold"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('lessonTitle', e.currentTarget.textContent || '')}
                >
                  {plan.lessonTitle}
                </td>
              </tr>
              <tr>
                <th colSpan={2}>{t('cbc_objective')}</th>
                <td
                  colSpan={6}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) =>
                    updateField('instructionalObjective', e.currentTarget.textContent || '')
                  }
                >
                  {plan.instructionalObjective}
                </td>
              </tr>
              <tr>
                <th colSpan={2}>{t('cbc_location')}</th>
                <td
                  colSpan={6}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('planLocation', e.currentTarget.textContent || '')}
                >
                  {plan.planLocation}
                </td>
              </tr>
              <tr>
                <th colSpan={2}>{t('cbc_materials')}</th>
                <td
                  colSpan={6}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('learningMaterials', e.currentTarget.textContent || '')}
                >
                  {plan.learningMaterials}
                </td>
              </tr>
              <tr>
                <th colSpan={2}>{t('cbc_references')}</th>
                <td
                  colSpan={6}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('references', e.currentTarget.textContent || '')}
                >
                  {plan.references}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Lesson Development Table (clean thead so headers repeat on every printed page) */}
          <table className="w-full border-collapse mt-1.5">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  style={{ width: '15%', verticalAlign: 'middle', textAlign: 'center' }}
                >
                  {t('cbc_stages')}
                </th>
                <th colSpan={2} style={{ width: '55%', textAlign: 'center' }}>
                  {t('cbc_desc')}
                </th>
                <th rowSpan={2} style={{ width: '30%', verticalAlign: 'middle' }}>
                  {t('cbc_generic')}
                </th>
              </tr>
              <tr>
                <th style={{ width: '27.5%' }}>{t('cbc_teacher_act')}</th>
                <th style={{ width: '27.5%' }}>{t('cbc_learner_act')}</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="text-xs font-semibold text-center bg-[#f8faf9]">{t('cbc_overview')}</td>
                <td
                  colSpan={2}
                  className="text-xs italic bg-white"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateField('activityOverview', e.currentTarget.textContent || '')}
                >
                  {plan.activityOverview}
                </td>
                <td className="bg-[#f8faf9]" />
              </tr>
              {plan.stages.map((stage) => (
                <tr key={stage.id}>
                  <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <div
                      className="font-bold text-xs"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) =>
                        updateStage(stage.id, 'stageName', e.currentTarget.textContent || '')
                      }
                    >
                      {stage.stageName}
                    </div>
                    <div className="mt-2 inline-flex items-center justify-center gap-0.5 font-mono-tabular font-bold text-xs">
                      <input
                        type="number"
                        min={1}
                        max={240}
                        aria-label={`${stage.stageName} minutes`}
                        value={stage.timingMinutes || ''}
                        onChange={(e) =>
                          updateStage(stage.id, 'timingMinutes', parseMinutesInput(e.target.value))
                        }
                        className="no-print w-11 text-center font-mono-tabular font-bold text-xs px-1 py-0.5 rounded bg-[#edf4ef] border border-[#cbd5e1] text-[#111827] focus:outline-none focus:border-[#1f7a4d]"
                      />
                      <span className="hidden print:inline">{stage.timingMinutes}</span>
                      <span>&rsquo;</span>
                    </div>

                    {stage.stageType === 'development' &&
                      plan.stages.filter((s) => s.stageType === 'development').length > 1 && (
                        <div className="print-hide-row-controls mt-2">
                          <button
                            type="button"
                            onClick={() => removeStage(stage.id)}
                            title={t('remove_btn')}
                            className="inline-flex items-center gap-1 text-[11px] text-red-700 hover:underline cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('remove_btn')}
                          </button>
                        </div>
                      )}
                  </td>

                  <td
                    className="whitespace-pre-wrap"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) =>
                      updateStage(stage.id, 'teacherActivities', e.currentTarget.textContent || '')
                    }
                  >
                    {stage.teacherActivities}
                  </td>

                  <td
                    className="whitespace-pre-wrap"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) =>
                      updateStage(stage.id, 'learnerActivities', e.currentTarget.textContent || '')
                    }
                  >
                    {stage.learnerActivities}
                  </td>

                  <td
                    className="whitespace-pre-wrap"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) =>
                      updateStage(
                        stage.id,
                        'competencesAndIssues',
                        e.currentTarget.textContent || ''
                      )
                    }
                  >
                    {stage.competencesAndIssues}
                  </td>
                </tr>
              ))}

              {/* Self-evaluation row matching bottom of official REB template */}
              <tr>
                <th style={{ textAlign: 'center', verticalAlign: 'middle' }}>{t('cbc_eval')}</th>
                <td
                  colSpan={3}
                  className="whitespace-pre-wrap"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) =>
                    updateField('teacherSelfEvaluation', e.currentTarget.textContent || '')
                  }
                >
                  {plan.teacherSelfEvaluation}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
