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
    if (!currentUser) return setPanel('<h3>Job reminders</h3><p class="muted">Sign in to manage phone reminders.</p>');
    if (!supported()) return setPanel('<h3>Job reminders</h3><p class="muted">Push reminders need the installed Spray &amp; Wash app on a supported Android browser.</p>');
    if (!latestStatus) return setPanel('<h3>Job reminders</h3><p class="muted">Checking notification availability…</p>');
    if (!latestStatus.vapid_public_key) return setPanel('<h3>Job reminders</h3><p class="muted">Push reminders are being prepared and cannot be enabled yet.</p>');
    if (Notification.permission === 'denied') return setPanel('<h3>Job reminders</h3><p class="dangerBox">Notifications are blocked for this app. Enable them in your browser or Android app settings, then return here.</p>');
    const active = latestStatus.push_enabled && latestStatus.subscriptions?.length;
    const detail = active
      ? `Enabled on ${latestStatus.subscriptions.length} device${latestStatus.subscriptions.length === 1 ? '' : 's'}.`
      : 'Enable reminders for new assignments and due items.';
    setPanel(`<h3>Job reminders</h3><p class="muted">${escapeText(detail)}</p><p class="muted">No reminders are sent until the delivery phase is approved.</p><div class="row"><button class="primary" onclick="enablePushNotifications()" ${active ? 'disabled' : ''}>Enable phone reminders</button>${active ? '<button onclick="disablePushNotifications()">Disable</button>' : ''}</div>`);
  };

  const refresh = async () => {
    latestStatus = null;
    render();
    if (!currentUser || !supported()) return;
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
