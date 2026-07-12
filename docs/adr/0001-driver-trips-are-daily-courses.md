# `driver_trips` pozostaje kursem dziennym

Istniejące rekordy `driver_trips` zachowujemy jako tożsamość kursu dziennego, a przystanki, zadania, odcinki i zdarzenia dokładamy jako powiązane encje. Nie tworzymy równoległej tabeli kursów, ponieważ rozdzieliłaby historię oraz rozliczenia istniejących tras; zmianę kierowcy lub auta zapisujemy jako zakończenie odcinka, nie zakończenie kursu.
