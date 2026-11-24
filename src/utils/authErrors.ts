export function mapAuthError(
  err: unknown,
  t: (k: string) => string,
  currentHost?: string
): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/unauthorized-domain': {
      const host =
        currentHost ||
        (typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '');
      const base = t('auth_err_unauthorized_domain');
      return host ? base.replace('{domain}', host) : base.replace(' ({domain})', '');
    }
    case 'auth/operation-not-allowed':
      return t('auth_err_op_not_allowed');
    case 'auth/email-already-in-use':
      return t('auth_err_email_in_use');
    case 'auth/invalid-email':
      return t('auth_err_invalid_email');
    case 'auth/weak-password':
      return t('auth_err_weak_pass');
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return t('auth_err_invalid_cred');
    case 'auth/popup-closed-by-user':
      return t('auth_err_popup_closed');
    case 'auth/popup-blocked':
      return t('auth_err_popup_blocked');
    case 'auth/too-many-requests':
      return t('auth_err_too_many');
    default:
      return err instanceof Error ? err.message : t('auth_err_generic');
  }
}
