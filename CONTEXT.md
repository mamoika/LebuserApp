# Operacje pralni i transportu

Słownik pojęć używanych w planowaniu, realizacji i rozliczaniu transportu oraz czasu pracy.

## Kursy

**Szablon trasy**:
Stały wzorzec kolejności klientów, z którego można utworzyć kurs dzienny.
_Unikaj_: Trasa wirtualna

**Kurs dzienny**:
Konkretna realizacja transportu w określonym dniu, zachowująca tożsamość mimo zmiany kierowcy lub auta.
_Unikaj_: Sesja trasy, przejazd auta

**Przystanek**:
Wizyta u klienta w określonej pozycji kursu dziennego.

**Zadanie kursu**:
Jedna czynność do wykonania na przystanku, na przykład dostawa czystego prania albo odbiór brudnego.
_Unikaj_: Wpis, akcja

**Załadunek kursu**:
Fizyczne odebranie przez kierowcę gotowego i spakowanego czystego prania z pralni przed rozpoczęciem przejazdu. Dopiero załadowane pranie tworzy dostawę w kursie.
_Unikaj_: Dodanie czystego do trasy

**Punkt tylko po brudne**:
Planowany przystanek u klienta bez dostawy czystego prania, dodany po to, aby kierowca zarejestrował na miejscu odbiór brudnego.
_Unikaj_: Pusty przystanek

**Plan obsługi klienta**:
Zestaw cyklicznych reguł określających, w jakie dni klient powinien zostać uwzględniony w planie transportu.
_Unikaj_: Grafik klienta, harmonogram wpisów

**Reguła wizyty**:
Jedna powtarzalna zasada planu obsługi klienta, wskazująca dzień tygodnia, częstotliwość oraz tydzień początkowy cyklu.
_Unikaj_: Termin klienta

**Zarchiwizowany punkt klienta**:
Punkt wyłączony z bieżących tras i nowych planów, którego wcześniejsze wpisy oraz historia pozostają dostępne.
_Unikaj_: Usunięty klient

**Odcinek kursu**:
Część kursu dziennego wykonywana bez zmiany kierowcy i auta. Zmiana kierowcy lub auta zamyka bieżący odcinek i otwiera następny.
_Unikaj_: Nowy kurs

**Zdarzenie kursu**:
Niezmienny fakt w dzienniku kursu opisujący zmianę stanu, wykonanie zadania, problem, zmianę auta lub przekazanie kierowcy.

**Rozliczenie kursu**:
Zestaw zgłoszonych kilometrów i godzin pracy wymagających niezależnych decyzji administratora.

## Czas pracy

**Zgłoszenie czasu pracy**:
Deklaracja pracownika dotycząca początku i końca pracy w konkretnym dniu, oczekująca na decyzję administratora.

**Zatwierdzenie czasu pracy**:
Decyzja administratora, która uznaje wskazany zakres godzin za obowiązujący zapis w grafiku.

**Zdarzenie weryfikacji czasu pracy**:
Niezmienny fakt opisujący zgłoszenie, zatwierdzenie albo odrzucenie czasu pracy wraz z osobą, czasem i wartościami użytymi w tej czynności.

## Audyt

**Log aktywności**:
Przekrojowy zapis czynności wykonanej w aplikacji, służący do wyszukiwania i kontroli operacyjnej. Nie zastępuje historii właściwej dla danego procesu.
