# Klauzula Informacyjna RODO - LEBUSER App

Status: ready for controller review. Version to publish in the app/company
records: `privacy_notice_v1`.

## 1. Administrator Danych

Administratorem danych osobowych jest:

- Nazwa firmy: LEBUSER TEXTILSERVICE Sp. z o.o.
- Adres: ul. Owcza 10, 66-400 Gorzów Wielkopolski, woj. lubuskie
- KRS: 0000648492, NIP: 9271945131, REGON: 365910038
- Email kontaktowy: info@lebuser.pl
- Osoba odpowiedzialna za aplikację i sprawy danych w projekcie: Rusłan Mamoika

## 2. Kogo Dotyczy Informacja

Informacja dotyczy użytkowników aplikacji LEBUSER, w szczególności:

- administratorów i osób zarządzających operacjami,
- kierowców i pracowników korzystających z aplikacji,
- osób, których dane pojawiają się w grafiku, kosztach lub historii działań,
- kontaktów klientów B2B, jeżeli ich dane są wpisywane do aplikacji.

## 3. Kategorie Danych

Aplikacja może przetwarzać:

- dane konta: login, imię i nazwisko, rola, język, status hasła,
- dane uprawnień: role, przypisane trasy, domyślne auto, aktywność konta,
- dane sesji i bezpieczeństwa: daty sesji, etykieta urządzenia, hash tokenu,
  data ostatniej aktywności, status revokowania,
- dane operacyjne: wpisy odbioru/dostawy, statusy, wagi, kosze, dokumenty
  przyjęcia, przekazania tras,
- dane tras: kierowca, auto, licznik, data, status, planowany start,
- dane klientów/punktów: nazwa, adres lub lokalizacja GPS punktu,
  przypisana trasa, notatki operacyjne,
- dane grafików i pracowników: grupa, aktywność w miesiącu, godziny/zmiany,
  rodzaj umowy, plan pracy,
- dane kosztowe: wpisy kosztów operacyjnych, stawki, zużycia mediów,
- logi działań: kto wykonał akcję, kiedy, czego dotyczyła.

Hasła i tokeny sesji nie są przechowywane w postaci jawnej. W bazie
przechowywane są hashe.

## 4. Cele Przetwarzania

Dane są przetwarzane w celu:

- planowania i realizacji odbiorów oraz dostaw,
- organizacji pracy kierowców i pracowników,
- prowadzenia historii tras i operacji,
- rozliczania kosztów wewnętrznych,
- obsługi klientów i punktów odbioru/dostawy,
- kontroli dostępu, bezpieczeństwa aplikacji i audytu działań,
- obsługi błędów technicznych i utrzymania ciągłości działania.

## 5. Podstawy Prawne

Do potwierdzenia przez administratora danych. Typowe podstawy do rozważenia:

- art. 6 ust. 1 lit. b RODO - wykonanie umowy lub działania przed jej
  zawarciem, jeżeli dane dotyczą współpracowników/kontrahentów,
- art. 6 ust. 1 lit. c RODO - obowiązek prawny, jeżeli dane są potrzebne do
  dokumentacji pracowniczej, księgowej lub podatkowej,
- art. 6 ust. 1 lit. f RODO - prawnie uzasadniony interes administratora,
  np. organizacja pracy, bezpieczeństwo systemu, dochodzenie roszczeń,
  wykrywanie błędów i nadużyć.

Jeżeli administrator przetwarza dane pracowników, podstawy i zakres należy
uzgodnić z dokumentacją kadrową i przepisami prawa pracy.

## 6. Odbiorcy I Podmioty Przetwarzające

Dane mogą być dostępne dla:

- uprawnionych użytkowników aplikacji zgodnie z rolą,
- administratorów systemu,
- dostawców technicznych działających na polecenie administratora.

Aktualna lista dostawców i status umów powierzenia jest prowadzona w
`PROCESSORS_AND_TRANSFERS.md`.

## 7. Transfer Poza EOG

Administrator powinien potwierdzić regiony i mechanizmy transferu dla każdego
dostawcy. Jeżeli dostawca albo jego podprocesor przetwarza dane poza EOG,
należy wskazać podstawę transferu, np. decyzję adekwatności albo standardowe
klauzule umowne.

## 8. Okres Przechowywania

Okresy retencji określa `RETENTION_POLICY.md`. Co do zasady dane są
przechowywane tylko tak długo, jak jest to potrzebne do realizacji procesów
logistycznych, obowiązków prawnych, bezpieczeństwa, rozliczeń albo obrony
roszczeń.

## 9. Prawa Osób

Osoba, której dane dotyczą, ma prawo:

- dostępu do danych,
- sprostowania danych,
- usunięcia danych, jeżeli nie ma podstawy do dalszego przetwarzania,
- ograniczenia przetwarzania,
- sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie,
- przenoszenia danych, gdy ma zastosowanie,
- wniesienia skargi do Prezesa UODO.

Żądania należy kierować na adres: info@lebuser.pl.

## 10. Zautomatyzowane Decyzje

Aplikacja nie podejmuje zautomatyzowanych decyzji wywołujących skutki prawne
wobec osób ani podobnie istotnie na nie wpływających. Jeśli w przyszłości
pojawią się oceny, scoring lub profilowanie, ten punkt trzeba zaktualizować.

## 11. Potwierdzenie W Aplikacji

Aplikacja wyświetla użytkownikom skróconą informację RODO po zalogowaniu i
zapisuje potwierdzenie wersji `privacy_notice_v1`. Przy istotnej zmianie tej
klauzuli należy:

1. zaktualizować treść,
2. zmienić `PRIVACY_NOTICE_VERSION` w `src/context/AuthContext.jsx`,
3. wdrożyć aplikację,
4. zachować datę wdrożenia i treść wersji w dokumentacji firmy.
