-- Tabele na potrzeby systemu Kosztów i Wydajności

CREATE TABLE public.cost_settings (
  month_key TEXT PRIMARY KEY, -- format: 'YYYY-MM'
  fiat_l_100km NUMERIC DEFAULT 9.01,
  isuzu_l_100km NUMERIC DEFAULT 10.88,
  merc_l_100km NUMERIC DEFAULT 13.04,
  iveco_l_100km NUMERIC DEFAULT 12.25,
  fuel_price NUMERIC DEFAULT 4.85,
  
  elec_multiplier NUMERIC DEFAULT 80,
  elec_fixed_monthly NUMERIC DEFAULT 3562.12,
  elec_price_kwh NUMERIC DEFAULT 0.6823,
  
  gas_prod_price_m3 NUMERIC DEFAULT 1.95,
  gas_prod_fixed_daily NUMERIC DEFAULT 173.51,
  
  gas_heat_price_m3 NUMERIC DEFAULT 6.15,
  gas_heat_fixed_monthly NUMERIC DEFAULT 49.78,
  
  water_fixed_monthly NUMERIC DEFAULT 20.10,
  water_price_m3 NUMERIC DEFAULT 16.25,
  
  worker_hourly_rate NUMERIC DEFAULT 45.82,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE public.daily_costs (
  entry_date TEXT PRIMARY KEY, -- format: 'YYYY-MM-DD'
  
  -- SAMOCHODY (stany liczników)
  fiat_start NUMERIC,
  fiat_end NUMERIC,
  isuzu_start NUMERIC,
  isuzu_end NUMERIC,
  merc_start NUMERIC,
  merc_end NUMERIC,
  iveco_start NUMERIC,
  iveco_end NUMERIC,
  
  -- MEDIA (stany liczników)
  elec_start NUMERIC,
  elec_end NUMERIC,
  gas_prod_start NUMERIC,
  gas_prod_end NUMERIC,
  gas_heat_start NUMERIC,
  gas_heat_end NUMERIC,
  water_start NUMERIC,
  water_end NUMERIC,
  
  -- INNE
  other_costs NUMERIC DEFAULT 0,
  
  -- WYDAJNOŚĆ / TONAŻ (jeśli pobierane ręcznie, nie z grafiku)
  ton_zd1 NUMERIC,
  ton_zd2 NUMERIC,
  ton_pralki NUMERIC,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

-- RLS i Polityki
ALTER TABLE public.cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_costs ENABLE ROW LEVEL SECURITY;

-- W tej aplikacji (wg pliku schema-react-auth.sql) mamy dostęp dla wszystkich zalogowanych (authenticated)
CREATE POLICY "Dostęp dla zalogowanych cost_settings" ON public.cost_settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Dostęp dla zalogowanych daily_costs" ON public.daily_costs FOR ALL TO authenticated USING (true);
