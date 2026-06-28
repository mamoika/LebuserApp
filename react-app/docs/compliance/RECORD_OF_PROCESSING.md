# Rejestr Czynności Przetwarzania - LEBUSER App

Status: prepared on 2026-06-28; controller identified (KRS 0000648492), legal
bases still require approval. Review at least quarterly and after every new app
module/provider.

Administrator danych: LEBUSER TEXTILSERVICE Sp. z o.o., ul. Owcza 10, 66-400 Gorzów Wielkopolski (KRS 0000648492, NIP 9271945131, REGON 365910038)
Osoba odpowiedzialna za aktualizację rejestru: Rusłan Mamoika

## 1. Organizacja Logistyki, Tras I Dostaw

- Cel: planowanie tras, odbiorów, dostaw, pracy kierowców i obsługi punktów.
- Kategorie osób: kierowcy, pracownicy, administratorzy, kontakty klientów B2B.
- Kategorie danych: imię i nazwisko, login, rola, trasy, klient/punkt, adres
  lub GPS punktu, wpisy odbioru/dostawy, wagi, kosze, dokumenty przyjęcia,
  notatki operacyjne, statusy tras, auto, licznik.
- Podstawa prawna (propozycja, do potwierdzenia): art. 6 ust. 1 lit. f RODO -
  uzasadniony interes: organizacja i realizacja usług logistycznych; oraz
  lit. b w zakresie wykonania umów z klientami/kontrahentami B2B.
- Odbiorcy: uprawnieni użytkownicy aplikacji, administratorzy, dostawcy
  techniczni z `PROCESSORS_AND_TRANSFERS.md`.
- Retencja: patrz `RETENTION_POLICY.md`.
- Zabezpieczenia: role aplikacji, session-token RPC, ograniczone zapisy i
  odczyty do bazy, brak jawnych tokenów w UI, backup/restore test.

## 2. Zarządzanie Pracownikami, Grafikami I Zespołami

- Cel: organizacja czasu pracy, obsada stanowisk, planowanie zespołów,
  historia zmian.
- Kategorie osób: pracownicy, kierowcy, osoby zarządzające.
- Kategorie danych: imię i nazwisko, grupa, aktywność w miesiącu, harmonogram,
  rodzaj umowy, godziny/zmiany, role w aplikacji.
- Podstawa prawna (propozycja, do potwierdzenia): art. 6 ust. 1 lit. c RODO w
  zw. z obowiązkami pracodawcy (m.in. Kodeks pracy, ewidencja czasu pracy);
  oraz lit. f - uzasadniony interes organizacji pracy i obsady zespołów.
- Odbiorcy: uprawnieni administratorzy, osoby z rolą viewer/admin viewer,
  dostawcy techniczni.
- Retencja: patrz `RETENTION_POLICY.md`.
- Zabezpieczenia: role admin/viewer, kontrola dostępu, logi działań.

## 3. Konta Użytkowników, Sesje I Bezpieczeństwo

- Cel: logowanie, nadawanie uprawnień, kontrola dostępu, wykrywanie nadużyć,
  audyt działań i wsparcie użytkowników.
- Kategorie osób: użytkownicy aplikacji, administratorzy.
- Kategorie danych: login, imię i nazwisko, rola, hash hasła, hash tokenu
  sesji, data utworzenia/wygasania sesji, etykieta urządzenia, status
  revokowania, logi działań, status potwierdzenia informacji RODO.
- Podstawa prawna (propozycja, do potwierdzenia): art. 6 ust. 1 lit. f RODO -
  uzasadniony interes: bezpieczeństwo aplikacji, kontrola dostępu, audyt i
  wykrywanie nadużyć; ewentualnie lit. c przy obowiązkach prawnych.
- Odbiorcy: administratorzy systemu, dostawcy techniczni.
- Retencja: sesje według `SESSION_PRUNING_POLICY.md`; logi według
  `RETENTION_POLICY.md`.
- Zabezpieczenia: hashe haseł i tokenów, limit aktywnych sesji, ręczne
  revokowanie sesji, admin-only RPC, 2FA u dostawców.

## 4. Koszty Operacyjne I Rozliczenia Wewnętrzne

- Cel: analiza kosztu/kg, paliwo, energia, woda, gaz, koszty pracowników,
  rozliczenia zarządcze.
- Kategorie osób: pracownicy, kierowcy, osoby zarządzające kosztami.
- Kategorie danych: wpisy kosztów dziennych, ustawienia stawek, grafik pracy,
  tonaż, dane pojazdów, zużycia mediów.
- Podstawa prawna (propozycja, do potwierdzenia): art. 6 ust. 1 lit. c RODO -
  obowiązki księgowe i podatkowe (m.in. ustawa o rachunkowości, przepisy
  podatkowe); oraz lit. f - wewnętrzne rozliczenia i analiza kosztów.
- Odbiorcy: administratorzy, osoby uprawnione do wglądu, dostawcy techniczni.
- Retencja: patrz `RETENTION_POLICY.md`; okres księgowy potwierdzić z
  księgowością.
- Zabezpieczenia: zapisy kosztów tylko przez admin RPC, role aplikacji.

## 5. Monitoring Błędów I Utrzymanie Systemu

- Cel: diagnoza awarii, zapewnienie ciągłości działania, bezpieczeństwo
  techniczne.
- Kategorie osób: użytkownicy aplikacji, administratorzy.
- Kategorie danych: identyfikator konta, login, rola, URL widoku, komunikat
  błędu, stack trace, przeglądarka/OS; bez Session Replay i bez domyślnego PII.
- Podstawa prawna (propozycja, do potwierdzenia): art. 6 ust. 1 lit. f RODO -
  uzasadniony interes: utrzymanie, diagnostyka i bezpieczeństwo techniczne
  systemu.
- Odbiorcy: administratorzy techniczni, dostawca monitoringu jeśli włączony.
- Retencja: według ustawień dostawcy; docelowo <= 90 dni dla zdarzeń
  technicznych, chyba że incydent wymaga dłuższej dokumentacji.
- Zabezpieczenia: `sendDefaultPii: false`, brak screen/DOM recording,
  minimalizacja danych w zdarzeniach.

## 6. Backup, Audyt I Ciągłość Działania

- Cel: odtworzenie danych po awarii, dowody techniczne, audyt bezpieczeństwa.
- Kategorie osób: wszyscy, których dane znajdują się w bazie lub logach.
- Kategorie danych: kopie danych aplikacji, logi migracji, wyniki testów
  restore, dokumentacja dostępu.
- Podstawa prawna (propozycja, do potwierdzenia): art. 6 ust. 1 lit. f RODO -
  uzasadniony interes: ciągłość działania i bezpieczeństwo; oraz lit. c w
  zakresie prawnych obowiązków przechowywania danych.
- Odbiorcy: administratorzy techniczni, dostawcy hostingu/bazy/backupu.
- Retencja: backupy według `RETENTION_POLICY.md` i ustawień dostawców.
- Zabezpieczenia: ograniczony dostęp, test restore, dokumentowanie eksportów.

## Open Items

- Potwierdzić podstawę prawną dla każdej czynności.
- Potwierdzić, czy dane pracownicze wymagają dodatkowych odniesień do prawa
  pracy lub dokumentacji kadrowej.
- Potwierdzić listę podmiotów przetwarzających i transferów.
- Potwierdzić okresy retencji i wdrożyć automatyzację czyszczenia.
- Ocenić DPIA przed dodaniem live-trackingu lub historii lokalizacji osób.
