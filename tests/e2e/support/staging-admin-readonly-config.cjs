const { getStagingConfig } = require('./staging-config.cjs');

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required staging Admin review setting: ${name}`);
  return value;
}

// This uses a separately managed Staging Admin account. It is deliberately
// distinct from the ordinary browse-only test account, so an accidental role
// change cannot broaden that account's access.
function getStagingAdminReadOnlyConfig(env = process.env) {
  const staging = getStagingConfig({
    ...env,
    E2E_STAGING_TEST_EMAIL: required(env, 'E2E_STAGING_ADMIN_EMAIL'),
    E2E_STAGING_TEST_PASSWORD: required(env, 'E2E_STAGING_ADMIN_PASSWORD')
  });
  return { ...staging, accountPurpose: 'Admin read-only browser review' };
}

module.exports = { getStagingAdminReadOnlyConfig };
