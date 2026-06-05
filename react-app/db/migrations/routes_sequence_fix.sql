create or replace function public.reset_routes_id_sequence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence_name text;
begin
  v_sequence_name := pg_get_serial_sequence('public.routes', 'id');

  if v_sequence_name is not null then
    execute format(
      'select setval(%L, coalesce((select max(id) from public.routes), 0) + 1, false)',
      v_sequence_name
    );
  end if;
end;
$$;

grant execute on function public.reset_routes_id_sequence() to anon, authenticated;
