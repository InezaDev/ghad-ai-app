import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  Printer,
  Sparkles,
  WifiOff,
  Zap,
} from 'lucide-react';
import { GraphicsQuality, Lang, ViewName } from '../types/ghad';
import { translate } from '../i18n/translations';
import { HeroScene3D } from './HeroScene3D';

const QUICK_CLASSES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const QUICK_SUBJECTS = [
  'Social & Religious Studies (SRS)',
  'Mathematics',
  'Biology',
  'Physics',
  'Chemistry',
  'English',
  'Kinyarwanda',
  'French',
  'Geography',
  'History & Citizenship',
  'Science & Elementary Technology (SET)',
  'ICT / Computer Science',
  'Entrepreneurship',
];

const SUBJECT_SAMPLE_MAP: Record<string, { unit: string; title: string; intro: string; dev: string }> = {
  'Social & Religious Studies (SRS)': {
    unit: 'Unit 1 · Equity & Social Cohesion',
    title: 'Equity and Equality in Our Community',
    intro: '1. Greet learners & check inclusive seating. 2. Discuss fairness box scenario.',
    dev: '1. Compare scenario cards in groups. 2. Present definitions. 3. Short role-play.',
  },
  Mathematics: {
    unit: 'Unit 4 · Fractions',
    title: 'Addition of Fractions with Same Denominator',
    intro: '1. Review shaded 1/4 circle on chalkboard. 2. Connect to equal sharing.',
    dev: '1. Fold & shade paper strips in pairs. 2. Harmonize rule. 3. Solve 3 practice items.',
  },
  Biology: {
    unit: 'Unit 3 · Plant Nutrition',
    title: 'Photosynthesis & Leaf Structure',
    intro: '1. Examine fresh green leaves. 2. Ask how plants make food using sunlight.',
    dev: '1. Group leaf-vein observation. 2. Summarize light & chlorophyll equation.',
  },
};

interface LandingPageProps {
  lang: Lang;
  graphicsQuality?: GraphicsQuality;
  user: User | null;
  onChangeLang: (lang: Lang) => void;
  onLaunch: (view: ViewName) => void;
  onQuickLaunchLesson?: (prefill: { subject: string; classLevel: string }) => void;
  onOpenAuth: (mode?: 'signin' | 'register') => void;
  onSignOut: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  lang,
  graphicsQuality = 'ultra',
  user,
  onChangeLang,
  onLaunch,
  onQuickLaunchLesson,
  onOpenAuth,
  onSignOut,
}) => {
  const t = (k: string) => translate(lang, k);
  const year = new Date().getFullYear();

  const [quickClass, setQuickClass] = useState('P4');
  const [quickSubject, setQuickSubject] = useState('Social & Religious Studies (SRS)');
  const [heroShowcaseTab, setHeroShowcaseTab] = useState<'3d' | 'sheet'>('3d');

  const samplePreview = SUBJECT_SAMPLE_MAP[quickSubject] || {
    unit: `Unit 1 · ${quickSubject}`,
    title: `Core Concepts in ${quickSubject}`,
    intro: '1. Review prior knowledge orally. 2. Introduce the day’s learning objective.',
    dev: '1. Mixed-ability group investigation. 2. Board synthesis & guided practice.',
  };

  const handleQuickTry = (e: React.FormEvent) => {
    e.preventDefault();
    if (onQuickLaunchLesson) {
      onQuickLaunchLesson({ subject: quickSubject, classLevel: quickClass });
    } else {
      onLaunch('lesson');
    }
  };

  return (
    <div id="landingPage" className="relative z-10 min-h-screen bg-transparent text-[var(--text)]">
      {/* Top Bar Contract: Brand wordmark — 4 concise nav links — Primary action */}
      <header className="holo-glass border-b border-[#38bdf8]/25 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-8">
          <a
            href="#top"
            className="flex items-center gap-2 font-display font-bold text-base sm:text-lg tracking-tight text-[var(--text)] whitespace-nowrap shrink-0"
          >
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#0284c7] text-[#030712] grid place-items-center font-extrabold text-sm sm:text-base shadow-[0_0_16px_-4px_rgba(16,185,129,0.7)]">
              G
            </span>
            <span>GHAD AI</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--muted)]">
            <a
              href="#workflow"
              data-i18n="nav_how"
              className="hover:text-[var(--text)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav_how')}
            </a>
            <a
              href="#toolkit"
              data-i18n="nav_toolkit"
              className="hover:text-[var(--text)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav_toolkit')}
            </a>
            <a
              href="#reb-format"
              data-i18n="nav_cbc"
              className="hover:text-[var(--text)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav_cbc')}
            </a>
            <a
              href="#portals"
              data-i18n="nav_links"
              className="hover:text-[var(--text)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav_links')}
            </a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
            <select
              id="lang"
              aria-label={t('lang_label')}
              value={lang}
              onChange={(e) => onChangeLang(e.target.value as Lang)}
              className="max-w-[92px] sm:max-w-none px-2 sm:px-2.5 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            >
              <option value="en">English</option>
              <option value="rw">Ikinyarwanda</option>
              <option value="fr">Français</option>
              <option value="sw">Kiswahili</option>
            </select>

            {user ? (
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-xs">
                <span className="font-semibold text-[var(--text)] max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  title={t('auth_sign_out')}
                  className="text-[var(--muted)] hover:text-red-600 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('signin')}
                title={t('auth_sign_in')}
                aria-label={t('auth_sign_in')}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:border-[#15803D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline" data-i18n="auth_sign_in">{t('auth_sign_in')}</span>
              </button>
            )}

            <button
              id="landingLaunchBtn"
              type="button"
              data-i18n="open_workspace"
              onClick={() => onLaunch('dashboard')}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-[#15803D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t('open_workspace')}
            </button>
          </div>
        </div>
      </header>

      {/* 2-Column Hero Section */}
      <section id="top" className="relative overflow-hidden border-b border-[var(--border)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30"
          style={{
            background:
              'radial-gradient(640px circle at 12% 18%, rgba(21,128,61,0.10), transparent 60%), radial-gradient(560px circle at 88% 15%, rgba(2,132,199,0.10), transparent 60%), radial-gradient(480px circle at 70% 85%, rgba(245,158,11,0.08), transparent 60%)',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#0284C7]/10 text-[#0284C7] dark:text-[#38BDF8] text-xs font-semibold tracking-wide">
                <span aria-hidden="true">🇷🇼</span>
                <span data-i18n="hero_badge">{t('hero_badge')}</span>
              </div>

              <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-[3.35rem] tracking-tight leading-[1.08] text-[var(--text)]">
                <span data-i18n="hero_title_1">{t('hero_title_1')}</span>{' '}
                <span data-i18n="hero_title_2" className="text-[#15803D] dark:text-[#4ADE80]">
                  {t('hero_title_2')}
                </span>
              </h1>

              <p
                data-i18n="hero_sub"
                className="text-base sm:text-lg text-[var(--muted)] max-w-xl leading-relaxed"
              >
                {t('hero_sub')}
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => onLaunch('lesson')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm sm:text-base font-semibold text-white bg-[#15803D] hover:bg-[#166534] rounded-xl shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#FBBF24]" />
                  <span data-i18n="cta_lesson">{t('cta_lesson')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onLaunch('assistant')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm sm:text-base font-semibold text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:border-[#0284C7] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-[#0284C7] dark:text-[#38BDF8]" />
                  <span data-i18n="cta_assistant">{t('cta_assistant')}</span>
                </button>
              </div>

              {/* Interactive Quick-Try Bar */}
              <form
                onSubmit={handleQuickTry}
                className="holo-glass holo-reticle p-4 rounded-xl border border-[#38bdf8]/30 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--muted)]">
                  <span>{t('quick_try_title')}</span>
                  <span className="text-[#0284C7] dark:text-[#38BDF8]">P1–S6</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <select
                    aria-label="Quick select class level"
                    value={quickClass}
                    onChange={(e) => setQuickClass(e.target.value)}
                    className="sm:col-span-3 px-3 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] font-semibold focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  >
                    {QUICK_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Quick select subject"
                    value={quickSubject}
                    onChange={(e) => setQuickSubject(e.target.value)}
                    className="sm:col-span-6 px-3 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  >
                    {QUICK_SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>{t('quick_try_start')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Interactive 3D CBC Showcase + Live REB Lesson Plan Preview */}
            <div className="lg:col-span-6 perspective-stage">
              <div className="relative">
                <div className="holo-glass holo-reticle card-3d-depth p-4 sm:p-5 rounded-2xl border border-[#38bdf8]/35">
                  {/* Top capabilities & 3D/Sheet switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[var(--border)] text-xs font-semibold">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-[#15803D] dark:text-[#4ADE80]">
                        <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
                        {t('cap_ready')}
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-[#0284C7] dark:text-[#38BDF8]">
                        <Printer className="w-3.5 h-3.5" />
                        {t('cap_print')}
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-[var(--muted)]">
                        <WifiOff className="w-3.5 h-3.5" />
                        {t('cap_offline')}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setHeroShowcaseTab('3d')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          heroShowcaseTab === '3d'
                            ? 'bg-[#15803D] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        <Box className="w-3 h-3" />
                        <span>{t('tab_3d')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeroShowcaseTab('sheet')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          heroShowcaseTab === 'sheet'
                            ? 'bg-[#0284C7] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>{t('tab_reb_sheet')}</span>
                      </button>
                    </div>
                  </div>

                  {heroShowcaseTab === '3d' ? (
                    <HeroScene3D lang={lang} graphicsQuality={graphicsQuality} />
                  ) : (
                    /* Miniature Official REB A4 Paper Sheet */
                    <div className="bg-white text-[#0F172A] rounded-md border border-[#CBD5E1] p-3 sm:p-4 text-[11px] leading-snug shadow-sm">
                    <div className="flex items-center justify-between gap-2 pb-2 font-semibold text-[11px]">
                      <span>School: GS Kigali</span>
                      <span>Teacher: J. B. Mugisha</span>
                    </div>

                    <table className="w-full border-collapse border border-[#0F172A] text-[10.5px]">
                      <thead>
                        <tr className="bg-[#ECFDF5] text-[#0F172A] font-bold">
                          <th className="border border-[#1E293B] px-1.5 py-1 text-center">Term</th>
                          <th className="border border-[#1E293B] px-1.5 py-1 text-center">Subject</th>
                          <th className="border border-[#1E293B] px-1.5 py-1 text-center">Class</th>
                          <th className="border border-[#1E293B] px-1.5 py-1 text-center">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-[#1E293B] px-1.5 py-1 text-center">Term 1</td>
                          <td className="border border-[#1E293B] px-1.5 py-1 text-center font-semibold">
                            {quickSubject}
                          </td>
                          <td className="border border-[#1E293B] px-1.5 py-1 text-center font-mono-tabular">
                            {quickClass}
                          </td>
                          <td className="border border-[#1E293B] px-1.5 py-1 text-center font-mono-tabular">
                            40 min
                          </td>
                        </tr>
                        <tr>
                          <th className="border border-[#1E293B] bg-[#ECFDF5] px-1.5 py-1 font-semibold">
                            Unit
                          </th>
                          <td colSpan={3} className="border border-[#1E293B] px-1.5 py-1">
                            {samplePreview.unit}
                          </td>
                        </tr>
                        <tr>
                          <th className="border border-[#1E293B] bg-[#ECFDF5] px-1.5 py-1 font-semibold">
                            Lesson Title
                          </th>
                          <td colSpan={3} className="border border-[#1E293B] px-1.5 py-1 font-semibold">
                            {samplePreview.title}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <table className="w-full border-collapse border border-[#0F172A] text-[10.5px] mt-1.5">
                      <thead>
                        <tr className="bg-[#ECFDF5] text-[#0F172A] font-bold">
                          <th className="border border-[#1E293B] px-1.5 py-1 w-1/5 text-center">
                            Step &amp; Time
                          </th>
                          <th className="border border-[#1E293B] px-1.5 py-1">
                            Description of teaching/learning activities
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-[#1E293B] px-1.5 py-1.5 text-center font-semibold font-mono-tabular">
                            Intro
                            <br />
                            5&apos;
                          </td>
                          <td className="border border-[#1E293B] px-1.5 py-1.5">{samplePreview.intro}</td>
                        </tr>
                        <tr>
                          <td className="border border-[#1E293B] px-1.5 py-1.5 text-center font-semibold font-mono-tabular">
                            Body
                            <br />
                            30&apos;
                          </td>
                          <td className="border border-[#1E293B] px-1.5 py-1.5">{samplePreview.dev}</td>
                        </tr>
                        <tr>
                          <td className="border border-[#1E293B] px-1.5 py-1.5 text-center font-semibold font-mono-tabular">
                            Concl.
                            <br />
                            5&apos;
                          </td>
                          <td className="border border-[#1E293B] px-1.5 py-1.5">
                            1. Recap key points. 2. Exit check &amp; homework.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats & Trust Strip Below Hero */}
          <div className="mt-12 pt-8 border-t border-[var(--border)] grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <strong className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)] font-mono-tabular block">
                {t('stat_4_langs')}
              </strong>
              <span className="text-sm text-[var(--muted)]">{t('stat_langs_list')}</span>
            </div>
            <div>
              <strong className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)] font-mono-tabular block">
                {t('stat_tools_num')}
              </strong>
              <span className="text-sm text-[var(--muted)]">{t('stat_tools_list')}</span>
            </div>
            <div>
              <strong className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)] font-mono-tabular block">
                P1–S6
              </strong>
              <span className="text-sm text-[var(--muted)]">{t('stat_levels_sub')}</span>
            </div>
            <div>
              <strong className="font-display text-2xl sm:text-3xl font-bold text-[#15803D] dark:text-[#4ADE80] block">
                {t('stat_free_title')}
              </strong>
              <span className="text-sm text-[var(--muted)]">{t('stat_free_sub')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Visual 3-Step Guide */}
      <section id="workflow" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="max-w-2xl mb-10">
          <h2 data-i18n="how_title" className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)]">
            {t('how_title')}
          </h2>
          <p data-i18n="how_sub" className="mt-2 text-[var(--muted)]">
            {t('how_sub')}
          </p>
        </div>

        <div className="perspective-stage grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { num: '01', tk: 'step1_t', dk: 'step1_d', accent: 'text-[#0284C7] dark:text-[#38BDF8]' },
            { num: '02', tk: 'step2_t', dk: 'step2_d', accent: 'text-[#F59E0B] dark:text-[#FBBF24]' },
            { num: '03', tk: 'step3_t', dk: 'step3_d', accent: 'text-[#15803D] dark:text-[#4ADE80]' },
          ].map((step) => (
            <article
              key={step.num}
              className="holo-glass holo-reticle card-3d-tilt p-6 rounded-xl border border-[#38bdf8]/25 flex flex-col gap-3"
            >
              <span className={`font-mono-tabular text-sm font-bold ${step.accent}`}>{step.num}</span>
              <h3 data-i18n={step.tk} className="font-display text-lg font-bold text-[var(--text)]">
                {t(step.tk)}
              </h3>
              <p data-i18n={step.dk} className="text-sm text-[var(--muted)] leading-relaxed">
                {t(step.dk)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 4-Tool Bento Showcase */}
      <section id="toolkit" className="bg-[#030712]/35 border-y border-[#38bdf8]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-2xl mb-10">
            <h2 data-i18n="tools_title" className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)]">
              {t('tools_title')}
            </h2>
            <p data-i18n="tools_sub" className="mt-2 text-[var(--muted)]">
              {t('tools_sub')}
            </p>
          </div>

          <div className="perspective-stage grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Bento 1: Lesson Planner (wide) */}
            <button
              type="button"
              onClick={() => onLaunch('lesson')}
              className="holo-glass holo-reticle card-3d-tilt lg:col-span-7 text-left p-6 rounded-2xl border border-[#38bdf8]/25 hover:border-[#10b981] flex flex-col justify-between gap-5 cursor-pointer"
            >
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#15803D] to-[#0284C7] text-white grid place-items-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 data-i18n="tool_lesson_t" className="font-display text-lg font-bold text-[var(--text)]">
                  {t('tool_lesson_t')}
                </h3>
                <p data-i18n="tool_lesson_d" className="text-sm text-[var(--muted)] leading-relaxed">
                  {t('tool_lesson_d')}
                </p>
                <div className="p-3 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-xs text-[var(--text)] font-mono-tabular flex flex-wrap items-center gap-3">
                  <span>Intro: 5&apos;</span>
                  <span aria-hidden="true">·</span>
                  <span>Development: 30&apos;</span>
                  <span aria-hidden="true">·</span>
                  <span>Conclusion: 5&apos;</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#15803D] dark:text-[#4ADE80] font-semibold">
                    40 / 40 min aligned
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#15803D] dark:text-[#4ADE80]">
                <span data-i18n="open">{t('open')}</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            {/* Bento 2: AI Assistant */}
            <button
              type="button"
              onClick={() => onLaunch('assistant')}
              className="holo-glass holo-reticle card-3d-tilt lg:col-span-5 text-left p-6 rounded-2xl border border-[#38bdf8]/25 hover:border-[#38bdf8] flex flex-col justify-between gap-5 cursor-pointer"
            >
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0284C7] to-[#15803D] text-white grid place-items-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 data-i18n="tool_ai_t" className="font-display text-lg font-bold text-[var(--text)]">
                  {t('tool_ai_t')}
                </h3>
                <p data-i18n="tool_ai_d" className="text-sm text-[var(--muted)] leading-relaxed">
                  {t('tool_ai_d')}
                </p>
                <div className="p-3 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-xs text-[var(--muted)]">
                  &ldquo;How do I differentiate a P4 SRS lesson for slow learners and visual needs?&rdquo;
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0284C7] dark:text-[#38BDF8]">
                <span data-i18n="open">{t('open')}</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            {/* Bento 3: Assessment Builder */}
            <button
              type="button"
              onClick={() => onLaunch('assessment')}
              className="holo-glass holo-reticle card-3d-tilt lg:col-span-6 text-left p-6 rounded-2xl border border-[#38bdf8]/25 hover:border-[#f59e0b] flex flex-col justify-between gap-5 cursor-pointer"
            >
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white grid place-items-center">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <h3 data-i18n="tool_assess_t" className="font-display text-lg font-bold text-[var(--text)]">
                  {t('tool_assess_t')}
                </h3>
                <p data-i18n="tool_assess_d" className="text-sm text-[var(--muted)] leading-relaxed">
                  {t('tool_assess_d')}
                </p>
                <div className="p-3 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-xs text-[var(--muted)] flex items-center justify-between gap-2">
                  <span>Q1. Compare equity &amp; equality [4 pts]</span>
                  <span className="font-semibold text-[#15803D] dark:text-[#4ADE80]">{t('bento_marking_key')}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#D97706] dark:text-[#FBBF24]">
                <span data-i18n="open">{t('open')}</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            {/* Bento 4: Methodology Guide */}
            <button
              type="button"
              onClick={() => onLaunch('methodology')}
              className="holo-glass holo-reticle card-3d-tilt lg:col-span-6 text-left p-6 rounded-2xl border border-[#38bdf8]/25 hover:border-[#10b981] flex flex-col justify-between gap-5 cursor-pointer"
            >
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#15803D] to-[#F59E0B] text-white grid place-items-center">
                  <Compass className="w-5 h-5" />
                </div>
                <h3 data-i18n="tool_method_t" className="font-display text-lg font-bold text-[var(--text)]">
                  {t('tool_method_t')}
                </h3>
                <p data-i18n="tool_method_d" className="text-sm text-[var(--muted)] leading-relaxed">
                  {t('tool_method_d')}
                </p>
                <div className="p-3 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-xs text-[var(--muted)] flex items-center justify-between gap-2">
                  <span>Think-Pair-Share · Role-Play · Group Inquiry</span>
                  <span className="inline-flex items-center gap-1 text-[#0284C7] dark:text-[#38BDF8] font-semibold">
                    <FileText className="w-3.5 h-3.5" />
                    {t('bento_sen_ready')}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#15803D] dark:text-[#4ADE80]">
                <span data-i18n="open">{t('open')}</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* REB Format Highlights & Official Portals */}
      <section id="reb-format" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="font-display text-2xl font-bold text-[var(--text)] mb-3">
              {t('reb_highlight_title')}
            </h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              {t('reb_highlight_sub')}
            </p>
            <ul className="space-y-3 text-sm text-[var(--text)]">
              {(['trust_1', 'trust_2', 'trust_3', 'trust_4'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-[#4ADE80] shrink-0" />
                  <span data-i18n={key}>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div id="portals" className="holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30">
            <h3 data-i18n="res_title" className="font-display text-lg font-bold text-[var(--text)] mb-1">
              {t('res_title')}
            </h3>
            <p data-i18n="res_sub" className="text-sm text-[var(--muted)] mb-4">
              {t('res_sub')}
            </p>
            <div className="divide-y divide-[var(--border)]">
              {[
                { name: t('res_reb_title'), url: 'https://www.reb.gov.rw' },
                { name: t('res_elearn_title'), url: 'https://elearning.reb.rw' },
                { name: t('res_mineduc_title'), url: 'https://www.mineduc.gov.rw' },
              ].map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 flex items-center justify-between text-sm font-medium text-[var(--text)] hover:text-[#10b981] transition-colors"
                >
                  <span>{link.name}</span>
                  <ArrowRight className="w-4 h-4 text-[var(--muted)]" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="holo-glass border-t border-[#38bdf8]/20 py-8 px-6 text-center text-sm text-[var(--muted)]">
        <p className="font-medium text-[var(--text)]">
          GHAD AI — <span data-i18n="footer_line">{t('footer_line')}</span>
        </p>
        <p className="mt-1">
          © <span id="footerYear">{year}</span> GHAD AI ·{' '}
          <span data-i18n="footer_rights">{t('footer_rights')}</span>
        </p>
      </footer>
    </div>
  );
};
