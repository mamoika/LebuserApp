// Stałe 4 auta floty. `key` odpowiada kolumnie odczytu licznika w daily_costs:
// fiat_end / isuzu_end / merc_end / iveco_end.
export const VEHICLES = [
  { key: 'fiat',  label: 'Fiat' },
  { key: 'isuzu', label: 'Isuzu' },
  { key: 'merc',  label: 'Mercedes' },
  { key: 'iveco', label: 'Iveco' },
];

export const VEHICLE_LABELS = Object.fromEntries(VEHICLES.map(v => [v.key, v.label]));

// Kolumna w daily_costs z końcowym odczytem licznika danego auta
export function vehicleEndColumn(carKey) {
  return `${carKey}_end`;
}

// Klucz w app_settings, pod którym trzymamy przypisania domyślnych aut kierowców
export const DRIVER_CARS_KEY = 'driver_cars';
