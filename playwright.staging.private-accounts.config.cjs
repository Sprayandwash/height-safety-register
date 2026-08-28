const { defineConfig, devices } = require('@playwright/test');
module.exports=defineConfig({testDir:'./tests/e2e/staging',testMatch:'private-account-lifecycle.spec.cjs',timeout:120000,workers:1,use:{baseURL:process.env.E2E_STAGING_BASE_URL||'http://127.0.0.1:4174',trace:'retain-on-failure',video:'retain-on-failure',screenshot:'only-on-failure',...devices['Desktop Chrome']}});
