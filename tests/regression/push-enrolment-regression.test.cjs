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
  assert.match(index, /src="push-notifications\.js\?v=1"/);
  assert.match(app, /window\.refreshPushNotificationSettings\?\.\(\)/);
  assert.match(enrolment, /Notification\.requestPermission\(\)/);
  assert.match(enrolment, /pushManager\.subscribe\(/);
  assert.match(enrolment, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(enrolment, /register_push_subscription/);
  assert.match(enrolment, /vapid_public_key/);
});

test('NOTIFY-ENROL-002: the client enrolment code has no delivery path', () => {
  const enrolment = read('push-notifications.js');
  assert.doesNotMatch(enrolment, /web-push|sendNotification|fetch\([^)]*push/i);
  assert.match(enrolment, /No reminders are sent until the delivery phase is approved\./);
});

test('NOTIFY-ENROL-003: the PWA worker can display a future push and return to the app', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /self\.addEventListener\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /self\.addEventListener\('notificationclick'/);
  assert.match(worker, /self\.clients\.openWindow/);
});
