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
