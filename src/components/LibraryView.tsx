import React, { useMemo, useState } from 'react';
import { BookOpen, CopyPlus, FileText, FolderOpen, GraduationCap, Layers, Printer, Search, Trash2 } from 'lucide-react';
import { Lang, SavedAssessment, SavedMethodology, SavedPlan } from '../types/ghad';
import { translate } from '../i18n/translations';

interface LibraryViewProps {
  lang: Lang;
  plans: SavedPlan[];
  assessments: SavedAssessment[];
  methodologies: SavedMethodology[];
  onOpenPlan: (saved: SavedPlan) => void;
  onDuplicatePlan: (saved: SavedPlan) => void;
  onPrintPlan: (saved: SavedPlan) => void;
  onDeletePlan: (id: string) => void;
  onOpenAssessment: (saved: SavedAssessment) => void;
  onPrintAssessment: (saved: SavedAssessment) => void;
  onDeleteAssessment: (id: string) => void;
  onOpenMethodology: (saved: SavedMethodology) => void;
  onPrintMethodology: (saved: SavedMethodology) => void;
  onDeleteMethodology: (id: string) => void;
  onCreateNew: () => void;
}

type LibraryItemType = 'all' | 'plan' | 'assessment' | 'methodology';

interface UnifiedLibraryItem {
  id: string;
  type: 'plan' | 'assessment' | 'methodology';
  subject: string;
  classLevel: string;
  title: string;
  subtitle: string;
  date: string;
  raw: SavedPlan | SavedAssessment | SavedMethodology;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  lang,
  plans,
  assessments,
  methodologies,
  onOpenPlan,
  onDuplicatePlan,
  onPrintPlan,
  onDeletePlan,
  onOpenAssessment,
  onPrintAssessment,
  onDeleteAssessment,
  onOpenMethodology,
  onPrintMethodology,
  onDeleteMethodology,
  onCreateNew,
}) => {
  const t = (k: string) => translate(lang, k);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<LibraryItemType>('all');

  const allItems = useMemo<UnifiedLibraryItem[]>(() => {
    const result: UnifiedLibraryItem[] = [];

    plans.forEach((p) => {
      result.push({
        id: `plan_${p.id}`,
        type: 'plan',
        subject: p.plan.subject || '',
        classLevel: p.plan.classLevel || '',
        title: p.plan.lessonTitle || t('lib_untitled') || 'Untitled Lesson Plan',
        subtitle: `${p.plan.unitNo ? `Unit ${p.plan.unitNo} — ` : ''}${p.plan.keyUnitCompetence || p.plan.schoolName || ''}`,
        date: p.updatedAt || p.createdAt || '',
        raw: p,
      });
    });

    assessments.forEach((a) => {
      result.push({
        id: `assess_${a.id}`,
        type: 'assessment',
        subject: a.subject || '',
        classLevel: a.classLevel || '',
        title: a.data?.title || a.topic || 'Assessment & Marking Scheme',
        subtitle: `${a.assessmentType || 'Test'} • ${a.difficulty || 'medium'} • ${a.topic || ''}`,
        date: a.createdAt || '',
        raw: a,
      });
    });

    methodologies.forEach((m) => {
      result.push({
        id: `method_${m.id}`,
        type: 'methodology',
        subject: m.subject || '',
        classLevel: m.classLevel || '',
        title: m.data?.title || m.topic || 'Methodology Guide',
        subtitle: `${m.topic || ''} • Active Learner-Centred Guide`,
        date: m.createdAt || '',
        raw: m,
      });
    });

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [plans, assessments, methodologies, t]);

  const subjects = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.subject).filter(Boolean))).sort(),
    [allItems]
  );

  const classes = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.classLevel).filter(Boolean))).sort(),
    [allItems]
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (subjectFilter !== 'ALL' && item.subject !== subjectFilter) return false;
      if (classFilter !== 'ALL' && item.classLevel !== classFilter) return false;
      if (!q) return true;

      return (
        item.title.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.classLevel.toLowerCase().includes(q)
      );
    });
  }, [allItems, query, subjectFilter, classFilter, typeFilter]);

  const totalCount = allItems.length;
  const planCount = plans.length;
  const assessmentCount = assessments.length;
  const methodologyCount = methodologies.length;

  return (
    <section id="view-library" className="view-animate space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 data-i18n="library_title" className="font-display text-2xl font-bold text-[var(--text)]">
            {t('library_title')}
          </h1>
          <p data-i18n="library_sub" className="text-sm text-[var(--muted)] mt-1">
            {t('library_sub')} — Lesson plans, assessments, and methodology guides.
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

      {/* Type Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            typeFilter === 'all'
              ? 'bg-[#15803D] text-white shadow-sm'
              : 'bg-[var(--surface-subtle)] text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Items ({totalCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter('plan')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            typeFilter === 'plan'
              ? 'bg-[#15803D] text-white shadow-sm'
              : 'bg-[var(--surface-subtle)] text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Lesson Plans ({planCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter('assessment')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            typeFilter === 'assessment'
              ? 'bg-[#15803D] text-white shadow-sm'
              : 'bg-[var(--surface-subtle)] text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Assessments ({assessmentCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter('methodology')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            typeFilter === 'methodology'
              ? 'bg-[#15803D] text-white shadow-sm'
              : 'bg-[var(--surface-subtle)] text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Methodology Guides ({methodologyCount})</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="holo-glass holo-reticle p-4 rounded-2xl border border-[#38bdf8]/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plans, assessments, methodologies by title or subject..."
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

      {/* Library Items List */}
      {allItems.length === 0 ? (
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
      ) : filteredItems.length === 0 ? (
        <div className="holo-glass p-8 rounded-2xl border border-[#38bdf8]/25 text-center text-sm text-[var(--muted)]">
          {t('lib_no_match')}
        </div>
      ) : (
        <div className="perspective-stage grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            if (item.type === 'plan') {
              const planItem = item.raw as SavedPlan;
              return (
                <article
                  key={item.id}
                  className="holo-glass holo-reticle card-3d-tilt p-5 rounded-2xl border border-[#38bdf8]/25 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="text-xs text-[var(--muted)] flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Lesson Plan
                      </span>
                      <span className="font-semibold text-[#15803D] dark:text-[#4ade80]">
                        {planItem.plan.subject}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{planItem.plan.classLevel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{planItem.plan.durationMinutes} min</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {new Date(planItem.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-base font-bold text-[var(--text)]">
                      {planItem.plan.lessonTitle || t('lib_untitled')}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                      {planItem.plan.unitNo ? `Unit ${planItem.plan.unitNo} — ` : ''}
                      {planItem.plan.keyUnitCompetence || planItem.plan.schoolName || t('out_lesson')}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenPlan(planItem)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t('lib_open_edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicatePlan(planItem)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                      {t('lib_duplicate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrintPlan(planItem)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t('print_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePlan(planItem.id)}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('delete_short')}
                    </button>
                  </div>
                </article>
              );
            }

            if (item.type === 'assessment') {
              const assessItem = item.raw as SavedAssessment;
              return (
                <article
                  key={item.id}
                  className="holo-glass holo-reticle card-3d-tilt p-5 rounded-2xl border border-[#38bdf8]/25 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="text-xs text-[var(--muted)] flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                        Assessment
                      </span>
                      <span className="font-semibold text-[#15803D] dark:text-[#4ade80]">
                        {assessItem.subject}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{assessItem.classLevel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {assessItem.data?.questions?.length || 0} Qs
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {new Date(assessItem.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-base font-bold text-[var(--text)]">
                      {assessItem.data?.title || assessItem.topic || 'Assessment'}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                      Topic: {assessItem.topic} ({assessItem.difficulty})
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenAssessment(assessItem)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      View Assessment
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrintAssessment(assessItem)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t('print_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAssessment(assessItem.id)}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('delete_short')}
                    </button>
                  </div>
                </article>
              );
            }

            const methodItem = item.raw as SavedMethodology;
            return (
              <article
                key={item.id}
                className="holo-glass holo-reticle card-3d-tilt p-5 rounded-2xl border border-[#38bdf8]/25 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="text-xs text-[var(--muted)] flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                      Methodology
                    </span>
                    <span className="font-semibold text-[#15803D] dark:text-[#4ade80]">
                      {methodItem.subject}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{methodItem.classLevel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {new Date(methodItem.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="mt-2 font-display text-base font-bold text-[var(--text)]">
                    {methodItem.data?.title || methodItem.topic || 'Methodology Guide'}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                    Topic: {methodItem.topic}
                  </p>
                </div>

                <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenMethodology(methodItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    View Guide
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrintMethodology(methodItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {t('print_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteMethodology(methodItem.id)}
                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('delete_short')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
