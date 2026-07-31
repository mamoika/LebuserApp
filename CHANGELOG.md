# Changelog

Log istotnych zmian w projekcie (po ludzku). Najnowsze na górze.
Pełny, techniczny zapis każdej zmiany jest w historii Git (`git log`); tutaj
trzymamy czytelne podsumowania, w tym rzeczy spoza kodu (Vercel, Sentry, decyzje).

## 2026-07-31

### Ruchy kartonów według klientów (react-app)
- Przyjęcie, wydanie i przeniesienie asortymentu w kartonach wymagają wskazania
  klienta. Stan klienta jest widoczny bezpośrednio na kartonie oraz w historii.
- Wydanie jest kontrolowane na poziomie klienta, więc nie można wydać jego
  asortymentu kosztem stanu innego klienta znajdującego się w tym samym kartonie.
- Ogólny stan **Do rozłożenia** jest odseparowany od ruchów kartonów i można go
  zmieniać wyłącznie ręcznie przez **Ustaw stan**.

## 2026-07-28

### Wizualny magazyn ZD1 i ZD2 (react-app)
- Nowa zakładka **Magazyn** po Pralni: stan stref, dwa startowe kartony w ZD2,
  dodawanie kolejnych kartonów oraz historia wszystkich ruchów.
- Dostawy, wydania, transfery i ręczna inwentaryzacja są zapisywane w
  niezmiennym dzienniku z operatorem i czasem. System blokuje ujemne stany.
- Katalog asortymentu jest konfigurowalny. Można dodawać własne nazwy,
  kategorie i warianty rozmiarowe, np. ręczniki 50 x 100 cm i 70 x 140 cm.
- Migracja `db/migrations/warehouse_inventory.sql` została wdrożona w Supabase.

## 2026-06-28

### Odporność na nieświeże deploye (react-app)
- Auto-reload przy `vite:preloadError`: gdy po deployu komuś nie doładuje się
  leniwy chunk ("Importing a module script failed"), aplikacja robi cichy,
  jednorazowy reload zamiast pokazywać crash. Plik `src/lib/chunkReload.js`.

### Sentry — monitoring błędów frontendu (react-app)
- Commity: `5322890` (integracja), `35d1751` (source mapy / endpoint EU).
- Zakres: **tylko błędy** — bez Session Replay i bez tracingu; `sendDefaultPii:
  false` (RODO). Łapie też ciche awarie ładowania danych w `useAppData`.
- Kontekst zgłoszeń: id konta + login + rola (bez nazwiska/maila).
- Region **EU** (`de.sentry.io`), org `lebuser`, projekt `javascript-react`.
- CSP w `vercel.json`: dozwolone `https://*.sentry.io` w `connect-src`.
- Source mapy: upload przy buildzie, gdy w Vercel ustawione `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build env, token = Sensitive).
- Aktywacja: `VITE_SENTRY_DSN` w Vercel (**Production**) → prod-only; dev
  pozostaje wyciszony (DSN świadomie nie w `.env.local`).
- Nowy sub-procesor odnotowany w `docs/compliance/PROCESSORS_AND_TRANSFERS.md`.

### Sprzątanie repozytorium
- Commit `c3ca592`: nieużywane pliki przeniesione do `old/` (prototyp gatewaya
  `gateway/Lebuser.TunnelGateway/`, `dist_vercel.js`, `test_render.js`,
  skrypty z `react-app/`). Aktywny gateway to `Lebuser.TunnelGateway/` w roocie.
