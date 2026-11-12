# Agent Instructions — LebuserApp

## Developer & Context
- Solo developer: Ruslan Mamoika
- Project: **LebuserApp** (React + Supabase for managing laundry delivery routes, clients, drivers, and financial costs).

## Core Principles & Rules

### 1. Obowiązkowa dwujęzyczność (PL + DE jednocześnie)
- Aplikacja posiada wyłącznie dwie wersje językowe: **język polski** oraz **język niemiecki**.
- **Żelazna zasada**: Przy **KAŻDEJ** modyfikacji lub dodaniu tekstu w UI (etykieta, nagłówek, podtytuł, treść przycisku, powiadomienie toast, komunikat błędu, legenda wykresu, tooltip) **ZAWSZE i JEDNOCZEŚNIE** aktualizujemy OBA pliki lokalizacyjne:
  - `react-app/src/i18n/locales/pl.json`
  - `react-app/src/i18n/locales/de.json`
- **Zakaz hardkodowania stringów tekstowych w JSX**: Wszystkie widoczne teksty muszą pochodzić z `useTranslation()` (`t('costs.key')` itp.).

### 2. Apple Design System (Apple HIG)
- Czysta, elegancka typografia Apple (SF Pro / system fonts).
- Zbalansowane kafelki z subtelnymi promieniami zaokrągleń (`border-radius: 18px` / `12px`), delikatne tła, spójne obramowania (`rgba(0,0,0,0.06)`).
- `tabular-nums` dla wszystkich wartości liczbowych, procentów i walut.
- Brak pustych przestrzeni, zawijających się etykiet czy zniekształconych plakietek.

### 3. Weryfikacja jakości
Przed każdym zatwierdzeniem zmian należy uruchomić i potwierdzić:
1. `npm run lint` w `react-app/`
2. Testy jednostkowe: `node --test src/lib/*.test.js` oraz dedykowane testy komponentów
3. Kontrola własności DOM: `node scripts/check-dom-ownership.mjs`
4. Build produkcyjny: `npm run build` w `react-app/`

### 4. Workflow Git
- Po ukończeniu spójnej paczki zmian: automatyczny commit.
