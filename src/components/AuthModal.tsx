import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, User as UserIcon, X } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { Lang } from '../types/ghad';
import { translate } from '../i18n/translations';
import { mapAuthError } from '../utils/authErrors';

interface AuthModalProps {
  open: boolean;
  lang: Lang;
  initialMode?: 'signin' | 'register';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  lang,
  initialMode = 'signin',
  onClose,
  onSuccess,
}) => {
  const t = (k: string) => translate(lang, k);
  const [mode, setMode] = useState<'signin' | 'register'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setErrorMsg(null);
      setInfoMsg(null);
    }
  }, [open, initialMode]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess(t('auth_google_success'));
      onClose();
    } catch (err) {
      setErrorMsg(mapAuthError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPass = password;
    const cleanName = fullName.trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMsg(t('auth_err_missing_fields'));
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (mode === 'register') {
        if (cleanPass.length < 6) {
          setErrorMsg(t('auth_err_pass_min'));
          setBusy(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
        if (cleanName) {
          await updateProfile(cred.user, { displayName: cleanName });
        }
        try {
          await sendEmailVerification(cred.user);
          onSuccess(t('auth_register_verify_sent'));
        } catch {
          onSuccess(t('auth_register_success'));
        }
        onClose();
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
        onSuccess(t('auth_signin_success'));
        onClose();
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg(t('auth_err_enter_email_reset'));
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMsg(t('auth_reset_sent'));
    } catch (err) {
      setErrorMsg(mapAuthError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('auth_title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030712]/70 backdrop-blur-md p-4"
    >
      <div className="holo-glass holo-reticle w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text)]">
              {mode === 'signin' ? t('auth_signin_title') : t('auth_register_title')}
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">{t('auth_sub')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Mode tabs */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'signin'
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t('auth_tab_signin')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t('auth_tab_register')}
            </button>
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[#15803D] text-sm font-semibold text-[var(--text)] transition-colors disabled:opacity-60 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.31 0 3.26 2.69 1.27 6.61l3.66 2.84C5.8 6.86 8.64 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.17-2 3.71-4.94 3.71-8.7z"
              />
              <path
                fill="#FBBC05"
                d="M4.93 14.55A7.16 7.16 0 0 1 4.56 12c0-.89.15-1.75.37-2.55L1.27 6.61A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l3.66-2.84z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.08.72-2.45 1.16-4.22 1.16-3.36 0-6.2-1.86-7.07-4.45l-3.66 2.84C3.26 21.31 7.31 24 12 24z"
              />
            </svg>
            <span>{t('auth_google')}</span>
          </button>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-[var(--border)]" />
            <span className="px-3 text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {t('auth_or_email')}
            </span>
            <div className="flex-1 border-t border-[var(--border)]" />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
                <span>{t('auth_full_name')}</span>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[var(--muted)] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Uwimana Alice"
                    className="w-full pl-9 pr-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  />
                </div>
              </label>
            )}

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
              <span>{t('auth_email')}</span>
              <div className="relative">
                <Mail className="w-4 h-4 text-[var(--muted)] absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@school.rw"
                  className="w-full pl-9 pr-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
              <div className="flex items-center justify-between">
                <span>{t('auth_password')}</span>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[11px] font-medium text-[#15803D] dark:text-[#4ade80] hover:underline cursor-pointer"
                  >
                    {t('auth_forgot')}
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--muted)] absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm font-normal rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#15803D] hover:bg-[#166534] text-white transition-colors disabled:opacity-60 cursor-pointer"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{mode === 'signin' ? t('auth_btn_signin') : t('auth_btn_register')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
