-- Migration to change meter reading columns from numeric to text
-- This allows users to preserve leading zeros when entering data (e.g. "05845" instead of "5845")

ALTER TABLE daily_costs
  ALTER COLUMN elec_end TYPE text,
  ALTER COLUMN water_end TYPE text,
  ALTER COLUMN gas_prod_end TYPE text,
  ALTER COLUMN gas_heat_end TYPE text,
  ALTER COLUMN fiat_end TYPE text,
  ALTER COLUMN isuzu_end TYPE text,
  ALTER COLUMN merc_end TYPE text,
  ALTER COLUMN iveco_end TYPE text;
