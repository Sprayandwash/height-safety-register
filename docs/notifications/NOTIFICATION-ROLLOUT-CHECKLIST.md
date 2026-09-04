# Notification rollout checklist

## Current readiness

The technical delivery paths have been verified in isolated Staging. The recurring push scheduler remains inactive and routine delivery flags remain disabled.

## Employee device enrolment

For each employee who will receive reminders:

1. Open the installed Staging PWA shortcut on their Android phone.
2. Sign in with that employee's own account.
3. Open **Account** and select **Enable phone reminders**.
4. Accept the Android/Chrome notification permission.
5. Confirm the account shows one enabled device.

Acceptance criterion: every intended recipient has one current subscription with permission `granted` and no recent failure.

## Weekly email preference

- Admin weekly summary is enabled through the separate weekly-email delivery phase.
- Employee weekly summaries are opt-in only and must include only that employee's tasks.
- Keep the email scheduler inactive until a separately approved controlled email test.

## Staging routine-activation proposal

Before a new external-send Step 9B, report the recipients and count, push-only channel, Pacific/Auckland send window, candidate source, and the plan to return delivery to disabled after the test.

## Production gate

Do not activate production routine delivery until staff devices are enrolled, Staging testing covers the agreed pilot group, and the user explicitly approves recipients, timing and rollback.

## Rollback

Disable `TASK_PUSH_DELIVERY_ENABLED`, keep the scheduler inactive, preserve the delivery ledger for diagnosis, and document the fault before any further external-send test.
