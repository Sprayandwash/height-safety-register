import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;
  const client = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || ''
  );
  const { data: { user }, error } = await client.auth.getUser(token);
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

type WeeklyTask = Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'due_date' | 'assigned_user_id' | 'assigned_role'> & {
  assigned_to: string | null;
  created_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

const nzDayFormatter = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
});

function nzDayParts(date = new Date()) {
  const parts = Object.fromEntries(nzDayFormatter.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function previousNzWeek(now = new Date()) {
  const today = nzDayParts(now);
  const weekdayIndex: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const index = weekdayIndex[today.weekday] ?? 0;
  const end = addCalendarDays(today.date, -index - 1);
  return { start: addCalendarDays(end, -6), end };
}

function isInNzDateRange(value: string | null | undefined, range: { start: string; end: string }) {
  if (!value) return false;
  const date = nzDate(new Date(value));
  return date >= range.start && date <= range.end;
}

function classifyWeeklyTasks(tasks: WeeklyTask[], today: string) {
  const dueSoon = addCalendarDays(today, 2);
  const groups = { overdue: [] as WeeklyTask[], due_within_48_hours: [] as WeeklyTask[], later_due: [] as WeeklyTask[] };
  for (const task of tasks) {
    if (task.due_date && task.due_date < today) groups.overdue.push(task);
    else if (task.due_date && task.due_date <= dueSoon) groups.due_within_48_hours.push(task);
    else groups.later_due.push(task);
  }
  return groups;
}

function weeklyTaskLine(task: WeeklyTask, includeAssignment: boolean) {
  return {
    id: task.id, title: task.title, due_date: task.due_date, priority: task.priority || 'Medium',
    ...(includeAssignment ? { assigned_to: task.assigned_to || task.assigned_role || (task.assigned_user_id ? 'Named employee' : 'Unassigned') } : {}),
    deep_link: './'
  };
}

async function openTasksForUser(service: ReturnType<typeof createClient>, userId: string, tasks?: WeeklyTask[]) {
  const openTasks = tasks || await (async () => {
    const { data, error } = await service.from('operations_maintenance_tasks')
      .select('id,title,status,priority,due_date,assigned_user_id,assigned_role,assigned_to,created_at,completed_at,updated_at')
      .not('status', 'in', '(Completed,Deferred)');
    if (error) throw error;
    return (data || []) as WeeklyTask[];
  })();
  const { data: roles, error: rolesError } = await service.from('user_roles').select('role').eq('user_id', userId);
  if (rolesError) throw rolesError;
  const roleNames = new Set((roles || []).map(row => row.role));
  return openTasks.filter(task => task.assigned_user_id === userId || (!!task.assigned_role && roleNames.has(task.assigned_role)));
}

async function weeklyAdminPreview(service: ReturnType<typeof createClient>) {
  const range = previousNzWeek();
  const today = nzDate();
  const [{ data: taskRows, error: taskError }, { data: vehicleChecks, error: vehicleError }, { data: maintenanceRows, error: maintenanceError }, { data: heightRows, error: heightError }, { data: adminRoles, error: adminRoleError }] = await Promise.all([
    service.from('operations_maintenance_tasks').select('id,title,status,priority,due_date,assigned_user_id,assigned_role,assigned_to,created_at,completed_at,updated_at').not('status', 'in', '(Completed,Deferred)'),
    service.from('operations_inspections').select('id,inspection_date,overall_result,created_at'),
    service.from('operations_maintenance_log').select('id,created_at'),
    service.from('inspections').select('id,inspection_date').gte('inspection_date', range.start).lte('inspection_date', range.end),
    service.from('user_roles').select('user_id').eq('role', 'Admin')
  ]);
  if (taskError || vehicleError || maintenanceError || heightError || adminRoleError) throw taskError || vehicleError || maintenanceError || heightError || adminRoleError;
  const openTasks = (taskRows || []) as WeeklyTask[];
  const adminIds = [...new Set((adminRoles || []).map(row => row.user_id))];
  let activeAdminCount = 0;
  if (adminIds.length) {
    const { data: accessRows, error } = await service.from('app_user_access').select('user_id,must_change_password')
      .in('user_id', adminIds).eq('status', 'Active');
    if (error) throw error;
    activeAdminCount = (accessRows || []).filter(row => row.must_change_password !== true).length;
  }
  const vehicleRows = vehicleChecks || [];
  const nonPassVehicleChecks = vehicleRows.filter(row => isInNzDateRange(row.created_at, range) && !!row.overall_result && !['pass', 'passed', 'ok'].includes(String(row.overall_result).toLowerCase()));
  const taskActivityRows = await service.from('operations_maintenance_tasks').select('id,status,created_at,completed_at,updated_at');
  if (taskActivityRows.error) throw taskActivityRows.error;
  const activityTasks = taskActivityRows.data || [];
  const groups = classifyWeeklyTasks(openTasks, today);
  return {
    kind: 'admin_weekly_preview', delivery: 'disabled', period_nz: range, active_admin_recipient_count: activeAdminCount,
    activity: {
      tasks_created: activityTasks.filter(task => isInNzDateRange(task.created_at, range)).length,
      tasks_completed: activityTasks.filter(task => task.status === 'Completed' && isInNzDateRange(task.completed_at || task.updated_at, range)).length,
      tasks_deferred: activityTasks.filter(task => task.status === 'Deferred' && isInNzDateRange(task.updated_at, range)).length,
      vehicle_checks_completed: vehicleRows.filter(row => isInNzDateRange(row.created_at, range)).length,
      vehicle_checks_with_reported_issue: nonPassVehicleChecks.length,
      maintenance_records_created: (maintenanceRows || []).filter(row => isInNzDateRange(row.created_at, range)).length,
      height_equipment_inspections_completed: (heightRows || []).length
    },
    pending_tasks: Object.fromEntries(Object.entries(groups).map(([group, rows]) => [group, rows.map(task => weeklyTaskLine(task, true))])),
    exceptions: {
      unassigned_tasks: openTasks.filter(task => !task.assigned_user_id && !task.assigned_role).map(task => weeklyTaskLine(task, true)),
      vehicle_checks_with_reported_issue: nonPassVehicleChecks.length,
      delivery_failures: 'Not queried: preview creates no notification or delivery record.'
    }
  };
}

async function weeklyEmployeePreview(service: ReturnType<typeof createClient>, userId: string) {
  const tasks = await openTasksForUser(service, userId);
  const groups = classifyWeeklyTasks(tasks, nzDate());
  return {
    kind: 'employee_weekly_preview', delivery: 'disabled', recipient: 'current_user',
    suppressed: tasks.length === 0, suppression_reason: tasks.length === 0 ? 'No open tasks are assigned to this employee.' : null,
    pending_tasks: Object.fromEntries(Object.entries(groups).map(([group, rows]) => [group, rows.map(task => weeklyTaskLine(task, false))]))
  };
}

function escapeEmailHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

type WeeklyPreview = {
  kind: 'admin_weekly_preview' | 'employee_weekly_preview';
  delivery: 'disabled';
  period_nz?: { start: string; end: string };
  activity?: Record<string, number>;
  pending_tasks: Record<string, Array<Record<string, unknown>>>;
  exceptions?: { unassigned_tasks?: Array<Record<string, unknown>>; vehicle_checks_with_reported_issue?: number };
  suppressed?: boolean;
  suppression_reason?: string | null;
};

function taskLine(task: Record<string, unknown>, includeAssignment: boolean) {
  return [
    String(task.title || 'Untitled task'),
    task.due_date ? `due ${task.due_date}` : 'no due date',
    task.priority ? `priority ${task.priority}` : null,
    includeAssignment && task.assigned_to ? `assigned to ${task.assigned_to}` : null
  ].filter(Boolean).join(' — ');
}

function taskLinesForEmail(groups: WeeklyPreview['pending_tasks'], includeAssignment: boolean, excludedGroups = new Set<string>()) {
  const labels: Record<string, string> = {
    overdue: 'Overdue',
    due_within_48_hours: 'Due within 48 hours',
    later_due: 'Later due'
  };
  const text: string[] = [];
  const html: string[] = [];
  for (const [group, tasks] of Object.entries(groups)) {
    if (!tasks.length || excludedGroups.has(group)) continue;
    const heading = labels[group] || group;
    text.push(heading);
    html.push(`<h3>${escapeEmailHtml(heading)}</h3><ul>`);
    for (const task of tasks) {
      const line = taskLine(task, includeAssignment);
      text.push(`- ${line}`);
      html.push(`<li>${escapeEmailHtml(line)}</li>`);
    }
    html.push('</ul>');
  }
  return { text: text.join('\n'), html: html.join('') };
}

function overdueTasksByEmployee(tasks: Array<Record<string, unknown>>) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const task of tasks) {
    const employee = String(task.assigned_to || 'Unassigned');
    const rows = grouped.get(employee) || [];
    rows.push(task);
    grouped.set(employee, rows);
  }
  const text: string[] = ['Overdue tasks by employee'];
  const html: string[] = ['<h3 style="margin:0 0 12px;color:#003b73">Overdue tasks by employee</h3>'];
  for (const [employee, rows] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    text.push(employee);
    html.push(`<div style="margin:0 0 14px;padding:12px;border-left:4px solid #0b9b50;background:#f3f7fb"><strong>${escapeEmailHtml(employee)}</strong><ul style="margin:8px 0 0;padding-left:20px">`);
    for (const task of rows) {
      const line = taskLine(task, false);
      text.push(`- ${line}`);
      html.push(`<li style="margin:5px 0">${escapeEmailHtml(line)}</li>`);
    }
    html.push('</ul></div>');
  }
  return { text: text.join('\n'), html: html.join('') };
}

function brandedEmail(title: string, subtitle: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef4f8;font-family:Arial,Helvetica,sans-serif;color:#17324d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f8"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 28px;background:#003b73;color:#ffffff"><div style="font-size:25px;font-weight:700;letter-spacing:.2px">Spray <span style="color:#74c948">&amp;</span> Wash</div><div style="margin-top:5px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#d9e8f4">Operations</div></td></tr><tr><td style="height:5px;background:#0b9b50"></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 6px;font-size:24px;line-height:1.25;color:#003b73">${escapeEmailHtml(title)}</h1><p style="margin:0 0 24px;color:#5d7185">${escapeEmailHtml(subtitle)}</p>${body}<p style="margin:28px 0 0;color:#5d7185">Review and action your tasks in the Spray &amp; Wash Operations App.</p></td></tr><tr><td style="padding:16px 28px;background:#f3f7fb;color:#5d7185;font-size:12px">Spray &amp; Wash Operations</td></tr></table></td></tr></table></body></html>`;
}

function renderWeeklyEmailDraft(preview: WeeklyPreview) {
  if (preview.kind === 'employee_weekly_preview' && preview.suppressed) {
    return {
      delivery: 'disabled',
      suppressed: true,
      suppression_reason: preview.suppression_reason || 'No open tasks are assigned to this employee.',
      subject: null,
      text: null,
      html: null
    };
  }

  const taskLines = taskLinesForEmail(preview.pending_tasks, preview.kind === 'admin_weekly_preview');
  if (preview.kind === 'employee_weekly_preview') {
    const employeeBody = `<div style="padding:18px;background:#f3f7fb;border-left:4px solid #0b9b50"><h2 style="margin:0 0 12px;font-size:18px;color:#003b73">Your open tasks</h2>${taskLines.html || '<p style="margin:0">No dated tasks.</p>'}</div>`;
    return {
      delivery: 'disabled',
      suppressed: false,
      subject: 'Spray & Wash — your weekly task update',
      text: `Your open tasks\n\n${taskLines.text || 'No dated tasks.'}\n\nReview and action your tasks in the Spray & Wash app.`,
      html: brandedEmail('Your weekly task update', 'A summary of tasks currently assigned to you.', employeeBody)
    };
  }

  const activity = preview.activity || {};
  const activityText = [
    `Tasks created: ${activity.tasks_created || 0}`,
    `Tasks completed: ${activity.tasks_completed || 0}`,
    `Tasks deferred: ${activity.tasks_deferred || 0}`,
    `Vehicle checks completed: ${activity.vehicle_checks_completed || 0}`,
    `Vehicle checks with reported issue: ${activity.vehicle_checks_with_reported_issue || 0}`,
    `Maintenance records created: ${activity.maintenance_records_created || 0}`,
    `Height Equipment inspections completed: ${activity.height_equipment_inspections_completed || 0}`
  ];
  const activityHtml = activityText.map(line => `<li style="margin:5px 0">${escapeEmailHtml(line)}</li>`).join('');
  const unassigned = preview.exceptions?.unassigned_tasks?.length || 0;
  const vehicleIssues = preview.exceptions?.vehicle_checks_with_reported_issue || 0;
  const overdue = overdueTasksByEmployee(preview.pending_tasks.overdue || []);
  const remainingTasks = taskLinesForEmail(preview.pending_tasks, true, new Set(['overdue']));
  const adminBody = `<div style="margin:0 0 20px;padding:18px;background:#f3f7fb;border-radius:8px"><h2 style="margin:0 0 12px;font-size:18px;color:#003b73">Activity</h2><ul style="margin:0;padding-left:20px">${activityHtml}</ul></div><div style="margin:0 0 20px;padding:18px;border:1px solid #d6e3ee;border-radius:8px">${overdue.html}<h3 style="margin:20px 0 12px;color:#003b73">Other pending tasks</h3>${remainingTasks.html || '<p>No other open tasks.</p>'}</div><div style="padding:18px;background:#fff6e8;border-left:4px solid #e5a321"><h2 style="margin:0 0 10px;font-size:18px;color:#003b73">Exceptions</h2><ul style="margin:0;padding-left:20px"><li>Unassigned tasks: ${unassigned}</li><li>Vehicle checks with reported issue: ${vehicleIssues}</li></ul></div>`;
  return {
    delivery: 'disabled',
    suppressed: false,
    subject: `Spray & Wash — weekly operations update (${preview.period_nz?.start || ''} to ${preview.period_nz?.end || ''})`,
    text: `Weekly operations update\n${preview.period_nz?.start || ''} to ${preview.period_nz?.end || ''}\n\nActivity\n${activityText.map(line => `- ${line}`).join('\n')}\n\n${overdue.text}\n\nOther pending tasks\n${remainingTasks.text || 'No other open tasks.'}\n\nExceptions\n- Unassigned tasks: ${unassigned}\n- Vehicle checks with reported issue: ${vehicleIssues}\n\nReview and action your tasks in the Spray & Wash app.`,
    html: brandedEmail('Weekly operations update', `${preview.period_nz?.start || ''} to ${preview.period_nz?.end || ''}`, adminBody)
  };
}

async function sendOneStagingWeeklyEmail(service: ReturnType<typeof createClient>, userId: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM');
  const recipient = Deno.env.get('STAGING_EMAIL_TEST_RECIPIENT');
  if (!apiKey || !from || !recipient) throw new Error('Staging email delivery is not fully configured.');
  // A renderer revision gets one independently approved staging delivery test.
  const stagingEmailTestVersion = 'plain-close-v1';
  const idempotencyKey = `staging-weekly-email-test:${stagingEmailTestVersion}:${userId}`;
  const { data: existing, error: existingError } = await service.from('operations_notifications')
    .select('id').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error('A staging weekly email test has already been attempted for this admin.');

  const preview = await weeklyAdminPreview(service);
  const draft = renderWeeklyEmailDraft(preview);
  if (draft.suppressed || !draft.subject || !draft.text || !draft.html) throw new Error('The staging Admin weekly email draft is unavailable.');

  const now = new Date().toISOString();
  const { data: notification, error: notificationError } = await service.from('operations_notifications').insert({
    recipient_user_id: userId, task_id: null, event_type: 'task_assigned', escalation_stage: 'test', severity: 'Low',
    title: 'Staging weekly email test', body: 'A controlled staging weekly-email delivery test.', deep_link: './',
    state: 'processing', eligible_at: now, idempotency_key: idempotencyKey,
    metadata: { source: 'manual-staging-test', channel: 'email', automated: false, recipient: 'staging_secret' }
  }).select('id').single();
  if (notificationError || !notification) throw new Error(notificationError?.message || 'Could not create the staging email test record.');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({ from, to: [recipient], subject: draft.subject, text: draft.text, html: draft.html })
    });
    const providerResult = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!response.ok) throw new Error('Email provider rejected the staging test.');
    const providerMessageId = typeof providerResult?.id === 'string' ? providerResult.id : 'accepted';
    await Promise.all([
      service.from('operations_notification_deliveries').insert({
        notification_id: notification.id, recipient_user_id: userId, channel: 'email', status: 'sent',
        provider_message_id: providerMessageId, attempted_at: now, delivered_at: new Date().toISOString()
      }),
      service.from('operations_notifications').update({ state: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', notification.id)
    ]);
    return { notification_id: notification.id, provider_message_id: providerMessageId, test_version: stagingEmailTestVersion };
  } catch (error) {
    const failure = error instanceof Error ? error.message.slice(0, 500) : 'Email provider delivery failed.';
    await Promise.all([
      service.from('operations_notification_deliveries').insert({
        notification_id: notification.id, recipient_user_id: userId, channel: 'email', status: 'failed',
        error_code: 'email_send_failed', error_message: failure, attempted_at: now
      }),
      service.from('operations_notifications').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', notification.id)
    ]);
    throw new Error('Staging weekly email test failed.');
  }
}


const weeklyRoutineSchedule = {
  timezone: 'Pacific/Auckland',
  cron_utc: '30 18 * * 0',
  local_time: 'Monday 7:30 am',
  active: false
};

async function weeklyRoutineSchedulePreview(service: ReturnType<typeof createClient>) {
  const [{ data: accessRows, error: accessError }, { data: roleRows, error: roleError }, { data: preferenceRows, error: preferenceError }] = await Promise.all([
    service.from('app_user_access').select('user_id,must_change_password').eq('status', 'Active'),
    service.from('user_roles').select('user_id,role'),
    service.from('operations_notification_preferences').select('user_id').eq('weekly_email_enabled', true)
  ]);
  if (accessError || roleError || preferenceError) throw accessError || roleError || preferenceError;
  const activeIds = new Set((accessRows || []).filter(row => row.must_change_password !== true).map(row => row.user_id));
  const adminIds = new Set((roleRows || []).filter(row => row.role === 'Admin' && activeIds.has(row.user_id)).map(row => row.user_id));
  const employeeIds = new Set((preferenceRows || []).map(row => row.user_id).filter(id => activeIds.has(id)));
  const period = previousNzWeek();
  return {
    delivery: 'disabled', schedule: weeklyRoutineSchedule, period_nz: period,
    candidates: { admin_weekly_summary: adminIds.size, employee_task_only_summary: employeeIds.size, total: adminIds.size + employeeIds.size },
    idempotency: { admin: 'weekly-admin:' + period.end + ':<active-admin-user-id>', employee: 'weekly-employee:' + period.end + ':<opted-in-user-id>' },
    safeguards: ['No provider call, notification record, delivery record or scheduler job is created by preview.', 'Employee summaries require an explicit weekly-email opt-in.']
  };
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

function weeklyRoutineSchedulerAuthorized(req: Request) {
  const expected = Deno.env.get('WEEKLY_ROUTINE_SCHEDULER_SECRET');
  const supplied = req.headers.get('x-spray-wash-scheduler-secret');
  return Boolean(expected && supplied && supplied === expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || '');
  const service = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  if (action === 'run_weekly_routine_preview') {
    if (!weeklyRoutineSchedulerAuthorized(req)) return json({ error: 'Scheduler access required' }, 403);
    try {
      return json({ ok: true, kind: 'weekly_routine_scheduler_preview', ...await weeklyRoutineSchedulePreview(service) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Weekly schedule preview failed.' }, 500);
    }
  }

  const user = await currentUser(req);
  if (!user) return json({ error: 'Unauthenticated' }, 401);

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

  if (action === 'send_staging_test_push') {
    if (Deno.env.get('STAGING_PUSH_TEST_DELIVERY_ENABLED') !== 'true') return json({ error: 'Staging test delivery is not enabled.' }, 403);
    if (!await isActiveAdmin(service, user.id)) return json({ error: 'Admin access required' }, 403);
    if (body?.confirmation !== 'SEND_ONE_STAGING_TEST_PUSH') return json({ error: 'Explicit one-device test confirmation required.' }, 400);
    const [vapidPublicKey, vapidPrivateKey, vapidSubject] = [Deno.env.get('VAPID_PUBLIC_KEY'), Deno.env.get('VAPID_PRIVATE_KEY'), Deno.env.get('VAPID_SUBJECT')];
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return json({ error: 'Staging VAPID delivery is not configured.' }, 503);
    const { data: subscriptions, error: subscriptionError } = await service.from('operations_push_subscriptions').select('id,subscription_json').eq('user_id', user.id).eq('permission_state', 'granted');
    if (subscriptionError) return json({ error: subscriptionError.message }, 500);
    if ((subscriptions || []).length !== 1) return json({ error: 'Exactly one granted device subscription is required for this staging test.' }, 409);
    const subscription = subscriptions![0];
    const { data: existingDelivery, error: existingDeliveryError } = await service.from('operations_notification_deliveries').select('id').eq('recipient_user_id', user.id).eq('subscription_id', subscription.id).eq('channel', 'push').limit(1).maybeSingle();
    if (existingDeliveryError) return json({ error: existingDeliveryError.message }, 500);
    if (existingDelivery) return json({ error: 'A staging push test has already been attempted for this device.' }, 409);
    const now = new Date().toISOString();
    const title = 'Spray & Wash — test reminder';
    const message = 'Staging push delivery is working.';
    const { data: notification, error: notificationError } = await service.from('operations_notifications').insert({
      recipient_user_id: user.id, task_id: null, event_type: 'task_assigned', escalation_stage: 'test', severity: 'Low', title, body: message, deep_link: './', state: 'processing', eligible_at: now,
      idempotency_key: `staging-push-test:${user.id}:${subscription.id}`, metadata: { source: 'manual-staging-test', channel: 'push', automated: false }
    }).select('id').single();
    if (notificationError || !notification) return json({ error: notificationError?.message || 'Could not create test notification.' }, 500);
    try {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      const response = await webpush.sendNotification(subscription.subscription_json, JSON.stringify({ title, body: message, url: './', tag: 'spray-wash-staging-test', data: { kind: 'staging_test_push' } }), { TTL: 60, urgency: 'high' });
      await Promise.all([
        service.from('operations_notification_deliveries').insert({ notification_id: notification.id, recipient_user_id: user.id, channel: 'push', subscription_id: subscription.id, status: 'sent', provider_message_id: String(response.statusCode || 'accepted'), attempted_at: now, delivered_at: new Date().toISOString() }),
        service.from('operations_notifications').update({ state: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', notification.id),
        service.from('operations_push_subscriptions').update({ last_success_at: new Date().toISOString(), last_failure_at: null, last_failure_code: null, updated_at: new Date().toISOString() }).eq('id', subscription.id)
      ]);
      return json({ ok: true, delivery: 'push', recipient: 'current_admin_device', notification_id: notification.id });
    } catch (error) {
      const failure = error instanceof Error ? error.message.slice(0, 500) : 'Push provider delivery failed.';
      await Promise.all([
        service.from('operations_notification_deliveries').insert({ notification_id: notification.id, recipient_user_id: user.id, channel: 'push', subscription_id: subscription.id, status: 'failed', error_code: 'push_send_failed', error_message: failure, attempted_at: now }),
        service.from('operations_notifications').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('id', notification.id),
        service.from('operations_push_subscriptions').update({ last_failure_at: new Date().toISOString(), last_failure_code: 'push_send_failed', updated_at: new Date().toISOString() }).eq('id', subscription.id)
      ]);
      return json({ error: 'Staging push test failed.' }, 502);
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
      weekly_email_enabled: preference?.weekly_email_enabled === true,
      timezone: preference?.timezone || 'Pacific/Auckland',
      vapid_public_key: Deno.env.get('VAPID_PUBLIC_KEY') || null,
      is_admin: await isActiveAdmin(service, user.id),
      is_staging_test_delivery_enabled: Deno.env.get('STAGING_PUSH_TEST_DELIVERY_ENABLED') === 'true',
      subscriptions: subscriptions || []
    });
  }

  if (action === 'preview_weekly_summary') {
    const scope = String(body?.scope || 'self');
    if (!['self', 'admin'].includes(scope)) return json({ error: 'Scope must be self or admin.' }, 400);
    const admin = await isActiveAdmin(service, user.id);
    if (scope === 'admin' && !admin) return json({ error: 'Admin access required' }, 403);
    try {
      const preview = scope === 'admin'
        ? await weeklyAdminPreview(service)
        : await weeklyEmployeePreview(service, user.id);
      return json({ ok: true, scope, ...preview });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Weekly summary preview failed.' }, 500);
    }
  }

  if (action === 'render_weekly_email') {
    const scope = String(body?.scope || 'self');
    if (!['self', 'admin'].includes(scope)) return json({ error: 'Scope must be self or admin.' }, 400);
    const admin = await isActiveAdmin(service, user.id);
    if (scope === 'admin' && !admin) return json({ error: 'Admin access required' }, 403);
    try {
      const preview = scope === 'admin'
        ? await weeklyAdminPreview(service)
        : await weeklyEmployeePreview(service, user.id);
      const draft = renderWeeklyEmailDraft(preview);
      return json({ ok: true, scope, kind: preview.kind, ...draft });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Weekly email rendering failed.' }, 500);
    }
  }

  if (action === 'send_staging_test_weekly_email') {
    if (Deno.env.get('STAGING_EMAIL_TEST_DELIVERY_ENABLED') !== 'true') {
      return json({ error: 'Staging email test delivery is not enabled.' }, 403);
    }
    if (!await isActiveAdmin(service, user.id)) return json({ error: 'Admin access required' }, 403);
    if (body?.confirmation !== 'SEND_ONE_STAGING_TEST_WEEKLY_EMAIL') {
      return json({ error: 'Explicit one-email test confirmation required.' }, 400);
    }
    try {
      const result = await sendOneStagingWeeklyEmail(service, user.id);
      return json({ ok: true, delivery: 'email', recipient: 'staging_test_recipient', ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Staging weekly email test failed.';
      const status = /already been attempted/.test(message) ? 409 : 502;
      return json({ error: message }, status);
    }
  }


  if (action === 'preview_weekly_routine_schedule') {
    if (!await isActiveAdmin(service, user.id)) return json({ error: 'Admin access required' }, 403);
    try {
      return json({ ok: true, kind: 'weekly_routine_schedule_preview', ...await weeklyRoutineSchedulePreview(service) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Weekly schedule preview failed.' }, 500);
    }
  }

  if (action === 'set_weekly_email_preference') {
    const enabled = body?.enabled === true;
    const now = new Date().toISOString();
    const { error } = await service.from('operations_notification_preferences')
      .upsert({ user_id: user.id, weekly_email_enabled: enabled, updated_at: now, updated_by: user.id });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, weekly_email_enabled: enabled, delivery: 'disabled' });
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
