-- Zmiana kolejności stanowisk (drag & drop w Panel Admina → Stanowiska),
-- ten sam wzorzec co admin_reorder_routes (admin_reorder_routes_rpc.sql).
-- Lista jest pogrupowana per grupa (ZD1/ZD2/...), więc przeciągnięcie stanowiska
-- do innej sekcji zmienia mu też group_id, nie tylko sort_order.
create or replace function public.admin_reorder_roles(
  p_session_token text,
  p_updates jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  perform public.require_admin(p_session_token);

  for v_rec in select * from jsonb_to_recordset(p_updates) as x(id uuid, sort_order integer, group_id uuid)
  loop
    update public.roles
    set sort_order = v_rec.sort_order,
        group_id = coalesce(v_rec.group_id, group_id)
    where id = v_rec.id;
  end loop;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_reorder_roles(text, jsonb) to anon, authenticated;
