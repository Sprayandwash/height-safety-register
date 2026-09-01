const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/configure-staging-vapid.yml'), 'utf8');

test('NOTIFY-VAPID-001: staging VAPID creation is explicit, staging-only, and non-destructive', () => {
  assert.match(workflow, /SET STAGING VAPID KEYS/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: twkgfmctuffmkvkmdkct/);
  assert.match(workflow, /SAFETY STOP: staging ref matches production/);
  assert.match(workflow, /will not replace them/);
  assert.match(workflow, /VAPID_PUBLIC_KEY/);
  assert.match(workflow, /VAPID_PRIVATE_KEY/);
});

test('NOTIFY-VAPID-002: VAPID setup stores secrets but has no notification delivery path', () => {
  assert.match(workflow, /web-push generate-vapid-keys --json/);
  assert.match(workflow, /supabase secrets set/);
  assert.doesNotMatch(workflow, /send-notification|sendNotification|curl .*fcm/i);
  assert.match(workflow, /No push message was sent/);
});
