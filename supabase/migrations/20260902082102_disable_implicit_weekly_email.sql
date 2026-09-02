-- Employee weekly emails are optional. Rows created before this migration
-- inherited an enabled value from the former column default, not an opt-in.
ALTER TABLE public.operations_notification_preferences
  ALTER COLUMN weekly_email_enabled SET DEFAULT false;

UPDATE public.operations_notification_preferences
SET weekly_email_enabled = false
WHERE weekly_email_enabled = true;
