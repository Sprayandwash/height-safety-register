# Notification implementation baseline

**Date:** 1 September 2026  
**Step:** 1 — feature-branch baseline  
**Feature branch:** `feature/employee-notifications-foundation`  
**Base commit:** `0a3757de90ac9f6eed075649d7f9553295250129` (`main`)

## Existing application state

- GitHub Pages PWA: `manifest.webmanifest` already declares `display: standalone`.
- Service worker: `service-worker.js`, release cache name `spray-wash-operations-v4-0-90`.
- The browser registers the service worker from `app.js` after `DOMContentLoaded`.
- Current deployed Edge Function: `account-admin` only.
- Existing task source: `public.operations_maintenance_tasks`.
- Existing recipient fields: `assigned_user_id` and `assigned_role`.
- Existing employee data: `public.profiles`, `public.user_roles` and `public.app_user_access`.
- Vehicle-check issue tasks are created as open maintenance tasks and currently default to the `Maintenance manager` role.

## Staging infrastructure verified

- Staging project: `Spray and Wash Staging`.
- Available extensions: `pg_cron`, `pg_net` and Supabase Vault.
- Existing Edge Function: `account-admin` (version 1; JWT verification enabled).
- No notification tables, notification function, Web Push VAPID configuration or operational email provider configuration exists yet.

## Boundaries

- No production data, function, secret, cron job, GitHub Pages artifact or employee notification has been changed at this point.
- This branch begins with records only; the notification schema will first be designed and applied in staging, then tested before any production decision.
