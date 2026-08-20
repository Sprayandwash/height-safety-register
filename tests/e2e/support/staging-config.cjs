const PRODUCTION_PROJECT_REF = 'twkgfmctuffmkvkmdkct';
const REVIEW_PREFIX = 'E2E REVIEW —';

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required staging test setting: ${name}`);
  return value;
}

function getStagingConfig(env = process.env) {
  const projectRef = required(env, 'E2E_STAGING_PROJECT_REF');
  const baseURL = required(env, 'E2E_STAGING_BASE_URL');
  const email = required(env, 'E2E_STAGING_TEST_EMAIL');
  const password = required(env, 'E2E_STAGING_TEST_PASSWORD');

  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error('SAFETY STOP: E2E_STAGING_PROJECT_REF is the production Supabase project.');
  }
  if (baseURL.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('SAFETY STOP: E2E_STAGING_BASE_URL references the production Supabase project.');
  }

  let parsed;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error('E2E_STAGING_BASE_URL must be an absolute http(s) URL.');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('E2E_STAGING_BASE_URL must use http or https.');
  }

  return { projectRef, baseURL: parsed.toString().replace(/\/$/, ''), email, password, reviewPrefix: REVIEW_PREFIX };
}

module.exports = { PRODUCTION_PROJECT_REF, REVIEW_PREFIX, getStagingConfig };
