# Procedura Naruszeń Ochrony Danych

Status: prepared on 2026-06-28; adopt internally and assign named owners.

## Cel

Zapewnić szybkie wykrycie, ocenę, udokumentowanie i obsługę naruszeń ochrony
danych osobowych. Jeżeli naruszenie może powodować ryzyko naruszenia praw lub
wolności osób, zgłoszenie do UODO powinno nastąpić bez zbędnej zwłoki, w miarę
możliwości nie później niż w ciągu 72 godzin od stwierdzenia naruszenia.

## Role

| Rola | Osoba | Kontakt | Backup |
| --- | --- | --- | --- |
| Właściciel biznesowy | `[UZUPELNIC]` | `[UZUPELNIC]` | `[UZUPELNIC]` |
| Osoba odpowiedzialna za RODO | `[UZUPELNIC]` | `[UZUPELNIC]` | `[UZUPELNIC]` |
| Administrator techniczny | Rusłan Mamoika | r.mamoika@lebuser.pl | `[UZUPELNIC]` |
| Kontakt do hostingu/Supabase | `[UZUPELNIC]` | `[UZUPELNIC]` | `[UZUPELNIC]` |

## Co Może Być Naruszeniem

- ujawnienie tokenu, hasła, backupu lub danych z bazy,
- dostęp osoby bez uprawnień do Supabase/GitHub/hostingu/Sentry,
- błędne role w aplikacji lub nadmiarowy dostęp admina,
- utrata laptopa/telefonu z aktywną sesją admina,
- wysłanie danych klienta/pracownika do złej osoby,
- publiczny dostęp do tabel, backupów, logów albo env vars,
- złośliwy kod/XSS mogący wykradać sesję użytkownika,
- błędna migracja lub deploy pokazujący dane niewłaściwej roli.

## Pierwsze 2 Godziny

1. Otwórz wpis w `BREACH_REGISTER.md`.
2. Zabezpiecz system:
   - wycofaj podejrzane sesje w Admin -> Sesje,
   - wyłącz lub zmień role podejrzanych kont,
   - rotuj tokeny/env vars, jeśli mogły wyciec,
   - zablokuj dostęp byłych/nieuprawnionych osób,
   - zachowaj logi i dowody przed ich nadpisaniem.
3. Ustal zakres:
   - jakie systemy,
   - jakie dane,
   - ilu osób,
   - od kiedy,
   - kto mógł uzyskać dostęp,
   - czy dane zostały pobrane/skopiowane.
4. Powiadom role z tabeli powyżej.

## Pierwsze 24 Godziny

- Określ kategorię incydentu:
  - poufność: ktoś zobaczył dane bez uprawnień,
  - integralność: dane zmieniono/usunięto nieprawidłowo,
  - dostępność: dane lub system są niedostępne.
- Zbierz dowody:
  - daty i godziny,
  - konta i sesje,
  - zakres danych,
  - zrzuty ekranu/eksporty logów,
  - działania naprawcze.
- Oceń ryzyko dla osób:
  - czy dane identyfikują osobę,
  - czy dotyczą pracy, tras, lokalizacji, kosztów, kont lub haseł,
  - czy dane były zaszyfrowane/zahashowane,
  - czy osoba nieuprawniona mogła realnie je wykorzystać,
  - czy naruszenie dotyczy wielu osób albo danych pracowniczych.

## Decyzja O Zgłoszeniu

| Ocena | Działanie |
| --- | --- |
| Ryzyko mało prawdopodobne | Nie zgłaszać do UODO, ale udokumentować uzasadnienie w rejestrze. |
| Możliwe ryzyko dla praw lub wolności osób | Zgłosić do UODO bez zbędnej zwłoki, docelowo w ciągu 72h od stwierdzenia. |
| Wysokie ryzyko dla osób | Oprócz UODO rozważyć poinformowanie osób, których dane dotyczą. |

Decyzję podejmuje właściciel biznesowy z osobą odpowiedzialną za RODO. Jeżeli
brakuje informacji, wpisz w rejestrze, czego brakuje i kiedy zostanie ustalone.

## Minimalna Treść Wpisu / Zgłoszenia

- opis naruszenia,
- data i godzina wykrycia oraz stwierdzenia,
- kategorie i przybliżona liczba osób,
- kategorie i przybliżona liczba rekordów,
- możliwe konsekwencje,
- działania podjęte lub proponowane,
- osoba kontaktowa,
- uzasadnienie zgłoszenia albo braku zgłoszenia.

## Po Incydencie

- usuń przyczynę,
- zmień uprawnienia lub architekturę,
- zrotuj sekrety, jeśli dotyczy,
- wykonaj test potwierdzający,
- zaktualizuj procedury/checklisty,
- zamknij wpis w rejestrze z datą i wnioskami.

## Gdzie Trzymać Dowody

Dowody trzymaj w kontrolowanym miejscu firmowym, nie w publicznym repo. W repo
może zostać tylko zanonimizowany wpis lub numer sprawy, bez danych osobowych i
bez sekretów.
