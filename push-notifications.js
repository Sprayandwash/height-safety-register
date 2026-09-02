// Employee push enrolment only. This file never sends a notification.
(() => {
  const FUNCTION_NAME = 'employee-notifications';
  let latestStatus = null;

  const supported = () => window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

  const base64UrlToUint8Array = value => {
    const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  };

  const functionCall = async (action, payload = {}) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in again to manage job reminders.');
    const { data, error } = await sb.functions.invoke(FUNCTION_NAME, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action, ...payload }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const setPanel = html => {
    const panel = document.getElementById('pushNotificationSettings');
    if (panel) panel.innerHTML = html;
  };

  const escapeText = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  const render = () => {
    if (!currentUser) return setPanel('<h3>Job reminders</h3><p class="muted">Sign in to manage reminders and weekly email.</p>');
    if (!latestStatus) return setPanel('<h3>Job reminders</h3><p class="muted">Checking notification availability…</p>');

    const weeklyEnabled = latestStatus.weekly_email_enabled === true;
    const weeklyControl = `<div class="pushSettings"><h3>Weekly task email</h3><p class="muted">${weeklyEnabled ? 'Enabled. You will receive your own open-task summary each Monday at 7:30 am.' : 'Optional. Receive only your own open tasks each Monday at 7:30 am.'}</p><p class="muted">No email is sent when you have no open tasks. Routine email delivery is not enabled yet.</p><div class="row"><button class="primary" onclick="setWeeklyEmailPreference(true)" ${weeklyEnabled ? 'disabled' : ''}>Enable weekly task email</button>${weeklyEnabled ? '<button onclick="setWeeklyEmailPreference(false)">Disable</button>' : ''}</div></div>`;

    if (!supported()) return setPanel(`<h3>Job reminders</h3><p class="muted">Push reminders need the installed Spray &amp; Wash app on a supported Android browser.</p>${weeklyControl}`);
    if (!latestStatus.vapid_public_key) return setPanel(`<h3>Job reminders</h3><p class="muted">Push reminders are being prepared and cannot be enabled yet.</p>${weeklyControl}`);
    if (Notification.permission === 'denied') return setPanel(`<h3>Job reminders</h3><p class="dangerBox">Notifications are blocked for this app. Enable them in your browser or Android app settings, then return here.</p>${weeklyControl}`);
    const active = latestStatus.push_enabled && latestStatus.subscriptions?.length;
    const detail = active
      ? `Enabled on ${latestStatus.subscriptions.length} device${latestStatus.subscriptions.length === 1 ? '' : 's'}.`
      : 'Enable reminders for new assignments and due items.';
    const canSendStagingTest = window.SPRAY_WASH_ENV === 'staging' && latestStatus.is_admin && latestStatus.is_staging_test_delivery_enabled && active && latestStatus.subscriptions.length === 1;
    const testControl = canSendStagingTest ? '<button class="primary" onclick="sendStagingTestPush()">Send one staging test push</button>' : '';
    setPanel(`<h3>Job reminders</h3><p class="muted">${escapeText(detail)}</p><p class="muted">Routine reminders remain disabled. A staging administrator may send one controlled test to this enrolled device.</p><div class="row"><button class="primary" onclick="enablePushNotifications()" ${active ? 'disabled' : ''}>Enable phone reminders</button>${active ? '<button onclick="disablePushNotifications()">Disable</button>' : ''}${testControl}</div>${weeklyControl}`);
  };

  const refresh = async () => {
    latestStatus = null;
    render();
    if (!currentUser) return;
    try { latestStatus = await functionCall('status'); } catch (error) {
      console.warn('Push notification status unavailable', error);
      setPanel('<h3>Job reminders</h3><p class="muted">Reminder settings are temporarily unavailable. Please try again.</p>');
      return;
    }
    render();
  };

  window.enablePushNotifications = async () => {
    if (!supported()) return render();
    if (!latestStatus?.vapid_public_key) return render();
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return render();
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(latestStatus.vapid_public_key)
      });
      await functionCall('register_push_subscription', {
        subscription: subscription.toJSON(),
        device_label: 'Android PWA'
      });
      await refresh();
    } catch (error) {
      console.warn('Push enrolment failed', error);
      alert(`Could not enable phone reminders: ${error.message || 'Please try again.'}`);
      await refresh();
    }
  };

  window.sendStagingTestPush = async () => {
    if (!(window.SPRAY_WASH_ENV === 'staging' && latestStatus?.is_admin && latestStatus?.is_staging_test_delivery_enabled)) return;
    if (!confirm('Send one staging test notification to this enrolled phone?')) return;
    try {
      await functionCall('send_staging_test_push', { confirmation: 'SEND_ONE_STAGING_TEST_PUSH' });
      alert('The staging test push was accepted. Check your notification shade.');
    } catch (error) {
      console.warn('Staging push test failed', error);
      alert('Could not send the staging test: ' + (error.message || 'Please try again.'));
    }
    await refresh();
  };

  window.setWeeklyEmailPreference = async enabled => {
    try {
      await functionCall('set_weekly_email_preference', { enabled: enabled === true });
    } catch (error) {
      console.warn('Weekly email preference update failed', error);
      alert(`Could not update weekly task email: ${error.message || 'Please try again.'}`);
    }
    await refresh();
  };

  window.disablePushNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await functionCall('disable_push');
    } catch (error) {
      console.warn('Push disable failed', error);
      alert(`Could not disable phone reminders: ${error.message || 'Please try again.'}`);
    }
    await refresh();
  };

  window.refreshPushNotificationSettings = refresh;
})();
