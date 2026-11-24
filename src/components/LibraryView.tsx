import React, { useMemo, useState } from 'react';
import { BookOpen, CopyPlus, FolderOpen, Printer, Search, Trash2 } from 'lucide-react';
import { Lang, SavedPlan } from '../types/ghad';
import { translate } from '../i18n/translations';

interface LibraryViewProps {
  lang: Lang;
  plans: SavedPlan[];
  onOpenPlan: (saved: SavedPlan) => void;
  onDuplicatePlan: (saved: SavedPlan) => void;
  onPrintPlan: (saved: SavedPlan) => void;
  onDeletePlan: (id: string) => void;
  onCreateNew: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  lang,
  plans,
  onOpenPlan,
  onDuplicatePlan,
  onPrintPlan,
  onDeletePlan,
  onCreateNew,
}) => {
  const t = (k: string) => translate(lang, k);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');

  const subjects = useMemo(
    () => Array.from(new Set(plans.map((p) => p.plan.subject).filter(Boolean))).sort(),
    [plans]
  );
  const classes = useMemo(
    () => Array.from(new Set(plans.map((p) => p.plan.classLevel).filter(Boolean))).sort(),
    [plans]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((item) => {
      if (subjectFilter !== 'ALL' && item.plan.subject !== subjectFilter) return false;
      if (classFilter !== 'ALL' && item.plan.classLevel !== classFilter) return false;
      if (!q) return true;
      return (
        item.plan.lessonTitle.toLowerCase().includes(q) ||
        item.plan.subject.toLowerCase().includes(q) ||
        item.plan.classLevel.toLowerCase().includes(q) ||
        item.plan.unitNo.toLowerCase().includes(q)
      );
    });
  }, [plans, query, subjectFilter, classFilter]);

  return (
    <section id="view-library" className="view-animate space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 data-i18n="library_title" className="font-display text-2xl font-bold text-[var(--text)]">
            {t('library_title')}
          </h1>
          <p data-i18n="library_sub" className="text-sm text-[var(--muted)] mt-1">
            {t('library_sub')}
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap"
        >
          <BookOpen className="w-4 h-4" />
          <span data-i18n="cta_lesson">{t('cta_lesson')}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="holo-glass holo-reticle p-4 rounded-2xl border border-[#38bdf8]/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('lib_search_ph')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
          />
        </div>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          aria-label={t('lib_all_subjects')}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
        >
          <option value="ALL">{t('lib_all_subjects')}</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          aria-label={t('lib_all_classes')}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
        >
          <option value="ALL">{t('lib_all_classes')}</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Plans List */}
      {plans.length === 0 ? (
        <div className="holo-glass holo-reticle p-10 rounded-2xl border border-[#38bdf8]/30 text-center space-y-3">
          <p className="font-display font-semibold text-base text-[var(--text)]">
            {t('lib_empty_title')}
          </p>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            {t('lib_empty_desc')}
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] cursor-pointer"
          >
            {t('lib_open_planner')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="holo-glass p-8 rounded-2xl border border-[#38bdf8]/25 text-center text-sm text-[var(--muted)]">
          {t('lib_no_match')}
        </div>
      ) : (
        <div className="perspective-stage grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="holo-glass holo-reticle card-3d-tilt p-5 rounded-2xl border border-[#38bdf8]/25 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="text-xs text-[var(--muted)] flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#15803D] dark:text-[#4ade80]">
                    {item.plan.subject}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.plan.classLevel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{item.plan.durationMinutes} min</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-base font-bold text-[var(--text)]">
                  {item.plan.lessonTitle || t('lib_untitled')}
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                  {item.plan.unitNo ? `${item.plan.unitNo} — ` : ''}
                  {item.plan.keyUnitCompetence || item.plan.schoolName || t('out_lesson')}
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenPlan(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('lib_open_edit')}
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicatePlan(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                >
                  <CopyPlus className="w-3.5 h-3.5" />
                  {t('lib_duplicate')}
                </button>
                <button
                  type="button"
                  onClick={() => onPrintPlan(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {t('print_btn')}
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePlan(item.id)}
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('delete_short')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
