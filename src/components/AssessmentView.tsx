import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  FileDown,
  History,
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
  printOrDownloadHtml,
} from '../utils/export';
import { AiClientError, requestAssessment } from '../services/aiClient';

interface AssessmentViewProps {
  lang: Lang;
  history: SavedAssessment[];
  onSaveHistory: (next: SavedAssessment[]) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onCopy: (text: string) => void;
}

export const AssessmentView: React.FC<AssessmentViewProps> = ({
  lang,
  history,
  onSaveHistory,
  onToast,
  onCopy,
}) => {
  const t = (k: string) => translate(lang, k);

  const [subject, setSubject] = useState('');
  const [classLevel, setClassLevel] = useState('');
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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRetryCountdown(null);
    setLoading(false);
    onToast('Assessment generation cancelled.', 'info');
  };

  const handleGenerate = async () => {
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
          for (let sec = 4; sec >= 1; sec--) {
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
    if (active?.id === id) setActive(next[0] ?? null);
    onToast('Assessment removed from history.', 'info');
  };

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

      <form
        id="assessmentForm"
        className="no-print p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4"
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
              placeholder="e.g. Biology"
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_class">{t('f_class')} *</span>
            <input
              id="assessClass"
              type="text"
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              disabled={loading}
              placeholder="e.g. S2"
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_topic">{t('f_topic')} *</span>
            <input
              id="assessTopic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              placeholder="e.g. Photosynthesis"
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
              <option value="short" data-i18n="type_short">{t('type_short')}</option>
              <option value="mixed" data-i18n="type_mixed">{t('type_mixed')}</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            id="generateAssessment"
            type="submit"
            disabled={loading}
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
                  ? `AI service is temporarily busy — retrying automatically in ${retryCountdown}s…`
                  : t('loading_assess')}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {subject} · {classLevel} · {topic} ({count} questions)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-red-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            Cancel
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
          className="print-only-area rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
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
                onClick={() =>
                  printOrDownloadHtml({
                    filename: `Assessment_${active.subject}_${active.classLevel}`.replace(
                      /[^a-zA-Z0-9_-]+/g,
                      '_'
                    ),
                    title: active.data.title || 'REB CBC Assessment',
                    innerHtml: assessmentToWordHtml(active.data, showAnswers),
                    onNotify: onToast,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span data-i18n="print">{t('print')}</span>
              </button>
              <button
                id="copyAssessment"
                type="button"
                onClick={() => onCopy(assessmentToPlainText(active.data, showAnswers))}
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
                    assessmentToWordHtml(active.data, showAnswers)
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
            <div className="border-b border-[var(--border)] pb-4">
              <h2 className="font-display text-xl font-bold text-[var(--text)]">
                {active.data.title}
              </h2>
              <div className="mt-1.5 text-xs text-[var(--muted)] flex flex-wrap items-center gap-2">
                <span>{active.subject}</span>
                <span aria-hidden="true">·</span>
                <span>{active.classLevel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular font-semibold">
                  Total Marks: {active.data.totalMarks}
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--text)]">
                <strong>Instructions:</strong> {active.data.instructions}
              </p>
            </div>

            <div className="space-y-5">
              {(active.data.questions ?? []).map((q) => (
                <div key={q.number} className="space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-[var(--text)]">
                      <span className="font-mono-tabular font-bold mr-1.5">{q.number}.</span>
                      {q.question}
                    </p>
                    <span className="font-mono-tabular text-xs font-semibold text-[var(--muted)] shrink-0">
                      [{q.marks} pts]
                    </span>
                  </div>
                  {(q.options ?? []).length > 0 && (
                    <ul className="pl-6 space-y-1 text-sm text-[var(--text)]">
                      {(q.options ?? []).map((opt, idx) => (
                        <li key={idx}>{opt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {showAnswers && (
              <div className="pt-5 border-t border-[var(--border)] space-y-3">
                <h3 className="font-display text-base font-bold text-[#15803D] dark:text-[#4ade80]">
                  Answer Key &amp; Marking Scheme
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse border border-[var(--border)]">
                    <thead>
                      <tr className="bg-[var(--surface-subtle)]">
                        <th className="border border-[var(--border)] px-3 py-2 text-left w-12">#</th>
                        <th className="border border-[var(--border)] px-3 py-2 text-left">Answer</th>
                        <th className="border border-[var(--border)] px-3 py-2 text-left w-20">Marks</th>
                        <th className="border border-[var(--border)] px-3 py-2 text-left">
                          Marking Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(active.data.questions ?? []).map((q) => (
                        <tr key={q.number}>
                          <td className="border border-[var(--border)] px-3 py-2 font-mono-tabular">
                            {q.number}
                          </td>
                          <td className="border border-[var(--border)] px-3 py-2 font-medium">
                            {q.answer}
                          </td>
                          <td className="border border-[var(--border)] px-3 py-2 font-mono-tabular">
                            {q.marks}
                          </td>
                          <td className="border border-[var(--border)] px-3 py-2 text-[var(--muted)]">
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
      <div className="no-print rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-[var(--text)]">
            <History className="w-4 h-4 text-[#15803D]" />
            Recent Assessment History
          </span>
          <span className="text-xs font-mono-tabular text-[var(--muted)]">{safeHistory.length} saved</span>
        </div>

        {safeHistory.length === 0 ? (
          <div className="p-5 text-sm text-[var(--muted)]">
            Generated assessments are saved here automatically for quick review and printing.
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
                    {item.data?.title || item.topic || 'Assessment'}
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
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy(assessmentToPlainText(item.data, true))}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    title="Copy"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(item);
                      setTimeout(() => {
                        printOrDownloadHtml({
                          filename: `Assessment_${item.subject}_${item.classLevel}`.replace(
                            /[^a-zA-Z0-9_-]+/g,
                            '_'
                          ),
                          title: item.data.title || 'REB CBC Assessment',
                          innerHtml: assessmentToWordHtml(item.data, true),
                          onNotify: onToast,
                        });
                      }, 100);
                    }}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    title="Print"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteItem(item.id)}
                    className="p-1.5 text-[var(--muted)] hover:text-red-600 cursor-pointer"
                    title="Delete"
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
