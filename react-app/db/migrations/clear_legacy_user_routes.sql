-- Czyszczenie starych, statycznych przypisań tras z tabeli users (users.routes).
-- Źródłem prawdy dla przypisań kierowców jest plan tras (driver_route_plan_assignments) oraz kursy (driver_trips).

begin;

update public.users
set routes = null
where routes is not null;

commit;
