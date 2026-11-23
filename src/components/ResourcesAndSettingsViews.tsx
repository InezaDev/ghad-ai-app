import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppBackup, Lang, TeacherProfile, ThemeMode } from '../types/ghad';
import { translate } from '../i18n/translations';
import { buildBackupPayload } from '../utils/storage';

export const ResourcesView: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = (k: string) => translate(lang, k);

  const portals = [
    {
      title: 'Rwanda Basic Education Board (REB)',
      desc: 'Official curriculum frameworks, national syllabi, and teacher development updates.',
      url: 'https://www.reb.gov.rw',
    },
    {
      title: 'REB e-Learning Platform',
      desc: 'Digital textbooks, teacher guides, and CBC interactive modules for P1–S6.',
      url: 'https://elearning.reb.rw',
    },
    {
      title: 'Ministry of Education (MINEDUC)',
      desc: 'National education policies, academic calendars, and school inspection standards.',
      url: 'https://www.mineduc.gov.rw',
    },
  ];

  return (
    <section id="view-resources" className="view-animate space-y-6">
      <div>
        <h1 data-i18n="res_title" className="font-display text-2xl font-bold text-[var(--text)]">
          {t('res_title')}
        </h1>
        <p data-i18n="res_sub" className="text-sm text-[var(--muted)] mt-1">
          {t('res_sub')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {portals.map((p) => (
          <a
            key={p.url}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[#15803D] transition-colors flex flex-col justify-between gap-4"
          >
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text)]">{p.title}</h2>
              <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{p.desc}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] dark:text-[#4ade80]">
              Visit Portal <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </a>
        ))}
      </div>

      <div className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
        <h2 className="font-display text-base font-bold text-[var(--text)]">
          REB CBC Lesson Plan Checklist
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[var(--muted)]">
          <div>
            <strong className="text-[var(--text)]">Instructional Objective (4 Parts):</strong>
            <p className="mt-1">
              Condition (materials/context) + Who (learners) + Action/Behavior (measurable Bloom
              verb) + Standard (criteria/accuracy).
            </p>
          </div>
          <div>
            <strong className="text-[var(--text)]">Cross-Cutting Issues (REB):</strong>
            <p className="mt-1">
              Genocide Studies, Environment &amp; Sustainability, Gender, Comprehensive Sexuality
              Education, Peace &amp; Values, Financial Education, Standardization Culture, Inclusive
              Education.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

interface SettingsViewProps {
  lang: Lang;
  theme: ThemeMode;
  profile: TeacherProfile;
  onChangeLang: (lang: Lang) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onSaveProfile: (profile: TeacherProfile) => void;
  onImportBackup: (backup: AppBackup) => void;
  onClearAll: () => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  lang,
  theme,
  profile,
  onChangeLang,
  onChangeTheme,
  onSaveProfile,
  onImportBackup,
  onClearAll,
  onToast,
}) => {
  const t = (k: string) => translate(lang, k);
  const [schoolName, setSchoolName] = useState(profile?.schoolName || '');
  const [teacherName, setTeacherName] = useState(profile?.teacherName || '');
  const [defaultTerm, setDefaultTerm] = useState(profile?.defaultTerm || 'Term 1');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSchoolName(profile?.schoolName || '');
    setTeacherName(profile?.teacherName || '');
    setDefaultTerm(profile?.defaultTerm || 'Term 1');
  }, [profile?.schoolName, profile?.teacherName, profile?.defaultTerm]);

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      schoolName: (schoolName || '').trim(),
      teacherName: (teacherName || '').trim(),
      defaultTerm: defaultTerm || 'Term 1',
    });
    onToast('Teacher profile defaults saved.', 'success');
  };

  const handleExportBackup = () => {
    const payload = buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghad-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Backup JSON downloaded.', 'success');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}')) as AppBackup;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.plans)) {
          throw new Error('Invalid GHAD AI backup file.');
        }
        onImportBackup(parsed);
        if (parsed.profile) {
          setSchoolName(parsed.profile.schoolName || '');
          setTeacherName(parsed.profile.teacherName || '');
          setDefaultTerm(parsed.profile.defaultTerm || 'Term 1');
        }
        onToast('Backup restored successfully!', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to parse backup file.';
        onToast(msg, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <section id="view-settings" className="view-animate space-y-6">
      <div>
        <h1 data-i18n="settings_title" className="font-display text-2xl font-bold text-[var(--text)]">
          {t('settings_title')}
        </h1>
        <p data-i18n="settings_sub" className="text-sm text-[var(--muted)] mt-1">
          {t('settings_sub')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Teacher Profile Defaults */}
        <form
          onSubmit={handleProfileSave}
          className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4"
        >
          <h2 className="font-display text-base font-bold text-[var(--text)]">
            Teacher Profile Defaults
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Automatically pre-fills School Name, Teacher’s Name, and Term on every new REB lesson plan.
          </p>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="cbc_school">{t('cbc_school')}</span>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. GS Kigali / Lycée de Kigali"
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="cbc_teacher">{t('cbc_teacher')}</span>
            <input
              type="text"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="e.g. Uwimana Alice"
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <span data-i18n="f_term">{t('f_term')}</span>
            <select
              value={defaultTerm}
              onChange={(e) => setDefaultTerm(e.target.value)}
              className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#15803D] hover:bg-[#166534] text-white transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Defaults
          </button>
        </form>

        {/* Language, Theme & Data Backup */}
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
            <h2 className="font-display text-base font-bold text-[var(--text)]">
              Workspace Language &amp; Theme
            </h2>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
              <span data-i18n="settings_lang">{t('settings_lang')}</span>
              <select
                id="settingsLang"
                value={lang}
                onChange={(e) => onChangeLang(e.target.value as Lang)}
                className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              >
                <option value="en">English</option>
                <option value="rw">Ikinyarwanda</option>
                <option value="fr">Français</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
              <span data-i18n="theme_label">{t('theme_label')}</span>
              <select
                id="settingsTheme"
                value={theme}
                onChange={(e) => onChangeTheme(e.target.value as ThemeMode)}
                className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              >
                <option value="auto" data-i18n="theme_auto">{t('theme_auto')}</option>
                <option value="light" data-i18n="theme_light">{t('theme_light')}</option>
                <option value="dark" data-i18n="theme_dark">{t('theme_dark')}</option>
              </select>
            </label>
          </div>

          <div className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
            <h2 className="font-display text-base font-bold text-[var(--text)]">
              Data Backup &amp; Restore
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Export all saved REB lesson plans, chats, assessments, and methodologies as a `.json` file to transfer across devices.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export Backup (.json)
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Import Backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />

              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg text-red-600 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All History
                </button>
              ) : (
                <div className="w-full p-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    Delete all saved plans, chats, and history?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClearAll();
                        setConfirmClear(false);
                      }}
                      className="px-3 py-1 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                    >
                      Yes, Clear All
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-3 py-1 text-xs font-semibold rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
