-- Spray & Wash Operations App V4.0.4 admin, certificate search and preventive maintenance guide release
-- Run AFTER V4.0.1/V4.0.2. This file includes the V4.0.3 corrective changes plus V4.0.4 additions.

begin;

-- 1) Rename the vehicle checklist and archive/merge the old Google-form naming if both exist.
do $$
declare
  old_id uuid;
  new_id uuid;
begin
  select id into old_id
  from public.operations_checklist_templates
  where name = 'Periodic Vehicle Checks - Google Form'
  order by created_at
  limit 1;

  select id into new_id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  order by created_at
  limit 1;

  if new_id is null and old_id is not null then
    update public.operations_checklist_templates
    set name = 'Vehicle Inspection Checklist', target_type = 'vehicle', is_active = true, frequency_days = 14
    where id = old_id;
    new_id := old_id;
  elsif new_id is not null and old_id is not null and new_id <> old_id then
    update public.operations_checklist_items
    set template_id = new_id
    where template_id = old_id
      and not exists (
        select 1 from public.operations_checklist_items existing
        where existing.template_id = new_id
          and existing.question_text = operations_checklist_items.question_text
      );
    update public.operations_checklist_templates
    set is_active = false,
        name = 'Periodic Vehicle Checks - Google Form - archived ' || left(old_id::text, 8)
    where id = old_id;
  elsif new_id is null then
    insert into public.operations_checklist_templates(name, target_type, frequency_days, is_active)
    values ('Vehicle Inspection Checklist', 'vehicle', 14, true)
    returning id into new_id;
  end if;

  update public.operations_checklist_templates
  set target_type = 'vehicle', is_active = true, frequency_days = 14
  where id = new_id;
end $$;

-- 2) Rework the vehicle checklist: one active checklist, grouped sections, blank UI default handled in JS.
with t as (
  select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1
)
update public.operations_checklist_items i
set
  required = true,
  pass_values = case when i.response_type in ('pass_fail','pass_fail_na','yes_no','choice') then '["Completed OK","N/A"]'::jsonb else i.pass_values end,
  problem_values = case when i.response_type in ('pass_fail','pass_fail_na','yes_no','choice') then '["Issue to report"]'::jsonb else i.problem_values end,
  response_type = case when i.response_type = 'yes_no' then 'pass_fail_na' else i.response_type end,
  photo_required_on_problem = false,
  notes_required_on_problem = case when i.creates_task_on_problem then true else i.notes_required_on_problem end
from t
where i.template_id = t.id;

-- Make RUC response text so petrol vehicles can answer N/A while still giving a response.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set response_type = 'text', required = true, help_text = 'Enter kilometres remaining for diesel vehicles, or N/A for petrol vehicles.'
from t
where i.template_id = t.id
  and i.question_text ilike '%Road User Charges%';

-- Deactivate separate cab/tray/photo items; replace them with a single combined cleaning item.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set is_active = false
from t
where i.template_id = t.id
  and (
    i.question_text ilike '%Vehicle tray cleaned%'
    or i.question_text ilike '%Vehicle cab tidied%'
    or i.question_text ilike '%Truck and tray photos uploaded%'
  );

with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
insert into public.operations_checklist_items
  (template_id, section, question_text, response_type, required, sort_order, pass_values, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, notes_required_on_problem, help_text, is_active)
select t.id,
  'Vehicle cleaning',
  'Vehicle cab and tray cleaned - rubbish removed, cab tidied, interior surfaces wiped down, tray items removed and tray pressure washed clean',
  'pass_fail_na',
  true,
  120,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  'Complete cab and tray cleaning',
  'Low',
  false,
  true,
  'This combines the old separate cab and tray cleaning boxes into one checklist item.',
  true
from t
on conflict (template_id, question_text) do update set
  section = excluded.section,
  response_type = excluded.response_type,
  required = excluded.required,
  sort_order = excluded.sort_order,
  pass_values = excluded.pass_values,
  problem_values = excluded.problem_values,
  creates_task_on_problem = excluded.creates_task_on_problem,
  default_task_title = excluded.default_task_title,
  default_severity = excluded.default_severity,
  photo_required_on_problem = excluded.photo_required_on_problem,
  notes_required_on_problem = excluded.notes_required_on_problem,
  help_text = excluded.help_text,
  is_active = true;

-- Only the exterior wash item should show an item-level photo upload portal.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set photo_required_on_problem = case when i.question_text ilike '%Vehicle exterior washed%' then true else false end,
    help_text = case when i.question_text ilike '%Vehicle exterior washed%' then 'Upload exterior vehicle photos here after washing.' else i.help_text end
from t
where i.template_id = t.id;

-- Group and order the checklist more logically.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set section = case
    when i.question_text ilike '%Warrant of Fitness%' or i.question_text ilike '%Registration%' or i.question_text ilike '%mileage%' or i.question_text ilike '%odometer%' or i.question_text ilike '%Road User Charges%' or i.question_text ilike '%Wheel nuts%' or i.question_text ilike 'Vehicle checks - any other%' then 'Vehicle checks'
    when i.question_text ilike '%Vehicle exterior washed%' or i.question_text ilike '%cab and tray cleaned%' or i.question_text ilike 'Vehicle maintenance - any other%' then 'Vehicle cleaning'
    when i.question_text ilike '%First Aid%' or i.question_text ilike '%Eye wash%' or i.question_text ilike '%Fire extinguisher%' or i.question_text ilike '%Safety glasses%' or i.question_text ilike '%Hearing protection%' or i.question_text ilike '%chemical gloves%' or i.question_text ilike '%Sign board%' or i.question_text ilike '%Safety cones%' or i.question_text ilike '%MSDS%' or i.question_text ilike '%Sunscreen%' or i.question_text ilike '%Ladder pad%' or i.question_text ilike '%Gutter clamp%' then 'Safety equipment / PPE'
    when i.question_text ilike '%Screwdrivers%' or i.question_text ilike '%spanner%' or i.question_text ilike '%Socket set%' or i.question_text ilike '%Dentist picks%' or i.question_text ilike '%parrot grips%' or i.question_text ilike '%Thread tape%' or i.question_text ilike '%WD40%' then 'Tools'
    when i.question_text ilike '%engine%' or i.question_text ilike '%pump%' or i.question_text ilike '%unloader%' or i.question_text ilike '%pressure hose%' or i.question_text ilike '%swivel%' or i.question_text ilike '%fuel tank%' then 'Engine, pump, hose reel and unloader checks'
    else 'Washing equipment checks'
  end,
  sort_order = case
    when i.question_text ilike '%Warrant of Fitness%' then 10
    when i.question_text ilike '%Registration%' then 20
    when i.question_text ilike '%mileage%' or i.question_text ilike '%odometer%' then 30
    when i.question_text ilike '%Road User Charges%' then 40
    when i.question_text ilike '%Wheel nuts%' then 50
    when i.question_text ilike 'Vehicle checks - any other%' then 60
    when i.question_text ilike '%Vehicle exterior washed%' then 100
    when i.question_text ilike '%cab and tray cleaned%' then 120
    when i.question_text ilike 'Vehicle maintenance - any other%' then 140
    when i.question_text ilike '%Trigger guns%' then 200
    when i.question_text ilike '%wand%' or i.question_text ilike '%pole%' or i.question_text ilike '%brush%' or i.question_text ilike '%gutter attachment%' then 220
    when i.question_text ilike '%nozzle%' then 300
    when i.question_text ilike '%tap connectors%' or i.question_text ilike '%end-of-hose%' then 380
    when i.question_text ilike '%Surface cleaner%' then 430
    when i.question_text ilike '%Pure water%' or i.question_text ilike '%Water fed pole%' then 440
    when i.question_text ilike '%Ladder levelling%' or i.question_text ilike '%Ladders checked%' then 470
    when i.question_text ilike '%Screwdrivers%' or i.question_text ilike '%spanner%' or i.question_text ilike '%Socket set%' or i.question_text ilike '%Dentist picks%' or i.question_text ilike '%parrot grips%' or i.question_text ilike '%Thread tape%' or i.question_text ilike '%WD40%' then 500
    when i.question_text ilike '%First Aid%' or i.question_text ilike '%Eye wash%' or i.question_text ilike '%Fire extinguisher%' or i.question_text ilike '%Safety glasses%' or i.question_text ilike '%Hearing protection%' or i.question_text ilike '%chemical gloves%' or i.question_text ilike '%Sign board%' or i.question_text ilike '%Safety cones%' or i.question_text ilike '%MSDS%' or i.question_text ilike '%Sunscreen%' or i.question_text ilike '%Ladder pad%' or i.question_text ilike '%Gutter clamp%' then 600
    when i.question_text ilike '%Drivers side%' then 800
    when i.question_text ilike '%Passenger side%' then 900
    else i.sort_order
  end
from t
where i.template_id = t.id;

-- 3) Standard preventive maintenance procedure templates.
insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values
('Air filter check/replacement','Engine','washing_equipment','Check and clean or replace the petrol engine air filter. Confirm the exact filter type from the engine manual.',90,null,10,'Basic',false,'Stop engine and allow hot parts to cool. Do not run the engine without the filter fitted.','Screwdriver/socket if required, clean rag.','Correct replacement air filter if required.',true),
('Spark plug inspection/replacement','Engine','washing_equipment','Inspect or replace the petrol engine spark plug. Confirm plug type and gap from the engine manual.',365,null,15,'Basic',false,'Stop engine, allow to cool, and disconnect ignition lead before removing plug.','Spark plug socket, gap tool if trained.','Correct spark plug from manufacturer manual.',true),
('Unloader valve check','Pump','washing_equipment','Check the unloader valve area for leaks, sticking, pressure cycling, or unusual behaviour.',90,null,15,'Intermediate',false,'Release pressure before touching fittings. Never inspect high-pressure leaks with your hand.','Torch, rag, suitable spanners if trained.','O-rings/fittings only if required.',true),
('Hose reel inspection','Hose Reel','washing_equipment','Inspect hose reel, swivel, reel frame and hose condition for leaks, wear, stiffness or damage.',30,null,10,'Basic',false,'Release pressure before inspecting or tightening fittings.','Torch, rag.','Replacement O-rings/fittings only if required.',true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = null,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

-- Remove hour wording from existing guide steps where possible.
update public.operations_maintenance_procedure_steps
set instruction = replace(instruction, 'Record hours, oil used, notes and next due schedule.', 'Record completion date, oil used, notes and next due schedule.')
where instruction ilike '%Record hours%';

update public.operations_maintenance_procedure_steps
set instruction = replace(instruction, 'Record engine hours, oil used, notes and next due schedule.', 'Record completion date, oil used, notes and next due schedule.')
where instruction ilike '%Record engine hours%';

-- 4) Version marker.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'key')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'value') then
    insert into public.app_settings(key, value)
    values ('operations_module_version', '4.0.4')
    on conflict (key) do update set value = excluded.value;
  end if;
exception when others then
  null;
end $$;




-- 5) Admin user pre-load table and claiming function.
create table if not exists public.operations_preloaded_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  last_name text,
  display_name text,
  role_preset text,
  roles text[] not null default array['Viewer']::text[],
  active boolean not null default true,
  status text not null default 'Pending' check (status in ('Pending','Claimed','Inactive')),
  claimed_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_preloaded_users_email_idx on public.operations_preloaded_users(lower(email));

drop trigger if exists operations_preloaded_users_set_updated_at on public.operations_preloaded_users;
create trigger operations_preloaded_users_set_updated_at
before update on public.operations_preloaded_users
for each row execute function public.set_updated_at();

alter table public.operations_preloaded_users enable row level security;

do $$
begin
  execute 'drop policy if exists "ops preloaded users admin manage" on public.operations_preloaded_users';
  execute 'create policy "ops preloaded users admin manage" on public.operations_preloaded_users for all to authenticated using (public.has_any_app_role(array[''Admin'']::text[])) with check (public.has_any_app_role(array[''Admin'']::text[]))';
  execute 'drop policy if exists "ops preloaded users self read" on public.operations_preloaded_users';
  execute 'create policy "ops preloaded users self read" on public.operations_preloaded_users for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> ''email'', '''')))';
end $$;

create or replace function public.claim_preloaded_user_setup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_pre public.operations_preloaded_users%rowtype;
  v_role text;
begin
  if v_user is null or v_email = '' then
    return;
  end if;

  select * into v_pre
  from public.operations_preloaded_users
  where lower(email) = v_email
    and active = true
  order by created_at desc
  limit 1;

  if not found then
    return;
  end if;

  insert into public.profiles(user_id, email, display_name, last_seen_at)
  values (v_user, v_email, coalesce(nullif(v_pre.display_name,''), v_email), now())
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = coalesce(nullif(public.profiles.display_name,''), excluded.display_name),
        last_seen_at = now();

  foreach v_role in array coalesce(v_pre.roles, array['Viewer']::text[]) loop
    if v_role = any(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]) then
      insert into public.user_roles(user_id, role, assigned_by)
      select v_user, v_role, v_pre.created_by
      where not exists (
        select 1 from public.user_roles ur
        where ur.user_id = v_user and ur.role = v_role
      );
    end if;
  end loop;

  update public.operations_preloaded_users
  set claimed_user_id = v_user,
      claimed_at = coalesce(claimed_at, now()),
      status = 'Claimed',
      updated_at = now()
  where id = v_pre.id;
end;
$$;

grant execute on function public.claim_preloaded_user_setup() to authenticated;

-- 6) Expanded preventive maintenance procedure and guide seed.
insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values
('Engine pre-start inspection','Engine','washing_equipment','Quick visual and operational check before starting a petrol water blaster engine.',30,null,5,'Basic',false,'Do not start the engine if fuel, oil, hose or pump leaks are present.','Torch, rag.','None.',true),
('Engine oil level check','Engine','washing_equipment','Check the petrol engine oil level and visible condition.',30,null,8,'Basic',false,'Engine must be off and on level ground. Allow hot parts to cool.','Clean rag, funnel if topping up.','Approved engine oil as confirmed by the engine manual.',true),
('Engine oil change','Engine','washing_equipment','Drain and replace petrol engine oil. Confirm oil grade and quantity from the actual engine manual.',180,null,25,'Basic',false,'Use gloves and eye protection. Allow hot components to cool. Capture and dispose of waste oil correctly.','Drain tray, funnel, rag, suitable spanner/socket.','Approved engine oil and waste oil container.',true),
('Air filter check/replacement','Engine','washing_equipment','Check and clean or replace the petrol engine air filter. Confirm filter type from the engine manual.',90,null,10,'Basic',false,'Do not run the engine without the filter fitted. Avoid blowing dust into the intake.','Screwdriver/socket if required, clean rag.','Correct replacement air filter if required.',true),
('Spark plug inspection/replacement','Engine','washing_equipment','Inspect or replace spark plug. Confirm plug type and gap from engine manual.',365,null,15,'Basic',false,'Stop engine, allow to cool and disconnect ignition lead before removing plug.','Spark plug socket, gap tool if trained.','Correct spark plug from manufacturer manual.',true),
('Fuel tank water/grit removal with syringe','Engine','washing_equipment','Remove visible water or grit from the petrol tank using a syringe as per current vehicle check routine.',30,null,10,'Basic',false,'No smoking or ignition sources. Use suitable PPE and handle fuel carefully.','Fuel-safe syringe, rag, waste container.','None.',true),
('Fuel line and leak inspection','Engine','washing_equipment','Inspect fuel tank, tap, line and carburettor area for leaks, cracking or damage.',90,null,10,'Basic',false,'No ignition sources. Do not use equipment with fuel leaks.','Torch, rag.','Replacement line/filter only if required by competent person.',true),
('Pump oil level and condition check','Pump','washing_equipment','Check pump oil level and visible condition where the pump has an oil sight glass or dipstick.',30,null,8,'Basic',false,'Stop engine and release pressure before inspecting.','Rag, torch.','Approved pump oil only if topping up is allowed.',true),
('Pump oil change','Pump','washing_equipment','Change pump oil. Confirm exact oil type, quantity and procedure from the pump manual.',180,null,25,'Intermediate',false,'Release pressure and allow equipment to cool. Dispose of waste oil correctly.','Drain tray, funnel, rag, suitable spanner/socket.','Approved pump oil and waste oil container.',true),
('Pump leak and fitting check','Pump','washing_equipment','Check pump head, fittings and connected pressure hose area for leaks or damage.',30,null,10,'Basic',false,'Never check a high-pressure leak with hands. Release pressure before touching fittings.','Torch, rag.','O-rings/fittings if required.',true),
('Unloader valve check','Pump','washing_equipment','Check the unloader valve area for leaks, sticking, pressure cycling or unusual behaviour.',90,null,15,'Intermediate',false,'Release pressure before touching fittings. Do not adjust pressure beyond approved settings unless trained.','Torch, rag, suitable spanners if trained.','O-rings/fittings only if required.',true),
('Hose reel inspection','Hose Reel','washing_equipment','Inspect hose reel, swivel, reel frame and hose condition.',30,null,10,'Basic',false,'Release pressure before inspecting or tightening fittings.','Torch, rag.','Replacement O-rings/fittings only if required.',true),
('Trigger gun and lance inspection','Pressure System','washing_equipment','Inspect trigger guns, lances and wands for damage, leaks and safe operation.',30,null,10,'Basic',false,'Release pressure before changing fittings. Never point at people.','Torch, rag.','O-rings or replacement trigger if needed.',true),
('Quick-connect fitting and O-ring replacement','Pressure System','washing_equipment','Inspect and replace worn quick-connect O-rings/fittings.',30,null,10,'Basic',false,'Release all pressure before separating fittings.','Dentist pick, spare O-rings, rag.','Spare O-rings and fittings.',true),
('Nozzle inspection and replacement','Pressure System','washing_equipment','Check nozzle set for missing, blocked, worn or damaged nozzles.',30,null,10,'Basic',false,'Release pressure before changing nozzles. Never inspect a nozzle while pressurised.','Nozzle cleaning tool if used, rag.','Replacement nozzles if needed.',true),
('Surface cleaner inspection','Pressure System','washing_equipment','Inspect surface cleaner body, bar, jets, skirt and wheels.',90,null,15,'Basic',false,'Release pressure and isolate before checking underside.','Torch, rag.','Replacement jets/wheels if required.',true),
('Pure water TDS test','Pure Water','washing_equipment','Test pure water system output and report if reading is above the company threshold.',14,null,5,'Basic',false,'Do not contaminate TDS meter probe. Follow meter instructions.','TDS meter.','None.',true),
('Water fed pole and brush inspection','Pure Water','washing_equipment','Inspect water-fed poles, hoses and brushes for damage and usability.',30,null,10,'Basic',false,'Avoid overhead power lines. Do not use damaged poles.','Torch, rag.','Replacement brush/hose fittings if required.',true),
('Chemical injector check and flush','Chemical System','washing_equipment','Check chemical injector and flush chemical line after use.',90,null,10,'Basic',false,'Wear chemical PPE and avoid chemical splashes.','Clean water, bucket, gloves, eye protection.','None.',true),
('End-of-day rinse-down and storage procedure','General','washing_equipment','Rinse down equipment and store it ready for the next work day.',1,null,10,'Basic',false,'Avoid spraying electrical components directly. Allow hot equipment to cool.','Hose/water, rag.','None.',true),
('Ladder visual inspection','Ladders / Access','both','Basic ladder condition inspection for extension and short fixed fence-scaling ladders.',30,null,10,'Basic',false,'Do not use any ladder with structural damage, missing feet, faulty locks or slippery contamination.','Torch, rag.','None.',true),
('Ladder levelling feet clean and lubricate','Ladders / Access','both','Clean and lubricate ladder levelling feet/sliding areas where fitted.',30,null,10,'Basic',false,'Do not use ladder while lubrication is being applied. Wipe away excess to avoid slip risk.','High pressure water if appropriate, rag, WD40 or suitable lubricant.','WD40 or similar.',true),
('Ladder feet, rung, stile and hinge inspection','Ladders / Access','both','More detailed ladder check covering feet, rungs, rails, locks, hinges and labels where present.',90,null,15,'Basic',false,'Do not use damaged ladders. Tag or separate unsafe ladders immediately.','Torch, rag.','None.',true),
('Ladder clean-down and storage check','Ladders / Access','both','Clean ladders and store safely on vehicle or in storage.',90,null,10,'Basic',false,'Do not climb while cleaning. Secure ladders correctly after storage.','Water, brush/rag.','None.',true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = null,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Engine pre-start inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Park and isolate','Park the unit on level ground, turn the engine off and make sure the area is safe.',null,false,false,true),
  (2,'Check oil/fuel area','Check around the oil filler, fuel cap, fuel tap and tank for leaks or damage.',null,false,false,true),
  (3,'Check guards and mounts','Check guards, engine mounts and frame bolts appear secure.',null,false,false,true),
  (4,'Report issues','Record any leak, loose part, unusual smell or damaged component before use.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Engine oil level check' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Set level','Place the machine on level ground and turn the engine off.',null,false,false,true),
  (2,'Clean dipstick area','Wipe dirt from around the dipstick/filler cap before opening.',null,false,false,true),
  (3,'Check level','Remove, wipe and check the dipstick according to the engine manual.',null,false,false,true),
  (4,'Assess condition','Oil should not appear milky, gritty, very black or contaminated.',null,false,false,true),
  (5,'Record result','Record completion date and report low/dirty oil or any leak.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Engine oil change' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Prepare','Place machine level, isolate engine and position drain tray.',null,false,false,true),
  (2,'Drain old oil','Remove drain/filler as per manual and drain oil into container.',null,false,false,true),
  (3,'Refill','Refit drain plug and refill with approved oil to the correct level.',null,false,false,true),
  (4,'Check','Run briefly if appropriate, stop, recheck level and inspect for leaks.',null,false,false,true),
  (5,'Record','Record completion date, oil used, notes and next due schedule.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Air filter check/replacement' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Open cover','Remove the air filter cover without letting dirt enter the intake.',null,false,false,true),
  (2,'Inspect element','Check the filter for dust, oil, damage or collapse.',null,false,false,true),
  (3,'Clean or replace','Clean only if suitable for that filter type, otherwise replace.',null,false,false,true),
  (4,'Refit','Refit filter and cover securely.',null,false,false,true),
  (5,'Record issue','Report damaged, missing or heavily contaminated filters.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Spark plug inspection/replacement' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Cool engine','Allow the engine to cool before touching the plug area.',null,false,false,true),
  (2,'Remove lead','Pull the ignition lead from the plug cap carefully.',null,false,false,true),
  (3,'Inspect plug','Remove plug and check for fouling, damage or worn electrode.',null,false,false,true),
  (4,'Refit/replace','Refit or replace with correct plug type and gap.',null,false,false,true),
  (5,'Test start','Reconnect lead and confirm engine starts normally.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Fuel tank water/grit removal with syringe' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Open tank carefully','Open the fuel cap carefully and inspect for visible water or grit.',null,false,false,true),
  (2,'Remove contamination','Use syringe to suck out water/grit from the lowest visible point.',null,false,false,true),
  (3,'Dispose safely','Place contaminated fuel/water into a safe waste container.',null,false,false,true),
  (4,'Close and check','Refit fuel cap and check for leaks or damaged cap/seal.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Fuel line and leak inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Visual check','Check tank, cap, tap, line and carburettor area.',null,false,false,true),
  (2,'Look for signs','Look for wet fuel, fuel smell, cracking or perished line.',null,false,false,true),
  (3,'Move tap','Operate fuel tap if fitted and check it does not leak.',null,false,false,true),
  (4,'Report','Take equipment out of service if fuel leakage is found.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Pump oil level and condition check' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Stop and release','Turn engine off and release system pressure.',null,false,false,true),
  (2,'Check level','Inspect pump oil sight glass/dipstick for correct level.',null,false,false,true),
  (3,'Check colour','Oil should not be milky, black, gritty or leaking.',null,false,false,true),
  (4,'Report issue','Report low, cloudy, contaminated oil or pump oil leaks.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Pump oil change' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Prepare','Place unit level, stop engine and release pressure.',null,false,false,true),
  (2,'Drain','Drain pump oil into a container using the pump drain point.',null,false,false,true),
  (3,'Refill','Refill with correct pump oil to sight glass/dipstick level.',null,false,false,true),
  (4,'Check leaks','Run briefly if appropriate, stop, recheck level and inspect for leaks.',null,false,false,true),
  (5,'Record','Record completion date, oil used and any issue found.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Pump leak and fitting check' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Inspect pump area','Look around pump, inlet, outlet and fittings for wet areas or staining.',null,false,false,true),
  (2,'Inspect while running','From a safe position, watch for leaks during operation.',null,false,false,true),
  (3,'Release pressure','Stop engine and release pressure before touching fittings.',null,false,false,true),
  (4,'Report','Report leaks, damaged fittings or unusual pump noise.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Unloader valve check' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Visual check','Inspect unloader valve and fittings for leaks or damage.',null,false,false,true),
  (2,'Operational check','Check for unusual pressure cycling, sticking or pulsing.',null,false,false,true),
  (3,'Do not over-adjust','Do not change pressure settings unless authorised.',null,false,false,true),
  (4,'Report','Record any leak, hunting, sticking or unusual pressure behaviour.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Hose reel inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Unwind hose','Unwind enough hose to inspect high-wear areas.',null,false,false,true),
  (2,'Check hose','Look for cuts, bulges, kinks, abrasion or exposed reinforcement.',null,false,false,true),
  (3,'Check swivel','Inspect swivel and reel fittings for leaks or looseness.',null,false,false,true),
  (4,'Check reel','Confirm reel winds smoothly and mount/frame is secure.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Trigger gun and lance inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Inspect body','Check trigger gun body, guard and trigger action.',null,false,false,true),
  (2,'Inspect lance','Check lance/wand is straight and fittings are secure.',null,false,false,true),
  (3,'Leak check','Check for leaks during safe test operation.',null,false,false,true),
  (4,'Report','Report sticking triggers, leaks or damaged lances.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Quick-connect fitting and O-ring replacement' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Release pressure','Stop engine and release system pressure.',null,false,false,true),
  (2,'Inspect O-rings','Check O-rings for cuts, flattening or missing seals.',null,false,false,true),
  (3,'Replace if needed','Remove damaged O-ring carefully and fit correct replacement.',null,false,false,true),
  (4,'Test','Reconnect and check for leaks under normal operation.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Nozzle inspection and replacement' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Count nozzles','Confirm required nozzle types/counts are present.',null,false,false,true),
  (2,'Inspect tips','Check for damage, blocked holes or unusual spray patterns.',null,false,false,true),
  (3,'Clean/replace','Clean only as appropriate or replace worn/damaged nozzles.',null,false,false,true),
  (4,'Report shortages','Record missing nozzles or damaged tips.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Surface cleaner inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Inspect body','Check shell, handle, wheels and skirt for damage.',null,false,false,true),
  (2,'Check spray bar','Check spray bar rotates freely and jets are present.',null,false,false,true),
  (3,'Leak check','Check fittings and hose connection for leaks.',null,false,false,true),
  (4,'Report','Report damaged skirt, seized bar or missing/worn jets.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Pure water TDS test' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Rinse sample point','Flush a small amount of water before testing.',null,false,false,true),
  (2,'Test water','Measure TDS at the system output.',null,false,false,true),
  (3,'Compare threshold','Report if reading is above 20 ppm or current company threshold.',null,false,false,true),
  (4,'Record','Record the reading and date.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Water fed pole and brush inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Inspect pole','Check sections extend/lock properly and are not cracked.',null,false,false,true),
  (2,'Inspect brush','Check brush head, jets and hose connection.',null,false,false,true),
  (3,'Inspect hose','Check for kinks, leaks or damaged fittings.',null,false,false,true),
  (4,'Report','Record damage, leaks or missing parts.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Chemical injector check and flush' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Inspect line','Check chemical line and filter for splits, blockages or damage.',null,false,false,true),
  (2,'Check draw','Confirm injector draws chemical during normal operation.',null,false,false,true),
  (3,'Flush','Flush line with clean water after chemical use.',null,false,false,true),
  (4,'Report','Record poor draw, leaks or damaged line/filter.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'End-of-day rinse-down and storage procedure' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Rinse exterior','Rinse dirt and chemical residue from frame, hoses and fittings.',null,false,false,true),
  (2,'Drain/store hoses','Drain and wind hoses neatly without kinks.',null,false,false,true),
  (3,'Check leaks/damage','Look for damage noticed during clean-down.',null,false,false,true),
  (4,'Store safely','Store equipment so it will not roll, fall or block access.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Ladder visual inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Identify ladder type','Select the ladder type: extra long 17 rung, long 13 rung, short 9 rung, or short fixed fence-scaling ladder.',null,false,false,true),
  (2,'Check stiles/rails','Check side rails are straight and free from cracks, crushing, corrosion or sharp damage.',null,false,false,true),
  (3,'Check rungs','Check rungs/steps are secure, clean and not bent, cracked or slippery.',null,false,false,true),
  (4,'Check feet/ends','Check rubber feet/end caps are present and in usable condition.',null,false,false,true),
  (5,'Remove if unsafe','Remove ladder from service and report if unsafe.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Ladder levelling feet clean and lubricate' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Clean mechanism','Flush dirt from levelling foot/sliding area.',null,false,false,true),
  (2,'Inspect movement','Check levelling feet slide/adjust smoothly.',null,false,false,true),
  (3,'Lubricate lightly','Apply a small amount of lubricant to sliding area only.',null,false,false,true),
  (4,'Wipe excess','Wipe off excess lubricant and check foot remains safe/non-slip.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Ladder feet, rung, stile and hinge inspection' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Check feet','Check feet are present, secure and not badly worn.',null,false,false,true),
  (2,'Check rungs and stiles','Check rungs and stiles/rails for damage, bends or looseness.',null,false,false,true),
  (3,'Check locks/hinges','Check locks, hinges or extension catches operate correctly.',null,false,false,true),
  (4,'Check cleanliness','Ensure ladder is clean and free from slippery residue.',null,false,false,true),
  (5,'Report/retire','Report damage and remove unsafe ladder from use.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;

with p as (select id from public.operations_maintenance_procedures where name = 'Ladder clean-down and storage check' limit 1)
insert into public.operations_maintenance_procedure_steps
(procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading, requires_confirmation)
select p.id, v.* from p, (values
  (1,'Clean ladder','Remove dirt, algae, chemical residue and slippery contamination.',null,false,false,true),
  (2,'Dry/check','Allow to dry if needed and check no new damage is visible.',null,false,false,true),
  (3,'Store correctly','Store/secure ladder so it cannot fall or be damaged in transit.',null,false,false,true),
  (4,'Report','Record if storage brackets, straps or vehicle mounting are damaged.',null,false,false,true)
) as v(step_number,title,instruction,safety_note,requires_photo,requires_reading,requires_confirmation)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading,
  requires_confirmation = excluded.requires_confirmation;


-- 7) Ladder type reference as app setting for future ladder inspection UI.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'key')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'value') then
    insert into public.app_settings(key, value)
    values
      ('operations_ladder_types', '["Extra long extension ladder - 17 rung","Long extension ladder - 13 rung","Short extension ladder - 9 rung","Short fixed ladder - fence scaling ladder"]'),
      ('operations_module_version', '4.0.4')
    on conflict (key) do update set value = excluded.value;
  end if;
exception when others then
  null;
end $$;

commit;
