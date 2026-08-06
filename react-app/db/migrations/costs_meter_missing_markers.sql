-- Keep the database meter contract aligned with the costs UI.
-- A dash is an explicit "no reading / no driving" marker, not a numeric zero.

create or replace function private.validate_daily_cost_row()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_meter text;
begin
  if new.entry_date !~ '^\d{4}-\d{2}-\d{2}$'
     or to_char(to_date(new.entry_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> new.entry_date then
    raise exception 'Nieprawidłowa data kosztu: %', new.entry_date using errcode = '22023';
  end if;

  foreach v_meter in array array[
    new.fiat_end, new.isuzu_end, new.merc_end, new.iveco_end,
    new.elec_end, new.gas_prod_end, new.gas_heat_end, new.water_end
  ] loop
    if v_meter is not null
       and trim(v_meter) not in ('', '-', '—')
       and replace(trim(v_meter), ',', '.') !~ '^\d+(\.\d*)?$' then
      raise exception 'Nieprawidłowy stan licznika: %', v_meter using errcode = '22023';
    end if;
  end loop;

  if coalesce(new.ton_zd1, 0) < 0 or coalesce(new.ton_zd2, 0) < 0 or coalesce(new.ton_pralki, 0) < 0 then
    raise exception 'Tonaż nie może być ujemny' using errcode = '22023';
  end if;
  return new;
end;
$$;
