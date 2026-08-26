const { getStagingConfig } = require('./staging-config.cjs');

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required controlled staging test setting: ${name}`);
  return value;
}

function getStagingPreloadedClaimConfig(env = process.env) {
  const staging = getStagingConfig(env);
  const accessToken = required(env, 'SUPABASE_ACCESS_TOKEN');
  const adminEmail = required(env, 'E2E_STAGING_ADMIN_EMAIL').toLowerCase();
  const adminPassword = required(env, 'E2E_STAGING_ADMIN_PASSWORD');
  const claimEmail = required(env, 'E2E_REG049_CLAIM_EMAIL').toLowerCase();
  const selfSignupEmail = required(env, 'E2E_REG049_SELF_SIGNUP_EMAIL').toLowerCase();
  const marker = required(env, 'E2E_REG049_MARKER');

  if (!/^\S+@\S+\.\S+$/.test(adminEmail) || !/^\S+@\S+\.\S+$/.test(claimEmail) || !/^\S+@\S+\.\S+$/.test(selfSignupEmail)) {
    throw new Error('SAFETY STOP: REG-049 requires valid controlled Staging test email addresses.');
  }
  const testAddresses = [adminEmail, claimEmail, selfSignupEmail, staging.email.toLowerCase()];
  if (new Set(testAddresses).size !== testAddresses.length) {
    throw new Error('SAFETY STOP: REG-049 requires a dedicated Admin account and two distinct temporary mailboxes, all separate from the normal staging test account.');
  }
  if (!marker.startsWith('E2E REG-049 — ')) {
    throw new Error('SAFETY STOP: REG-049 marker is invalid.');
  }

  return { ...staging, accessToken, adminEmail, adminPassword, claimEmail, selfSignupEmail, marker };
}

module.exports = { getStagingPreloadedClaimConfig };
