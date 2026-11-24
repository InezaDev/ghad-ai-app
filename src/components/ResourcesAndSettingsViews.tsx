import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Download,
  ExternalLink,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppBackup, GraphicsQuality, Lang, TeacherProfile, ThemeMode } from '../types/ghad';
import { translate } from '../i18n/translations';
import { buildBackupPayload } from '../utils/storage';

export const ResourcesView: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = (k: string) => translate(lang, k);

  const portals = [
    {
      title: t('res_reb_title'),
      desc: t('res_reb_desc'),
      url: 'https://www.reb.gov.rw',
    },
    {
      title: t('res_elearn_title'),
      desc: t('res_elearn_desc'),
      url: 'https://elearning.reb.rw',
    },
    {
      title: t('res_mineduc_title'),
      desc: t('res_mineduc_desc'),
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

      <div className="perspective-stage grid grid-cols-1 md:grid-cols-3 gap-4">
        {portals.map((p) => (
          <a
            key={p.url}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="holo-glass holo-reticle card-3d-tilt p-5 rounded-2xl border border-[#38bdf8]/25 hover:border-[#10b981] flex flex-col justify-between gap-4"
          >
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text)]">{p.title}</h2>
              <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{p.desc}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#10b981]">
              {t('res_visit_portal')} <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </a>
        ))}
      </div>

      <div className="holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30 space-y-3">
        <h2 className="font-display text-base font-bold text-[var(--text)]">
          {t('res_checklist_title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[var(--muted)]">
          <div>
            <strong className="text-[var(--text)]">{t('res_obj_parts_title')}</strong>
            <p className="mt-1">{t('res_obj_parts_desc')}</p>
          </div>
          <div>
            <strong className="text-[var(--text)]">{t('res_cci_title')}</strong>
            <p className="mt-1">{t('res_cci_desc')}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

interface SettingsViewProps {
  lang: Lang;
  theme: ThemeMode;
  graphicsQuality: GraphicsQuality;
  profile: TeacherProfile;
  onChangeLang: (lang: Lang) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeGraphicsQuality: (quality: GraphicsQuality) => void;
  onSaveProfile: (profile: TeacherProfile) => void;
  onImportBackup: (backup: AppBackup) => void;
  onClearAll: () => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  lang,
  theme,
  graphicsQuality,
  profile,
  onChangeLang,
  onChangeTheme,
  onChangeGraphicsQuality,
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
    onToast(t('set_profile_saved'), 'success');
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
    onToast(t('set_backup_exported'), 'success');
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
        onToast(t('set_backup_restored'), 'success');
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
        {/* Left Column: Teacher Profile Defaults */}
        <div className="space-y-6">
          <form
            onSubmit={handleProfileSave}
            className="holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-[var(--text)]">
              {t('set_profile_title')}
            </h2>
            <p className="text-xs text-[var(--muted)]">{t('set_profile_desc')}</p>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
              <span data-i18n="cbc_school">{t('cbc_school')}</span>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder={t('lesson_ph_school')}
                className="px-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
              <span data-i18n="cbc_teacher">{t('cbc_teacher')}</span>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder={t('lesson_ph_teacher')}
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
                <option value="Term 1">{t('term_term_1')}</option>
                <option value="Term 2">{t('term_term_2')}</option>
                <option value="Term 3">{t('term_term_3')}</option>
              </select>
            </label>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#15803D] hover:bg-[#166534] text-white transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {t('set_save_defaults')}
            </button>
          </form>
        </div>

        {/* Right Column: Language, Theme, 3D Graphics & Data Backup */}
        <div className="space-y-6">
          <div className="holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30 space-y-4">
            <h2 className="font-display text-base font-bold text-[var(--text)]">
              {t('set_lang_theme_title')}
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
                <option value="sw">Kiswahili</option>
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

          <div className="holo-glass holo-reticle p-6 rounded-2xl border border-[#10b981]/30 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#10b981]" />
              <h2 className="font-display text-base font-bold text-[var(--text)]">
                {t('set_graphics_title')}
              </h2>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">{t('set_graphics_desc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                data-testid="graphics-ultra-btn"
                aria-pressed={graphicsQuality === 'ultra'}
                onClick={() => onChangeGraphicsQuality('ultra')}
                className={`px-3.5 py-2.5 text-xs font-semibold rounded-xl border text-left transition-colors cursor-pointer ${
                  graphicsQuality === 'ultra'
                    ? 'border-[#10b981] bg-[#10b981]/15 text-[#10b981]'
                    : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-[#38bdf8]'
                }`}
              >
                {t('set_graphics_ultra')}
              </button>
              <button
                type="button"
                data-testid="graphics-low-btn"
                aria-pressed={graphicsQuality === 'low'}
                onClick={() => onChangeGraphicsQuality('low')}
                className={`px-3.5 py-2.5 text-xs font-semibold rounded-xl border text-left transition-colors cursor-pointer ${
                  graphicsQuality === 'low'
                    ? 'border-[#38bdf8] bg-[#38bdf8]/15 text-[#38bdf8]'
                    : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] hover:border-[#38bdf8]'
                }`}
              >
                {t('set_graphics_low')}
              </button>
            </div>
          </div>

          <div className="holo-glass holo-reticle p-6 rounded-2xl border border-[#38bdf8]/30 space-y-4">
            <h2 className="font-display text-base font-bold text-[var(--text)]">
              {t('set_backup_title')}
            </h2>
            <p className="text-xs text-[var(--muted)]">{t('set_backup_desc')}</p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {t('set_export_backup')}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                {t('set_import_backup')}
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
                  {t('set_clear_all')}
                </button>
              ) : (
                <div className="w-full p-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    {t('set_confirm_clear')}
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
                      {t('set_yes_clear')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-3 py-1 text-xs font-semibold rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] cursor-pointer"
                    >
                      {t('cancel_btn')}
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
