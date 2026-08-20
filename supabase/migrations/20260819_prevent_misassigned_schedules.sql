-- Prevent maintenance procedures from being scheduled against incompatible machinery.
-- This affects new and edited schedules only; it does not alter historical records.

create or replace function public.operations_validate_maintenance_schedule_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_category text;
  v_procedure_name text;
  v_machinery_type text;
  v_equipment_type text;
begin
  -- Vehicle-level planned maintenance is intentionally outside the sub-asset mapping.
  if new.washing_equipment_id is null then
    return new;
  end if;

  select lower(trim(category)), lower(trim(name))
    into v_category, v_procedure_name
    from public.operations_maintenance_procedures
    where id = new.procedure_id;

  if v_procedure_name like 'pm planned %' or v_category like 'planned:%' then
    return new;
  end if;

  select coalesce(nullif(trim(machinery_type), ''), ''), lower(trim(equipment_type))
    into v_machinery_type, v_equipment_type
    from public.operations_washing_equipment
    where id = new.washing_equipment_id;

  if v_machinery_type = '' then
    if v_equipment_type like '%gear%' then v_machinery_type := 'Gearbox';
    elsif v_equipment_type like '%pump%' then v_machinery_type := 'Pump';
    else v_machinery_type := 'Engine';
    end if;
  end if;

  if (v_category = 'engine' and v_machinery_type = 'Engine')
     or (v_category = 'pump' and v_machinery_type = 'Pump')
     or (v_category = 'gearbox' and v_machinery_type = 'Gearbox')
     or (v_category = 'hose reel' and v_equipment_type like '%hose reel%')
     or (v_category = 'pressure system' and v_equipment_type like '%pressure system%')
     or (v_category = 'general' and v_equipment_type = 'water blaster') then
    return new;
  end if;

  raise exception 'Procedure category "%" is not compatible with machinery "%" (%).',
    coalesce(v_category, 'unknown'), coalesce(v_equipment_type, 'unknown'), v_machinery_type
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists operations_validate_maintenance_schedule_category
  on public.operations_equipment_maintenance_schedules;

create trigger operations_validate_maintenance_schedule_category
before insert or update of washing_equipment_id, procedure_id
on public.operations_equipment_maintenance_schedules
for each row execute function public.operations_validate_maintenance_schedule_category();
