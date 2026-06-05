# Rejestr Czynności Przetwarzania - LEBUSER App

Status: template - fill and maintain.

## 1. Organizacja Logistyki I Dostaw

- Cel: planowanie tras, dostaw, odbiorów i obsługi klientów.
- Kategorie osób: pracownicy, kierowcy, osoby kontaktowe klientów, klienci B2B.
- Kategorie danych: imię i nazwisko, login, rola, trasy, klient/punkt, GPS
  punktu klienta, wpisy odbioru/dostawy, wagi, kosze, notatki operacyjne.
- Podstawa prawna: do uzupełnienia.
- Odbiorcy: Supabase, hosting, uprawnieni użytkownicy aplikacji.
- Retencja: patrz `RETENTION_POLICY.md`.
- Zabezpieczenia: role aplikacji, session-token RPC, ograniczone zapisy do
  bazy, CSP, 2FA dla administratorów, backupy dostawców.

## 2. Zarządzanie Pracownikami I Grafikiem

- Cel: organizacja czasu pracy, obsada stanowisk, planowanie zespołów.
- Kategorie osób: pracownicy i kierowcy.
- Kategorie danych: imię i nazwisko, grupa, harmonogram, role, wpisy czasu.
- Podstawa prawna: do uzupełnienia.
- Odbiorcy: uprawnieni administratorzy, dostawcy techniczni.
- Retencja: patrz `RETENTION_POLICY.md`.
- Zabezpieczenia: role admin/viewer, kontrola dostępu, logi działań.

## 3. Konta Użytkowników I Bezpieczeństwo

- Cel: logowanie, nadawanie uprawnień, wykrywanie nadużyć, audyt działań.
- Kategorie osób: użytkownicy aplikacji.
- Kategorie danych: login, imię i nazwisko, rola, hash hasła, session token
  hash, logi działań, daty sesji.
- Podstawa prawna: do uzupełnienia.
- Odbiorcy: administratorzy systemu, dostawcy techniczni.
- Retencja: patrz `RETENTION_POLICY.md`.
- Zabezpieczenia: hasła hashowane w bazie, tokeny sesji hashowane w bazie,
  brak direct write z przeglądarki do głównych tabel, 2FA u dostawców.

## 4. Koszty Operacyjne

- Cel: rozliczenia wewnętrzne, analiza kosztu/kg, paliwo, energia, woda,
  koszty pracowników.
- Kategorie osób: pracownicy, osoby zarządzające kosztami.
- Kategorie danych: wpisy kosztów dziennych, ustawienia stawek, grafiki
  pracowników, tonaż.
- Podstawa prawna: do uzupełnienia.
- Odbiorcy: administratorzy, osoby uprawnione do wglądu.
- Retencja: patrz `RETENTION_POLICY.md`.
- Zabezpieczenia: zapisy kosztów tylko przez admin RPC.

## Open Items

- Potwierdzić podstawy prawne dla każdego celu.
- Potwierdzić okresy retencji.
- Potwierdzić listę podmiotów przetwarzających i regiony danych.
- Ocenić, czy jakikolwiek moduł wymaga DPIA.
