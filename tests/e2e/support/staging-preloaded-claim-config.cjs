const { getStagingConfig } = require('./staging-config.cjs');

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required controlled staging test setting: ${name}`);
  return value;
}

function getStagingPreloadedClaimConfig(env = process.env) {
  const staging = getStagingConfig(env);
  const accessToken = required(env, 'SUPABASE_ACCESS_TOKEN');
  const claimEmail = required(env, 'E2E_REG049_CLAIM_EMAIL').toLowerCase();
  const selfSignupEmail = required(env, 'E2E_REG049_SELF_SIGNUP_EMAIL').toLowerCase();
  const marker = required(env, 'E2E_REG049_MARKER');

  if (!claimEmail.endsWith('@example.test') || !selfSignupEmail.endsWith('@example.test')) {
    throw new Error('SAFETY STOP: REG-049 may only use generated @example.test identities.');
  }
  if (!marker.startsWith('E2E REG-049 — ')) {
    throw new Error('SAFETY STOP: REG-049 marker is invalid.');
  }

  return { ...staging, accessToken, claimEmail, selfSignupEmail, marker };
}

module.exports = { getStagingPreloadedClaimConfig };
