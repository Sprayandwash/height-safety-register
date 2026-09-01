# Notification scope decision

**Date:** 1 September 2026  
**Status:** Approved to begin foundation work  
**Release area:** Employee notifications for Spray & Wash Operations

## Agreed direction

- Android PWA push notifications are the primary employee channel.
- Email is a concise weekly summary and delivery/audit fallback, not an individual-task channel.
- SMS is not part of this release.
- The in-app Attention Items dashboard remains the authoritative task list.
- The first release covers outstanding maintenance tasks, including issue tasks created by vehicle inspections.
- Production remains separately approval-gated: a pull-request merge does not deploy either the GitHub Pages app or database changes.

## Intended notification rules

| Event | Intended delivery |
|---|---|
| A task is assigned or reassigned | One push notification to the resolved recipient |
| A vehicle inspection creates an issue task | One push notification to the resolved recipient |
| A task becomes due soon | One push notification, two working days before the due date |
| A task is overdue | One push notification on each workday while it remains open |
| Weekly summary | One Monday email per intended recipient, containing only current outstanding work |

No notification may be sent for a task that has been completed, deferred, cancelled, or superseded by reassignment. Every delivery must be auditable and idempotent.

## Deliberately deferred configuration

The foundation will make the following configuration explicit and safe, but will not activate these behaviours until the operational choice is recorded:

1. The nominated manager for an unassigned critical task.
2. Whether critical tasks receive an escalation after two working days overdue.
3. The final employee/manager recipients for the weekly summary.
4. The release email sender subdomain and Resend account/API secret.
5. The final weekday send times (the implementation plan proposes 7:00 am NZ time for reminders and Monday 6:30 am NZ time for the summary).

## Record handling

This is the Step 0 record. The formal staging evidence record is generated at Step 9b after controlled testing, following the existing testing-history pattern. Records are secret-free: they identify commit, migration and function versions but never keys, credentials, device subscription encryption data, passwords or raw mailbox addresses.
