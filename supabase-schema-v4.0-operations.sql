-- Spray & Wash Operations App V4.0
-- Vehicle, washing equipment, inspections, maintenance tasks, preventive schedules, and maintenance guides.
-- IMPORTANT:
-- 1. Back up V3.4 before running this.
-- 2. This migration is additive. It does not delete or rename existing V3.4 tables/columns.
-- 3. It does not create, delete, or alter Supabase Storage buckets.
-- 4. It expects the existing V3.4 roles: Admin, Inspector, Equipment Manager, Office / Reports, Viewer.

create extension if not exists pgcrypto;

-- Keep the V3.4 helper available. Safe to replace.
create or replace function public.has_any_app_role(check_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any(check_roles)
  );
$$;

grant execute on function public.has_any_app_role(text[]) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Operations vehicle register.
create table if not exists public.operations_vehicles (
  id uuid primary key default gen_random_uuid(),
  rego text not null unique,
  name text,
  make_model text,
  year integer,
  status text not null default 'Active' check (status in ('Active','Inactive','Sold','Retired')),
  assigned_driver text,
  inspection_frequency_days integer not null default 14,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_vehicles_status_idx on public.operations_vehicles(status);
create index if not exists operations_vehicles_rego_idx on public.operations_vehicles(rego);

drop trigger if exists operations_vehicles_set_updated_at on public.operations_vehicles;
create trigger operations_vehicles_set_updated_at
before update on public.operations_vehicles
for each row execute function public.set_updated_at();

-- Operations washing equipment register.
create table if not exists public.operations_washing_equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  equipment_type text not null default 'Water Blaster',
  serial_number text,
  assigned_vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Inactive','Retired','Quarantined')),
  inspection_frequency_days integer not null default 14,
  engine_make_model text,
  pump_make_model text,
  has_hour_meter boolean not null default false,
  current_engine_hours numeric(10,1),
  current_pump_hours numeric(10,1),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_washing_equipment_status_idx on public.operations_washing_equipment(status);
create index if not exists operations_washing_equipment_vehicle_idx on public.operations_washing_equipment(assigned_vehicle_id);
create unique index if not exists operations_washing_equipment_serial_unique_idx
  on public.operations_washing_equipment(serial_number)
  where serial_number is not null and serial_number <> '';

drop trigger if exists operations_washing_equipment_set_updated_at on public.operations_washing_equipment;
create trigger operations_washing_equipment_set_updated_at
before update on public.operations_washing_equipment
for each row execute function public.set_updated_at();

-- Inspection checklist templates and items.
create table if not exists public.operations_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  target_type text not null check (target_type in ('vehicle','washing_equipment','combined')),
  frequency_days integer not null default 14,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists operations_checklist_templates_set_updated_at on public.operations_checklist_templates;
create trigger operations_checklist_templates_set_updated_at
before update on public.operations_checklist_templates
for each row execute function public.set_updated_at();

create table if not exists public.operations_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operations_checklist_templates(id) on delete cascade,
  section text,
  question_text text not null,
  response_type text not null default 'pass_fail_na' check (response_type in ('pass_fail','pass_fail_na','yes_no','number','text','choice')),
  response_options jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  sort_order integer not null default 100,
  pass_values jsonb not null default '["Pass","N/A","No"]'::jsonb,
  problem_values jsonb not null default '["Fail","Yes"]'::jsonb,
  creates_task_on_problem boolean not null default true,
  default_task_title text,
  default_severity text not null default 'Medium' check (default_severity in ('Low','Medium','High','Critical')),
  photo_required_on_problem boolean not null default false,
  notes_required_on_problem boolean not null default true,
  help_text text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_checklist_items_template_idx on public.operations_checklist_items(template_id, sort_order);
create unique index if not exists operations_checklist_items_template_question_unique_idx on public.operations_checklist_items(template_id, question_text);

drop trigger if exists operations_checklist_items_set_updated_at on public.operations_checklist_items;
create trigger operations_checklist_items_set_updated_at
before update on public.operations_checklist_items
for each row execute function public.set_updated_at();

-- Operations inspection submissions.
create table if not exists public.operations_inspections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.operations_checklist_templates(id) on delete set null,
  target_type text not null check (target_type in ('vehicle','washing_equipment','combined')),
  vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  washing_equipment_id uuid references public.operations_washing_equipment(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_by_email text,
  inspector_name text,
  inspection_date date not null default current_date,
  odometer numeric(12,1),
  engine_hours numeric(10,1),
  pump_hours numeric(10,1),
  overall_result text not null default 'Pass' check (overall_result in ('Pass','Problem','Fail','Incomplete')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_inspections_target_check check (
    (target_type = 'vehicle' and vehicle_id is not null)
    or (target_type = 'washing_equipment' and washing_equipment_id is not null)
    or (target_type = 'combined' and vehicle_id is not null and washing_equipment_id is not null)
  )
);

create index if not exists operations_inspections_date_idx on public.operations_inspections(inspection_date desc);
create index if not exists operations_inspections_vehicle_idx on public.operations_inspections(vehicle_id, inspection_date desc);
create index if not exists operations_inspections_washing_equipment_idx on public.operations_inspections(washing_equipment_id, inspection_date desc);

drop trigger if exists operations_inspections_set_updated_at on public.operations_inspections;
create trigger operations_inspections_set_updated_at
before update on public.operations_inspections
for each row execute function public.set_updated_at();

create table if not exists public.operations_inspection_answers (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.operations_inspections(id) on delete cascade,
  checklist_item_id uuid references public.operations_checklist_items(id) on delete set null,
  question_text text,
  answer_value text,
  answer_number numeric(12,2),
  is_problem boolean not null default false,
  severity text not null default 'Medium' check (severity in ('Low','Medium','High','Critical')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists operations_inspection_answers_inspection_idx on public.operations_inspection_answers(inspection_id);
create index if not exists operations_inspection_answers_problem_idx on public.operations_inspection_answers(is_problem) where is_problem = true;

create table if not exists public.operations_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.operations_inspections(id) on delete cascade,
  checklist_item_id uuid references public.operations_checklist_items(id) on delete set null,
  bucket text not null default 'inspection-photos',
  storage_path text not null,
  file_name text,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists operations_inspection_photos_inspection_idx on public.operations_inspection_photos(inspection_id);

-- Preventive maintenance guides/procedures.
create table if not exists public.operations_maintenance_procedures (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'General',
  target_type text not null default 'washing_equipment' check (target_type in ('vehicle','washing_equipment','both')),
  description text,
  frequency_days integer,
  frequency_hours numeric(10,1),
  estimated_minutes integer,
  skill_level text not null default 'Basic' check (skill_level in ('Basic','Intermediate','Advanced')),
  requires_signoff boolean not null default false,
  safety_summary text,
  tools_required text,
  parts_required text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists operations_maintenance_procedures_set_updated_at on public.operations_maintenance_procedures;
create trigger operations_maintenance_procedures_set_updated_at
before update on public.operations_maintenance_procedures
for each row execute function public.set_updated_at();

create table if not exists public.operations_maintenance_procedure_steps (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.operations_maintenance_procedures(id) on delete cascade,
  step_number integer not null,
  title text not null,
  instruction text not null,
  safety_note text,
  requires_photo boolean not null default false,
  requires_reading boolean not null default false,
  requires_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(procedure_id, step_number)
);

create index if not exists operations_maintenance_procedure_steps_idx on public.operations_maintenance_procedure_steps(procedure_id, step_number);

drop trigger if exists operations_maintenance_procedure_steps_set_updated_at on public.operations_maintenance_procedure_steps;
create trigger operations_maintenance_procedure_steps_set_updated_at
before update on public.operations_maintenance_procedure_steps
for each row execute function public.set_updated_at();

-- Preventive maintenance schedules tied to washing equipment.
create table if not exists public.operations_equipment_maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  washing_equipment_id uuid not null references public.operations_washing_equipment(id) on delete cascade,
  procedure_id uuid not null references public.operations_maintenance_procedures(id) on delete cascade,
  frequency_days integer,
  frequency_hours numeric(10,1),
  last_completed_at timestamptz,
  last_completed_hours numeric(10,1),
  next_due_at date,
  next_due_hours numeric(10,1),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(washing_equipment_id, procedure_id)
);

create index if not exists operations_equipment_maintenance_schedules_equipment_idx on public.operations_equipment_maintenance_schedules(washing_equipment_id);
create index if not exists operations_equipment_maintenance_schedules_due_idx on public.operations_equipment_maintenance_schedules(next_due_at, is_active);

drop trigger if exists operations_equipment_maintenance_schedules_set_updated_at on public.operations_equipment_maintenance_schedules;
create trigger operations_equipment_maintenance_schedules_set_updated_at
before update on public.operations_equipment_maintenance_schedules
for each row execute function public.set_updated_at();

-- Maintenance tasks. These can be reactive, scheduled, or manually created.
create table if not exists public.operations_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'Manual' check (source_type in ('Inspection','Scheduled','Manual')),
  source_inspection_id uuid references public.operations_inspections(id) on delete set null,
  source_answer_id uuid references public.operations_inspection_answers(id) on delete set null,
  procedure_id uuid references public.operations_maintenance_procedures(id) on delete set null,
  schedule_id uuid references public.operations_equipment_maintenance_schedules(id) on delete set null,
  target_type text not null check (target_type in ('vehicle','washing_equipment','combined')),
  vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  washing_equipment_id uuid references public.operations_washing_equipment(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'Open' check (status in ('Open','In Progress','Waiting on Parts','Completed','Deferred')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  assigned_to text,
  due_date date,
  due_engine_hours numeric(10,1),
  completed_engine_hours numeric(10,1),
  completed_pump_hours numeric(10,1),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  deferred_reason text,
  completion_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_maintenance_tasks_status_idx on public.operations_maintenance_tasks(status, due_date);
create index if not exists operations_maintenance_tasks_equipment_idx on public.operations_maintenance_tasks(washing_equipment_id, status);
create index if not exists operations_maintenance_tasks_vehicle_idx on public.operations_maintenance_tasks(vehicle_id, status);
create index if not exists operations_maintenance_tasks_source_idx on public.operations_maintenance_tasks(source_type, source_inspection_id);

drop trigger if exists operations_maintenance_tasks_set_updated_at on public.operations_maintenance_tasks;
create trigger operations_maintenance_tasks_set_updated_at
before update on public.operations_maintenance_tasks
for each row execute function public.set_updated_at();

create table if not exists public.operations_maintenance_task_steps (
  id uuid primary key default gen_random_uuid(),
  maintenance_task_id uuid not null references public.operations_maintenance_tasks(id) on delete cascade,
  procedure_step_id uuid references public.operations_maintenance_procedure_steps(id) on delete set null,
  step_number integer,
  title text,
  completed boolean not null default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists operations_maintenance_task_steps_task_idx on public.operations_maintenance_task_steps(maintenance_task_id);

create table if not exists public.operations_maintenance_parts_used (
  id uuid primary key default gen_random_uuid(),
  maintenance_task_id uuid not null references public.operations_maintenance_tasks(id) on delete cascade,
  item_name text not null,
  quantity numeric(10,2),
  unit text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists operations_maintenance_parts_used_task_idx on public.operations_maintenance_parts_used(maintenance_task_id);

create table if not exists public.operations_maintenance_readings (
  id uuid primary key default gen_random_uuid(),
  maintenance_task_id uuid references public.operations_maintenance_tasks(id) on delete cascade,
  washing_equipment_id uuid references public.operations_washing_equipment(id) on delete set null,
  vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  reading_type text not null,
  reading_value numeric(12,2),
  reading_unit text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

create index if not exists operations_maintenance_readings_equipment_idx on public.operations_maintenance_readings(washing_equipment_id, recorded_at desc);
create index if not exists operations_maintenance_readings_vehicle_idx on public.operations_maintenance_readings(vehicle_id, recorded_at desc);

-- Enable RLS.
alter table public.operations_vehicles enable row level security;
alter table public.operations_washing_equipment enable row level security;
alter table public.operations_checklist_templates enable row level security;
alter table public.operations_checklist_items enable row level security;
alter table public.operations_inspections enable row level security;
alter table public.operations_inspection_answers enable row level security;
alter table public.operations_inspection_photos enable row level security;
alter table public.operations_maintenance_procedures enable row level security;
alter table public.operations_maintenance_procedure_steps enable row level security;
alter table public.operations_equipment_maintenance_schedules enable row level security;
alter table public.operations_maintenance_tasks enable row level security;
alter table public.operations_maintenance_task_steps enable row level security;
alter table public.operations_maintenance_parts_used enable row level security;
alter table public.operations_maintenance_readings enable row level security;

-- Policy groups.
-- View operations data.
do $$ begin
  execute 'drop policy if exists "ops vehicles select approved" on public.operations_vehicles';
  execute 'create policy "ops vehicles select approved" on public.operations_vehicles for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops vehicles manage managers" on public.operations_vehicles';
  execute 'create policy "ops vehicles manage managers" on public.operations_vehicles for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops washing equipment select approved" on public.operations_washing_equipment';
  execute 'create policy "ops washing equipment select approved" on public.operations_washing_equipment for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops washing equipment manage managers" on public.operations_washing_equipment';
  execute 'create policy "ops washing equipment manage managers" on public.operations_washing_equipment for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops templates select approved" on public.operations_checklist_templates';
  execute 'create policy "ops templates select approved" on public.operations_checklist_templates for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops templates manage managers" on public.operations_checklist_templates';
  execute 'create policy "ops templates manage managers" on public.operations_checklist_templates for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops items select approved" on public.operations_checklist_items';
  execute 'create policy "ops items select approved" on public.operations_checklist_items for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops items manage managers" on public.operations_checklist_items';
  execute 'create policy "ops items manage managers" on public.operations_checklist_items for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops inspections select approved" on public.operations_inspections';
  execute 'create policy "ops inspections select approved" on public.operations_inspections for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops inspections insert inspectors" on public.operations_inspections';
  execute 'create policy "ops inspections insert inspectors" on public.operations_inspections for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'']::text[]))';
  execute 'drop policy if exists "ops inspections update managers" on public.operations_inspections';
  execute 'create policy "ops inspections update managers" on public.operations_inspections for update to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops answers select approved" on public.operations_inspection_answers';
  execute 'create policy "ops answers select approved" on public.operations_inspection_answers for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops answers insert inspectors" on public.operations_inspection_answers';
  execute 'create policy "ops answers insert inspectors" on public.operations_inspection_answers for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops photos select approved" on public.operations_inspection_photos';
  execute 'create policy "ops photos select approved" on public.operations_inspection_photos for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops photos insert inspectors" on public.operations_inspection_photos';
  execute 'create policy "ops photos insert inspectors" on public.operations_inspection_photos for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops procedures select approved" on public.operations_maintenance_procedures';
  execute 'create policy "ops procedures select approved" on public.operations_maintenance_procedures for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops procedures manage managers" on public.operations_maintenance_procedures';
  execute 'create policy "ops procedures manage managers" on public.operations_maintenance_procedures for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops procedure steps select approved" on public.operations_maintenance_procedure_steps';
  execute 'create policy "ops procedure steps select approved" on public.operations_maintenance_procedure_steps for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops procedure steps manage managers" on public.operations_maintenance_procedure_steps';
  execute 'create policy "ops procedure steps manage managers" on public.operations_maintenance_procedure_steps for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops schedules select approved" on public.operations_equipment_maintenance_schedules';
  execute 'create policy "ops schedules select approved" on public.operations_equipment_maintenance_schedules for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops schedules manage managers" on public.operations_equipment_maintenance_schedules';
  execute 'create policy "ops schedules manage managers" on public.operations_equipment_maintenance_schedules for all to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops tasks select approved" on public.operations_maintenance_tasks';
  execute 'create policy "ops tasks select approved" on public.operations_maintenance_tasks for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops tasks insert approved" on public.operations_maintenance_tasks';
  execute 'create policy "ops tasks insert approved" on public.operations_maintenance_tasks for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'']::text[]))';
  execute 'drop policy if exists "ops tasks update managers" on public.operations_maintenance_tasks';
  execute 'create policy "ops tasks update managers" on public.operations_maintenance_tasks for update to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops task steps select approved" on public.operations_maintenance_task_steps';
  execute 'create policy "ops task steps select approved" on public.operations_maintenance_task_steps for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops task steps insert managers" on public.operations_maintenance_task_steps';
  execute 'create policy "ops task steps insert managers" on public.operations_maintenance_task_steps for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops parts select approved" on public.operations_maintenance_parts_used';
  execute 'create policy "ops parts select approved" on public.operations_maintenance_parts_used for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops parts insert managers" on public.operations_maintenance_parts_used';
  execute 'create policy "ops parts insert managers" on public.operations_maintenance_parts_used for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';

  execute 'drop policy if exists "ops readings select approved" on public.operations_maintenance_readings';
  execute 'create policy "ops readings select approved" on public.operations_maintenance_readings for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Viewer'']::text[]))';
  execute 'drop policy if exists "ops readings insert approved" on public.operations_maintenance_readings';
  execute 'create policy "ops readings insert approved" on public.operations_maintenance_readings for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'']::text[]))';
end $$;

-- Seed checklist templates.
insert into public.operations_checklist_templates (name, target_type, frequency_days)
values
  ('Vehicle Fortnightly Inspection', 'vehicle', 14),
  ('Washing Equipment Fortnightly Inspection', 'washing_equipment', 14)
on conflict (name) do nothing;

-- Seed vehicle checklist.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Fortnightly Inspection')
insert into public.operations_checklist_items (template_id, section, question_text, response_type, sort_order, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, help_text)
select t.id, v.section, v.question_text, v.response_type, v.sort_order, v.problem_values::jsonb, v.creates_task, v.task_title, v.severity, v.photo_required, v.help_text
from t,
(values
  ('Vehicle condition','Vehicle is clean, tidy and presentable','pass_fail_na',10,'["Fail"]',true,'Clean vehicle / address presentation issue','Low',false,'Record any cleaning or presentation issue.'),
  ('Vehicle condition','Tyres appear safe and in good condition','pass_fail_na',20,'["Fail"]',true,'Inspect or replace vehicle tyres','High',true,'Look for low tread, sidewall damage, punctures and uneven wear.'),
  ('Vehicle condition','Lights and indicators are working','pass_fail_na',30,'["Fail"]',true,'Repair vehicle lights or indicators','High',false,'Check headlights, brake lights, indicators, hazards and reverse lights.'),
  ('Vehicle condition','Windscreen, mirrors and wipers are serviceable','pass_fail_na',40,'["Fail"]',true,'Repair windscreen, mirrors or wipers','Medium',true,'Record chips, cracks, poor wiper blades or missing mirrors.'),
  ('Vehicle condition','No obvious fluid leaks under vehicle','yes_no',50,'["Yes"]',true,'Investigate vehicle fluid leak','High',true,'Problem answer is Yes.'),
  ('Safety equipment','First aid kit is present and stocked','pass_fail_na',60,'["Fail"]',true,'Restock or replace first aid kit','Medium',true,'Check contents are suitable and usable.'),
  ('Safety equipment','Fire extinguisher is present and in date, if fitted','pass_fail_na',70,'["Fail"]',true,'Check or replace fire extinguisher','Medium',true,'Check gauge, date and mounting.'),
  ('Documentation','Vehicle WOF/rego/RUC appear current where applicable','pass_fail_na',80,'["Fail"]',true,'Check vehicle compliance documents','High',true,'Record expiry dates or concerns.'),
  ('Driver notes','Odometer reading','number',90,'[]',false,null,'Low',false,'Enter current odometer reading in the inspection header if preferred.'),
  ('Driver notes','Any other vehicle issues?','yes_no',100,'["Yes"]',true,'Review additional vehicle issue','Medium',true,'Problem answer is Yes; explain in notes.')
) as v(section, question_text, response_type, sort_order, problem_values, creates_task, task_title, severity, photo_required, help_text)
on conflict do nothing;

-- Seed washing equipment checklist.
with t as (select id from public.operations_checklist_templates where name = 'Washing Equipment Fortnightly Inspection')
insert into public.operations_checklist_items (template_id, section, question_text, response_type, sort_order, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, help_text)
select t.id, v.section, v.question_text, v.response_type, v.sort_order, v.problem_values::jsonb, v.creates_task, v.task_title, v.severity, v.photo_required, v.help_text
from t,
(values
  ('Engine','Engine starts and runs normally','pass_fail_na',10,'["Fail"]',true,'Investigate water blaster engine running issue','High',false,'Record hard starting, surging, smoke or unusual noise.'),
  ('Engine','Engine oil level appears correct','pass_fail_na',20,'["Fail"]',true,'Check/top up/change engine oil','High',true,'Use the manufacturer manual for oil type and level.'),
  ('Engine','Air filter appears clean and serviceable','pass_fail_na',30,'["Fail"]',true,'Clean or replace engine air filter','Medium',true,'Record dirty, wet, damaged or missing filters.'),
  ('Pump','Pump runs smoothly with no unusual noise or vibration','pass_fail_na',40,'["Fail"]',true,'Investigate pump noise or vibration','High',false,'Stop using if severe vibration or noise is present.'),
  ('Pump','Pump oil level/condition appears acceptable where visible','pass_fail_na',50,'["Fail"]',true,'Check/change pump oil','High',true,'Use manufacturer manual for pump oil requirements.'),
  ('Pump','No visible water, oil or chemical leaks','yes_no',60,'["Yes"]',true,'Investigate leak on washing equipment','High',true,'Problem answer is Yes.'),
  ('Hoses and fittings','High-pressure hoses are free from cuts, bulges or exposed wire','pass_fail_na',70,'["Fail"]',true,'Replace or repair high-pressure hose','Critical',true,'Quarantine damaged high-pressure hoses.'),
  ('Hoses and fittings','Lance, gun, nozzles and couplings are serviceable','pass_fail_na',80,'["Fail"]',true,'Repair lance, gun, nozzle or coupling','High',true,'Check trigger lock, leaks, worn nozzles and damaged fittings.'),
  ('Chemical system','Chemical injector/hoses appear clean and working','pass_fail_na',90,'["Fail"]',true,'Clean or repair chemical injector system','Medium',false,'Record blocked, cracked or leaking chemical parts.'),
  ('Trolley/frame','Frame, wheels, hose reel and mounting points are secure','pass_fail_na',100,'["Fail"]',true,'Repair trolley, hose reel or mounting issue','Medium',true,'Check for loose bolts, broken wheels and damaged reels.'),
  ('General','Any other washing equipment issue?','yes_no',110,'["Yes"]',true,'Review additional washing equipment issue','Medium',true,'Problem answer is Yes; explain in notes.')
) as v(section, question_text, response_type, sort_order, problem_values, creates_task, task_title, severity, photo_required, help_text)
on conflict do nothing;

-- Seed maintenance procedures and steps. These are general guides and must be checked against actual engine/pump manuals.
insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required)
values
('Engine oil change','Engine','washing_equipment','Basic petrol water blaster engine oil change. Confirm oil grade, oil quantity, drain method and service interval from the exact engine manual before use.',180,50,25,'Basic',false,'Work on a level surface. Stop engine, isolate machine, allow hot parts to cool, wear gloves/eye protection, control spills, and dispose of waste oil responsibly.','Drain pan, funnel, rag, suitable spanner/socket, waste oil container.','Correct engine oil from manufacturer manual, replacement washer if required.'),
('Air filter check / clean / replace','Engine','washing_equipment','Check the engine air filter and clean or replace it as required. Confirm filter type and cleaning method from the engine manual.',30,25,15,'Basic',false,'Stop engine before removing filter. Do not run the engine without the filter fitted. Avoid blowing dust toward people.','Screwdriver or socket if required, soft brush, rag.','Correct replacement air filter if damaged or too dirty to reuse.'),
('Spark plug inspection / replacement','Engine','washing_equipment','Inspect or replace spark plug using the exact engine manual for plug type and gap.',365,100,20,'Basic',false,'Stop engine and allow to cool. Disconnect spark plug cap before working. Do not overtighten the plug.','Spark plug socket, gap tool if applicable, rag.','Correct spark plug from manufacturer manual.'),
('Pump oil change','Pump','washing_equipment','Basic pressure washer pump oil change. Confirm oil type, oil quantity, drain/fill points and service interval from the pump manual before use.',365,100,30,'Basic',false,'Stop engine, release pressure, allow pump to cool, control spills and dispose of waste oil responsibly.','Drain pan, funnel, rag, suitable spanner/socket, waste oil container.','Correct pump oil from manufacturer manual, replacement washer if required.'),
('Pump leak and fitting check','Pump','washing_equipment','Visual and functional check for leaks, damaged fittings, unusual pump noise or vibration.',30,25,15,'Basic',false,'Release pressure before tightening or changing fittings. Never inspect high-pressure leaks with your hand.','Rag, torch, basic spanners if trained/authorised.','Replacement O-rings/fittings if required.'),
('Hose, lance and trigger inspection','Hoses','washing_equipment','Inspect high-pressure hose, trigger gun, lance, nozzles and quick couplings for safe use.',14,null,15,'Basic',false,'Do not use damaged high-pressure hoses. Release pressure before disconnecting fittings. Wear eye protection when testing.','Rag, torch.','Replacement hose, nozzle, O-rings or fittings if required.'),
('Chemical injector clean/check','Chemical System','washing_equipment','Check chemical injector, filter, pickup hose and fittings for blockage, cracks or leaks.',30,null,15,'Basic',false,'Wear gloves and eye protection. Avoid chemical splash. Flush with clean water after testing.','Clean water, bucket, rag, small brush.','Replacement pickup filter, hose or fittings if required.')
on conflict (name) do nothing;

-- Procedure steps.
with p as (select id, name from public.operations_maintenance_procedures)
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, s.step_number, s.title, s.instruction, s.safety_note, s.requires_photo, s.requires_reading
from p
join (values
('Engine oil change',1,'Confirm manual requirements','Confirm the exact engine model, oil grade, oil quantity, drain point and fill point from the manufacturer manual before starting.','Do not guess oil specifications.',false,false),
('Engine oil change',2,'Prepare machine','Park the machine level, turn the engine off, isolate fuel if required and allow hot parts to cool.','Hot oil and engine parts can burn.',false,false),
('Engine oil change',3,'Drain old oil','Place a drain pan, remove the drain plug or use the approved drain method, and collect old oil.','Control spills and keep oil away from stormwater.',false,false),
('Engine oil change',4,'Refill oil','Refit drain plug securely, refill with the correct oil to the correct level, then refit cap/dipstick.','Do not overfill.',false,false),
('Engine oil change',5,'Run and recheck','Run briefly, stop the engine, wait for oil to settle, then recheck level and leaks.','Keep clear of moving/hot parts.',true,true),
('Engine oil change',6,'Record completion','Record engine hours, oil used, notes and next due schedule.','Dispose of waste oil correctly.',false,true),

('Air filter check / clean / replace',1,'Access filter','Turn engine off and remove the air filter cover.','Do not run engine with filter removed.',false,false),
('Air filter check / clean / replace',2,'Inspect filter','Check for dust, oil, water, damage, poor sealing or missing parts.','Avoid breathing dust.',true,false),
('Air filter check / clean / replace',3,'Clean or replace','Clean only as allowed by the engine manual, or replace with the correct filter.','Do not use solvents unless the manual allows it.',false,false),
('Air filter check / clean / replace',4,'Refit and test','Refit filter and cover securely, then start engine and confirm normal running.','Keep fingers clear of moving parts.',false,false),
('Air filter check / clean / replace',5,'Record completion','Record engine hours, whether the filter was cleaned or replaced, and any parts used.','',false,true),

('Spark plug inspection / replacement',1,'Confirm plug type','Confirm exact spark plug type and gap from the engine manual.','Incorrect plug can damage the engine.',false,false),
('Spark plug inspection / replacement',2,'Cool and disconnect','Stop engine, allow it to cool and disconnect spark plug cap.','Avoid burns and accidental starting.',false,false),
('Spark plug inspection / replacement',3,'Remove and inspect','Remove plug and inspect electrode, deposits, cracking and condition.','Keep dirt out of plug hole.',true,false),
('Spark plug inspection / replacement',4,'Replace/refit','Fit correct plug, tighten as specified by the manual, and reconnect cap.','Do not overtighten.',false,false),
('Spark plug inspection / replacement',5,'Test and record','Start engine, confirm normal running and record hours/parts used.','',false,true),

('Pump oil change',1,'Confirm pump manual','Confirm pump model, oil grade, oil quantity, drain/fill points and sight-glass level from the pump manual.','Do not guess pump oil specifications.',false,false),
('Pump oil change',2,'Prepare machine','Stop engine, release pressure, allow pump to cool and place machine level.','Stored pressure can injure.',false,false),
('Pump oil change',3,'Drain pump oil','Drain pump oil into a container using the approved drain method.','Control spills.',false,false),
('Pump oil change',4,'Refill pump oil','Refit drain plug and fill with correct oil to the correct level.','Do not overfill.',true,false),
('Pump oil change',5,'Run and inspect','Run briefly with water supply connected, check for leaks/noise, then recheck oil level.','Never run pump dry.',true,true),
('Pump oil change',6,'Record completion','Record hours, oil used, notes and next due schedule.','Dispose of waste oil correctly.',false,true),

('Pump leak and fitting check',1,'Release pressure','Turn machine off and release all pressure before touching fittings.','Never inspect high-pressure leaks with your hand.',false,false),
('Pump leak and fitting check',2,'Visual check','Inspect pump body, fittings, unloader area and hoses for water, oil or chemical leaks.','Wear eye protection.',true,false),
('Pump leak and fitting check',3,'Functional check','Run machine with water supply connected and check for unusual noise, vibration or leaks.','Keep clear of spray and moving parts.',false,false),
('Pump leak and fitting check',4,'Record findings','Record any leaks, parts required and whether the machine should be quarantined.','Quarantine unsafe equipment.',false,false),

('Hose, lance and trigger inspection',1,'Depressurise','Turn machine off and release pressure before disconnecting hose or lance.','Stored pressure can injure.',false,false),
('Hose, lance and trigger inspection',2,'Inspect hose','Check hose for cuts, bulges, exposed wire, kinks, damaged ends or leaks.','Quarantine damaged high-pressure hose.',true,false),
('Hose, lance and trigger inspection',3,'Inspect gun/lance/nozzles','Check trigger operation, trigger lock, lance, nozzles, O-rings and couplings.','Wear eye protection during test.',true,false),
('Hose, lance and trigger inspection',4,'Test and record','Reconnect safely, test for leaks, and record any repairs or replacements.','Keep spray pointed in safe direction.',false,false),

('Chemical injector clean/check',1,'Flush system','Flush chemical pickup and injector with clean water.','Wear gloves and eye protection.',false,false),
('Chemical injector clean/check',2,'Inspect parts','Check pickup filter, hose, fittings and injector for blockage, cracking or leaks.','Avoid chemical splash.',true,false),
('Chemical injector clean/check',3,'Test draw','Test chemical draw with clean water where practical and confirm operation.','Do not mix incompatible chemicals.',false,false),
('Chemical injector clean/check',4,'Record completion','Record cleaning, parts replaced and any follow-up needed.','',false,false)
) as s(proc_name, step_number, title, instruction, safety_note, requires_photo, requires_reading)
  on p.name = s.proc_name
on conflict (procedure_id, step_number) do nothing;

-- App version marker.
insert into public.app_settings (key, value)
values ('operations_module_version', '"4.0"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Optional exact Google Form conversion seed added in V4.0.1.
-- Spray & Wash Operations App V4.0.1
-- Add-on seed: Periodic Vehicle Checks Google Form conversion
-- Source: Periodic Vehicle Checks - Google Forms.pdf uploaded by Brendan.
-- Safe to run after supabase-schema-v4.0-operations.sql. Additive and idempotent.

-- Seed vehicles from the Google Form dropdown.
insert into public.operations_vehicles (rego, name, make_model, status, inspection_frequency_days)
values
  ('MRT70', 'Navara - MRT70', 'Nissan Navara', 'Active', 14),
  ('RQJ369', 'Dyna - RQJ369', 'Toyota Dyna', 'Active', 14),
  ('QAN557', 'Dyna - QAN557', 'Toyota Dyna', 'Active', 14),
  ('KMT606', 'Hilux - KMT606', 'Toyota Hilux', 'Active', 14)
on conflict (rego) do update set
  name = excluded.name,
  make_model = coalesce(public.operations_vehicles.make_model, excluded.make_model),
  inspection_frequency_days = excluded.inspection_frequency_days;

-- Seed the exact replacement checklist. It is vehicle-targeted because the original form selects only a vehicle.
insert into public.operations_checklist_templates (name, target_type, frequency_days, is_active)
values ('Periodic Vehicle Checks - Google Form', 'vehicle', 14, true)
on conflict (name) do update set
  target_type = excluded.target_type,
  frequency_days = excluded.frequency_days,
  is_active = excluded.is_active;

with t as (select id from public.operations_checklist_templates where name = 'Periodic Vehicle Checks - Google Form')
insert into public.operations_checklist_items (template_id, section, question_text, response_type, required, sort_order, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, notes_required_on_problem, help_text)
select t.id, v.section, v.question_text, v.response_type, v.required, v.sort_order, v.problem_values::jsonb, v.creates_task_on_problem, v.default_task_title, v.default_severity, v.photo_required_on_problem, v.notes_required_on_problem, v.help_text
from t, (values
  ('Vehicle checks', 'Months until Warrant of Fitness is due', 'number', true, 10, '[]'::jsonb, false, null, 'Low', false, false, 'Enter the number of months remaining. If expired or due soon, create a maintenance task or note it for the Ops Manager.'),
  ('Vehicle checks', 'Months until Registration is due', 'number', true, 20, '[]'::jsonb, false, null, 'Low', false, false, 'Enter the number of months remaining. If expired or due soon, create a maintenance task or note it for the Ops Manager.'),
  ('Vehicle checks', 'Vehicle mileage / odometer reading', 'number', true, 30, '[]'::jsonb, false, null, 'Low', false, false, 'Record the vehicle mileage. You can also use the inspection odometer field.'),
  ('Vehicle checks', 'Kilometres remaining on Road User Charges - diesel vehicles only', 'number', false, 40, '[]'::jsonb, false, null, 'Low', false, false, 'Diesel vehicles only. Leave blank or mark N/A if not applicable.'),
  ('Vehicle checks', 'Wheel nuts checked with wheel spanner for tightness', 'pass_fail_na', true, 50, '["Fail"]'::jsonb, true, 'Check/tighten vehicle wheel nuts', 'High', true, true, 'Use a wheel spanner to check tightness of all wheel nuts.'),
  ('Vehicle checks', 'Vehicle checks - any other issue to note?', 'yes_no', true, 60, '["Yes"]'::jsonb, true, 'Review vehicle check note', 'Medium', true, true, 'Select Yes if anything needs the Ops Manager to review, and describe it in notes.'),
  ('Vehicle maintenance', 'Vehicle exterior washed - wash mix applied, painted surfaces brushed, and rinsed', 'pass_fail_na', true, 100, '["Fail"]'::jsonb, true, 'Complete exterior vehicle wash', 'Low', true, true, 'Regular cleaning task to keep the vehicle presentable and in good condition.'),
  ('Vehicle maintenance', 'Vehicle tray cleaned - items removed and tray pressure washed clean', 'pass_fail_na', true, 110, '["Fail"]'::jsonb, true, 'Clean vehicle tray', 'Low', true, true, 'Remove all items from the tray before pressure washing clean.'),
  ('Vehicle maintenance', 'Vehicle cab tidied - rubbish removed and interior surfaces wiped down', 'pass_fail_na', true, 120, '["Fail"]'::jsonb, true, 'Clean and tidy vehicle cab', 'Low', true, true, 'Remove rubbish, tidy the cab, and wipe down interior surfaces.'),
  ('Vehicle maintenance', 'Truck and tray photos uploaded after cleaning', 'pass_fail_na', true, 130, '["Fail"]'::jsonb, true, 'Upload truck/tray cleaning photos', 'Low', false, true, 'Use the inspection photo upload field to attach images after cleaning.'),
  ('Vehicle maintenance', 'Vehicle maintenance - any other issue to note?', 'yes_no', true, 140, '["Yes"]'::jsonb, true, 'Review vehicle maintenance note', 'Medium', true, true, 'Select Yes if anything needs the Ops Manager to review, and describe it in notes.'),
  ('Washing equipment - trigger guns', 'Trigger guns - minimum 2 on board and in good working condition', 'pass_fail_na', true, 200, '["Fail"]'::jsonb, true, 'Replace/repair missing or faulty trigger guns', 'High', true, true, null),
  ('Washing equipment - trigger guns', 'Trigger guns - spare O-rings for quick-connect fittings present', 'pass_fail_na', true, 210, '["Fail"]'::jsonb, true, 'Restock trigger gun quick-connect O-rings', 'Medium', false, true, null),
  ('Washing equipment - wands and poles', '2 x 1 metre wands on board and in good working condition', 'pass_fail_na', true, 2200, '["Fail"]'::jsonb, true, 'Restock/repair 1 metre wands', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '1 x 2 metre wand on board and in good working condition', 'pass_fail_na', true, 2210, '["Fail"]'::jsonb, true, 'Restock/repair 2 metre wand', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '1 x 0.5 metre wand on board and in good working condition', 'pass_fail_na', true, 2220, '["Fail"]'::jsonb, true, 'Restock/repair 0.5 metre wand', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '10m extendable brush on board and in good working condition', 'pass_fail_na', true, 2230, '["Fail"]'::jsonb, true, 'Restock/repair 10m extendable brush', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '12m carbon wash pole on board and in good working condition', 'pass_fail_na', true, 2240, '["Fail"]'::jsonb, true, 'Restock/repair 12m carbon wash pole', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '1 x stubby gutter attachment on board and in good working condition', 'pass_fail_na', true, 2250, '["Fail"]'::jsonb, true, 'Restock/repair stubby gutter attachment', 'Medium', true, true, null),
  ('Washing equipment - nozzles', '2 x White 90''s nozzles present', 'pass_fail_na', true, 300, '["Fail"]'::jsonb, true, 'Restock White 90''s nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x White 60''s nozzles present', 'pass_fail_na', true, 310, '["Fail"]'::jsonb, true, 'Restock White 60''s nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x White 45''s nozzles present', 'pass_fail_na', true, 320, '["Fail"]'::jsonb, true, 'Restock White 45''s nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Red nozzles present', 'pass_fail_na', true, 330, '["Fail"]'::jsonb, true, 'Restock Red nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Chem Jet nozzles present', 'pass_fail_na', true, 340, '["Fail"]'::jsonb, true, 'Restock Chem Jet nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Chem fan nozzles present', 'pass_fail_na', true, 350, '["Fail"]'::jsonb, true, 'Restock Chem fan nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Turbo nozzles present', 'pass_fail_na', true, 360, '["Fail"]'::jsonb, true, 'Restock Turbo nozzles', 'Medium', false, true, null),
  ('Washing equipment - plumbing fittings', 'Sufficient spare tap connectors present', 'pass_fail_na', true, 380, '["Fail"]'::jsonb, true, 'Restock spare tap connectors', 'Medium', false, true, null),
  ('Washing equipment - plumbing fittings', 'Sufficient spare end-of-hose fittings present', 'pass_fail_na', true, 390, '["Fail"]'::jsonb, true, 'Restock spare end-of-hose fittings', 'Medium', false, true, null),
  ('Washing equipment - ladders', 'Ladder levelling feet flushed with high-pressure water to remove dirt', 'pass_fail_na', true, 400, '["Fail"]'::jsonb, true, 'Clean ladder levelling feet', 'Medium', true, true, null),
  ('Washing equipment - ladders', 'Ladder levelling feet sliding areas lubricated with WD40', 'pass_fail_na', true, 410, '["Fail"]'::jsonb, true, 'Lubricate ladder levelling feet', 'Medium', true, true, null),
  ('Washing equipment - ladders', 'Ladders checked for damage', 'pass_fail_na', true, 420, '["Fail"]'::jsonb, true, 'Inspect/repair damaged ladder', 'High', true, true, 'If ladder damage is found, remove it from service and advise the Ops Manager.'),
  ('Washing equipment - surface cleaner', 'Surface cleaner working correctly with no damage, wear, or tear', 'pass_fail_na', true, 430, '["Fail"]'::jsonb, true, 'Repair or replace surface cleaner', 'High', true, true, null),
  ('Washing equipment - pure water system', 'Pure water system tested - water purity is 20ppm or below', 'pass_fail_na', true, 440, '["Fail"]'::jsonb, true, 'Investigate pure water reading above 20ppm', 'Medium', true, true, 'Original form says report if reading is above 20ppm.'),
  ('Washing equipment - pure water system', 'Pure water system hoses in good condition', 'pass_fail_na', true, 450, '["Fail"]'::jsonb, true, 'Repair/replace pure water system hoses', 'Medium', true, true, null),
  ('Washing equipment - pure water system', 'Water fed pole present and in good order', 'pass_fail_na', true, 460, '["Fail"]'::jsonb, true, 'Repair/replace water fed pole', 'Medium', true, true, null),
  ('Washing equipment - tools', 'Screwdrivers (+ and -) present', 'pass_fail_na', true, 500, '["Fail"]'::jsonb, true, 'Restock screwdrivers', 'Low', false, true, null),
  ('Washing equipment - tools', '22mm spanner present', 'pass_fail_na', true, 510, '["Fail"]'::jsonb, true, 'Restock 22mm spanner', 'Low', false, true, null),
  ('Washing equipment - tools', '24mm spanner present', 'pass_fail_na', true, 520, '["Fail"]'::jsonb, true, 'Restock 24mm spanner', 'Low', false, true, null),
  ('Washing equipment - tools', 'Large adjustable spanner present', 'pass_fail_na', true, 530, '["Fail"]'::jsonb, true, 'Restock large adjustable spanner', 'Low', false, true, null),
  ('Washing equipment - tools', 'Socket set present', 'pass_fail_na', true, 540, '["Fail"]'::jsonb, true, 'Restock socket set', 'Low', false, true, null),
  ('Washing equipment - tools', 'Dentist picks present', 'pass_fail_na', true, 550, '["Fail"]'::jsonb, true, 'Restock dentist picks', 'Low', false, true, null),
  ('Washing equipment - tools', 'Adjustable parrot grips present', 'pass_fail_na', true, 560, '["Fail"]'::jsonb, true, 'Restock adjustable parrot grips', 'Low', false, true, null),
  ('Washing equipment - tools', 'Thread tape present', 'pass_fail_na', true, 570, '["Fail"]'::jsonb, true, 'Restock thread tape', 'Low', false, true, null),
  ('Washing equipment - tools', 'WD40 or similar present', 'pass_fail_na', true, 580, '["Fail"]'::jsonb, true, 'Restock WD40 or equivalent', 'Low', false, true, null),
  ('Washing equipment', 'Washing equipment checks - any other issue to note?', 'yes_no', true, 590, '["Yes"]'::jsonb, true, 'Review washing equipment note', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'First Aid Kit present and in usable condition', 'pass_fail_na', true, 600, '["Fail"]'::jsonb, true, 'Restock/replace first aid kit', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Eye wash present and in usable condition', 'pass_fail_na', true, 610, '["Fail"]'::jsonb, true, 'Restock/replace eye wash', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Fire extinguisher pressure gauge is in the green', 'pass_fail_na', true, 620, '["Fail"]'::jsonb, true, 'Service/replace fire extinguisher', 'High', true, true, null),
  ('Safety equipment - PPE', 'Fire extinguisher plastic tag is in place', 'pass_fail_na', true, 630, '["Fail"]'::jsonb, true, 'Check fire extinguisher tag', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Safety glasses present and in good condition', 'pass_fail_na', true, 640, '["Fail"]'::jsonb, true, 'Restock/replace safety glasses', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Hearing protection present and in good condition', 'pass_fail_na', true, 650, '["Fail"]'::jsonb, true, 'Restock/replace hearing protection', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Rubber chemical gloves present and in good condition', 'pass_fail_na', true, 660, '["Fail"]'::jsonb, true, 'Restock/replace rubber chemical gloves', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Sign board and base present and in good condition', 'pass_fail_na', true, 670, '["Fail"]'::jsonb, true, 'Restock/replace sign board and base', 'Low', false, true, null),
  ('Safety equipment - PPE', 'Safety cones present and in good condition', 'pass_fail_na', true, 680, '["Fail"]'::jsonb, true, 'Restock/replace safety cones', 'Low', false, true, null),
  ('Safety equipment - PPE', 'MSDS sheet folder present', 'pass_fail_na', true, 690, '["Fail"]'::jsonb, true, 'Replace/update MSDS sheet folder', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Sunscreen present', 'pass_fail_na', true, 700, '["Fail"]'::jsonb, true, 'Restock sunscreen', 'Low', false, true, null),
  ('Safety equipment - PPE', 'Ladder pad present and in good condition', 'pass_fail_na', true, 710, '["Fail"]'::jsonb, true, 'Restock/replace ladder pad', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Gutter clamp present and in good condition', 'pass_fail_na', true, 720, '["Fail"]'::jsonb, true, 'Restock/replace gutter clamp', 'Medium', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Engine oil level OK', 'pass_fail_na', true, 800, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Check/top up engine oil', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Engine oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 810, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Change/investigate engine oil condition', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pump oil level OK', 'pass_fail_na', true, 820, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Check/top up pump oil', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pump oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 830, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Change/investigate pump oil condition', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Water and grit sucked out from fuel tank with syringe', 'pass_fail_na', true, 840, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Remove water/grit from fuel tank', 'Medium', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pump and unloader valve checked for leaks', 'pass_fail_na', true, 850, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Investigate pump/unloader valve leak', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pressure hose and swivel checked for leaks', 'pass_fail_na', true, 860, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Investigate pressure hose or swivel leak', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - any other issue to note?', 'yes_no', true, 880, '["Yes"]'::jsonb, true, 'Review drivers side engine and pump note', 'Medium', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Engine oil level OK', 'pass_fail_na', true, 900, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Check/top up engine oil', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Engine oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 910, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Change/investigate engine oil condition', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pump oil level OK', 'pass_fail_na', true, 920, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Check/top up pump oil', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pump oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 930, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Change/investigate pump oil condition', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Water and grit sucked out from fuel tank with syringe', 'pass_fail_na', true, 940, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Remove water/grit from fuel tank', 'Medium', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pump and unloader valve checked for leaks', 'pass_fail_na', true, 950, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Investigate pump/unloader valve leak', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pressure hose and swivel checked for leaks', 'pass_fail_na', true, 960, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Investigate pressure hose or swivel leak', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - any other issue to note?', 'yes_no', true, 980, '["Yes"]'::jsonb, true, 'Review passenger side engine and pump note', 'Medium', true, true, null)
) as v(section, question_text, response_type, required, sort_order, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, notes_required_on_problem, help_text)
on conflict (template_id, question_text) do update set
  section = excluded.section,
  response_type = excluded.response_type,
  required = excluded.required,
  sort_order = excluded.sort_order,
  problem_values = excluded.problem_values,
  creates_task_on_problem = excluded.creates_task_on_problem,
  default_task_title = excluded.default_task_title,
  default_severity = excluded.default_severity,
  photo_required_on_problem = excluded.photo_required_on_problem,
  notes_required_on_problem = excluded.notes_required_on_problem,
  help_text = excluded.help_text,
  is_active = true;

-- Additional procedures from the uploaded periodic check form.
insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values ('Fuel tank water/grit removal with syringe', 'Engine', 'washing_equipment', 'Basic check from the periodic vehicle form: remove visible water and grit from small petrol engine fuel tanks using a syringe or approved suction tool. Confirm the method is suitable for the actual engine/fuel tank before use.', 14, null, 10, 'Basic', false, 'Work outside or in a ventilated area, away from ignition sources. Stop engine and allow it to cool. Wear gloves and eye protection. Store/dispose of contaminated fuel safely.', 'Fuel-safe syringe or suction tool, clean container for contaminated fuel/water, rag, gloves, eye protection.', 'None unless fuel line/filter or cap seal is found damaged.', true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = excluded.frequency_hours,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Fuel tank water/grit removal with syringe')
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, v.step_number, v.title, v.instruction, v.safety_note, v.requires_photo, v.requires_reading
from p, (values
  (1, 'Prepare safely', 'Stop the engine, allow it to cool, keep ignition sources away, and place the machine on stable level ground.', 'Petrol vapour is flammable.', false, false),
  (2, 'Open and inspect tank', 'Open the fuel cap and inspect for visible water, grit, debris, or contamination.', 'Avoid dropping dirt into the tank.', true, false),
  (3, 'Remove contamination', 'Use the syringe or approved suction tool to remove visible water and grit from the lowest practical point in the tank.', 'Use only fuel-safe equipment and avoid spills.', false, false),
  (4, 'Store waste safely', 'Put contaminated fuel/water into a suitable container for safe disposal. Wipe any spills.', 'Do not pour contaminated fuel into drains or onto ground.', false, false),
  (5, 'Refit and test', 'Refit fuel cap, check for leaks, and test run only when safe.', 'Keep clear of hot/moving parts.', false, false),
  (6, 'Record completion', 'Record the inspection/maintenance completion, any contamination found, and whether further servicing is needed.', '', false, true)
) as v(step_number, title, instruction, safety_note, requires_photo, requires_reading)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading;

insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values ('Ladder levelling feet clean and lubricate', 'Ladders', 'vehicle', 'Clean ladder levelling feet with high-pressure water, lubricate sliding areas with WD40 or similar, and check for damage as required by the periodic vehicle form.', 14, null, 15, 'Basic', false, 'Place ladder securely on the ground before working. Do not use a damaged ladder. Keep hands clear of sliding/pinch points.', 'High-pressure water source, WD40 or similar, rag, eye protection.', 'Replacement levelling foot parts only if damage is found.', true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = excluded.frequency_hours,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Ladder levelling feet clean and lubricate')
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, v.step_number, v.title, v.instruction, v.safety_note, v.requires_photo, v.requires_reading
from p, (values
  (1, 'Inspect before cleaning', 'Place ladder securely and inspect levelling feet for obvious damage or excessive wear.', 'Remove damaged ladder from service.', true, false),
  (2, 'Flush dirt', 'Flush levelling feet and sliding areas with high-pressure water to remove dirt and grit.', 'Wear eye protection and avoid directing water at people.', false, false),
  (3, 'Dry and lubricate', 'Let excess water drain, wipe if needed, then lubricate sliding areas with WD40 or similar.', 'Keep hands clear of pinch points.', false, false),
  (4, 'Function check', 'Operate the levelling feet through their movement and confirm smooth operation.', 'Do not force damaged parts.', false, false),
  (5, 'Record completion', 'Record completion and any parts/damage requiring follow-up.', '', false, false)
) as v(step_number, title, instruction, safety_note, requires_photo, requires_reading)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading;

insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values ('Pure water TDS test', 'Pure Water', 'vehicle', 'Test pure water system quality and report if the reading is above 20ppm, matching the periodic vehicle check requirement.', 14, null, 5, 'Basic', false, 'Use clean sampling practices. Avoid splashes around electrical equipment.', 'TDS meter, clean sample container if required.', 'DI resin or filters if replacement is needed after high readings.', true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = excluded.frequency_hours,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Pure water TDS test')
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, v.step_number, v.title, v.instruction, v.safety_note, v.requires_photo, v.requires_reading
from p, (values
  (1, 'Prepare meter', 'Confirm the TDS meter is clean and ready to use.', 'Follow meter instructions.', false, false),
  (2, 'Take sample', 'Run water briefly and take a representative sample from the pure water system.', 'Avoid contaminating the sample.', false, false),
  (3, 'Record reading', 'Measure and record the ppm reading. A reading above 20ppm must be reported.', '', false, true),
  (4, 'Create follow-up if high', 'If above 20ppm, create or complete a maintenance task to investigate resin/filter condition.', '', false, false),
  (5, 'Record completion', 'Save the reading and notes in the app.', '', false, false)
) as v(step_number, title, instruction, safety_note, requires_photo, requires_reading)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading;

