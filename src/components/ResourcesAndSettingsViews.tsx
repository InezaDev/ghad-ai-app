import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppBackup, Lang, TeacherProfile, ThemeMode } from '../types/ghad';
import { translate } from '../i18n/translations';
import { buildBackupPayload } from '../utils/storage';
import {
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
  testGeminiApiKey,
} from '../services/aiClient';

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
  const [customApiKey, setCustomApiKey] = useState(() => getStoredGeminiApiKey());
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
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

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customApiKey.trim();
    setStoredGeminiApiKey(clean);
    setTestStatus('idle');
    setTestMessage('');
    if (clean) {
      onToast('Gemini API key saved in browser storage.', 'success');
    } else {
      onToast('Gemini API key removed. Using built-in CBC fallback engine.', 'info');
    }
  };

  const handleClearApiKey = () => {
    setCustomApiKey('');
    setStoredGeminiApiKey('');
    setTestStatus('idle');
    setTestMessage('');
    onToast('API key cleared.', 'info');
  };

  const handleTestKey = async () => {
    if (!customApiKey.trim()) {
      onToast('Please enter an API key to test.', 'warning');
      return;
    }
    setTestStatus('testing');
    setTestMessage('Testing API connection with Gemini 3.8 Flash…');
    const result = await testGeminiApiKey(customApiKey.trim());
    if (result.success) {
      setTestStatus('success');
      setTestMessage(result.message);
      onToast('API key is valid and working!', 'success');
    } else {
      setTestStatus('error');
      setTestMessage(result.message);
      onToast('API key test returned an error. See details below.', 'error');
    }
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

  const isSessionToken = customApiKey.trim().startsWith('AQ.');
  const isValidFormat = customApiKey.trim().startsWith('AIzaSy');

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
        {/* Left Column: Teacher Profile Defaults & Gemini API Configuration */}
        <div className="space-y-6">
          {/* Gemini API Configuration Card */}
          <div className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#0284C7]/15 text-[#0284C7] dark:text-[#38BDF8] grid place-items-center">
                  <KeyRound className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="font-display text-base font-bold text-[var(--text)]">
                    Gemini API Configuration
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Real-time AI generation via Gemini 3.8 Flash, 3.1 Flash-Lite, and Gemini 4 Hydrogen
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              {isValidFormat ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  Standard Key Active
                </span>
              ) : isSessionToken ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <ShieldAlert className="w-3 h-3" />
                  Session Token (Offline Fallback Active)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Built-in CBC Engine Active
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--muted)] leading-relaxed">
              GHAD AI features a resilient multi-model pipeline with an integrated offline Rwanda REB CBC generator.
              If Google’s API encounters temporary high demand (503) or quota limits, your lesson plans and teaching assistant continue working seamlessly without errors.
            </p>

            {isSessionToken && (
              <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  Notice: Token format &apos;AQ....&apos; detected
                </div>
                <p className="leading-relaxed">
                  Keys starting with <code className="font-mono px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60">AQ.</code> are internal session/OAuth tokens, not standard Gemini API keys. Standard keys start with <code className="font-mono px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60">AIzaSy...</code>.
                  GHAD AI will automatically use the built-in CBC engine whenever Google’s API returns 503 high demand. You can get a free standard key from Google AI Studio.
                </p>
              </div>
            )}

            <form onSubmit={handleSaveApiKey} className="space-y-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <span>Gemini API Key</span>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={customApiKey}
                    onChange={(e) => {
                      setCustomApiKey(e.target.value);
                      setTestStatus('idle');
                      setTestMessage('');
                    }}
                    placeholder="AIzaSy..."
                    className="w-full pl-3 pr-10 py-2 text-sm font-mono rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {testStatus !== 'idle' && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    testStatus === 'testing'
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-900'
                      : testStatus === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900'
                      : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900'
                  }`}
                >
                  {testStatus === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                  ) : testStatus === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{testMessage}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#15803D] hover:bg-[#166534] text-white transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Key
                </button>

                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={testStatus === 'testing'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[#0284C7] text-[var(--text)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testStatus === 'testing' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Test Connection
                </button>

                {customApiKey && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Key
                  </button>
                )}

                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-[#0284C7] dark:text-[#38BDF8] hover:underline"
                >
                  Get free Gemini API key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </form>
          </div>

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
        </div>

        {/* Right Column: Language, Theme & Data Backup */}
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
