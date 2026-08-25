const { getStagingConfig } = require('./staging-config.cjs');

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required staging Height read-only security setting: ${name}`);
  return value;
}

function getStagingHeightReadOnlySecurityConfig(env = process.env) {
  const staging = getStagingConfig({
    ...env,
    E2E_STAGING_TEST_EMAIL: required(env, 'E2E_STAGING_HEIGHT_READONLY_EMAIL'),
    E2E_STAGING_TEST_PASSWORD: required(env, 'E2E_STAGING_HEIGHT_READONLY_PASSWORD')
  });
  return { ...staging, accountPurpose: 'Height equipment user-only' };
}

module.exports = { getStagingHeightReadOnlySecurityConfig };
