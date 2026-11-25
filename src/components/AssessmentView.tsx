import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  History,
  KeyRound,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Lang, SavedAssessment } from '../types/ghad';
import { translate } from '../i18n/translations';
import {
  assessmentToPlainText,
  assessmentToWordHtml,
  downloadWordDoc,
  formatQuestionMarks,
  groupAssessmentQuestions,
  isEmbeddedSandbox,
  printOrDownloadHtml,
} from '../utils/export';
import { AiClientError, requestAssessment } from '../services/aiClient';
import { MaintenanceNotice } from './MaintenanceNotice';

const RWANDA_CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

export interface AssessmentPrefill {
  subject: string;
  classLevel: string;
  topic: string;
  nonce: number;
}

interface AssessmentViewProps {
  lang: Lang;
  history: SavedAssessment[];
  prefill?: AssessmentPrefill | null;
  maintenanceMode?: boolean;
  onBackHome?: () => void;
  onSaveHistory: (next: SavedAssessment[]) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onCopy: (text: string) => void;
}

export const AssessmentView: React.FC<AssessmentViewProps> = ({
  lang,
  history,
  prefill,
  maintenanceMode = false,
  onBackHome,
  onSaveHistory,
  onToast,
  onCopy,
}) => {
  const t = (k: string) => translate(lang, k);

  const [subject, setSubject] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [customClassSelected, setCustomClassSelected] = useState(false);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [assessType, setAssessType] = useState('mcq');
  const [loading, setLoading] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const safeHistory = history.filter((item) => item && item.data);
  const [active, setActive] = useState<SavedAssessment | null>(safeHistory[0] ?? null);
  const [showAnswers, setShowAnswers] = useState(true);
  const [printAnswerOverride, setPrintAnswerOverride] = useState<boolean | null>(null);

  const effectiveShowAnswers = printAnswerOverride ?? showAnswers;

  useEffect(() => {
    if (!prefill) return;
    setSubject(prefill.subject);
    setClassLevel(prefill.classLevel);
    setCustomClassSelected(
      Boolean(prefill.classLevel && !RWANDA_CLASSES.includes(prefill.classLevel))
    );
    setTopic(prefill.topic);
    setErrorMsg(null);
  }, [prefill]);

  useEffect(() => {
    const resetOverride = () => setPrintAnswerOverride(null);
    window.addEventListener('afterprint', resetOverride);
    return () => {
      window.removeEventListener('afterprint', resetOverride);
      abortRef.current?.abort();
    };
  }, []);

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRetryCountdown(null);
    setLoading(false);
    onToast(t('toast_gen_cancelled'), 'info');
  };

  const handleGenerate = async () => {
    if (maintenanceMode) {
      const msg = 'GHAD AI is currently in maintenance mode. Generating new assessments is temporarily paused.';
      setErrorMsg(msg);
      onToast(msg, 'warning');
      return;
    }
    if (!subject.trim() || !classLevel.trim() || !topic.trim()) {
      const msg = t('toast_fill');
      setErrorMsg(msg);
      onToast(msg, 'error');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setErrorMsg(null);
    setRetryCountdown(null);
    setLoading(true);
    try {
      const payload = {
        lang,
        subject: subject.trim(),
        classLevel: classLevel.trim(),
        topic: topic.trim(),
        count: Number(count) || 5,
        difficulty,
        type: assessType,
        signal: controller.signal,
      };

      let assessmentData;
      try {
        assessmentData = await requestAssessment(payload);
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
          assessmentData = await requestAssessment(payload);
        } else {
          throw firstErr;
        }
      }

      if (controller.signal.aborted) return;

      const entry: SavedAssessment = {
        id: `assess_${Date.now()}`,
        createdAt: new Date().toISOString(),
        language: lang,
        subject: subject.trim(),
        classLevel: classLevel.trim(),
        topic: topic.trim(),
        difficulty,
        assessmentType: assessType,
        data: assessmentData,
      };

      const nextHistory = [entry, ...history];
      onSaveHistory(nextHistory);
      setActive(entry);
      onToast(t('toast_assess'), 'success');
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

  const deleteItem = (id: string) => {
    const next = history.filter((item) => item.id !== id);
    onSaveHistory(next);
    if (active?.id === id) {
      setPrintAnswerOverride(null);
      setActive(next[0] ?? null);
    }
    onToast(t('assess_deleted'), 'info');
  };

  const handlePrint = (includeAnswers: boolean, target: SavedAssessment | null = active) => {
    if (!target?.data) return;
    flushSync(() => {
      setActive(target);
      setPrintAnswerOverride(includeAnswers);
    });
    printOrDownloadHtml({
      filename: `Assessment_${target.subject}_${target.classLevel}_${
        includeAnswers ? 'Teacher_Key' : 'Student_Copy'
      }`.replace(/[^a-zA-Z0-9_-]+/g, '_'),
      title: `${target.data.title || 'REB CBC Assessment'} (${
        includeAnswers ? t('print_teacher_key') : t('print_student_copy')
      })`,
      innerHtml: assessmentToWordHtml(target.data, includeAnswers, lang, {
        subject: target.subject,
        classLevel: target.classLevel,
        assessmentType: target.assessmentType,
      }),
      onNotify: onToast,
    });
    if (isEmbeddedSandbox()) {
      setPrintAnswerOverride(null);
    }
  };

  const classSelectValue = customClassSelected
    ? '__OTHER__'
    : RWANDA_CLASSES.includes(classLevel)
    ? classLevel
    : classLevel
    ? '__OTHER__'
    : '';

  const groupedActive = active?.data
    ? groupAssessmentQuestions(active.data, active.assessmentType, lang)
    : null;

  return (
    <section id="view-assessment" className="view-animate space-y-6">
      <div className="no-print">
        <h1 data-i18n="assess_title" className="font-display text-2xl font-bold text-[var(--text)]">
          {t('assess_title')}
        </h1>
        <p data-i18n="assess_sub" className="text-sm text-[var(--muted)] mt-1">
          {t('assess_sub')}
        </p>
      </div>

      {maintenanceMode && (
        <MaintenanceNotice variant="workspace" onReturnHome={onBackHome} />
      )}

      <form
        id="assessmentForm"
        className="no-print holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_subject">{t('f_subject')} *</span>
            <input
              id="assessSubject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={loading}
              placeholder={t('assess_ph_subject')}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <label htmlFor="assessClass" data-i18n="f_class">
              {t('f_class')} *
            </label>
            <select
              id="assessClass"
              value={classSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__OTHER__') {
                  setCustomClassSelected(true);
                  if (RWANDA_CLASSES.includes(classLevel)) {
                    setClassLevel('');
                  }
                } else {
                  setCustomClassSelected(false);
                  setClassLevel(v);
                }
              }}
              disabled={loading}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            >
              <option value="">{t('select_class')}</option>
              {RWANDA_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__OTHER__">{t('class_other')}</option>
            </select>
            {classSelectValue === '__OTHER__' && (
              <input
                id="assessClassCustom"
                type="text"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                disabled={loading}
                aria-label={t('f_class_other')}
                placeholder={t('assess_ph_class')}
                className="mt-1 px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_topic">{t('f_topic')} *</span>
            <input
              id="assessTopic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              placeholder={t('assess_ph_topic')}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_questions">{t('f_questions')}</span>
            <input
              id="assessCount"
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 5)}
              disabled={loading}
              className="px-3 py-2 text-sm font-normal font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_difficulty">{t('f_difficulty')}</span>
            <select
              id="assessDifficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={loading}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            >
              <option value="easy" data-i18n="diff_easy">{t('diff_easy')}</option>
              <option value="medium" data-i18n="diff_medium">{t('diff_medium')}</option>
              <option value="hard" data-i18n="diff_hard">{t('diff_hard')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_type">{t('f_type')}</span>
            <select
              id="assessType"
              value={assessType}
              onChange={(e) => setAssessType(e.target.value)}
              disabled={loading}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            >
              <option value="mcq" data-i18n="type_mcq">{t('type_mcq')}</option>
              <option value="fill_blank" data-i18n="type_fill_blank">{t('type_fill_blank')}</option>
              <option value="matching" data-i18n="type_matching">{t('type_matching')}</option>
              <option value="true_false" data-i18n="type_true_false">{t('type_true_false')}</option>
              <option value="open_ended" data-i18n="type_open_ended">{t('type_open_ended')}</option>
              <option value="short" data-i18n="type_short">{t('type_short')}</option>
              <option value="mixed" data-i18n="type_mixed">{t('type_mixed')}</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            id="generateAssessment"
            type="submit"
            disabled={loading || maintenanceMode}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#15803D] hover:bg-[#166534] disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('toast_busy')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span data-i18n="btn_assess">{t('btn_assess')}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Inline Loading State */}
      {loading && (
        <div
          role="status"
          className="no-print p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text)]"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#15803D] shrink-0" />
            <div>
              <div className="font-semibold">
                {retryCountdown !== null
                  ? `${t('loading_retry_busy')} ${retryCountdown}s…`
                  : t('loading_assess')}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {subject} · {classLevel} · {topic} ({count} {t('assess_questions_short')})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-red-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            {t('cancel_btn')}
          </button>
        </div>
      )}

      {/* Inline Error Alert */}
      {errorMsg && !loading && (
        <div
          role="alert"
          className="no-print p-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-3 text-sm text-red-800 dark:text-red-200"
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
              className="p-1 hover:opacity-75 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Output */}
      {active?.data && (
        <div
          id="assessmentOutput"
          data-print-answers={String(effectiveShowAnswers)}
          className="print-only-area holo-glass holo-reticle rounded-2xl border border-[#38bdf8]/30 overflow-hidden"
        >
          <div className="no-print px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-3">
            <strong data-i18n="out_assess" className="font-display text-sm font-bold text-[var(--text)]">
              {t('out_assess')}
            </strong>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAnswers((s) => !s)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#c89b2b] transition-colors cursor-pointer whitespace-nowrap"
              >
                {showAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showAnswers ? t('hide_answers') : t('show_answers')}</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrint(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('print_student_copy')}</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrint(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#15803D]/40 bg-[var(--surface)] text-[#15803D] dark:text-[#4ade80] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t('print_teacher_key')}</span>
              </button>
              <button
                id="copyAssessment"
                type="button"
                onClick={() =>
                  onCopy(
                    assessmentToPlainText(active.data, showAnswers, lang, {
                      subject: active.subject,
                      classLevel: active.classLevel,
                      assessmentType: active.assessmentType,
                    })
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span data-i18n="copy">{t('copy')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadWordDoc(
                    `Assessment_${active.subject}_${active.classLevel}`.replace(/[^a-zA-Z0-9_-]+/g, '_'),
                    active.data.title,
                    assessmentToWordHtml(active.data, showAnswers, lang, {
                      subject: active.subject,
                      classLevel: active.classLevel,
                      assessmentType: active.assessmentType,
                    })
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span data-i18n="download_doc">{t('download_doc')}</span>
              </button>
            </div>
          </div>

          <div id="assessmentBody" className="p-6 space-y-6">
            <div className="border-2 border-[var(--border)] p-5 rounded-2xl bg-[var(--surface-subtle)] space-y-3">
              <div className="text-center">
                <p className="font-display font-bold text-xs uppercase tracking-wider text-[var(--muted)]">Republic of Rwanda · Ministry of Education</p>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--text)] mt-1">
                  {active.data.title}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs font-semibold text-[var(--text)] pt-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">School Name:</span>
                  <span className="border-b border-dotted border-[var(--text)] flex-1">&nbsp;</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Class / Level:</span>
                  <span className="border-b border-dotted border-[var(--text)] flex-1">{active.classLevel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Pupil&apos;s Name:</span>
                  <span className="border-b border-dotted border-[var(--text)] flex-1">&nbsp;</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Date:</span>
                  <span className="border-b border-dotted border-[var(--text)] flex-1">&nbsp;</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Subject:</span>
                  <span className="border-b border-dotted border-[var(--text)] flex-1">{active.subject || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Total Marks:</span>
                  <span className="border-b border-dotted border-[var(--text)] flex-1">... / {active.data.totalMarks}</span>
                </div>
              </div>
              <p className="text-xs text-[var(--muted)] pt-1">
                <strong>Instructions:</strong> {active.data.instructions}
              </p>
            </div>

            <div className="space-y-6">
              {(groupedActive?.sections ?? []).map((sec, secIdx) => (
                <div key={sec.title ?? `sec_${secIdx}`} className="space-y-5">
                  {sec.title && (
                    <h3 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--text)] pb-1.5 border-b border-[var(--border)]">
                      {sec.title}
                    </h3>
                  )}
                  {sec.questions.map((q) => {
                    const isMatching = q.type === 'matching';
                    const isShortOrOpen = q.type === 'short' || q.type === 'open_ended';
                    const linesCount = (Number(q.marks) || 1) >= 3 ? 4 : 2;

                    return (
                      <div
                        key={q.displayNumber}
                        className="assessment-question-block space-y-2.5 pb-3 border-b border-[var(--border)]/40 last:border-0"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-medium text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                            <span className="font-mono-tabular font-bold mr-1.5">{q.displayNumber}.</span>
                            {q.question}
                          </p>
                          <div className="shrink-0">
                            <span className="font-mono-tabular text-xs font-semibold text-[var(--muted)]">
                              ({formatQuestionMarks(q.marks, lang)})
                            </span>
                          </div>
                        </div>

                        {(q.options ?? []).length > 0 && (
                          <ul
                            className={
                              isMatching
                                ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4 pt-1'
                                : 'pl-6 space-y-1.5 text-sm text-[var(--text)]'
                            }
                          >
                            {(q.options ?? []).map((opt, idx) => (
                              <li
                                key={idx}
                                className={
                                  isMatching
                                    ? 'p-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs font-medium'
                                    : ''
                                }
                              >
                                {opt}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isShortOrOpen && (
                          <div className="mt-3 space-y-2 select-none">
                            {Array.from({ length: linesCount }).map((_, i) => (
                              <div key={i} className="border-b border-dotted border-[var(--border)] h-5 w-full" />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {effectiveShowAnswers && (
              <div className="assessment-answer-key pt-5 border-t border-[var(--border)] space-y-3">
                <h3 className="font-display text-base font-bold text-[#15803D] dark:text-[#4ade80]">
                  {t('assess_answer_key_title')}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse border border-[var(--border)]">
                    <thead>
                      <tr className="bg-[var(--surface-subtle)]">
                        <th className="border border-[var(--border)] px-3 py-2 text-left w-12">#</th>
                        <th className="border border-[var(--border)] px-3 py-2 text-left">{t('assess_col_answer')}</th>
                        <th className="border border-[var(--border)] px-3 py-2 text-left w-20">{t('assess_col_marks')}</th>
                        <th className="border border-[var(--border)] px-3 py-2 text-left">
                          {t('assess_col_notes')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(groupedActive?.orderedQuestions ?? []).map((q) => (
                        <tr key={q.displayNumber}>
                          <td className="border border-[var(--border)] px-3 py-2 font-mono-tabular">
                            {q.displayNumber}
                          </td>
                          <td className="border border-[var(--border)] px-3 py-2 font-medium whitespace-pre-wrap">
                            {q.answer}
                          </td>
                          <td className="border border-[var(--border)] px-3 py-2 font-mono-tabular">
                            {q.marks}
                          </td>
                          <td className="border border-[var(--border)] px-3 py-2 text-[var(--muted)] whitespace-pre-wrap">
                            {q.markingNotes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Assessment History */}
      <div className="no-print holo-glass rounded-2xl border border-[#38bdf8]/25 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-[var(--text)]">
            <History className="w-4 h-4 text-[#15803D]" />
            {t('assess_history_title')}
          </span>
          <span className="text-xs font-mono-tabular text-[var(--muted)]">{safeHistory.length} {t('saved_label')}</span>
        </div>

        {safeHistory.length === 0 ? (
          <div className="p-5 text-sm text-[var(--muted)]">
            {t('assess_history_empty')}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {safeHistory.map((item) => (
              <div
                key={item.id}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--surface-subtle)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text)] truncate">
                    {item.data?.title || item.topic || t('nav_assessment')}
                  </div>
                  <div className="text-xs text-[var(--muted)] flex items-center gap-2 mt-0.5">
                    <span>{item.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.classLevel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActive(item)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:border-[#15803D] cursor-pointer"
                  >
                    {t('view_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onCopy(
                        assessmentToPlainText(item.data, true, lang, {
                          subject: item.subject,
                          classLevel: item.classLevel,
                          assessmentType: item.assessmentType,
                        })
                      )
                    }
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    title={t('copy_short')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrint(false, item)}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    title={t('print_student_copy')}
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteItem(item.id)}
                    className="p-1.5 text-[var(--muted)] hover:text-red-600 cursor-pointer"
                    title={t('delete_short')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
