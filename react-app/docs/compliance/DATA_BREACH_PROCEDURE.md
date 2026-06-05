# Procedura Naruszeń Ochrony Danych

Status: template - adopt internally before production use.

## Cel

Zapewnić szybkie wykrycie, ocenę, udokumentowanie i zgłoszenie naruszeń ochrony
danych osobowych zgodnie z RODO. Jeśli naruszenie może powodować ryzyko dla
praw lub wolności osób, zgłoszenie do UODO powinno nastąpić bez zbędnej zwłoki,
w miarę możliwości nie później niż w ciągu 72 godzin od stwierdzenia naruszenia.

## Co Może Być Naruszeniem

- ujawnienie tokenu, hasła, backupu lub danych z bazy,
- dostęp osoby bez uprawnień do Supabase/GitHub/hostingu,
- błędne uprawnienia w aplikacji,
- utrata laptopa/telefonu z dostępem admina,
- wysłanie danych klienta/pracownika do złej osoby,
- publiczny dostęp do tabel lub backupów,
- złośliwy kod/XSS wykradający sesję użytkownika.

## Pierwsze 2 Godziny

1. Zabezpiecz system:
   - odetnij nieuprawniony dostęp,
   - zmień/wycofaj tokeny,
   - wyłącz podejrzane konto,
   - zachowaj logi.

2. Ustal zakres:
   - jakie dane,
   - ilu osób,
   - od kiedy,
   - kto mógł uzyskać dostęp,
   - czy dane zostały pobrane/skopiowane.

3. Powiadom osoby odpowiedzialne:
   - właściciel firmy/systemu:
   - osoba odpowiedzialna za RODO:
   - techniczny administrator:

## Ocena Ryzyka

Oceń, czy naruszenie może powodować ryzyko dla praw lub wolności osób:

- czy dane identyfikują osobę,
- czy obejmują lokalizację, pracę, rozliczenia, hasła lub dane kontaktowe,
- czy dane były zaszyfrowane lub zabezpieczone,
- czy osoba nieuprawniona mogła je realnie wykorzystać,
- czy naruszenie dotyczy pracowników, klientów lub wielu osób.

## Decyzja O Zgłoszeniu

- Jeśli ryzyko jest mało prawdopodobne: nie zgłaszać do UODO, ale wpisać do
  rejestru naruszeń z uzasadnieniem.
- Jeśli jest ryzyko: zgłosić do UODO w terminie do 72 godzin od stwierdzenia.
- Jeśli jest wysokie ryzyko dla osób: rozważyć poinformowanie osób, których
  dane dotyczą.

## Rejestr Naruszeń

Każde zdarzenie zapisuj w rejestrze:

- data i godzina wykrycia,
- kto wykrył,
- opis zdarzenia,
- kategorie danych,
- liczba osób,
- przyczyna,
- działania naprawcze,
- ocena ryzyka,
- decyzja o zgłoszeniu / braku zgłoszenia,
- data zamknięcia.

## Po Incydencie

- usuń przyczynę,
- zaktualizuj procedury,
- zmień uprawnienia lub architekturę,
- wykonaj krótkie podsumowanie i zachowaj dowody.
