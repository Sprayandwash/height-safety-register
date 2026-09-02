const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('NOTIFY-ENROL-001: push enrolment is opt-in and uses the authenticated notification function', () => {
  const index = read('index.html');
  const app = read('app.js');
  const enrolment = read('push-notifications.js');
  assert.match(index, /id="pushNotificationSettings"/);
  assert.match(index, /src="push-notifications\\.js\\?v=1"/);
  assert.match(app, /window\\.refreshPushNotificationSettings\\?\\.\\(\\)/);
  assert.match(enrolment, /Notification\\.requestPermission\\(\\)/);
  assert.match(enrolment, /pushManager\\.subscribe\\(/);
  assert.match(enrolment, /register_push_subscription/);
  assert.match(enrolment, /vapid_public_key/);
});

test('NOTIFY-ENROL-002: the client has no direct push-provider delivery path', () => {
  const enrolment = read('push-notifications.js');
  assert.doesNotMatch(enrolment, /web-push|fetch\\([^)]*push/i);
  assert.match(enrolment, /Routine reminders remain disabled\\./);
});

test('NOTIFY-DELIVERY-001: a staging test is constrained to the authenticated staging administrator device', () => {
  const enrolment = read('push-notifications.js');
  const sender = read('supabase/functions/employee-notifications/index.ts');
  assert.match(enrolment, /window\\.SPRAY_WASH_ENV === 'staging'/);
  assert.match(enrolment, /send_staging_test_push/);
  assert.match(sender, /STAGING_PUSH_TEST_DELIVERY_ENABLED/);
  assert.match(sender, /SEND_ONE_STAGING_TEST_PUSH/);
  assert.match(sender, /Exactly one granted device subscription is required/);
  assert.match(sender, /A staging push test has already been attempted for this device/);
  assert.match(sender, /automated: false/);
});

test('NOTIFY-ENROL-003: the PWA worker can display a future push and return to the app', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /self\\.addEventListener\\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /self\\.addEventListener\\('notificationclick'/);
  assert.match(worker, /self\\.clients\\.openWindow/);
});
