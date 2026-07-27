-- Spray & Wash Operations V4.0.57
-- Run after v4.0.53-repeatable-maintenance-items.sql.
-- Restores profile display names from the existing pre-loaded user records.

begin;

update public.profiles as profile
set display_name = coalesce(
  nullif(btrim(preloaded.display_name), ''),
  nullif(btrim(concat_ws(' ', preloaded.first_name, preloaded.last_name)), '')
)
from public.operations_preloaded_users as preloaded
where lower(coalesce(profile.email, '')) = lower(coalesce(preloaded.email, ''))
  and coalesce(
    nullif(btrim(preloaded.display_name), ''),
    nullif(btrim(concat_ws(' ', preloaded.first_name, preloaded.last_name)), '')
  ) is not null
  and profile.display_name is distinct from coalesce(
    nullif(btrim(preloaded.display_name), ''),
    nullif(btrim(concat_ws(' ', preloaded.first_name, preloaded.last_name)), '')
  );

commit;
