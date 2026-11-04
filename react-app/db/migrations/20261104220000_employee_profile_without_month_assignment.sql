-- Edycja profilu z listy istniejących pracowników nie może automatycznie
-- dodawać pracownika do aktualnie oglądanego miesiąca.
create or replace function public.admin_update_employee_profile(
  p_session_token text,
  p_employee_id uuid,
  p_name text,
  p_group_name text,
  p_contract_type text default 'UoP',
  p_default_start text default '7',
  p_default_end text default '15'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  perform public.require_admin(p_session_token);

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if p_employee_id is null then
    return json_build_object('error', 'Brak pracownika');
  end if;
  if v_name is null then
    return json_build_object('error', 'Nazwisko i imię jest wymagane');
  end if;

  update public.employees
  set name = v_name,
      group_name = nullif(trim(coalesce(p_group_name, '')), ''),
      contract_type = coalesce(nullif(trim(coalesce(p_contract_type, '')), ''), 'UoP'),
      default_start = coalesce(nullif(trim(coalesce(p_default_start, '')), ''), '7'),
      default_end = coalesce(nullif(trim(coalesce(p_default_end, '')), ''), '15')
  where id = p_employee_id;

  if not found then
    return json_build_object('error', 'Nie znaleziono pracownika');
  end if;

  return json_build_object('ok', true, 'id', p_employee_id);
end;
$$;

revoke all on function public.admin_update_employee_profile(text, uuid, text, text, text, text, text) from public;
grant execute on function public.admin_update_employee_profile(text, uuid, text, text, text, text, text) to anon, authenticated;
