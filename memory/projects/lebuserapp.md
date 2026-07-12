# LebuserApp

**What it is:** React + Supabase web app for managing delivery clients, routes, and drivers.

## Stack
- Frontend: React (`react-app/`), i18n in Polish (`pl.json`) and German (`de.json`) — no English locale.
- Backend: Supabase (RPC calls like `admin_reorder_clients`).

## Key Areas
- `ClientsRoutesView.jsx` — main clients/routes board (drag-and-drop reordering, print button).
- Route scheduling uses codes: daily / mwf / tth / other (see memory/glossary.md).
- Trolley (wózek) handling on deliveries: driver decides stay/return/exchange.

## Workflow
- Po każdej gotowej paczce zmian: commit + push na `main` automatycznie (preferencja Ruslana, 2026-07-12).

## Recent Work
- Historia kursów kierowcy: filtr miesiąca, synchronizacja godzin z grafikiem (bez statusu „zaplanowane” / I).
- Dzień operacyjny (weekend = piątek), wznawianie kursu w fazie planowania (2026-07-12).
- Friendlier network-error messages, fixed decimal parsing for other costs, searchable client picker.
