// Employee push-enrolment UI. Delivery remains server-controlled and disabled
// until the notification sender, VAPID keys and staged test approvals exist.
(() => {
  const state = { status: null, loading: false, error: '' };
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const base64ToBytes = value => {
    const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
    const raw = atob(padded);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };

  async function invoke(action, extra = {}) {
    if (!sb || !currentUser) throw new Error('Sign in before managing job reminders.');
    const { data, error } = await sb.functions.invoke('employee-notifications', { body: { action, ...extra } });
    if (error) throw new Error(error.message || 'Notification settings could not be updated.');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function refresh() {
    if (!currentUser || state.loading) return state.status;
    state.loading = true;
    try { state.status = await invoke('status'); state.error = ''; }
    catch (error) { state.error = error.message || String(error); }
    finally { state.loading = false; renderHomeCard(); }
    return state.status;
  }

  function deviceLabel() {
    const agent = navigator.userAgent || '';
    if (/Android/i.test(agent) && /Chrome/i.test(agent)) return 'Android Chrome';
    if (/Android/i.test(agent)) return 'Android browser';
    return 'Browser';
  }

  async function enable() {
    try {
      if (!supported()) throw new Error('This browser does not support push notifications. Use Chrome on your Android phone.');
      const status = state.status || await refresh();
      const publicKey = status?.vapid_public_key;
      if (!publicKey) throw new Error('Job reminders are not ready for enrolment yet.');
      if (Notification.permission === 'denied') throw new Error('Notifications are blocked for this app in Android settings. Allow them there, then try again.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) });
      await invoke('register_push_subscription', { subscription: subscription.toJSON(), device_label: deviceLabel() });
      await refresh();
    } catch (error) { state.error = error.message || String(error); renderHomeCard(); }
  }

  async function disable() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await invoke('disable_push');
      await refresh();
    } catch (error) { state.error = error.message || String(error); renderHomeCard(); }
  }

  function ensureHost() {
    let host = document.getElementById('employeeNotificationSettings');
    if (host) return host;
    const shell = document.getElementById('moduleHomeShell');
    if (!shell || document.getElementById('moduleHome')?.classList.contains('hidden')) return null;
    host = document.createElement('div');
    host.id = 'employeeNotificationSettings';
    shell.appendChild(host);
    return host;
  }

  function renderHomeCard() {
    const host = ensureHost();
    if (!host) return;
    if (!currentUser) { host.innerHTML = ''; return; }
    if (!supported()) {
      host.innerHTML = `<section class="ops-card"><h3>Job reminders</h3><p class="ops-subtle">Push reminders are available through Chrome on Android phones.</p></section>`;
      return;
    }
    const status = state.status;
    const subscriptionCount = Number(status?.subscriptions?.length || 0);
    const enabled = status?.push_enabled === true && subscriptionCount > 0;
    const unavailable = status && !status.vapid_public_key;
    const message = state.error
      ? `<p class="ops-error">${escapeHtml(state.error)}</p>`
      : state.loading || !status
        ? '<p class="ops-subtle">Checking reminder status…</p>'
        : unavailable
          ? '<p class="ops-subtle">Job reminders are being prepared and cannot be enabled yet.</p>'
          : enabled
            ? `<p class="ops-subtle">Job reminders are enabled on ${subscriptionCount} device${subscriptionCount === 1 ? '' : 's'}.</p>`
            : '<p class="ops-subtle">Receive a prompt on this phone when work is assigned, due soon or overdue.</p>';
    const action = unavailable || state.loading
      ? ''
      : enabled
        ? '<button type="button" class="ops-btn ghost" onclick="SWEmployeeNotifications.disable()">Turn off job reminders</button>'
        : '<button type="button" class="ops-btn primary" onclick="SWEmployeeNotifications.enable()">Enable job reminders</button>';
    host.innerHTML = `<section class="ops-card"><h3>Job reminders</h3>${message}${action}<p class="ops-subtle" style="margin-bottom:0">For the most reliable result, install Spray &amp; Wash Operations to your Android Home screen before enabling reminders.</p></section>`;
  }

  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'sw:pushsubscriptionchange') refresh();
  });

  window.SWEmployeeNotifications = { refresh, enable, disable, renderHomeCard };
  document.addEventListener('sw:operations-rendered', () => setTimeout(() => { renderHomeCard(); refresh(); }, 0));
  new MutationObserver(() => {
    if (!document.getElementById('employeeNotificationSettings') && !document.getElementById('moduleHome')?.classList.contains('hidden')) {
      renderHomeCard();
      refresh();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
