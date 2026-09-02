const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('NOTIFY-READY-001: readiness review is a controlled staging-only, read-only check', () => {
  const workflow = read('.github/workflows/staging-push-enrolment-readiness-review.yml');
  const spec = read('tests/e2e/staging/push-enrolment-readiness.spec.cjs');
  assert.match(workflow, /REVIEW STAGING PUSH ENROLMENT/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /twkgfmctuffmkvkmdkct/);
  assert.match(spec, /action: 'status'/);
  assert.match(spec, /vapid_public_key/);
  assert.match(spec, /subscriptions \|\| \[\]\)\.toEqual\(\[\]\)/);
  assert.doesNotMatch(spec, /register_push_subscription|disable_push/);
  assert.doesNotMatch(workflow, /send-notification|register_push_subscription|supabase secrets set/i);
});
