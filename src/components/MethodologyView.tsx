import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Copy,
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
import { Lang, SavedMethodology } from '../types/ghad';
import { translate } from '../i18n/translations';
import {
  downloadWordDoc,
  methodologyToPlainText,
  methodologyToWordHtml,
  printOrDownloadHtml,
} from '../utils/export';
import { AiClientError, requestMethodology } from '../services/aiClient';

const RWANDA_CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

export interface MethodologyPrefill {
  subject: string;
  classLevel: string;
  topic: string;
  nonce: number;
}

interface MethodologyViewProps {
  lang: Lang;
  history: SavedMethodology[];
  prefill?: MethodologyPrefill | null;
  onSaveHistory: (next: SavedMethodology[]) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onCopy: (text: string) => void;
}

export const MethodologyView: React.FC<MethodologyViewProps> = ({
  lang,
  history,
  prefill,
  onSaveHistory,
  onToast,
  onCopy,
}) => {
  const t = (k: string) => translate(lang, k);

  const [subject, setSubject] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [customClassSelected, setCustomClassSelected] = useState(false);
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const safeHistory = history.filter((item) => item && item.data);
  const [active, setActive] = useState<SavedMethodology | null>(safeHistory[0] ?? null);

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
    return () => {
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
        signal: controller.signal,
      };

      let methodologyData;
      try {
        methodologyData = await requestMethodology(payload);
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
          methodologyData = await requestMethodology(payload);
        } else {
          throw firstErr;
        }
      }

      if (controller.signal.aborted) return;

      const entry: SavedMethodology = {
        id: `method_${Date.now()}`,
        createdAt: new Date().toISOString(),
        language: lang,
        subject: subject.trim(),
        classLevel: classLevel.trim(),
        topic: topic.trim(),
        data: methodologyData,
      };

      const nextHistory = [entry, ...history];
      onSaveHistory(nextHistory);
      setActive(entry);
      onToast(t('toast_method'), 'success');
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
    onToast(t('method_deleted'), 'info');
  };

  const classSelectValue = customClassSelected
    ? '__OTHER__'
    : RWANDA_CLASSES.includes(classLevel)
    ? classLevel
    : classLevel
    ? '__OTHER__'
    : '';

  return (
    <section id="view-methodology" className="view-animate space-y-6">
      <div className="no-print">
        <h1 data-i18n="method_title" className="font-display text-2xl font-bold text-[var(--text)]">
          {t('method_title')}
        </h1>
        <p data-i18n="method_sub" className="text-sm text-[var(--muted)] mt-1">
          {t('method_sub')}
        </p>
      </div>

      <form
        id="methodologyForm"
        className="no-print holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_subject">{t('f_subject')} *</span>
            <input
              id="methodSubject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={loading}
              placeholder={t('method_ph_subject')}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <label htmlFor="methodClass" data-i18n="f_class">
              {t('f_class')} *
            </label>
            <select
              id="methodClass"
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
                id="methodClassCustom"
                type="text"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                disabled={loading}
                aria-label={t('f_class_other')}
                placeholder={t('method_ph_class')}
                className="mt-1 px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_topic">{t('f_topic')} *</span>
            <input
              id="methodTopic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              placeholder={t('method_ph_topic')}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            id="generateMethodology"
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
                <span data-i18n="btn_method">{t('btn_method')}</span>
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
                  : t('loading_method')}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {subject} · {classLevel} · {topic}
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

      {active?.data && (
        <div
          id="methodologyOutput"
          className="print-only-area holo-glass holo-reticle rounded-2xl border border-[#38bdf8]/30 overflow-hidden"
        >
          <div className="no-print px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-3">
            <strong data-i18n="out_method" className="font-display text-sm font-bold text-[var(--text)]">
              {t('out_method')}
            </strong>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  printOrDownloadHtml({
                    filename: `Methodology_${active.subject}_${active.classLevel}`.replace(
                      /[^a-zA-Z0-9_-]+/g,
                      '_'
                    ),
                    title: active.data.title || 'REB CBC Methodology Guide',
                    innerHtml: methodologyToWordHtml(active.data, lang),
                    onNotify: onToast,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span data-i18n="print">{t('print')}</span>
              </button>
              <button
                id="copyMethodology"
                type="button"
                onClick={() => onCopy(methodologyToPlainText(active.data, lang))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span data-i18n="copy">{t('copy')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadWordDoc(
                    `Methodology_${active.subject}_${active.classLevel}`.replace(/[^a-zA-Z0-9_-]+/g, '_'),
                    active.data.title,
                    methodologyToWordHtml(active.data, lang)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span data-i18n="download_doc">{t('download_doc')}</span>
              </button>
            </div>
          </div>

          <div id="methodologyBody" className="p-6 space-y-6">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--text)]">
                {active.data.title}
              </h2>
              <div className="mt-1 text-xs text-[var(--muted)] flex items-center gap-2">
                <span>{active.subject}</span>
                <span aria-hidden="true">·</span>
                <span>{active.classLevel}</span>
                <span aria-hidden="true">·</span>
                <span>{active.topic}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--text)] leading-relaxed">
                <strong>{t('method_core_approach')}:</strong> {active.data.coreApproach}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-[var(--border)]">
                <thead>
                  <tr className="bg-[var(--surface-subtle)]">
                    <th className="border border-[var(--border)] px-3 py-2 text-left">{t('method_col_strategy')}</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-left w-24">{t('method_col_timing')}</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-left">{t('method_col_desc')}</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-left">{t('method_col_teacher')}</th>
                    <th className="border border-[var(--border)] px-3 py-2 text-left">{t('method_col_learner')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(active.data.strategies ?? []).map((s, idx) => (
                    <tr key={idx}>
                      <td className="border border-[var(--border)] px-3 py-2 font-semibold">{s.name}</td>
                      <td className="border border-[var(--border)] px-3 py-2 font-mono-tabular">
                        {s.durationHint}
                      </td>
                      <td className="border border-[var(--border)] px-3 py-2">{s.description}</td>
                      <td className="border border-[var(--border)] px-3 py-2">{s.teacherRole}</td>
                      <td className="border border-[var(--border)] px-3 py-2">{s.learnerRole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="perspective-stage grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[var(--border)]">
              <div className="holo-glass card-3d-tilt p-4 rounded-xl border border-[#38bdf8]/20">
                <h3 className="font-display text-sm font-bold text-[var(--text)] mb-2">
                  {t('method_sen_title')}
                </h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {active.data.differentiationSen}
                </p>

                <h3 className="font-display text-sm font-bold text-[var(--text)] mt-4 mb-2">
                  {t('method_formative_title')}
                </h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text)]">
                  {(active.data.formativeChecks ?? []).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              <div className="holo-glass card-3d-tilt p-4 rounded-xl border border-[#10b981]/25">
                <h3 className="font-display text-sm font-bold text-[var(--text)] mb-2">
                  {t('method_materials_title')}
                </h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text)]">
                  {(active.data.recommendedMaterials ?? []).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent History */}
      <div className="no-print holo-glass rounded-2xl border border-[#38bdf8]/25 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold text-[var(--text)]">
            <History className="w-4 h-4 text-[#15803D]" />
            {t('method_history_title')}
          </span>
          <span className="text-xs font-mono-tabular text-[var(--muted)]">{safeHistory.length} {t('saved_label')}</span>
        </div>

        {safeHistory.length === 0 ? (
          <div className="p-5 text-sm text-[var(--muted)]">
            {t('method_history_empty')}
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
                    {item.data?.title || item.topic || t('nav_methodology')}
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
                    onClick={() => onCopy(methodologyToPlainText(item.data, lang))}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    title={t('copy_short')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(item);
                      setTimeout(() => {
                        printOrDownloadHtml({
                          filename: `Methodology_${item.subject}_${item.classLevel}`.replace(
                            /[^a-zA-Z0-9_-]+/g,
                            '_'
                          ),
                          title: item.data.title || 'REB CBC Methodology Guide',
                          innerHtml: methodologyToWordHtml(item.data, lang),
                          onNotify: onToast,
                        });
                      }, 100);
                    }}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    title={t('print_btn')}
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
