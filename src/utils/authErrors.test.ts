import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAuthError } from './authErrors.js';
import { translate } from '../i18n/translations.js';

test('mapAuthError formats auth/unauthorized-domain with current hostname across languages', () => {
  const msgEn = mapAuthError(
    { code: 'auth/unauthorized-domain' },
    (k) => translate('en', k),
    'ghad-ai-app-vyhn.vercel.app'
  );
  assert.match(msgEn, /ghad-ai-app-vyhn\.vercel\.app/);
  assert.match(msgEn, /Authorized domains/);

  const msgRw = mapAuthError(
    { code: 'auth/unauthorized-domain' },
    (k) => translate('rw', k),
    'ghad-ai-app-vyhn.vercel.app'
  );
  assert.match(msgRw, /ghad-ai-app-vyhn\.vercel\.app/);
});

test('mapAuthError handles standard Firebase auth codes cleanly', () => {
  const popupBlocked = mapAuthError(
    { code: 'auth/popup-blocked' },
    (k) => translate('en', k)
  );
  assert.equal(popupBlocked, translate('en', 'auth_err_popup_blocked'));

  const invalidCred = mapAuthError(
    { code: 'auth/invalid-credential' },
    (k) => translate('fr', k)
  );
  assert.equal(invalidCred, translate('fr', 'auth_err_invalid_cred'));
});
