import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  Mail,
  User as UserIcon,
  X,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, googleProvider } from '../firebase';
import { Lang } from '../types/ghad';
import { translate } from '../i18n/translations';
import { extractAuthErrorCode, mapAuthError } from '../utils/authErrors';

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
  const [errorCode, setErrorCode] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);
  const [emailProviderDisabled, setEmailProviderDisabled] = useState<boolean>(() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ghad_email_auth_disabled') === '1';
    } catch {
      return false;
    }
  });

  const currentHost =
    typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '';

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setErrorMsg(null);
      setErrorCode('');
      setInfoMsg(null);
      setCopiedHost(false);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopyDomain = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard?.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMsg(null);
    setErrorCode('');
    setInfoMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess(t('auth_google_success'));
      onClose();
    } catch (err) {
      setErrorCode(extractAuthErrorCode(err));
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
      setErrorCode('');
      return;
    }

    if (emailProviderDisabled) {
      setErrorCode('auth/operation-not-allowed');
      setErrorMsg(t('auth_err_op_not_allowed'));
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setErrorCode('');
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
      const code = extractAuthErrorCode(err);
      setErrorCode(code);
      if (code === 'auth/operation-not-allowed') {
        setEmailProviderDisabled(true);
        try {
          sessionStorage.setItem('ghad_email_auth_disabled', '1');
        } catch {
          // Ignore storage failure
        }
      }
      setErrorMsg(mapAuthError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg(t('auth_err_enter_email_reset'));
      setErrorCode('');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setErrorCode('');
    setInfoMsg(null);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMsg(t('auth_reset_sent'));
    } catch (err) {
      setErrorCode(extractAuthErrorCode(err));
      setErrorMsg(mapAuthError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const isFirebaseSetupError =
    errorCode === 'auth/unauthorized-domain' || errorCode === 'auth/operation-not-allowed';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('auth_title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030712]/70 backdrop-blur-md p-4"
    >
      <div className="holo-glass holo-reticle w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
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
                setErrorCode('');
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
                setErrorCode('');
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
            <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>

              {isFirebaseSetupError && (
                <div className="pt-2 border-t border-red-200 dark:border-red-900/60 space-y-2 text-[11px] text-[var(--text)]">
                  <div className="font-semibold">
                    Firebase Project: <code className="font-mono">{firebaseConfig.projectId}</code>
                  </div>
                  {errorCode === 'auth/unauthorized-domain' && currentHost && (
                    <>
                      <p className="text-[var(--muted)] leading-relaxed">
                        Firebase Console → Authentication → Settings → Authorized domains:
                      </p>
                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                        <code className="font-mono text-[10.5px] truncate">{currentHost}</code>
                        <button
                          type="button"
                          onClick={handleCopyDomain}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[#15803D] text-[10.5px] font-semibold shrink-0 cursor-pointer"
                        >
                          {copiedHost ? <Check className="w-3 h-3 text-[#15803D]" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedHost ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </>
                  )}
                  {errorCode === 'auth/operation-not-allowed' && (
                    <div className="space-y-1.5">
                      <p className="text-[var(--muted)] leading-relaxed">
                        Enable <strong className="text-[var(--text)]">Email/Password</strong> in Firebase Console → Authentication → Sign-in method, or use Google Sign-In above.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEmailProviderDisabled(false);
                          setErrorMsg(null);
                          setErrorCode('');
                          try {
                            sessionStorage.removeItem('ghad_email_auth_disabled');
                          } catch {
                            // Ignore storage failure
                          }
                        }}
                        className="text-[11px] font-semibold text-[#15803D] dark:text-[#4ade80] hover:underline cursor-pointer"
                      >
                        I enabled it — try Email again
                      </button>
                    </div>
                  )}
                  <p className="text-[var(--muted)] leading-relaxed">
                    All GHAD AI tools and local saving work immediately without signing in.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[#15803D] text-xs font-semibold text-[var(--text)] cursor-pointer"
                  >
                    Continue Without Signing In
                  </button>
                </div>
              )}
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
