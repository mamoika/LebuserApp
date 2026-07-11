# LebuserApp

**What it is:** React + Supabase web app for managing delivery clients, routes, and drivers.

## Stack
- Frontend: React (`react-app/`), i18n in Polish (`pl.json`) and German (`de.json`) — no English locale.
- Backend: Supabase (RPC calls like `admin_reorder_clients`).

## Key Areas
- `ClientsRoutesView.jsx` — main clients/routes board (drag-and-drop reordering, print button).
- Route scheduling uses codes: daily / mwf / tth / other (see memory/glossary.md).
- Trolley (wózek) handling on deliveries: driver decides stay/return/exchange.

## Recent Work
- Added a print button + dedicated print CSS for the clients/routes list (2026-07-07).
- Friendlier network-error messages, fixed decimal parsing for other costs, searchable client picker.
