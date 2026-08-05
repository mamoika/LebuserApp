-- Remove the retired hall-planning API and its stored data.
-- Apply only after the frontend without WorkforcePlanningView is live.

drop function if exists public.get_workforce_floor_plan(text);
drop function if exists public.admin_save_workforce_floor_plan(text, jsonb, timestamptz);
drop function if exists public.get_workforce_plan(text, date);
drop function if exists public.admin_save_workforce_plan(text, date, jsonb, timestamptz);

delete from public.app_settings
where key = 'workforce_floor_plan'
   or key like 'workforce_plan_%';

notify pgrst, 'reload schema';
