import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Save,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import { DeveloperProfile, Lang } from '../types/ghad';
import { translate } from '../i18n/translations';

interface AdminDashboardViewProps {
  lang: Lang;
  onToast: (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  onBack: () => void;
  onSettingsUpdated?: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ lang, onToast, onBack, onSettingsUpdated }) => {
  const t = (k: string) => translate(lang, k);
  const [token, setToken] = useState<string>('');
  const [authConfigured, setAuthConfigured] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'analytics' | 'logs' | 'feedback' | 'developer'>('settings');

  const [settings, setSettings] = useState({
    bannerText: '',
    bannerActive: true,
    maintenanceMode: false,
    toolLesson: true,
    toolAssistant: true,
    toolAssessment: true,
    toolMethodology: true,
  });

  const [developer, setDeveloper] = useState<DeveloperProfile>({
    name: '',
    title: '',
    school: '',
    bio: '',
    photoUrl: '',
    phone: '',
    email: '',
    github: '',
    localizedTitles: {},
    localizedBios: {},
  });
  const [devEditLang, setDevEditLang] = useState<Lang>('en');

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setDeveloper((prev) => ({ ...prev, photoUrl: dataUrl }));
          onToast('Photo uploaded & resized successfully', 'success');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const [stats, setStats] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<Array<{ id: string; tool: string; subject: string; classLevel: string; language: string; summary: string; timestamp: string }>>([]);
  const [feedbacks, setFeedbacks] = useState<Array<{ id: string; name: string; email: string; message: string; createdAt: string }>>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/auth')
      .then((res) => (res.ok ? res.json() : { configured: true }))
      .then((data: { configured?: boolean }) => {
        if (active) setAuthConfigured(Boolean(data?.configured ?? true));
      })
      .catch(() => {
        if (active) setAuthConfigured(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authConfigured === false) {
      if (passwordInput.trim().length < 8) {
        onToast('Administrator password must be at least 8 characters long.', 'error');
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        onToast('Passwords do not match. Please confirm your password.', 'error');
        return;
      }
    }

    setLoading(true);
    try {
      const payload =
        authConfigured === false
          ? { action: 'setup', password: passwordInput }
          : { password: passwordInput };
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: { success?: boolean; token?: string; error?: string; needsSetup?: boolean } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: `Server returned status ${res.status}` };
      }
      if (data.needsSetup) {
        setAuthConfigured(false);
      }
      if (res.ok && data.success && data.token) {
        setAuthConfigured(true);
        setPasswordInput('');
        setConfirmPasswordInput('');
        setToken(data.token);
        onToast(
          authConfigured === false
            ? 'Administrator password created and signed in.'
            : 'Admin authenticated successfully',
          'success'
        );
        fetchAdminData(data.token);
      } else {
        onToast(data.error || 'Invalid admin password', 'error');
      }
    } catch {
      onToast('Failed to connect to admin server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async (adminToken: string) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${adminToken}` };
      const [setRes, statsRes, logsRes, fbRes, devRes] = await Promise.all([
        fetch('/api/admin/settings', { headers }),
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/logs', { headers }),
        fetch('/api/admin/feedback', { headers }),
        fetch('/api/admin/developer', { headers }),
      ]);

      if ([setRes, statsRes, logsRes, fbRes, devRes].some((r) => r.status === 401)) {
        setToken('');
        onToast('Admin session expired. Please sign in again.', 'warning');
        return;
      }

      if (setRes.ok) setSettings(await setRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (fbRes.ok) setFeedbacks(await fbRes.json());
      if (devRes.ok) setDeveloper(await devRes.json());
    } catch {
      onToast('Error loading admin data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAdminData(token);
    }
  }, [token]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        onToast('Site settings updated permanently in Redis!', 'success');
        onSettingsUpdated?.();
      } else {
        onToast('Failed to update settings', 'error');
      }
    } catch {
      onToast('Network error saving settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDeveloper = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/developer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(developer),
      });
      if (res.ok) {
        onToast('Developer profile updated permanently in Redis!', 'success');
        onSettingsUpdated?.();
      } else {
        onToast('Failed to update developer profile', 'error');
      }
    } catch {
      onToast('Network error saving profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFeedbacks((prev) => prev.filter((f) => f.id !== id));
        onToast('Feedback item removed', 'success');
      }
    } catch {
      onToast('Failed to delete feedback', 'error');
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 holo-glass rounded-2xl border border-[var(--border)] shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-[var(--surface-subtle)] text-[var(--primary)] border border-[var(--border)]">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[var(--text)]">GHAD AI Admin Portal</h2>
          <p className="text-sm text-[var(--muted)]">
            {authConfigured === false
              ? 'First-time setup: create a strong administrator password (at least 8 characters) to secure site settings and maintenance controls.'
              : 'Enter your administrator password to manage site settings, analytics, and persistence.'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
              {authConfigured === false ? 'Create Admin Password' : 'Admin Password'}
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder={authConfigured === false ? 'Minimum 8 characters' : 'Enter administrator password'}
              minLength={authConfigured === false ? 8 : 1}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
              required
            />
          </div>

          {authConfigured === false && (
            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Confirm Admin Password
              </label>
              <input
                type="password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                placeholder="Re-enter administrator password"
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || authConfigured === null}
            className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold shadow-md hover:opacity-95 disabled:opacity-60 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            <span>{authConfigured === false ? 'Save Password & Open Admin' : 'Access Admin Dashboard'}</span>
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            onClick={onBack}
            className="text-xs text-[var(--muted)] hover:text-[var(--text)] underline cursor-pointer"
          >
            ← Return to GHAD AI Workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Admin Header */}
      <div className="holo-glass p-6 rounded-2xl border border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-subtle)] border border-[var(--border)] text-xs font-semibold text-[var(--primary)] mb-2">
            <Server className="w-3.5 h-3.5" />
            <span>Redis / Vercel KV Connected</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">GHAD AI Administration & Control</h1>
          <p className="text-sm text-[var(--muted)]">Manage persistent site settings, live analytics, teacher feedback inbox, and developer profile.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAdminData(token)}
            className="px-4 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-sm font-medium hover:bg-[var(--border)] transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={() => {
              setToken('');
              setPasswordInput('');
            }}
            className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 transition cursor-pointer"
          >
            Exit Admin
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        {[
          { id: 'settings', label: 'Site Settings & Toggles', icon: Settings },
          { id: 'analytics', label: 'Usage Analytics', icon: Activity },
          { id: 'logs', label: 'Activity Logs', icon: Database },
          { id: 'feedback', label: `Teacher Feedback (${feedbacks.length})`, icon: MessageSquare },
          { id: 'developer', label: 'Developer Profile', icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition cursor-pointer ${
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'bg-[var(--surface-subtle)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Settings */}
      {activeTab === 'settings' && (
        <div className="holo-glass p-6 rounded-2xl border border-[var(--border)] space-y-6">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">Live Site Settings (Redis Persistent)</h2>

          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Announcement Banner Text
              </label>
              <input
                type="text"
                value={settings.bannerText}
                onChange={(e) => setSettings({ ...settings, bannerText: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Show Announcement Banner</p>
                <p className="text-xs text-[var(--muted)]">Display the banner across the top of all teacher screens.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.bannerActive}
                onChange={(e) => setSettings({ ...settings, bannerActive: e.target.checked })}
                className="w-5 h-5 accent-[var(--primary)] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Maintenance Mode</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400">Display maintenance notice and temporarily pause AI generations.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                className="w-5 h-5 accent-amber-600 cursor-pointer"
              />
            </div>

            <div className="border-t border-[var(--border)] pt-4 space-y-3">
              <h3 className="font-display text-sm font-bold text-[var(--text)]">Core Tool Feature Toggles</h3>

              {[
                { key: 'toolLesson', label: 'Lesson Planner (REB CBC)', desc: 'Enable REB Lesson Planner generator and export' },
                { key: 'toolAssistant', label: 'AI Teaching Assistant', desc: 'Enable AI chat assistant with web grounding' },
                { key: 'toolAssessment', label: 'Assessment & Quiz Builder', desc: 'Enable quiz generator and answer key export' },
                { key: 'toolMethodology', label: 'Teaching Methodology Guide', desc: 'Enable active pedagogy guide generator' },
              ].map((tool) => (
                <div key={tool.key} className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{tool.label}</p>
                    <p className="text-xs text-[var(--muted)]">{tool.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={(settings as any)[tool.key]}
                    onChange={(e) => setSettings({ ...settings, [tool.key]: e.target.checked })}
                    className="w-5 h-5 accent-[var(--primary)] cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold shadow-md hover:opacity-95 transition flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Site Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Analytics */}
      {activeTab === 'analytics' && (
        <div className="holo-glass p-6 rounded-2xl border border-[var(--border)] space-y-6">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">Usage Analytics & Request Counters</h2>
          <p className="text-sm text-[var(--muted)]">Real-time usage counters stored in Redis across all teachers and deployments.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] space-y-1">
              <p className="text-xs text-[var(--muted)] uppercase font-semibold">Total Requests</p>
              <p className="text-3xl font-mono-tabular font-bold text-[var(--primary)]">{stats.total_requests || 0}</p>
            </div>
            <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] space-y-1">
              <p className="text-xs text-[var(--muted)] uppercase font-semibold">Lesson Plans Generated</p>
              <p className="text-3xl font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400">{stats.lesson_count || 0}</p>
            </div>
            <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] space-y-1">
              <p className="text-xs text-[var(--muted)] uppercase font-semibold">Assessments / Quizzes</p>
              <p className="text-3xl font-mono-tabular font-bold text-sky-600 dark:text-sky-400">{stats.assessment_count || 0}</p>
            </div>
            <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] space-y-1">
              <p className="text-xs text-[var(--muted)] uppercase font-semibold">Assistant Queries</p>
              <p className="text-3xl font-mono-tabular font-bold text-amber-600 dark:text-amber-400">{stats.assistant_count || 0}</p>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-6 space-y-4">
            <h3 className="font-display text-sm font-bold text-[var(--text)]">All Analytics Counters</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center">
                  <p className="text-[11px] text-[var(--muted)] truncate">{k}</p>
                  <p className="text-lg font-mono-tabular font-bold text-[var(--text)] mt-1">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Logs */}
      {activeTab === 'logs' && (
        <div className="holo-glass p-6 rounded-2xl border border-[var(--border)] space-y-6">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">Recent Activity Logs (Last 100 Events)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)] uppercase">
                  <th className="py-3 px-3">Timestamp</th>
                  <th className="py-3 px-3">Tool</th>
                  <th className="py-3 px-3">Subject</th>
                  <th className="py-3 px-3">Class</th>
                  <th className="py-3 px-3">Language</th>
                  <th className="py-3 px-3">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-[var(--muted)]">No activity logs recorded yet.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--surface-subtle)] transition">
                      <td className="py-3 px-3 font-mono-tabular text-xs text-[var(--muted)]">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[var(--primary)] capitalize">{log.tool}</td>
                      <td className="py-3 px-3">{log.subject}</td>
                      <td className="py-3 px-3 font-mono-tabular">{log.classLevel}</td>
                      <td className="py-3 px-3 uppercase text-xs font-mono">{log.language}</td>
                      <td className="py-3 px-3 text-[var(--text)]">{log.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Feedback */}
      {activeTab === 'feedback' && (
        <div className="holo-glass p-6 rounded-2xl border border-[var(--border)] space-y-6">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">Teacher Feedback Inbox ({feedbacks.length})</h2>
          <p className="text-sm text-[var(--muted)]">Messages submitted by teachers through the website footer feedback form.</p>

          <div className="space-y-4">
            {feedbacks.length === 0 ? (
              <p className="text-center py-8 text-sm text-[var(--muted)]">No feedback messages in the inbox yet.</p>
            ) : (
              feedbacks.map((fb) => (
                <div key={fb.id} className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[var(--text)]">{fb.name}</p>
                      <p className="text-xs text-[var(--muted)]">{fb.email} · {new Date(fb.createdAt).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteFeedback(fb.id)}
                      className="p-2 rounded-xl text-red-600 hover:bg-red-500/10 transition cursor-pointer"
                      title="Delete message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text)] whitespace-pre-wrap bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)]">
                    {fb.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Developer Profile */}
      {activeTab === 'developer' && (
        <div className="holo-glass p-6 rounded-2xl border border-[var(--border)] space-y-6">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">Developer Profile Settings (Permanent Vercel KV)</h2>
          <div className="space-y-4 max-w-2xl">
            {/* Developer Photo Upload & Preview */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] space-y-3">
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                Developer Photo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--primary)] bg-gradient-to-br from-[#10b981] to-[#0284c7] text-white flex items-center justify-center font-display font-bold text-xl shrink-0 shadow-md">
                  {developer.photoUrl ? (
                    <img src={developer.photoUrl} alt="Developer" className="w-full h-full object-cover" />
                  ) : (
                    <span>NG</span>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90 transition cursor-pointer inline-flex items-center gap-1.5">
                      <span>Upload Photo</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                    {developer.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setDeveloper({ ...developer, photoUrl: '' })}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/20 transition cursor-pointer"
                      >
                        Remove Photo (Use NG Initials)
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={developer.photoUrl}
                    onChange={(e) => setDeveloper({ ...developer, photoUrl: e.target.value })}
                    placeholder="Or paste direct image URL (https://...)"
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={developer.name}
                onChange={(e) => setDeveloper({ ...developer, name: e.target.value })}
                placeholder="e.g. Nkurikiyineza Ghad"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--muted)]">
                Profile Language Version (Role &amp; Bio):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['en', 'rw', 'fr', 'sw'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setDevEditLang(code)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                      devEditLang === code
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--primary)]'
                    }`}
                  >
                    {code === 'en' ? 'English' : code === 'rw' ? 'Ikinyarwanda' : code === 'fr' ? 'Français' : 'Kiswahili'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Role / Title ({devEditLang.toUpperCase()})
              </label>
              <input
                type="text"
                value={
                  devEditLang === 'en'
                    ? developer.localizedTitles?.en ?? developer.title
                    : developer.localizedTitles?.[devEditLang] ?? translate(devEditLang, 'dev_default_title')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setDeveloper((prev) => ({
                    ...prev,
                    ...(devEditLang === 'en' ? { title: val } : {}),
                    localizedTitles: { ...(prev.localizedTitles || {}), [devEditLang]: val },
                  }));
                }}
                placeholder={translate(devEditLang, 'dev_default_title')}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                School / Organization
              </label>
              <input
                type="text"
                value={developer.school}
                onChange={(e) => setDeveloper({ ...developer, school: e.target.value })}
                placeholder="e.g. TTC Muhanga"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Bio / About Text ({devEditLang.toUpperCase()})
              </label>
              <textarea
                rows={4}
                value={
                  devEditLang === 'en'
                    ? developer.localizedBios?.en ?? developer.bio
                    : developer.localizedBios?.[devEditLang] ?? translate(devEditLang, 'dev_default_bio')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setDeveloper((prev) => ({
                    ...prev,
                    ...(devEditLang === 'en' ? { bio: val } : {}),
                    localizedBios: { ...(prev.localizedBios || {}), [devEditLang]: val },
                  }));
                }}
                placeholder="Share your developer story and mission for Rwandan education..."
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm resize-y"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Phone / WhatsApp Number (Optional)
              </label>
              <input
                type="text"
                value={developer.phone}
                onChange={(e) => setDeveloper({ ...developer, phone: e.target.value })}
                placeholder="e.g. +250 783262573 (Enables WhatsApp & Call buttons)"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={developer.email}
                onChange={(e) => setDeveloper({ ...developer, email: e.target.value })}
                placeholder="e.g. inezaghad250@gmail.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                GitHub / Website / Social Link (Optional)
              </label>
              <input
                type="url"
                value={developer.github}
                onChange={(e) => setDeveloper({ ...developer, github: e.target.value })}
                placeholder="e.g. https://github.com/..."
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm"
              />
            </div>

            <button
              onClick={handleSaveDeveloper}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold shadow-md hover:opacity-95 transition flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Developer Profile</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
