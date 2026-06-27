-- Spray & Wash Height Safety Register - Version 2.1 database update
-- You have already run this in Step 3. This copy is included for record keeping.

alter table equipment add column if not exists rope_length_m numeric(8,2);
alter table equipment add column if not exists archived boolean not null default false;
alter table equipment add column if not exists archived_at timestamptz;
alter table equipment add column if not exists disposed_at timestamptz;
alter table equipment add column if not exists disposal_reason text;
alter table equipment add column if not exists disposal_method text;
alter table equipment add column if not exists initial_inspection_required boolean not null default false;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'inspections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%result%'
  loop
    execute format('alter table inspections drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table inspections
add constraint inspections_result_v2_check
check (
  result in (
    'Pass',
    'Fail',
    'Fail - Repair Required',
    'Fail - Remove From Service / Disposal'
  )
);
