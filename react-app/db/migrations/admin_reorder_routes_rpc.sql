create or replace function public.admin_reorder_routes(
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

  for v_rec in select * from jsonb_to_recordset(p_updates) as x(id integer, sort_order integer)
  loop
    update public.routes
    set sort_order = v_rec.sort_order
    where id = v_rec.id;
  end loop;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_reorder_routes(text, jsonb) to anon, authenticated;
