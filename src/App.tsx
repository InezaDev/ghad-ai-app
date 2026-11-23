import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  User,
} from 'firebase/auth';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FolderOpen,
  LayoutDashboard,
  Link2,
  LogIn,
  LogOut,
  MailWarning,
  Menu,
  MessageSquare,
  Settings,
  X,
} from 'lucide-react';
import { auth } from './firebase';
import {
  deleteChatFromCloud,
  deletePlanFromCloud,
  saveAssessmentToCloud,
  saveChatToCloud,
  saveMethodologyToCloud,
  savePlanToCloud,
  saveProfileToCloud,
  subscribeUserCloudData,
} from './services/firestoreSync';
import { AuthModal } from './components/AuthModal';
import {
  AppBackup,
  ChatThread,
  Lang,
  LessonPlanData,
  SavedAssessment,
  SavedMethodology,
  SavedPlan,
  TeacherProfile,
  ThemeMode,
  ToastItem,
  ViewName,
} from './types/ghad';
import { translate } from './i18n/translations';
import {
  clearAllStoredHistory,
  loadActiveChatId,
  loadAssessments,
  loadChats,
  loadLang,
  loadMethodologies,
  loadPlans,
  loadProfile,
  loadTheme,
  saveActiveChatId,
  saveAssessments,
  saveChats,
  saveLang,
  saveMethodologies,
  savePlans,
  saveProfile,
  saveTheme,
} from './utils/storage';
import { lessonPlanToWordHtml, printOrDownloadHtml } from './utils/export';
import { LandingPage } from './components/LandingPage';
import { LessonPlannerView } from './components/LessonPlannerView';
import { AssistantView } from './components/AssistantView';
import { AssessmentView } from './components/AssessmentView';
import { MethodologyView } from './components/MethodologyView';
import { LibraryView } from './components/LibraryView';
import { ResourcesView, SettingsView } from './components/ResourcesAndSettingsViews';

export default function App() {
  const [inWorkspace, setInWorkspace] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [lang, setLangState] = useState<Lang>(() => loadLang());
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [profile, setProfileState] = useState<TeacherProfile>(() => loadProfile());

  const [plans, setPlans] = useState<SavedPlan[]>(() => loadPlans());
  const [activePlan, setActivePlan] = useState<LessonPlanData | null>(null);
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  const [lessonPrefill, setLessonPrefill] = useState<{
    subject: string;
    classLevel: string;
    nonce: number;
  } | null>(null);

  const [chats, setChats] = useState<ChatThread[]>(() => loadChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => loadActiveChatId());

  const [assessments, setAssessments] = useState<SavedAssessment[]>(() => loadAssessments());
  const [methodologies, setMethodologies] = useState<SavedMethodology[]>(() => loadMethodologies());

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'register'>('signin');
  const cloudSeededRef = useRef<string | null>(null);

  const t = useCallback((k: string) => translate(lang, k), [lang]);

  // Apply theme (auto / light / dark) to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const applyDarkClass = () => {
      const isDark = theme === 'dark' || (theme === 'auto' && mq.matches);
      root.classList.toggle('dark', isDark);
    };
    applyDarkClass();
    mq.addEventListener('change', applyDarkClass);
    return () => mq.removeEventListener('change', applyDarkClass);
  }, [theme]);

  // Apply language attribute to <html>
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const showToast = useCallback(
    (message: string, type: ToastItem['type'] = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3400);
    },
    []
  );

  const copyText = useCallback(
    (text: string) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => showToast(t('toast_copied'), 'success'))
          .catch(() => showToast(t('toast_copy_fail'), 'error'));
      } else {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          showToast(t('toast_copied'), 'success');
        } catch {
          showToast(t('toast_copy_fail'), 'error');
        }
      }
    },
    [showToast, t]
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        cloudSeededRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore subscription (only when auth is ready and user email is verified)
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) return;

    const uid = currentUser.uid;
    let firstPlansSnap = true;
    let firstChatsSnap = true;

    const unsub = subscribeUserCloudData(currentUser, {
      onProfile: (cloudProfile, cloudLang, cloudTheme) => {
        setProfileState(cloudProfile);
        saveProfile(cloudProfile);
        setLangState(cloudLang);
        saveLang(cloudLang);
        setThemeState(cloudTheme);
        saveTheme(cloudTheme);
      },
      onPlans: (cloudPlans) => {
        if (firstPlansSnap) {
          firstPlansSnap = false;
          const cloudIds = new Set(cloudPlans.map((p) => p.id));
          const localOnly = loadPlans().filter((p) => !cloudIds.has(p.id));
          localOnly.forEach((p) => {
            void savePlanToCloud(currentUser, p).catch((e) => console.error(e));
          });
          if (localOnly.length > 0) {
            const merged = [...localOnly, ...cloudPlans].sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt)
            );
            setPlans(merged);
            savePlans(merged);
            return;
          }
        }
        setPlans(cloudPlans);
        savePlans(cloudPlans);
      },
      onChats: (cloudChats) => {
        if (firstChatsSnap) {
          firstChatsSnap = false;
          const cloudIds = new Set(cloudChats.map((c) => c.id));
          const localOnly = loadChats().filter((c) => !cloudIds.has(c.id));
          localOnly.forEach((c) => {
            void saveChatToCloud(currentUser, c).catch((e) => console.error(e));
          });
          if (localOnly.length > 0) {
            const merged = [...localOnly, ...cloudChats].sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt)
            );
            setChats(merged);
            saveChats(merged);
            return;
          }
        }
        setChats(cloudChats);
        saveChats(cloudChats);
      },
      onAssessments: (cloudAssessments) => {
        setAssessments(cloudAssessments);
        saveAssessments(cloudAssessments);
      },
      onMethodologies: (cloudMethodologies) => {
        setMethodologies(cloudMethodologies);
        saveMethodologies(cloudMethodologies);
      },
    });

    if (cloudSeededRef.current !== uid) {
      cloudSeededRef.current = uid;
      const initialProfile = loadProfile();
      if (!initialProfile.teacherName && currentUser.displayName) {
        initialProfile.teacherName = currentUser.displayName;
        setProfileState(initialProfile);
        saveProfile(initialProfile);
      }
      void saveProfileToCloud(currentUser, initialProfile, loadLang(), loadTheme()).catch((e) =>
        console.error(e)
      );
    }

    return () => unsub();
  }, [authReady, currentUser, currentUser?.emailVerified]);

  const openAuth = (mode: 'signin' | 'register' = 'signin') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('Signed out.', 'info');
    } catch {
      showToast('Could not sign out. Please try again.', 'error');
    }
  };

  const handleResendVerification = async () => {
    if (!currentUser) return;
    try {
      await sendEmailVerification(currentUser);
      showToast('Verification email sent. Check your inbox.', 'success');
    } catch {
      showToast('Could not send verification email right now.', 'error');
    }
  };

  const handleRefreshVerification = async () => {
    if (!currentUser) return;
    try {
      await currentUser.reload();
      await currentUser.getIdToken(true);
      if (auth.currentUser?.emailVerified) {
        setCurrentUser({ ...auth.currentUser } as User);
        showToast('Email verified! Cloud sync enabled.', 'success');
      } else {
        showToast('Email not verified yet. Please click the link in your inbox.', 'warning');
      }
    } catch {
      showToast('Could not refresh account status.', 'error');
    }
  };

  const handleLangChange = (next: Lang) => {
    setLangState(next);
    saveLang(next);
    if (currentUser?.emailVerified) {
      void saveProfileToCloud(currentUser, profile, next, theme).catch((e) => console.error(e));
    }
  };

  const handleThemeChange = (next: ThemeMode) => {
    setThemeState(next);
    saveTheme(next);
    if (currentUser?.emailVerified) {
      void saveProfileToCloud(currentUser, profile, lang, next).catch((e) => console.error(e));
    }
  };

  const handleProfileSave = (next: TeacherProfile) => {
    setProfileState(next);
    saveProfile(next);
    if (currentUser?.emailVerified) {
      void saveProfileToCloud(currentUser, next, lang, theme).catch((e) => console.error(e));
    }
  };

  const launchWorkspace = (view: ViewName) => {
    setInWorkspace(true);
    setActiveView(view);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickLaunchLesson = (prefill: { subject: string; classLevel: string }) => {
    setLessonPrefill({ ...prefill, nonce: Date.now() });
    launchWorkspace('lesson');
  };

  const switchView = (view: ViewName) => {
    setActiveView(view);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Lesson Plan Persistence Handlers
  const handleSavePlan = (planData: LessonPlanData) => {
    const now = new Date().toISOString();
    let savedToSync: SavedPlan;
    if (editingSavedId && plans.some((p) => p.id === editingSavedId)) {
      savedToSync = {
        ...plans.find((p) => p.id === editingSavedId)!,
        updatedAt: now,
        language: lang,
        plan: planData,
      };
      const next = plans.map((p) => (p.id === editingSavedId ? savedToSync : p));
      setPlans(next);
      savePlans(next);
    } else {
      savedToSync = {
        id: `plan_${Date.now()}`,
        createdAt: now,
        updatedAt: now,
        language: lang,
        plan: planData,
      };
      const next = [savedToSync, ...plans];
      setPlans(next);
      savePlans(next);
      setEditingSavedId(savedToSync.id);
    }
    if (currentUser?.emailVerified) {
      void savePlanToCloud(currentUser, savedToSync).catch((e) => console.error(e));
    }
    showToast(t('toast_saved'), 'success');
  };

  const handleOpenSavedPlan = (saved: SavedPlan) => {
    setActivePlan(saved.plan);
    setEditingSavedId(saved.id);
    switchView('lesson');
  };

  const handleDuplicateSavedPlan = (saved: SavedPlan) => {
    const now = new Date().toISOString();
    const copy: SavedPlan = {
      id: `plan_${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      language: saved.language,
      plan: {
        ...saved.plan,
        lessonTitle: `${saved.plan.lessonTitle} (Copy)`,
      },
    };
    const next = [copy, ...plans];
    setPlans(next);
    savePlans(next);
    if (currentUser?.emailVerified) {
      void savePlanToCloud(currentUser, copy).catch((e) => console.error(e));
    }
    showToast('Lesson plan duplicated.', 'success');
  };

  const handlePrintSavedPlan = (saved: SavedPlan) => {
    setActivePlan(saved.plan);
    setEditingSavedId(saved.id);
    switchView('lesson');
    setTimeout(() => {
      printOrDownloadHtml({
        filename: `REB_${saved.plan.subject}_${saved.plan.classLevel}_${saved.plan.lessonTitle}`.replace(
          /[^a-zA-Z0-9_-]+/g,
          '_'
        ),
        title: saved.plan.lessonTitle || 'REB CBC Lesson Plan',
        innerHtml: lessonPlanToWordHtml(saved.plan, lang),
        onNotify: showToast,
      });
    }, 180);
  };

  const handleDeleteSavedPlan = (id: string) => {
    const next = plans.filter((p) => p.id !== id);
    setPlans(next);
    savePlans(next);
    if (editingSavedId === id) setEditingSavedId(null);
    if (currentUser?.emailVerified) {
      void deletePlanFromCloud(currentUser, id).catch((e) => console.error(e));
    }
    showToast('Lesson plan deleted.', 'info');
  };

  const handleChatsUpdate = (nextThreads: ChatThread[], nextActiveId: string | null) => {
    const prevIds = new Set(chats.map((c) => c.id));
    const nextIds = new Set(nextThreads.map((c) => c.id));

    setChats(nextThreads);
    setActiveChatId(nextActiveId);
    saveChats(nextThreads);
    saveActiveChatId(nextActiveId);

    if (currentUser?.emailVerified) {
      for (const id of prevIds) {
        if (!nextIds.has(id)) {
          void deleteChatFromCloud(currentUser, id).catch((e) => console.error(e));
        }
      }
      if (nextActiveId) {
        const active = nextThreads.find((c) => c.id === nextActiveId);
        if (active) {
          void saveChatToCloud(currentUser, active).catch((e) => console.error(e));
        }
      }
    }
  };

  const handleAssessmentsUpdate = (next: SavedAssessment[]) => {
    setAssessments(next);
    saveAssessments(next);
    if (currentUser?.emailVerified && next[0]) {
      void saveAssessmentToCloud(currentUser, next[0]).catch((e) => console.error(e));
    }
  };

  const handleMethodologiesUpdate = (next: SavedMethodology[]) => {
    setMethodologies(next);
    saveMethodologies(next);
    if (currentUser?.emailVerified && next[0]) {
      void saveMethodologyToCloud(currentUser, next[0]).catch((e) => console.error(e));
    }
  };

  const handleImportBackup = (backup: AppBackup) => {
    if (backup.lang) handleLangChange(backup.lang);
    if (backup.theme) handleThemeChange(backup.theme);
    if (backup.profile) handleProfileSave(backup.profile);
    if (Array.isArray(backup.plans)) {
      setPlans(backup.plans);
      savePlans(backup.plans);
      if (currentUser?.emailVerified) {
        backup.plans.forEach((p) => void savePlanToCloud(currentUser, p).catch((e) => console.error(e)));
      }
    }
    if (Array.isArray(backup.chats)) {
      setChats(backup.chats);
      saveChats(backup.chats);
      if (currentUser?.emailVerified) {
        backup.chats.forEach((c) => void saveChatToCloud(currentUser, c).catch((e) => console.error(e)));
      }
    }
    if (Array.isArray(backup.assessments)) {
      setAssessments(backup.assessments);
      saveAssessments(backup.assessments);
      if (currentUser?.emailVerified) {
        backup.assessments.forEach((a) =>
          void saveAssessmentToCloud(currentUser, a).catch((e) => console.error(e))
        );
      }
    }
    if (Array.isArray(backup.methodologies)) {
      setMethodologies(backup.methodologies);
      saveMethodologies(backup.methodologies);
      if (currentUser?.emailVerified) {
        backup.methodologies.forEach((m) =>
          void saveMethodologyToCloud(currentUser, m).catch((e) => console.error(e))
        );
      }
    }
  };

  const handleClearAll = () => {
    clearAllStoredHistory();
    setPlans([]);
    setActivePlan(null);
    setEditingSavedId(null);
    setChats([]);
    setActiveChatId(null);
    setAssessments([]);
    setMethodologies([]);
    showToast('All saved history cleared.', 'info');
  };

  const navItems: Array<{ view: ViewName; key: string; icon: React.ComponentType<{ className?: string }> }> = [
    { view: 'dashboard', key: 'nav_dashboard', icon: LayoutDashboard },
    { view: 'lesson', key: 'nav_lesson', icon: BookOpen },
    { view: 'assistant', key: 'nav_assistant', icon: MessageSquare },
    { view: 'assessment', key: 'nav_assessment', icon: ClipboardCheck },
    { view: 'methodology', key: 'nav_methodology', icon: Compass },
    { view: 'library', key: 'nav_library', icon: BookMarked },
    { view: 'resources', key: 'nav_resources', icon: Link2 },
    { view: 'settings', key: 'nav_settings', icon: Settings },
  ];

  return (
    <>
      {!inWorkspace ? (
        <LandingPage
          lang={lang}
          user={currentUser}
          onChangeLang={handleLangChange}
          onLaunch={launchWorkspace}
          onQuickLaunchLesson={handleQuickLaunchLesson}
          onOpenAuth={openAuth}
          onSignOut={handleSignOut}
        />
      ) : (
        <div id="workspaceApp" className="min-h-screen flex bg-[var(--bg)] text-[var(--text)]">
          {/* Mobile Backdrop */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden no-print"
            />
          )}

          {/* Sidebar */}
          <aside
            id="sidebar"
            className={`no-print fixed lg:sticky top-0 left-0 z-50 h-screen w-64 shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col justify-between p-4 transition-transform duration-200 lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 font-display font-bold text-base text-[var(--text)]">
                  <span className="w-8 h-8 rounded-lg bg-[#15803D] text-white grid place-items-center font-bold shadow-xs">
                    G
                  </span>
                  <span>GHAD AI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-1.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                id="backToHomeBtn"
                type="button"
                onClick={() => setInWorkspace(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#15803D] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span data-i18n="back_home">{t('back_home')}</span>
              </button>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.view;
                  return (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => switchView(item.view)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-[#15803D] text-white shadow-xs'
                          : 'text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span data-i18n={item.key} className="truncate">
                        {t(item.key)}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-[var(--border)] space-y-3">
              {/* Teacher Account Card */}
              {currentUser ? (
                <div className="p-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text)] truncate">
                        {currentUser.displayName || currentUser.email}
                      </p>
                      <p className="text-[11px] text-[var(--muted)] truncate">{currentUser.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      title={t('auth_sign_out')}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-600 hover:bg-[var(--surface)] cursor-pointer shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {currentUser.emailVerified ? (
                    <div className="flex items-center gap-1 text-[11px] text-[#15803D] dark:text-[#4ade80]">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>Cloud Sync Active</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
                      <p className="flex items-center gap-1 text-[11px] text-[#F59E0B]">
                        <MailWarning className="w-3 h-3 shrink-0" />
                        <span>{t('auth_verify_banner')}</span>
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleResendVerification}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded border border-[var(--border)] bg-[var(--surface)] hover:border-[#15803D] cursor-pointer"
                        >
                          {t('auth_resend_verify')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRefreshVerification}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[#15803D] text-white hover:bg-[#166534] cursor-pointer"
                        >
                          {t('auth_refresh_verify')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuth('signin')}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-[#15803D] hover:bg-[#166534] text-white transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('auth_sign_in')} / {t('auth_tab_register')}</span>
                </button>
              )}

              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="lang_label">{t('lang_label')}</span>
                <select
                  id="langWs"
                  value={lang}
                  onChange={(e) => handleLangChange(e.target.value as Lang)}
                  className="px-2.5 py-1.5 text-xs font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                >
                  <option value="en">English</option>
                  <option value="rw">Ikinyarwanda</option>
                  <option value="fr">Français</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                <span data-i18n="theme_label">{t('theme_label')}</span>
                <select
                  id="themeSelect"
                  value={theme}
                  onChange={(e) => handleThemeChange(e.target.value as ThemeMode)}
                  className="px-2.5 py-1.5 text-xs font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                >
                  <option value="auto" data-i18n="theme_auto">{t('theme_auto')}</option>
                  <option value="light" data-i18n="theme_light">{t('theme_light')}</option>
                  <option value="dark" data-i18n="theme_dark">{t('theme_dark')}</option>
                </select>
              </label>
            </div>
          </aside>

          {/* Mobile Menu Toggle */}
          <button
            id="menuToggle"
            type="button"
            onClick={() => setSidebarOpen((s) => !s)}
            aria-label="Toggle menu"
            className="no-print lg:hidden fixed top-3 left-3 z-30 p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Main Workspace Viewport */}
          <main className="workspace-main flex-1 min-w-0 px-4 sm:px-8 pt-16 lg:pt-8 pb-12 max-w-[1440px] w-full mx-auto">
            {activeView === 'dashboard' && (
              <section id="view-dashboard" className="view-animate space-y-6">
                <div>
                  <span className="text-xs font-semibold text-[#0284C7] dark:text-[#38BDF8]">
                    🇷🇼 Rwanda Competence-Based Workspace
                  </span>
                  <h1 data-i18n="dash_title" className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)] mt-1">
                    {t('dash_title')}
                  </h1>
                  <p data-i18n="dash_sub" className="text-sm text-[var(--muted)] mt-1">
                    {t('dash_sub')}
                  </p>
                </div>

                {/* Tabular workspace summary */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-wrap items-center gap-6 text-sm">
                  <div>
                    <span className="text-xs text-[var(--muted)] block">Saved Lesson Plans</span>
                    <strong className="font-display text-2xl font-bold font-mono-tabular text-[#15803D] dark:text-[#4ade80]">
                      {plans.length}
                    </strong>
                  </div>
                  <div className="h-9 w-px bg-[var(--border)] hidden sm:block" />
                  <div>
                    <span className="text-xs text-[var(--muted)] block">Assistant Threads</span>
                    <strong className="font-display text-2xl font-bold font-mono-tabular text-[#0284C7] dark:text-[#38BDF8]">
                      {chats.length}
                    </strong>
                  </div>
                  <div className="h-9 w-px bg-[var(--border)] hidden sm:block" />
                  <div>
                    <span className="text-xs text-[var(--muted)] block">Saved Assessments</span>
                    <strong className="font-display text-2xl font-bold font-mono-tabular text-[#F59E0B]">
                      {assessments.length}
                    </strong>
                  </div>
                  <div className="h-9 w-px bg-[var(--border)] hidden sm:block" />
                  <div>
                    <span className="text-xs text-[var(--muted)] block">Methodology Guides</span>
                    <strong className="font-display text-2xl font-bold font-mono-tabular text-[var(--text)]">
                      {methodologies.length}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    {
                      view: 'lesson' as ViewName,
                      icon: BookOpen,
                      tk: 'nav_lesson',
                      dk: 'dash_lesson_d',
                      iconStyle: 'bg-[#15803D]/12 text-[#15803D] dark:text-[#4ade80]',
                    },
                    {
                      view: 'assistant' as ViewName,
                      icon: MessageSquare,
                      tk: 'nav_assistant',
                      dk: 'dash_ai_d',
                      iconStyle: 'bg-[#0284C7]/12 text-[#0284C7] dark:text-[#38BDF8]',
                    },
                    {
                      view: 'assessment' as ViewName,
                      icon: ClipboardCheck,
                      tk: 'nav_assessment',
                      dk: 'dash_assess_d',
                      iconStyle: 'bg-[#F59E0B]/15 text-[#D97706] dark:text-[#FBBF24]',
                    },
                    {
                      view: 'methodology' as ViewName,
                      icon: Compass,
                      tk: 'nav_methodology',
                      dk: 'dash_method_d',
                      iconStyle: 'bg-[#15803D]/12 text-[#15803D] dark:text-[#4ade80]',
                    },
                    {
                      view: 'library' as ViewName,
                      icon: FolderOpen,
                      tk: 'nav_library',
                      dk: 'dash_library_d',
                      iconStyle: 'bg-[#0284C7]/12 text-[#0284C7] dark:text-[#38BDF8]',
                    },
                    {
                      view: 'resources' as ViewName,
                      icon: Link2,
                      tk: 'nav_resources',
                      dk: 'dash_res_d',
                      iconStyle: 'bg-[#F59E0B]/15 text-[#D97706] dark:text-[#FBBF24]',
                    },
                    {
                      view: 'settings' as ViewName,
                      icon: Settings,
                      tk: 'nav_settings',
                      dk: 'dash_set_d',
                      iconStyle: 'bg-[var(--surface-subtle)] text-[var(--text)]',
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.view}
                        type="button"
                        onClick={() => switchView(card.view)}
                        className="text-left p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[#15803D] hover:shadow-sm transition-all flex flex-col gap-3 cursor-pointer"
                      >
                        <div className={`w-10 h-10 rounded-xl grid place-items-center ${card.iconStyle}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 data-i18n={card.tk} className="font-display text-base font-bold text-[var(--text)]">
                            {t(card.tk)}
                          </h2>
                          <p data-i18n={card.dk} className="mt-1 text-sm text-[var(--muted)] leading-relaxed">
                            {t(card.dk)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {activeView === 'lesson' && (
              <LessonPlannerView
                lang={lang}
                profile={profile}
                activePlan={activePlan}
                prefill={lessonPrefill}
                onSetActivePlan={(p) => setActivePlan(p)}
                onSavePlan={handleSavePlan}
                onToast={showToast}
                onCopy={copyText}
              />
            )}

            {activeView === 'assistant' && (
              <AssistantView
                lang={lang}
                threads={chats}
                activeThreadId={activeChatId}
                onUpdateThreads={handleChatsUpdate}
                onToast={showToast}
                onCopy={copyText}
              />
            )}

            {activeView === 'assessment' && (
              <AssessmentView
                lang={lang}
                history={assessments}
                onSaveHistory={handleAssessmentsUpdate}
                onToast={showToast}
                onCopy={copyText}
              />
            )}

            {activeView === 'methodology' && (
              <MethodologyView
                lang={lang}
                history={methodologies}
                onSaveHistory={handleMethodologiesUpdate}
                onToast={showToast}
                onCopy={copyText}
              />
            )}

            {activeView === 'library' && (
              <LibraryView
                lang={lang}
                plans={plans}
                onOpenPlan={handleOpenSavedPlan}
                onDuplicatePlan={handleDuplicateSavedPlan}
                onPrintPlan={handlePrintSavedPlan}
                onDeletePlan={handleDeleteSavedPlan}
                onCreateNew={() => switchView('lesson')}
              />
            )}

            {activeView === 'resources' && <ResourcesView lang={lang} />}

            {activeView === 'settings' && (
              <SettingsView
                lang={lang}
                theme={theme}
                profile={profile}
                onChangeLang={handleLangChange}
                onChangeTheme={handleThemeChange}
                onSaveProfile={handleProfileSave}
                onImportBackup={handleImportBackup}
                onClearAll={handleClearAll}
                onToast={showToast}
              />
            )}
          </main>
        </div>
      )}

      {/* Auth Modal (Google Sign-In + Email Registration/Sign-In) */}
      <AuthModal
        open={authModalOpen}
        lang={lang}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(msg) => showToast(msg, 'success')}
      />

      {/* Toast Container */}
      <div
        id="toastContainer"
        aria-live="polite"
        className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl border text-sm font-medium shadow-lg bg-[var(--surface)] text-[var(--text)] ${
              toast.type === 'error'
                ? 'border-red-400 text-red-700 dark:text-red-300'
                : toast.type === 'success'
                ? 'border-[#15803D] text-[#15803D] dark:text-[#4ade80]'
                : toast.type === 'warning'
                ? 'border-[#F59E0B] text-amber-700 dark:text-amber-300'
                : 'border-[var(--border)]'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
