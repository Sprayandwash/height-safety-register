import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'content-type': 'application/json' }
});

const cleanLabel = (value: unknown) => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .trim()
  .slice(0, 80) || null;

function validSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== 'object') return false;
  const subscription = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    const endpoint = new URL(String(subscription.endpoint || ''));
    return endpoint.protocol === 'https:'
      && typeof subscription.keys?.p256dh === 'string'
      && subscription.keys.p256dh.length > 20
      && typeof subscription.keys?.auth === 'string'
      && subscription.keys.auth.length > 8;
  } catch (_) {
    return false;
  }
}

async function currentUser(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const client = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || '',
    { global: { headers: { authorization } } }
  );
  const { data: { user }, error } = await client.auth.getUser();
  return error ? null : user;
}

const nzDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return nzDate(next);
};

async function isActiveAdmin(service: ReturnType<typeof createClient>, userId: string) {
  const [{ data: access }, { data: roles }] = await Promise.all([
    service.from('app_user_access').select('status,must_change_password').eq('user_id', userId).maybeSingle(),
    service.from('user_roles').select('role').eq('user_id', userId)
  ]);
  return access?.status === 'Active'
    && access?.must_change_password !== true
    && (roles || []).some(row => row.role === 'Admin');
}

type Task = {
  id: string; title: string; description: string | null; status: string; priority: string | null;
  due_date: string | null; assigned_user_id: string | null; assigned_role: string | null;
};

async function recipientsForTask(service: ReturnType<typeof createClient>, task: Task) {
  const ids = new Set<string>();
  if (task.assigned_user_id) ids.add(task.assigned_user_id);
  if (task.assigned_role) {
    const { data: roleRows } = await service.from('user_roles').select('user_id').eq('role', task.assigned_role);
    (roleRows || []).forEach(row => ids.add(row.user_id));
  }
  if (!ids.size) return [];
  const { data: activeRows, error } = await service.from('app_user_access')
    .select('user_id').in('user_id', [...ids]).eq('status', 'Active');
  if (error) throw error;
  return (activeRows || []).map(row => row.user_id);
}

function taskEvent(task: Task, today: string) {
  if (!task.due_date) return null;
  if (task.due_date < today) return { type: 'overdue', keySuffix: today };
  if (task.due_date <= addDays(new Date(), 2)) return { type: 'due_soon', keySuffix: 'once' };
  return null;
}

async function reconcileTaskNotifications(service: ReturnType<typeof createClient>, record: boolean) {
  const { data: tasks, error } = await service.from('operations_maintenance_tasks')
    .select('id,title,description,status,priority,due_date,assigned_user_id,assigned_role')
    .not('status', 'in', '(Completed,Deferred)');
  if (error) throw error;
  const today = nzDate();
  const result = { scanned: tasks?.length || 0, eligible: 0, unresolved: 0, created: 0, duplicates: 0, preview: [] as Array<Record<string, unknown>> };
  for (const task of (tasks || []) as Task[]) {
    const event = taskEvent(task, today);
    if (!event) continue;
    const recipients = await recipientsForTask(service, task);
    if (!recipients.length) { result.unresolved += 1; continue; }
    result.eligible += recipients.length;
    for (const recipientUserId of recipients) {
      const idempotencyKey = `task:${task.id}:${recipientUserId}:${event.type}:${event.keySuffix}`;
      const notification = {
        recipient_user_id: recipientUserId,
        task_id: task.id,
        event_type: event.type,
        escalation_stage: 'standard',
        severity: task.priority || 'Medium',
        title: event.type === 'overdue' ? 'Overdue task' : 'Task due soon',
        body: `${task.title}${task.due_date ? ` — due ${task.due_date}` : ''}`,
        deep_link: './',
        state: 'pending',
        idempotency_key: idempotencyKey,
        metadata: { source: 'staging-reconcile', task_status: task.status, due_date: task.due_date }
      };
      result.preview.push({ task_id: task.id, event_type: event.type, due_date: task.due_date, idempotency_key: idempotencyKey });
      if (!record) continue;
      const { data: insertedRows, error: insertError } = await service.from('operations_notifications')
        .upsert(notification, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('id');
      if (insertError) throw insertError;
      if ((insertedRows || []).length) result.created += 1;
      else result.duplicates += 1;
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const user = await currentUser(req);
  if (!user) return json({ error: 'Unauthenticated' }, 401);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || '');
  const service = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  if (action === 'reconcile_staging') {
    if (!await isActiveAdmin(service, user.id)) return json({ error: 'Admin access required' }, 403);
    const mode = String(body?.mode || 'preview');
    if (!['preview', 'record'].includes(mode)) return json({ error: 'Mode must be preview or record.' }, 400);
    if (mode === 'record' && body?.confirmation !== 'STAGING_RECORDS_ONLY') {
      return json({ error: 'Staging record confirmation required.' }, 400);
    }
    try {
      const result = await reconcileTaskNotifications(service, mode === 'record');
      return json({ ok: true, mode, delivery: 'disabled', ...result });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Notification reconcile failed.' }, 500);
    }
  }

  if (action === 'status') {
    const [{ data: preference, error: preferenceError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      service.from('operations_notification_preferences')
        .select('push_enabled,weekly_email_enabled,timezone,updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      service.from('operations_push_subscriptions')
        .select('id,device_label,permission_state,last_success_at,last_failure_at,last_failure_code,updated_at')
        .eq('user_id', user.id)
        .neq('permission_state', 'unsubscribed')
        .order('updated_at', { ascending: false })
    ]);
    if (preferenceError || subscriptionsError) return json({ error: preferenceError?.message || subscriptionsError?.message }, 500);
    return json({
      push_enabled: preference?.push_enabled === true,
      weekly_email_enabled: preference?.weekly_email_enabled !== false,
      timezone: preference?.timezone || 'Pacific/Auckland',
      vapid_public_key: Deno.env.get('VAPID_PUBLIC_KEY') || null,
      subscriptions: subscriptions || []
    });
  }

  if (action === 'register_push_subscription') {
    const subscription = body?.subscription;
    if (!validSubscription(subscription)) return json({ error: 'Invalid push subscription.' }, 400);

    const { data: existing, error: existingError } = await service
      .from('operations_push_subscriptions')
      .select('id,user_id')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle();
    if (existingError) return json({ error: existingError.message }, 500);
    if (existing && existing.user_id !== user.id) return json({ error: 'This device is already enrolled for another user.' }, 409);

    const now = new Date().toISOString();
    const { error: subscriptionError } = await service
      .from('operations_push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription_json: subscription,
        device_label: cleanLabel(body?.device_label),
        permission_state: 'granted',
        updated_at: now,
        last_failure_at: null,
        last_failure_code: null
      }, { onConflict: 'endpoint' });
    if (subscriptionError) return json({ error: subscriptionError.message }, 500);

    const { error: preferenceError } = await service
      .from('operations_notification_preferences')
      .upsert({ user_id: user.id, push_enabled: true, updated_at: now, updated_by: user.id });
    if (preferenceError) return json({ error: preferenceError.message }, 500);
    return json({ ok: true });
  }

  if (action === 'disable_push') {
    const now = new Date().toISOString();
    const [{ error: preferenceError }, { error: subscriptionError }] = await Promise.all([
      service.from('operations_notification_preferences')
        .upsert({ user_id: user.id, push_enabled: false, updated_at: now, updated_by: user.id }),
      service.from('operations_push_subscriptions')
        .update({ permission_state: 'unsubscribed', updated_at: now })
        .eq('user_id', user.id)
    ]);
    if (preferenceError || subscriptionError) return json({ error: preferenceError?.message || subscriptionError?.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
