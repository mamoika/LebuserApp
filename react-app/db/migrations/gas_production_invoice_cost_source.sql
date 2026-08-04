-- Wartości z faktur były zapisane jako kumulatywne odczyty licznika gazu w m3.
-- Po przeniesieniu ich do cost_settings.gas_prod_invoice_* usuwamy wyłącznie
-- dwa dokładnie rozpoznane wpisy, aby aplikacja nie odejmowała faktur od siebie.

update public.daily_costs
set
  gas_prod_end = null,
  updated_at = now()
where entry_date = '2026-05-31'
  and replace(trim(coalesce(gas_prod_end, '')), ',', '.') = '79575'
  and exists (
    select 1
    from public.cost_settings
    where month_key = '2026-05'
      and gas_prod_invoice_kwh = 79575
      and gas_prod_invoice_net = 26751.80
  );

update public.daily_costs
set
  gas_prod_end = null,
  updated_at = now()
where entry_date = '2026-06-30'
  and replace(trim(coalesce(gas_prod_end, '')), ',', '.') = '95698'
  and exists (
    select 1
    from public.cost_settings
    where month_key = '2026-06'
      and gas_prod_invoice_kwh = 95698
      and gas_prod_invoice_net = 29858.96
  );
