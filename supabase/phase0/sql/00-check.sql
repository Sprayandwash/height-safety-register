-- Spray & Wash V4.0.82 Phase 0 repair preflight
-- READ-ONLY GATE: this script makes no permanent changes.

DO $$
DECLARE
  v_bad_roles text;
  v_bad_preloaded text;
  v_admins integer;
BEGIN
  IF to_regclass('public.user_roles') IS NULL
     OR to_regclass('public.operations_maintenance_tasks') IS NULL
     OR to_regclass('public.inspections') IS NULL THEN
    RAISE EXCEPTION 'Required Spray & Wash tables are missing.';
  END IF;

  SELECT string_agg(DISTINCT role, ', ' ORDER BY role)
  INTO v_bad_roles
  FROM public.user_roles
  WHERE role <> ALL (ARRAY['Admin','Height equipment manager','Height equipment user','Maintenance manager','Vehicle inspector']);
  IF v_bad_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported live user_roles values must be resolved before migration: %', v_bad_roles;
  END IF;

  SELECT string_agg(DISTINCT r, ', ' ORDER BY r)
  INTO v_bad_preloaded
  FROM public.operations_preloaded_users u
  CROSS JOIN LATERAL unnest(coalesce(u.roles, ARRAY[]::text[])) r
  WHERE r <> ALL (ARRAY['Admin','Height equipment manager','Height equipment user','Maintenance manager','Vehicle inspector']);
  IF v_bad_preloaded IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported preloaded-user role values must be resolved before migration: %', v_bad_preloaded;
  END IF;

  SELECT count(*) INTO v_admins FROM public.user_roles WHERE role='Admin';
  IF v_admins < 1 THEN
    RAISE EXCEPTION 'At least one Admin role is required.';
  END IF;

  IF to_regprocedure('public.operations_sync_automatic_tasks_v4077()') IS NULL
     OR to_regprocedure('public.operations_height_failure_task_v4077()') IS NULL
     OR to_regprocedure('public.claim_preloaded_user_setup()') IS NULL THEN
    RAISE EXCEPTION 'Required live functions are missing or have changed signatures.';
  END IF;
END $$;

SELECT
  now() AS checked_at,
  current_database() AS database_name,
  current_user AS sql_user,
  (SELECT count(*) FROM public.user_roles) AS user_role_rows,
  (SELECT count(*) FROM public.user_roles WHERE role='Admin') AS admin_role_rows,
  (SELECT count(*) FROM public.operations_preloaded_users) AS preloaded_user_rows,
  (SELECT count(*) FROM public.operations_maintenance_tasks WHERE source_module='height_equipment' AND status NOT IN ('Completed','Deferred')) AS open_height_tasks,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policy_count,
  (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') AS storage_object_policy_count;
