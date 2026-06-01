// Error handling moved to the top of the file

const TRANSLATIONS = {
  PL: {
    app_title: "Harmonogram",
    app_subtitle: "LEBUSER Textilservice Sp. z o.o. — Zarządzanie logistyką",
    admin_btn: "🔒 Administrator",
    admin_btn_out: "🔓 Wyloguj",
    admin_banner: "Tryb administratora aktywny",
    driver_select_title: "Kim jesteś?",
    driver_select_desc: "Wybierz swoje imię z listy poniżej, aby rozpocząć pracę.",
    btn_select_driver: "Wybierz kierowcę",
    driver_btn_out: "Wyloguj się",
    login_desc_ap: "Wpisz hasło, aby uzyskać pełny dostęp do systemu.",
    nav_harmonogram: "Harmonogram",
    nav_historia: "Historia",
    nav_klienci: "Klienci i Trasy",
    nav_mapa: "Mapa",
    nav_grafik: "Grafik Załogi",
    nav_edytor: "Grafik",
    nav_timeline: "Oś Czasu",
    day_0: "Poniedziałek",
    day_1: "Wtorek",
    day_2: "Środa",
    day_3: "Czwartek",
    day_4: "Piątek",
    day_short_0: "Pn",
    day_short_1: "Wt",
    day_short_2: "Śr",
    day_short_3: "Cz",
    day_short_4: "Pt",
    modal_add_title: "Dodaj przyjazd",
    modal_edit_title: "Edytuj wpis",
    modal_view_title: "Szczegóły zamówienia",
    label_client: "Klient",
    label_type: "Rodzaj prania",
    label_weight: "Waga (kg) — opcjonalnie",
    label_arr_day: "Dzień przyjazdu",
    label_pick_day: "Dzień odbioru",
    label_pick_week: "Tydzień odbioru",
    label_status: "Status",
    label_weight_simple: "Waga",
    label_added_by: "Przywiózł",
    label_added_at: "Wpisano",
    label_picked_by: "Odebrał",
    label_picked_at: "Odebrano",
    type_p: "Pościel",
    type_o: "Obrusy",
    week_same: "Ten sam tydzień",
    week_next: "Następny tydzień",
    week_next_suffix: " (nast. tydzień)",
    btn_cancel: "Anuluj",
    btn_close: "Zamknij",
    btn_add: "Dodaj",
    btn_save: "Zapisz",
    btn_delete: "Usuń",
    btn_delete_route: "Usuń trasę",
    btn_mark_done: "Oznacz jako odebrane",
    btn_mark_undone: "Cofnij odbiór",
    status_done: "✓ Odebrane",
    status_pending: "⏳ Oczekuje",
    grid_arrival: "Przyjazd",
    grid_wash: "Do prania",
    grid_arrived_sec: "↓ Przyjechało",
    grid_pickup_sec: "↑ Do odbioru",
    grid_add_btn: "+ dodaj zamówienie",
    grid_today: "Dziś",
    grid_next_week_pfx: "Następny: ",
    toast_added: "Dodano: ",
    toast_saved: "Zapisano",
    toast_deleted: "Usunięto",
    toast_weight_error: "Waga musi być liczbą większą od 0",
    login_title: "🔐 Logowanie administratora",
    login_pass: "Hasło administratora",
    placeholder_write_pass: "Wpisz hasło…",
    login_btn: "Zaloguj",
    hist_title: "Tydzień od ",
    hist_empty: "Brak historii",
    loading: "Ładowanie…",
    tl_select_week: "— wybierz tydzień —",
    tl_refresh: "Odśwież listę",
    tl_click_hint: "Kliknij komórkę → przypisz stanowisko",
    tl_choose_week_loader: "Wybierz tydzień z listy",
    nav_help: "Instrukcja",
    leg_intro: "Wybierz kartę na liście w zakładce Harmonogram, aby zobaczyć szczegóły zamówienia lub oznaczyć odbiór.",
    leg_arr: "Dostarczone",
    leg_pick: "Do odbioru",
    leg_done: "Odebrane",
    tl_stats_title: "📊 Statystyki dnia",
    grafik_load: "Załaduj",
    grafik_click_hint: "Kliknij komórkę aby zmienić status",
    legend_title: "LEGENDA:",
    legend_i: "zaplanowany",
    legend_w: "wolne",
    legend_uw: "urlop",
    legend_l4: "choroba",
    legend_nn: "nieobecny",
    legend_godz: "godz. pracy",
    legend_plus: "start+godz.",
    grafik_choose_month_loader: "Wybierz miesiąc i kliknij Załaduj",

    btn_new_route: "Nowa trasa",
    clients_drag_hint: "Przeciągaj klientów między trasami",
    gps_has: "ma GPS",
    gps_no: "brak GPS",
    modal_new_route_title: "Nowa trasa",
    label_route_name: "Nazwa trasy",
    placeholder_route_ex: "np. Trasa Północna",
    modal_edit_route_title: "Edytuj trasę",
    placeholder_write_name: "Wpisz nazwę…",
    modal_new_client_title: "Nowy klient",
    label_client_name_new: "Nazwa hotelu / firmy",
    label_default_route: "Stała trasa logistyczna",
    modal_edit_client_title: "Edytuj klienta",
    label_client_name: "Nazwa klienta",
    label_route: "Trasa logistyczna",
    gps_coords: "Współrzędne GPS",
    gps_lat: "Szerokość (Lat)",
    gps_lng: "Długość (Lng)",
    btn_delete_client: "Usuń z bazy",
    station_title: "Stanowisko",
    station_tunnel: "Tunnel",
    station_folder: "Składarka",
    station_ironer: "Magiel",
    station_shaker: "Roztrzep.",
    station_washing: "Pranie",
    station_pressing: "Prasowanie",
    station_sewing: "Szycie",
    station_reception: "Punkt przyj.",
    station_cleaning: "Sprzątanie",
    station_marking: "Oznakowanie",
    station_packing: "Pakowanie",
    station_dispatch: "Spedycja",
    station_driver: "Kierowca",
    cp_clear: "Wyczyść",
    cp_hours_label: "Godziny / Format niestandardowy",
    cp_hours_placeholder: "np. 8 lub 7+8 lub 7,5",
    status_title: "Status",
    btn_refresh: "Odśwież",
    btn_locate: "Moja pozycja",
    map_hint: "Kliknij trasę w legendzie, aby ją ukryć/pokazać. Klienci bez GPS nie pojawiają się na mapie.",
    gfp_title: "📊 Plik grafiku:",
    gfp_change_btn: "Zmień plik",
    gfp_instructions_1: "Wklej URL lub ID nowego pliku Google Sheets z grafikiem na bieżący miesiąc.",
    gfp_instructions_2: "Plik musi zawierać arkusz o nazwie Grafik (miesięczny) i arkusze W1, W2… (tygodniowe).",
    gfp_placeholder: "https://docs.google.com/spreadsheets/d/... lub samo ID",
    gfp_connect_btn: "Podłącz",
    toast_creating: "Tworzenie…",
    toast_route_added: "Dodano trasę",
    toast_route_name_empty: "Nazwa trasy nie może być pusta",
    toast_add_client_first: "Najpierw dodaj klienta",
    admin_mode_title: "🔓 Tryb administratora",
    admin_session_active: "Sesja aktywna. Czas pozostały: ",
    admin_stay: "Zostań",
    btn_logout: "Wyloguj",
    loading_grafik_file: "Łączenie z plikiem grafiku…",
    error_label: "Błąd",
    loading_timeline: "Ładowanie osi czasu…",
    loading_grafik: "Ładowanie grafiku…"
  },
  DE: {
    app_title: "Zeitplan",
    app_subtitle: "LEBUSER Textilservice Sp. z o.o. — Logistikmanagement",
    admin_btn: "🔒 Administrator",
    admin_btn_out: "🔓 Ausloggen",
    admin_banner: "Administrator-Modus aktiv",
    driver_select_title: "Wer bist du?",
    driver_select_desc: "Bitte wähle deinen Namen aus der Liste.",
    btn_select_driver: "Fahrer wählen",
    driver_btn_out: "Fahrer wechseln",
    login_desc_ap: "Passwort eingeben für vollen Systemzugriff.",
    nav_harmonogram: "Zeitplan",
    nav_historia: "Verlauf",
    nav_klienci: "Kunden & Routen",
    nav_mapa: "Karte",
    nav_grafik: "Dienstplan",
    nav_edytor: "Plan",
    nav_timeline: "Zeitachse",
    day_0: "Montag",
    day_1: "Dienstag",
    day_2: "Mittwoch",
    day_3: "Donnerstag",
    day_4: "Freitag",
    day_short_0: "Mo",
    day_short_1: "Di",
    day_short_2: "Mi",
    day_short_3: "Do",
    day_short_4: "Fr",
    modal_add_title: "Ankunft hinzufügen",
    modal_edit_title: "Eintrag bearbeiten",
    modal_view_title: "Auftragsdetails",
    label_client: "Kunde",
    label_type: "Wäscheart",
    label_weight: "Gewicht (kg) — optional",
    label_arr_day: "Ankunftstag",
    label_pick_day: "Abholtag",
    label_pick_week: "Abholwoche",
    label_status: "Status",
    label_weight_simple: "Gewicht",
    label_added_by: "Gebracht von",
    label_added_at: "Eingetragen",
    label_picked_by: "Abgeholt von",
    label_picked_at: "Abgeholt am",
    type_p: "Bettwäsche",
    type_o: "Tischdecken",
    week_same: "Gleiche Woche",
    week_next: "Nächste Woche",
    week_next_suffix: " (nächste Woche)",
    btn_cancel: "Abbrechen",
    btn_close: "Schließen",
    btn_add: "Hinzufügen",
    btn_save: "Speichern",
    btn_delete: "Löschen",
    btn_delete_route: "Route löschen",
    btn_mark_done: "Als abgeholt markieren",
    btn_mark_undone: "Abholung zurücksetzen",
    status_done: "✓ Abgeholt",
    status_pending: "⏳ Wartend",
    grid_arrival: "Ankunft",
    grid_wash: "Zum Waschen",
    grid_arrived_sec: "↓ Angekommen",
    grid_pickup_sec: "↑ Abholung",
    grid_add_btn: "+ Auftrag hinzufügen",
    grid_today: "Heute",
    grid_next_week_pfx: "Nächster: ",
    toast_added: "Hinzugefügt: ",
    toast_saved: "Gespeichert",
    toast_deleted: "Gelöscht",
    toast_weight_error: "Das Gewicht muss eine Zahl größer als 0 sein",
    login_title: "🔐 Administrator-Login",
    login_pass: "Admin-Passwort",
    placeholder_write_pass: "Passwort eingeben…",
    login_btn: "Einloggen",
    hist_title: "Woche ab ",
    hist_empty: "Kein Verlauf vorhanden",
    loading: "Laden…",
    tl_select_week: "— Woche auswählen —",
    leg_intro: "Klicken Sie auf eine Karte im Tab 'Zeitplan', um Bestelldetails anzuzeigen oder die Abholung zu markieren.",
    leg_arr: "Geliefert",
    leg_pick: "Abzuholen",
    leg_done: "Abgeholt",
    tl_refresh: "Liste aktualisieren",
    tl_click_hint: "Zelle anklicken → Position zuweisen",
    tl_choose_week_loader: "Wählen Sie eine Woche aus der Liste aus",
    tl_stats_title: "📊 Tagesstatistik",
    grafik_load: "Laden",
    grafik_click_hint: "Zelle anklicken um Status zu ändern",
    legend_title: "LEGENDE:",
    legend_i: "geplant",
    legend_w: "frei",
    legend_uw: "Urlaub",
    legend_l4: "Krankheit",
    legend_nn: "unentschuldigt",
    legend_godz: "Arbeitsstunden",
    legend_plus: "Start + Std.",
    grafik_choose_month_loader: "Monat auswählen und Laden anklicken",

    btn_new_route: "Neue Route",
    clients_drag_hint: "Kunden zwischen Routen verschieben (ziehen)",
    gps_has: "mit GPS",
    gps_no: "kein GPS",
    modal_new_route_title: "Neue Route",
    label_route_name: "Routenname",
    placeholder_route_ex: "z.B. Nordroute",
    modal_edit_route_title: "Route bearbeiten",
    placeholder_write_name: "Namen eingeben...",
    modal_new_client_title: "Neuer Kunde",
    label_client_name_new: "Hotel- / Firmenname",
    label_default_route: "Feste Logistikroute",
    modal_edit_client_title: "Kunde bearbeiten",
    label_client_name: "Kundenname",
    label_route: "Logistikroute",
    gps_coords: "GPS-Koordinaten",
    gps_lat: "Breitengrad (Lat)",
    gps_lng: "Längengrad (Lng)",
    btn_delete_client: "Aus Datenbank löschen",
    station_title: "Arbeitsplatz",
    station_tunnel: "Tunnel",
    station_folder: "Faltmaschine",
    station_ironer: "Mangel",
    station_shaker: "Rüttler",
    station_washing: "Waschen",
    station_pressing: "Bügeln",
    station_sewing: "Nähen",
    station_reception: "Annahmestelle",
    station_cleaning: "Reinigung",
    station_marking: "Kennzeichnung",
    station_packing: "Verpackung",
    station_dispatch: "Versand",
    station_driver: "Fahrer",
    cp_clear: "Löschen",
    cp_hours_label: "Stunden / Benutzerdefiniertes Format",
    cp_hours_placeholder: "z.B. 8 oder 7+8 oder 7,5",
    status_title: "Status",
    btn_refresh: "Aktualisieren",
    btn_locate: "Meine Position",
    map_hint: "Klicken Sie auf eine Route in der Legende, um sie auszublenden/anzuzeigen. Kunden ohne GPS werden nicht auf der Karte angezeigt.",
    gfp_title: "📊 Dienstplandatei:",
    gfp_change_btn: "Datei ändern",
    gfp_instructions_1: "Fügen Sie die URL oder ID einer neuen Google Sheets-Datei mit dem Dienstplan für den aktuellen Monat ein.",
    gfp_instructions_2: "Die Datei muss ein Blatt namens 'Grafik' (monatlich) und Blätter 'W1, W2...' (wöchentlich) enthalten.",
    gfp_placeholder: "https://docs.google.com/spreadsheets/d/... oder nur ID",
    gfp_connect_btn: "Verbinden",
    toast_creating: "Erstellung...",
    toast_route_added: "Route hinzugefügt",
    toast_route_name_empty: "Routenname darf nicht leer sein",
    toast_add_client_first: "Fügen Sie zuerst einen Kunden hinzu",
    admin_mode_title: "🔓 Admin-Modus",
    admin_session_active: "Sitzung aktiv. Verbleibende Zeit: ",
    admin_stay: "Bleiben",
    btn_logout: "Abmelden",
    loading_grafik_file: "Verbindung mit Dienstplandatei...",
    error_label: "Fehler",
    loading_timeline: "Zeitachse wird geladen...",
    loading_grafik: "Dienstplan wird geladen..."
  },
  UA: {
    app_title: "Розклад",
    app_subtitle: "LEBUSER Textilservice Sp. z o.o. — Управління логістикою",
    admin_btn: "🔒 Адміністратор",
    admin_btn_out: "🔓 Вийти",
    admin_banner: "Режим адміністратора активний",
    driver_select_title: "Хто ви?",
    driver_select_desc: "Оберіть своє ім'я зі списку нижче.",
    btn_select_driver: "Обрати водія",
    driver_btn_out: "Змінити водія",
    login_desc_ap: "Введіть пароль для повного доступу до системи.",
    nav_harmonogram: "Розклад",
    nav_historia: "Історія",
    nav_klienci: "Клієнти та маршрути",
    nav_mapa: "Карта",
    nav_grafik: "Графік персоналу",
    nav_edytor: "Графік",
    nav_timeline: "Шкала часу",
    nav_help: "Інструкція",
    day_0: "Понеділок",
    day_1: "Вівторок",
    day_2: "Середа",
    day_3: "Четвер",
    day_4: "П'ятниця",
    day_short_0: "Пн",
    day_short_1: "Вт",
    day_short_2: "Ср",
    day_short_3: "Чт",
    day_short_4: "Пт",
    modal_add_title: "Додати прибуття",
    modal_edit_title: "Редагувати запис",
    modal_view_title: "Деталі замовлення",
    label_client: "Клієнт",
    label_type: "Тип білизни",
    label_weight: "Вага (кг) — опціонально",
    label_arr_day: "День прибуття",
    label_pick_day: "День видачі",
    label_pick_week: "Тиждень видачі",
    label_status: "Статус",
    label_weight_simple: "Вага",
    label_added_by: "Привіз",
    label_added_at: "Записано",
    label_picked_by: "Забрав",
    label_picked_at: "Забрано",
    type_p: "Постіль",
    type_o: "Скатертини",
    week_same: "Той самий тиждень",
    week_next: "Наступний тиждень",
    week_next_suffix: " (наст. тиждень)",
    btn_cancel: "Скасувати",
    btn_close: "Закрити",
    btn_add: "Додати",
    btn_save: "Зберегти",
    btn_delete: "Вилучити",
    btn_delete_route: "Вилучити маршрут",
    btn_mark_done: "Позначити як видане",
    btn_mark_undone: "Скасувати видачу",
    status_done: "✓ Видано",
    status_pending: "⏳ Очікує",
    grid_arrival: "Прибуття",
    grid_wash: "До прання",
    grid_arrived_sec: "↓ Прибуло",
    grid_pickup_sec: "↑ До видачі",
    grid_add_btn: "+ додати замовлення",
    grid_today: "Сьогодні",
    grid_next_week_pfx: "Наступний: ",
    toast_added: "Додано: ",
    toast_saved: "Збережено",
    toast_deleted: "Вилучено",
    toast_weight_error: "Вага має бути числом більше 0",
    login_title: "🔐 Вхід адміністратора",
    login_pass: "Пароль адміністратора",
    placeholder_write_pass: "Введіть пароль…",
    login_btn: "Увійти",
    hist_title: "Тиждень від ",
    hist_empty: "Історія порожня",
    loading: "Завантаження…",
    tl_select_week: "— оберіть тиждень —",
    leg_intro: "Натисніть на картку, щоб переглянути деталі.",
    leg_arr: "Доставлено",
    leg_pick: "До забору",
    leg_done: "Забрано",
    tl_refresh: "Оновити список",
    tl_click_hint: "Клацніть на комірку → призначте посаду",
    tl_choose_week_loader: "Оберіть тиждень зі списку",
    tl_stats_title: "📊 Статистика дня",
    grafik_load: "Завантажити",
    grafik_click_hint: "Клацніть на комірку щоб змінити статус",
    legend_title: "ЛЕГЕНДА:",
    legend_i: "заплановано",
    legend_w: "вихідний",
    legend_uw: "відпустка",
    legend_l4: "лікарняний",
    legend_nn: "відсутній",
    legend_godz: "робочих годин",
    legend_plus: "старт+години",
    grafik_choose_month_loader: "Оберіть місяць та натисніть Завантажити",

    btn_new_route: "Новий маршрут",
    clients_drag_hint: "Перетягуйте клієнтів між маршрутами",
    gps_has: "з GPS",
    gps_no: "без GPS",
    modal_new_route_title: "Новий маршрут",
    label_route_name: "Назва маршруту",
    placeholder_route_ex: "напр., Північний маршрут",
    modal_edit_route_title: "Редагувати маршрут",
    placeholder_write_name: "Введіть назву...",
    modal_new_client_title: "Новий клієнт",
    label_client_name_new: "Назва готелю / компанії",
    label_default_route: "Постійний логістичний маршрут",
    modal_edit_client_title: "Редагувати клієнта",
    label_client_name: "Назва клієнта",
    label_route: "Логістичний маршрут",
    gps_coords: "Координати GPS",
    gps_lat: "Широта (Lat)",
    gps_lng: "Довгота (Lng)",
    btn_delete_client: "Вилучити з бази",
    station_title: "Робоче місце",
    station_tunnel: "Тунель",
    station_folder: "Складальна машина",
    station_ironer: "Прасувальний каток",
    station_shaker: "Розтрушувач",
    station_washing: "Прання",
    station_pressing: "Прасування",
    station_sewing: "Шиття",
    station_reception: "Пункт прийому",
    station_cleaning: "Прибирання",
    station_marking: "Маркування",
    station_packing: "Пакування",
    station_dispatch: "Експедиція",
    station_driver: "Водій",
    cp_clear: "Очистити",
    cp_hours_label: "Години / Власний формат",
    cp_hours_placeholder: "напр., 8 або 7+8 або 7,5",
    status_title: "Статус",
    btn_refresh: "Оновити",
    btn_locate: "Моя позиція",
    map_hint: "Клацніть на маршрут у легенді, щоб сховати або показати його. Клієнти без GPS не відображаються на карті.",
    gfp_title: "📊 Файл графіка:",
    gfp_change_btn: "Змінити файл",
    gfp_instructions_1: "Вставте URL-адресу або ідентифікатор нового файлу Google Таблиць із графіком на поточний місяць.",
    gfp_instructions_2: "Файл повинен містити аркуш із назвою Grafik (щомісячний) та аркуші W1, W2… (щотижневі).",
    gfp_placeholder: "https://docs.google.com/spreadsheets/d/... або просто ID",
    gfp_connect_btn: "Підключити",
    toast_creating: "Створення...",
    toast_route_added: "Маршрут додано",
    toast_route_name_empty: "Назва маршруту не може бути порожньою",
    toast_add_client_first: "Спочатку додайте клієнта",
    admin_mode_title: "🔓 Режим адміністратора",
    admin_session_active: "Сесія активна. Залишилося часу: ",
    admin_stay: "Залишитись",
    btn_logout: "Вийти",
    loading_grafik_file: "З'єднання з файлом графіка…",
    error_label: "Помилка",
    loading_timeline: "Завантаження шкали часу…",
    loading_grafik: "Завантаження графіка…"
  }
};

let currentLang = 'PL';
try {
  currentLang = localStorage.getItem('lebuserLang') || 'PL';
} catch(e) {}
function t(key){
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || (TRANSLATIONS['PL'][key]) || key;
}

const DAY_NAMES={
  get 0(){return t('day_0')},
  get 1(){return t('day_1')},
  get 2(){return t('day_2')},
  get 3(){return t('day_3')},
  get 4(){return t('day_4')}
};
const DAY_SHORT={
  get 0(){return t('day_short_0')},
  get 1(){return t('day_short_1')},
  get 2(){return t('day_short_2')},
  get 3(){return t('day_short_3')},
  get 4(){return t('day_short_4')}
};

let weekOffset=0,clients=[],routeMap={},entries=[],pendingTargetOffset=0,editingId=null,drivers=[],currentDriver=null;
let myMap=null,myTileLayer=null,baseMarker=null,mapLayers={},hiddenRoutes=new Set(),userLocationMarker=null;
const D_BASE_LAT=52.7229319,D_BASE_LNG=15.2520164;
const ROUTE_COLORS={1:'#007AFF',2:'#FF9500',3:'#AF52DE',4:'#FF3B30',5:'#32ADE6',6:'#34C759',7:'#5856D6',8:'#c49500',9:'#FF453A',10:'#636366'};

try {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = function(e) {
    if (myMap && myTileLayer) {
      const tileUrl = e.matches 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      myTileLayer.setUrl(tileUrl);
    }
  };
  if (mql.addEventListener) {
    mql.addEventListener('change', handler);
  } else if (mql.addListener) {
    mql.addListener(handler);
  }
} catch(e) {}

// ── ADMIN SESSION ──────────────────────────────────────────────
let isAdmin = false;
let adminExpires = 0;
const ADMIN_SESSION_KEY = 'lebuserAdminSession';
let sessionTimerInterval = null;

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lebuserLang', lang);
  
  // Highlight active lang button
  ['PL', 'DE', 'UA'].forEach(l => {
    const btn = document.getElementById('lang_' + l);
    if (btn) {
      if (l === lang) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  // Re-run translations and rendering
  translateStaticUI();
  
  // Re-render active views
  renderGrid();
  if (document.getElementById('histView') && document.getElementById('histView').style.display === 'block') loadHistory();
  if (document.getElementById('clientsView') && document.getElementById('clientsView').style.display === 'block') renderClientsList();
}

// Identyfikatory kontenerów dynamicznych — translateStaticUI pomija je
// gdy nie mają już klasy 'loader' (tzn. zostały wypełnione przez renderX())
const DYNAMIC_CONTAINERS = new Set([
  'clientsListContent','histContent',
  'grafikEditorGrid','tlGridContainer','grid1','grid2'
]);

function translateStaticUI() {
  // Translate elements with data-t attribute
  document.querySelectorAll('[data-t]').forEach(el => {
    // Pomiń dynamiczne kontenery — ich tekst jest ustawiany przez render functions przez t()
    if (DYNAMIC_CONTAINERS.has(el.id)) return;
    const key = el.getAttribute('data-t');
    const trans = t(key);
    if (trans) el.textContent = trans;
  });

  // Handle placeholders
  document.querySelectorAll('[data-t-placeholder]').forEach(el => {
    const key = el.getAttribute('data-t-placeholder');
    const trans = t(key);
    if (trans) el.setAttribute('placeholder', trans);
  });
  
  // Specific dynamic static elements
  const adminToggleBtn = document.getElementById('adminToggleBtn');
  if (adminToggleBtn) {
    adminToggleBtn.textContent = isAdmin ? t('admin_btn_out') : t('admin_btn');
  }

  // Type buttons text
  ['m', 'e'].forEach(pfx => {
    const pBtn = document.getElementById(pfx + 'Type_P');
    const oBtn = document.getElementById(pfx + 'Type_O');
    if (pBtn) pBtn.textContent = t('type_p');
    if (oBtn) oBtn.textContent = t('type_o');
  });
}

function translateDayShort(plName) {
  const clean = String(plName || '').trim().toUpperCase();
  if (clean.startsWith('PN')) return t('day_short_0');
  if (clean.startsWith('WT')) return t('day_short_1');
  if (clean.startsWith('ŚR')) return t('day_short_2');
  if (clean.startsWith('CZ')) return t('day_short_3');
  if (clean.startsWith('PI') || clean.startsWith('PT')) return t('day_short_4');
  if (clean.startsWith('SO')) return currentLang === 'DE' ? 'Sa' : (currentLang === 'UA' ? 'Сб' : 'So');
  if (clean.startsWith('ND') || clean.startsWith('N')) return currentLang === 'DE' ? 'So' : (currentLang === 'UA' ? 'Нд' : 'Nd');
  return plName;
}

function translateError(msg) {
  if (!msg) return msg;
  const str = String(msg);
  if (currentLang === 'PL') return str;
  if (currentLang === 'DE') {
    if (str.includes('Nieprawidłowe hasło administratora')) return 'Ungültiges Administrator-Passwort';
    if (str.includes('Nieprawidłowy URL lub ID')) return 'Ungültige URL oder ID';
    if (str.includes('Nie można połączyć:')) return str.replace('Nie można połączyć:', 'Verbindung nicht möglich:');
    if (str.includes('Błąd połączenia z plikiem grafiku:')) return str.replace('Błąd połączenia z plikiem grafiku:', 'Dienstplan-Verbindungsfehler:');
    if (str.includes('Błąd połączenia. Upewnij się, że odpaliłeś funkcję TEST_ZgodyGoogle')) return 'Verbindungsfehler. Bitte TEST_ZgodyGoogle ausführen. Details:';
    if (str.includes('Pusta nazwa')) return 'Leerer Name';
    if (str.includes('Brak arkusza tras')) return 'Kein Routenblatt';
    if (str.includes('Nie znaleziono trasy')) return 'Route nicht gefunden';
    if (str.includes('Nie można usunąć trasy, do której są przypisani klienci')) return 'Route hat Kunden und kann nicht gelöscht werden';
    if (str.includes('Klient już istnieje')) return 'Kunde existiert bereits';
    if (str.includes('Klient o tej nazwie już istnieje')) return 'Ein Kunde mit diesem Namen existiert bereits';
    if (str.includes('Nie znaleziono klienta')) return 'Kunde nicht gefunden';
    if (str.includes('Nie znaleziono wpisu')) return 'Eintrag nicht gefunden';
    if (str.includes('Błąd odczytu grafiku:')) return str.replace('Błąd odczytu grafiku:', 'Dienstplan-Lesefehler:');
    if (str.includes('Niezgodność wiersza:')) return str.replace('Niezgodność wiersza:', 'Zeilenabweichung:');
    if (str.includes('Nie znaleziono arkusza:')) return str.replace('Nie znaleziono arkusza:', 'Blatt nicht gefunden:');
    if (str.includes('Arkusz wygląda na pusty.')) return 'Das Blatt scheint leer zu sein.';
    if (str.includes('Nie wykryto dni w arkuszu.')) return 'Keine Tage im Blatt erkannt.';
    if (str.includes('Błąd odczytu osi czasu:')) return str.replace('Błąd odczytu osi czasu:', 'Zeitachsen-Lesefehler:');
    if (str.includes('Brak arkusza:')) return str.replace('Brak arkusza:', 'Kein Blatt:');
    if (str.includes('Niezgodność:')) return str.replace('Niezgodność:', 'Abweichung:');
  }
  if (currentLang === 'UA') {
    if (str.includes('Nieprawidłowe hasło administratora')) return 'Неправильний пароль адміністратора';
    if (str.includes('Nieprawidłowy URL lub ID')) return 'Неправильний URL або ID';
    if (str.includes('Nie można połączyć:')) return str.replace('Nie można połączyć:', 'Не вдалося підключитися:');
    if (str.includes('Błąd połączenia z plikiem grafiku:')) return str.replace('Błąd połączenia z plikiem grafiku:', 'Помилка підключення до файлу графіка:');
    if (str.includes('Błąd połączenia. Upewnij się, że odpaliłeś funkcję TEST_ZgodyGoogle')) return 'Помилка з\'єднання. Будь ласка, запустіть TEST_ZgodyGoogle. Деталі:';
    if (str.includes('Pusta nazwa')) return 'Порожня назва';
    if (str.includes('Brak arkusza tras')) return 'Немає аркуша маршрутів';
    if (str.includes('Nie znaleziono trasy')) return 'Маршрут не знайдено';
    if (str.includes('Nie można usunąć trasy, do której są przypisani klienci')) return 'Не вдалося вилучити маршрут з призначеними клієнтами';
    if (str.includes('Klient już istnieje')) return 'Клієнт вже існує';
    if (str.includes('Klient o tej nazwie już istnieje')) return 'Клієнт з такою назвою вже існує';
    if (str.includes('Nie znaleziono klienta')) return 'Клієнта не знайдено';
    if (str.includes('Nie znaleziono wpisu')) return 'Запис не знайдено';
    if (str.includes('Błąd odczytu grafiku:')) return str.replace('Błąd odczytu grafiku:', 'Помилка зчитування графіка:');
    if (str.includes('Niezgodność wiersza:')) return str.replace('Niezgodność wiersza:', 'Невідповідність рядка:');
    if (str.includes('Nie znaleziono arkusza:')) return str.replace('Nie znaleziono arkusza:', 'Аркуш не знайдено:');
    if (str.includes('Arkusz wygląda na pusty.')) return 'Аркуш виглядає порожнім.';
    if (str.includes('Nie wykryto dni w arkuszu.')) return 'Не виявлено днів на аркуші.';
    if (str.includes('Błąd odczytu osi czasu:')) return str.replace('Błąd odczytu osi czasu:', 'Помилка зчитування шкали часу:');
    if (str.includes('Brak arkusza:')) return str.replace('Brak arkusza:', 'Немає аркуша:');
    if (str.includes('Niezgodność:')) return str.replace('Niezgodność:', 'Невідповідність:');
  }
  return str;
}

function checkAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return 0;
    const s = JSON.parse(raw);
    if (s.expires && s.token && Date.now() < s.expires) return s.expires;
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch(e) {}
  return 0;
}

function getAdminToken() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return '';
    const s = JSON.parse(raw);
    if (s.expires && s.token && Date.now() < s.expires) return s.token;
  } catch(e) {}
  localStorage.removeItem(ADMIN_SESSION_KEY);
  applyAdminState(0);
  return '';
}

// Kolory awatarów kierowców (deterministyczne na podstawie ID)
const DRIVER_AVATAR_COLORS = ['#1266D6','#138A43','#D97706','#8E44AD','#D9342B','#0E7490','#4F46E5','#BE185D','#0F766E','#B45309'];
function driverAvatarColor(id) {
  let h = 0;
  for (let i = 0; i < (id||'').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DRIVER_AVATAR_COLORS[h % DRIVER_AVATAR_COLORS.length];
}
function driverInitials(name) {
  return (name||'').split(/\s+/).map(n=>n[0]||'').slice(0,2).join('').toUpperCase() || '?';
}

function openDriverSelect() {
  const container = document.getElementById('driverButtonsContainer');
  const actions   = document.getElementById('driverSelectActions');
  container.innerHTML = '';
  actions.innerHTML   = '';

  if (!drivers || drivers.length === 0) {
    container.innerHTML = '<div style="padding:32px 16px;text-align:center;color:rgba(60,60,67,0.6);font-size:15px;font-weight:500">' +
      (currentLang === 'DE' ? 'Keine Fahrer in der Datenbank.' : (currentLang === 'UA' ? 'Немає водіїв у базі.' : 'Brak kierowców w bazie.')) + '</div>';
  } else {
    // Wyszukiwarka (jeśli > 4 kierowców)
    if (drivers.length > 4) {
      const searchDiv = document.createElement('div');
      searchDiv.className = 'ap-driver-search';
      searchDiv.innerHTML = '<span class="ap-search-icon">🔍</span>' +
        '<input type="text" id="driverSearchInput" placeholder="' +
        (currentLang === 'DE' ? 'Fahrer suchen…' : (currentLang === 'UA' ? 'Пошук водія…' : 'Szukaj kierowcy…')) +
        '" oninput="filterDriverCards(this.value)" autocomplete="off">';
      container.appendChild(searchDiv);
    }

    // Lista kierowców
    const listDiv = document.createElement('div');
    listDiv.id = 'driverCardsList';
    listDiv.style.cssText = 'overflow-y:auto;max-height:' + (drivers.length > 4 ? '44vh' : '52vh');

    drivers.forEach(function(d) {
      const isSelected = currentDriver && currentDriver.id === d.id;
      const card = document.createElement('div');
      card.className = 'ap-driver-card' + (isSelected ? ' ap-selected' : '');
      card.setAttribute('data-driver-name', d.name.toLowerCase());
      const color = driverAvatarColor(d.id);
      const initials = driverInitials(d.name);
      const routeNames = (d.routes && d.routes.length > 0)
        ? d.routes.map(function(r, i){ return getRouteName(r) + ((i % 2 === 1 && i < d.routes.length - 1) ? '\n' : (i < d.routes.length - 1 ? ' · ' : '')); }).join('')
        : (currentLang === 'DE' ? 'Keine Routen zugewiesen' : (currentLang === 'UA' ? 'Маршрути не призначені' : 'Brak przypisanych tras'));

      card.innerHTML =
        '<div class="ap-driver-avatar" style="background:' + color + '">' + esc(initials) + '</div>' +
        '<div class="ap-driver-info">' +
          '<div class="ap-driver-name">' + esc(d.name) + '</div>' +
          '<div class="ap-driver-routes">' + esc(routeNames) + '</div>' +
        '</div>' +
        (isSelected ? '<div class="ap-check-badge">✓</div>' : '');
      card.onclick = function() { selectDriver(d.id); };
      listDiv.appendChild(card);
    });

    container.appendChild(listDiv);
  }

  // Wyloguj kierowcę (jeśli jest zalogowany)
  if (currentDriver) {
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'ap-btn ap-btn-danger';
    logoutBtn.innerHTML = (currentLang === 'DE' ? 'Abmelden' : (currentLang === 'UA' ? 'Вийти' : 'Wyloguj się'));
    logoutBtn.onclick = function() { selectDriver(null); };
    actions.appendChild(logoutBtn);
  }

  // Anuluj
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ap-btn ap-btn-secondary';
  cancelBtn.textContent = currentLang === 'DE' ? 'Abbrechen' : (currentLang === 'UA' ? 'Скасувати' : 'Anuluj');
  cancelBtn.onclick = function() { document.getElementById('driverSelectModal').style.display = 'none'; unlockScroll(); };
  actions.appendChild(cancelBtn);

  document.getElementById('driverSelectModal').style.display = 'flex';
  lockScroll();

  // Focus na wyszukiwarkę
  setTimeout(function() {
    const searchInput = document.getElementById('driverSearchInput');
    if (searchInput) searchInput.focus();
  }, 300);
}

function filterDriverCards(query) {
  const q = (query || '').toLowerCase().trim();
  const cards = document.querySelectorAll('#driverCardsList .ap-driver-card');
  cards.forEach(function(card) {
    const name = card.getAttribute('data-driver-name') || '';
    card.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

function selectDriver(id) {
  if (!id) {
    currentDriver = null;
    localStorage.removeItem('currentDriver');
  } else {
    const found = drivers.find(d => d.id === id);
    if (!found) {
      toast('Nie znaleziono kierowcy');
      return;
    }
    currentDriver = found;
    localStorage.setItem('currentDriver', JSON.stringify(currentDriver));
    // Wyloguj admina przy logowaniu kierowcy
    if (isAdmin) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      applyAdminState(0);
    }
  }
  document.getElementById('driverSelectModal').style.display = 'none';
  unlockScroll();
  applyDriverState();
}

function applyDriverState() {
  const btn   = document.getElementById('driverToggleBtn');
  const label = document.getElementById('driverBtnLabel');

  // Przycisk zawsze widoczny — niezależnie od trybu admin
  btn.style.display = 'flex';

  if (currentDriver) {
    label.textContent = currentDriver.name;
    label.removeAttribute('data-t'); // Zapobiega nadpisaniu przez translateStaticUI
    btn.classList.add('driver-active');
  } else {
    label.setAttribute('data-t', 'btn_select_driver');
    label.textContent = currentLang === 'DE' ? 'Fahrer wählen' : (currentLang === 'UA' ? 'Обрати водія' : 'Wybierz kierowcę');
    btn.classList.remove('driver-active');
  }
}

// ── DRIVER ADMIN (Panel dla Administratora) ──
let editedDriverRoutes = {};

function openDriverAdminModal() {
  const container = document.getElementById('driverAdminContainer');
  container.innerHTML = '';
  editedDriverRoutes = {};

  const routeIds = Object.keys(routeMap).map(Number).sort((a,b) => a-b);
  
  if (!drivers || drivers.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Brak kierowców w bazie.</div>';
  } else {
    drivers.forEach(d => {
      editedDriverRoutes[d.id] = [...(d.routes || [])];
      
      const dDiv = document.createElement('div');
      dDiv.style.border = '1px solid var(--border)';
      dDiv.style.borderRadius = '8px';
      dDiv.style.padding = '12px';
      dDiv.style.background = 'var(--bg-card-solid)';
      
      const dName = document.createElement('div');
      dName.style.fontWeight = 'bold';
      dName.style.marginBottom = '8px';
      dName.textContent = d.name;
      dDiv.appendChild(dName);
      
      const rCont = document.createElement('div');
      rCont.style.display = 'flex';
      rCont.style.flexWrap = 'wrap';
      rCont.style.gap = '6px';
      
      routeIds.forEach(rId => {
        const rBtn = document.createElement('div');
        rBtn.className = 'route-chip' + (editedDriverRoutes[d.id].includes(rId) ? ' active' : '');
        rBtn.textContent = getRouteName(rId);
        rBtn.onclick = () => {
          const idx = editedDriverRoutes[d.id].indexOf(rId);
          if (idx > -1) {
            editedDriverRoutes[d.id].splice(idx, 1);
            rBtn.classList.remove('active');
          } else {
            editedDriverRoutes[d.id].push(rId);
            rBtn.classList.add('active');
          }
        };
        rCont.appendChild(rBtn);
      });
      
      dDiv.appendChild(rCont);
      container.appendChild(dDiv);
    });
  }
  
  document.getElementById('driverAdminModal').style.display = 'flex';
  lockScroll();
}

function closeDriverAdminModal() {
  document.getElementById('driverAdminModal').style.display = 'none';
  unlockScroll();
}

function saveDriverRoutes() {
  const btn = document.querySelector('#driverAdminModal .primary');
  btn.disabled = true;
  btn.textContent = 'Zapisywanie...';
  
  const promises = drivers.map(d => {
    const newRoutes = editedDriverRoutes[d.id] || [];
    const oldRoutes = d.routes || [];
    // Sprawdzamy, czy tablice są różne
    if ([...newRoutes].sort().join(',') === [...oldRoutes].sort().join(',')) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(res => {
          if (res && res.error) reject(res.error);
          else resolve();
        })
        .withFailureHandler(err => reject(err.message))
        .updateDriverRoutes(d.id, newRoutes.join(','), getAdminToken());
    });
  });
  
  Promise.all(promises).then(() => {
    toast('Zapisano pomyślnie!');
    closeDriverAdminModal();
    // Odśwież dane
    btn.disabled = false;
    btn.textContent = 'Zapisz zmiany';
    loadAppData(function() {
      renderGrid();
      if(document.getElementById('clientsView').style.display === 'block') {
        renderClientsList();
      }
    });
  }).catch(err => {
    alert('Błąd podczas zapisywania: ' + err);
    btn.disabled = false;
    btn.textContent = 'Zapisz zmiany';
  });
}

function applyAdminState(expires) {
  isAdmin = expires > Date.now();
  adminExpires = expires;

  const btn = document.getElementById('adminToggleBtn');
  const banner = document.getElementById('adminBanner');
  const staffTab    = document.getElementById('btnViewStaff');
  const grafikTab   = document.getElementById('btnViewGrafikEditor');
  const timelineTab = document.getElementById('btnViewTimeline');
  const reportsTab  = document.getElementById('btnViewReports');
  const logsTab     = document.getElementById('btnViewLogs');

  if (isAdmin) {
    btn.classList.add('admin-active');
    banner.classList.add('visible');
    if(grafikTab)   grafikTab.classList.add('visible');
    if(timelineTab) timelineTab.classList.add('visible');
    if(reportsTab)  reportsTab.classList.add('visible');
    if(logsTab)     logsTab.classList.add('visible');
    updateSessionDisplay();
    if (!sessionTimerInterval) {
      sessionTimerInterval = setInterval(function() {
        if (Date.now() >= adminExpires) {
          clearInterval(sessionTimerInterval);
          sessionTimerInterval = null;
          localStorage.removeItem(ADMIN_SESSION_KEY);
          applyAdminState(0);
          toast(currentLang === 'DE' ? 'Admin-Sitzung abgelaufen — Bitte erneut anmelden' : (currentLang === 'UA' ? 'Сесія адміністратора закінчилася — увійдіть знову' : 'Sesja admina wygasła — zaloguj się ponownie'));
          switchView('main');
        } else {
          updateSessionDisplay();
        }
      }, 60000);
    }
  } else {
    btn.innerHTML = t('admin_btn');
    btn.classList.remove('admin-active');
    banner.classList.remove('visible');
    if(grafikTab)   grafikTab.classList.remove('visible');
    if(timelineTab) timelineTab.classList.remove('visible');
    if(reportsTab)  reportsTab.classList.remove('visible');
    if(logsTab)     logsTab.classList.remove('visible');
    if (sessionTimerInterval) { clearInterval(sessionTimerInterval); sessionTimerInterval = null; }
    const adminViews = ['grafikEditorView','timelineView','reportsView','logsView'];
    if (adminViews.some(id => { const el=document.getElementById(id); return el&&el.style.display==='block'; })) switchView('main');

  }

  applyDriverState();
  translateStaticUI();

  // Odśwież widok Klientów PO translateStaticUI() — inaczej translateStaticUI nadpisuje
  // zawartość przez data-t="loading" na #clientsListContent
  const cv = document.getElementById('clientsView');
  if (cv && cv.style.display === 'block') renderClientsList();
}

function updateSessionDisplay() {
  const msLeft = adminExpires - Date.now();
  const hLeft = msLeft / 3600000;
  let label;
  
  const minText = currentLang === 'DE' ? ' Min.' : (currentLang === 'UA' ? ' хв' : ' min');
  const hText = ' h';
  
  if (hLeft < 1) label = Math.ceil(msLeft / 60000) + minText;
  else label = hLeft.toFixed(1).replace('.', ',') + hText;

  const btnLabel = currentLang === 'DE' ? 'Abmelden' : (currentLang === 'UA' ? 'Вийти' : 'Wyloguj');
  const bannerLabel = currentLang === 'DE' ? 'verbleibend' : (currentLang === 'UA' ? 'залишилося' : 'pozostało');

  document.getElementById('adminToggleBtn').innerHTML = '🔓 ' + btnLabel + ' <span class="session-timer">' + label + '</span>';
  document.getElementById('adminSessionInfo').textContent = bannerLabel + ' ' + label;
}

function openAdminLogin() {
  if (isAdmin) {
    const msLeft = adminExpires - Date.now();
    const hLeft = (msLeft / 3600000).toFixed(1).replace('.', ',');
    document.getElementById('logoutSessionTime').textContent = hLeft + ' h';
    document.getElementById('adminLogoutModal').style.display = 'flex';
    lockScroll();
    return;
  }
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('adminLoginError').textContent = '';
  document.getElementById('adminLoginModal').style.display = 'flex';
  lockScroll();
  setTimeout(function() { document.getElementById('adminPasswordInput').focus(); }, 100);
}

function closeAdminLogin() {
  document.getElementById('adminLoginModal').style.display = 'none';
  unlockScroll();
}

function closeAdminLogout() {
  document.getElementById('adminLogoutModal').style.display = 'none';
  unlockScroll();
}

function doAdminLogin() {
  const pw = document.getElementById('adminPasswordInput').value;
  if (!pw) { document.getElementById('adminLoginError').textContent = currentLang === 'DE' ? 'Passwort eingeben' : (currentLang === 'UA' ? 'Введіть пароль' : 'Wpisz hasło'); return; }
  document.getElementById('adminLoginError').textContent = currentLang === 'DE' ? 'Überprüfung...' : (currentLang === 'UA' ? 'Перевірка…' : 'Sprawdzanie…');
  google.script.run
    .withFailureHandler(function(e) {
      document.getElementById('adminLoginError').textContent = t('error_label') + ': ' + translateError(e.message);
    })
    .withSuccessHandler(function(res) {
      if (res.error) {
        document.getElementById('adminLoginError').textContent = translateError(res.error);
        return;
      }
      const expires = Date.now() + res.sessionHours * 3600 * 1000;
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({expires: expires, token: res.token}));
      closeAdminLogin();
      // Wyloguj kierowcę przy logowaniu admina
      currentDriver = null;
      localStorage.removeItem('currentDriver');
      applyAdminState(expires);
      const loggedMsg = currentLang === 'DE' ? 'Als Administrator angemeldet (' + res.sessionHours + ' h)' : (currentLang === 'UA' ? 'Увійшов як адміністратор (' + res.sessionHours + ' год)' : 'Zalogowano jako administrator (' + res.sessionHours + ' h)');
      toast(loggedMsg);
    })
    .checkAdminPassword(pw);
}

function doAdminLogout() {
  closeAdminLogout();
  localStorage.removeItem(ADMIN_SESSION_KEY);
  applyAdminState(0);
  toast(currentLang === 'DE' ? 'Vom Administrator-Modus abgemeldet' : (currentLang === 'UA' ? 'Вийшов з режиму адміністратора' : 'Wylogowano z trybu administratora'));
}
// ──────────────────────────────────────────────────────────────

function applyDeviceLayout(){
  const width = window.innerWidth || document.documentElement.clientWidth || (window.screen && window.screen.width) || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || (window.screen && window.screen.height) || width;
  const shortestSide = Math.min(width, height);
  document.documentElement.classList.toggle('phone-layout', shortestSide <= 768);
}
applyDeviceLayout();
window.addEventListener('resize',applyDeviceLayout);
window.addEventListener('orientationchange',applyDeviceLayout);

function getMonday(offset){const d=new Date();const day=d.getDay();d.setDate(d.getDate()+(day===0?-6:1-day)+offset*7);d.setHours(0,0,0,0);return d;}
function weekKey(offset){const d=getMonday(offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtDate(d){const loc = currentLang === 'DE' ? 'de-DE' : (currentLang === 'UA' ? 'uk-UA' : 'pl-PL'); return d.toLocaleDateString(loc,{day:'numeric',month:'short'});}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',2500);}
function lockScroll(){document.body.classList.add('modal-open');}
function unlockScroll(){document.body.classList.remove('modal-open');}
function getRouteName(id){return routeMap[id]||('Trasa '+id);}
function getRouteColorIdx(routeId){return((Number(routeId)-1)%10)+1;}
function getRouteColor(routeId){return ROUTE_COLORS[getRouteColorIdx(routeId)]||'#8E8E93';}
function esc(value){
  const val = (value !== null && value !== undefined) ? value : '';
  return String(val).replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}
function jsArg(value){
  const val = (value !== null && value !== undefined) ? value : '';
  return esc(JSON.stringify(String(val)));
}

function updateRouteDropdowns(){
  const routeIds=Object.keys(routeMap).map(Number).sort((a,b)=>a-b);
  const optionsHTML=routeIds.map(id=>'<option value="'+id+'">'+esc(getRouteName(id))+'</option>').join('');
  document.getElementById('newClientRoute').innerHTML=optionsHTML;
  document.getElementById('ecRoute').innerHTML=optionsHTML;
}

function switchView(v){
  if(['grafikEditor','timeline','reports','logs'].includes(v)&&!isAdmin){
    toast(currentLang === 'DE' ? 'Dieser Tab ist nur für Administratoren verfügbar' : (currentLang === 'UA' ? 'Ця вкладка доступна тільки для адміністраторів' : 'Ta zakładka jest dostępna tylko dla administratora'));
    v='main';
  }

  const views=['main','history','clients','map','help','grafikEditor','timeline','reports','logs'];
  const btns={main:'btnViewMain',history:'btnViewHist',clients:'btnViewClients',map:'btnViewMap',help:'btnViewHelp',grafikEditor:'btnViewGrafikEditor',timeline:'btnViewTimeline',reports:'btnViewReports',logs:'btnViewLogs'};
  views.forEach(function(x){
    const idMap={main:'mainView',history:'histView'};
    const el=document.getElementById(idMap[x]||x+'View');
    if(el)el.style.display=(x===v?'block':'none');
    const b=document.getElementById(btns[x]);
    if(b){if(x===v)b.classList.add('active');else b.classList.remove('active');}
  });

  // Dynamiczny tytuł strony
  const titleMap={
    main:'nav_harmonogram', history:'nav_historia', clients:'nav_klienci',
    map:'nav_mapa', help:'nav_help',
    grafikEditor:'nav_edytor', timeline:'nav_timeline', reports:'nav_raporty', logs:'nav_logi'
  };
  const titleEl=document.querySelector('.app-title');
  if(titleEl && titleMap[v]) titleEl.textContent=t(titleMap[v]);

  // Panel pliku grafiku — widoczny tylko w zakładkach grafiku
  showGrafikFilePanel(v === 'grafikEditor' || v === 'timeline');

  if(v==='main')loadWeek();
  else if(v==='history')loadHistory();
  else if(v==='map')initMap();
  else if(v==='clients')renderClientsList();
  else if(v==='grafikEditor')initGrafikEditor();
  else if(v==='timeline')initTimelineView();
  else if(v==='reports')loadReports();
  else if(v==='logs')loadLogs();
  else if(v==='help')renderHelp();
}

function renderHelp(){
  const el=document.getElementById('helpView');
  if(!el)return;
  const L=currentLang;
  const PL=L==='PL', DE=L==='DE', UA=L==='UA'||(!PL&&!DE);

  const T={
    title:       PL?'ℹ️ Instrukcja':DE?'ℹ️ Anleitung':'ℹ️ Інструкція',
    intro:       PL?'Aplikacja służy do zarządzania logistyką pralni. Kierowcy logują się jako kierowca i korzystają z harmonogramu, aby śledzić przyjazdy i odbiory bielizny hotelowej.':
                 DE?'Die App dient zur Verwaltung der Wäschereilogistik. Fahrer melden sich als Fahrer an und nutzen den Zeitplan, um Anlieferungen und Abholungen von Hotelwäsche zu verfolgen.':
                 'Застосунок призначений для управління логістикою пральні. Водії авторизуються та використовують розклад для відстеження доставок та видач готельної білизни.',

    sec_driver:  PL?'👤 Kierowca — logowanie':DE?'👤 Fahrer — Anmeldung':'👤 Водій — вхід',
    driver1:     PL?'Naciśnij przycisk <b>Wybierz kierowcę</b> na górze ekranu.':DE?'Tippen Sie oben auf <b>Fahrer auswählen</b>.':'Натисніть кнопку <b>Вибрати водія</b> вгорі екрана.',
    driver2:     PL?'Wybierz swoje imię z listy — następnie możesz dodawać zamówienia i oznaczać odbiory.':DE?'Wählen Sie Ihren Namen aus der Liste — danach können Sie Aufträge hinzufügen und Abholungen markieren.':'Оберіть своє ім\'я зі списку — після цього можна додавати замовлення та позначати видачі.',
    driver3:     PL?'Twoje imię jest zapamiętywane na tym urządzeniu — nie musisz logować się przy każdym otwarciu.':DE?'Ihr Name wird auf diesem Gerät gespeichert — Sie müssen sich nicht jedes Mal neu anmelden.':'Ваше ім\'я зберігається на пристрої — не потрібно входити щоразу.',

    sec_schedule:PL?'🗓 Harmonogram — jak czytać':DE?'🗓 Zeitplan — Leseanleitung':'🗓 Розклад — як читати',
    sched1:      PL?'Harmonogram pokazuje bieżący tydzień podzielony na 5 dni (Pn–Pt).':DE?'Der Zeitplan zeigt die aktuelle Woche aufgeteilt in 5 Tage (Mo–Fr).':'Розклад показує поточний тиждень, розділений на 5 днів (Пн–Пт).',
    sched2:      PL?'Każdy dzień ma dwie sekcje: <b>↓ Przyjechało</b> (zielone karty) i <b>↑ Do odbioru</b> (niebieskie karty).':DE?'Jeder Tag hat zwei Abschnitte: <b>↓ Angekommen</b> (grüne Karten) und <b>↑ Zur Abholung</b> (blaue Karten).':'Кожен день має два розділи: <b>↓ Приїхало</b> (зелені картки) і <b>↑ До видачі</b> (сині картки).',
    sched3:      PL?'Szare karty (przekreślone) = odbiór już oznaczony.':DE?'Graue Karten (durchgestrichen) = Abholung bereits markiert.':'Сірі картки (закреслені) = видачу вже позначено.',
    sched4:      PL?'Na górze każdego dnia widać sumę kg: <b>Przyjazd</b> — ile kg przyjechało tego dnia; <b>Do prania</b> — ile kg czeka na pranie (z poprzedniego dnia).':DE?'Oben an jedem Tag sehen Sie die kg-Summe: <b>Ankunft</b> — wie viele kg heute angekommen sind; <b>Zu waschen</b> — wie viele kg auf die Wäsche warten (vom Vortag).':'Угорі кожного дня — сума кг: <b>Приїзд</b> — скільки кг приїхало цього дня; <b>До прання</b> — скільки кг чекає на прання (з попереднього дня).',

    sec_badges:  PL?'🏷 Oznaczenia na kartach':DE?'🏷 Kennzeichnungen auf den Karten':'🏷 Позначення на картках',
    badge_p:     PL?'<b>P</b> = Pościel (niebieskie oznaczenie)':DE?'<b>P</b> = Bettwäsche (blaue Kennzeichnung)':'<b>P</b> = Постіль (синє позначення)',
    badge_o:     PL?'<b>O</b> = Obrusy (fioletowe oznaczenie)':DE?'<b>O</b> = Tischdecken (violette Kennzeichnung)':'<b>O</b> = Скатертини (фіолетове позначення)',
    badge_t:     PL?'<b>T1, T2…</b> = Numer trasy logistycznej':DE?'<b>T1, T2…</b> = Nummer der Logistikroute':'<b>T1, T2…</b> = Номер логістичного маршруту',
    badge_kg:    PL?'<b>35 kg</b> = Waga bielizny w kilogramach':DE?'<b>35 kg</b> = Gewicht der Wäsche in Kilogramm':'<b>35 kg</b> = Вага білизни в кілограмах',
    badge_flag:  PL?'🚩 = Zamówienie pilne — priorytetowe':DE?'🚩 = Dringender Auftrag — Priorität':'🚩 = Термінове замовлення — пріоритет',

    sec_arrival: PL?'↓ Przyjechało — sekcja przyjazdu':DE?'↓ Angekommen — Anlieferungsbereich':'↓ Приїхало — розділ доставки',
    arr1:        PL?'Zielona karta = bielizna przywiozła i czeka na pranie.':DE?'Grüne Karte = Wäsche wurde angeliefert und wartet auf die Wäsche.':'Зелена картка = білизна приїхала і чекає на прання.',
    arr2:        PL?'Naciśnij kartę, aby zobaczyć szczegóły — dzień przyjazdu, dzień odbioru, rodzaj, wagę.':DE?'Tippen Sie auf die Karte, um Details zu sehen — Ankunftstag, Abholtag, Art, Gewicht.':'Натисніть картку, щоб побачити деталі — день приїзду, день видачі, тип, вагу.',
    arr3:        PL?'Jeśli dodałeś zamówienie sam — możesz je <b>usunąć</b> przyciskiem Usuń w oknie szczegółów.':DE?'Wenn Sie den Auftrag selbst hinzugefügt haben — können Sie ihn über die Schaltfläche <b>Löschen</b> im Detailfenster entfernen.':'Якщо ви самі додали замовлення — можна його <b>вилучити</b> кнопкою Вилучити у вікні деталей.',

    sec_pickup:  PL?'↑ Do odbioru — sekcja odbiorów':DE?'↑ Zur Abholung — Abholungsbereich':'↑ До видачі — розділ видачі',
    pick1:       PL?'Niebieska karta = bielizna gotowa do odbioru przez klienta.':DE?'Blaue Karte = Wäsche ist bereit zur Abholung durch den Kunden.':'Синя картка = білизна готова до видачі клієнту.',
    pick2:       PL?'Naciśnij kartę → naciśnij <b>Oznacz jako odebrane</b> gdy klient odbierze pranie.':DE?'Tippen Sie auf die Karte → tippen Sie auf <b>Als abgeholt markieren</b>, wenn der Kunde die Wäsche abholt.':'Натисніть картку → натисніть <b>Позначити як забране</b>, коли клієнт забере білизну.',
    pick3:       PL?'Jeśli klient ma zarówno Pościel (P) jak i Obrusy (O) w tym samym dniu odbioru — pojawią się razem na jednej karcie.':DE?'Hat der Kunde sowohl Bettwäsche (P) als auch Tischdecken (O) am selben Abholtag — erscheinen sie zusammen auf einer Karte.':'Якщо клієнт має і Постіль (P), і Скатертини (O) в той самий день видачі — вони з\'являться разом на одній картці.',
    pick4:       PL?'Po oznaczeniu karta staje się szara (przekreślona). Można cofnąć oznaczenie naciśnięciem karty → <b>Cofnij odbiór</b>.':DE?'Nach der Markierung wird die Karte grau (durchgestrichen). Die Markierung kann durch Tippen auf die Karte → <b>Abholung rückgängig</b> aufgehoben werden.':'Після позначення картка стає сірою (закресленою). Можна скасувати позначення — натисніть картку → <b>Скасувати видачу</b>.',

    sec_add:     PL?'➕ Dodawanie zamówienia':DE?'➕ Auftrag hinzufügen':'➕ Додавання замовлення',
    add1:        PL?'Naciśnij <b>+ dodaj zamówienie</b> na dole kolumny danego dnia.':DE?'Tippen Sie unten in der Tagesspalte auf <b>+ Auftrag hinzufügen</b>.':'Натисніть <b>+ додати замовлення</b> внизу стовпця потрібного дня.',
    add2:        PL?'Wybierz klienta, rodzaj bielizny (Pościel / Obrusy), podaj wagę (opcjonalnie) i dzień odbioru.':DE?'Wählen Sie den Kunden, die Art der Wäsche (Bettwäsche / Tischdecken), geben Sie das Gewicht (optional) und den Abholtag an.':'Оберіть клієнта, тип білизни (Постіль / Скатертини), вкажіть вагу (необов\'язково) та день видачі.',
    add3:        PL?'Naciśnij <b>Zapisz</b> — zamówienie pojawi się od razu w harmonogramie.':DE?'Tippen Sie auf <b>Speichern</b> — der Auftrag erscheint sofort im Zeitplan.':'Натисніть <b>Зберегти</b> — замовлення одразу з\'явиться в розкладі.',

    sec_nav:     PL?'📋 Inne zakładki':DE?'📋 Weitere Tabs':'📋 Інші вкладки',
    nav_hist:    PL?'<b>Historia</b> — wszystkie zamówienia z poprzednich tygodni':DE?'<b>Verlauf</b> — alle Aufträge aus vergangenen Wochen':'<b>Історія</b> — всі замовлення з попередніх тижнів',
    nav_clients: PL?'<b>Klienci i Trasy</b> — lista hoteli/firm i tras logistycznych (tylko admin)':DE?'<b>Kunden & Routen</b> — Liste der Hotels/Firmen und Logistikrouten (nur Admin)':'<b>Клієнти та Маршрути</b> — список готелів/фірм і маршрутів (тільки адмін)',
    nav_map:     PL?'<b>Mapa</b> — mapa z lokalizacjami klientów na trasie':DE?'<b>Karte</b> — Karte mit Kundenstandorten auf der Route':'<b>Карта</b> — карта з розташуванням клієнтів на маршруті',

    sec_colors:  PL?'🎨 Kolory kart':DE?'🎨 Kartenfarben':'🎨 Кольори карток',
    col_green:   PL?'Zielona = przyjechało (czeka na pranie)':DE?'Grün = angekommen (wartet auf die Wäsche)':'Зелена = приїхало (чекає на прання)',
    col_blue:    PL?'Niebieska = do odbioru (gotowe)':DE?'Blau = zur Abholung (fertig)':'Синя = до видачі (готово)',
    col_gray:    PL?'Szara = odebrane / zakończone':DE?'Grau = abgeholt / abgeschlossen':'Сіра = забрано / завершено',
  };

  function section(title, items){
    return '<div class="help-sec"><div class="help-sec-title">'+title+'</div>'
      +items.map(function(i){return'<div class="help-sec-item">'+i+'</div>';}).join('')
      +'</div>';
  }

  el.innerHTML=
    '<div class="legend-box" style="margin-top:0;padding:0;background:none;border:none;box-shadow:none;gap:0">'
    +'<div style="font-size:16px;font-weight:800;color:var(--text-primary);padding:16px 16px 4px">'+T.title+'</div>'
    +'<div style="font-size:13px;color:var(--text-secondary);padding:0 16px 16px;line-height:1.5">'+T.intro+'</div>'
    +section(T.sec_driver,[T.driver1,T.driver2,T.driver3])
    +section(T.sec_schedule,[T.sched1,T.sched2,T.sched3,T.sched4])
    +section(T.sec_badges,[
      T.badge_p,T.badge_o,T.badge_t,T.badge_kg,T.badge_flag
    ])
    +section(T.sec_arrival,[T.arr1,T.arr2,T.arr3])
    +section(T.sec_pickup,[T.pick1,T.pick2,T.pick3,T.pick4])
    +section(T.sec_add,[T.add1,T.add2,T.add3])
    +section(T.sec_nav,[T.nav_hist,T.nav_clients,T.nav_map])
    +section(T.sec_colors,[T.col_green,T.col_blue,T.col_gray])
    +'</div>';
}

// ── REPORTS & LOGS ──
function loadReports() {
  document.getElementById('reportsContent').innerHTML='<div class="loader">'+t('loading')+'</div>';
  google.script.run.withFailureHandler(function(e){
    document.getElementById('reportsContent').innerHTML='<div style="color:var(--accent-red)">Błąd: '+e.message+'</div>';
  }).withSuccessHandler(function(allEntries) {
    renderReports(allEntries);
  }).getAllEntries();
}

function renderReports(entries) {
  // Aggregate data: total kg, total clients picked, driver stats, days stats
  const completed = entries.filter(e => e.done);
  let totalKg = 0;
  const driverStats = {};
  const dayStats = {1:0,2:0,3:0,4:0,5:0,6:0,0:0};
  const clientsSet = new Set();
  
  completed.forEach(e => {
    totalKg += e.weight || 0;
    clientsSet.add(e.client);
    
    if (e.pickedBy) {
      if (!driverStats[e.pickedBy]) driverStats[e.pickedBy] = {kg:0, count:0};
      driverStats[e.pickedBy].kg += e.weight || 0;
      driverStats[e.pickedBy].count += 1;
    }
    
    if (e.pickedAt) {
      // Very basic parsing to find day of week, or just use pickDay
      dayStats[e.pickDay] = (dayStats[e.pickDay] || 0) + (e.weight || 0);
    }
  });

  const dayNames = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
  let maxDayKg = Math.max(...Object.values(dayStats), 1);

  var html = '<div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">' +
    '<div class="card" style="flex:1;min-width:120px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--accent-blue)">' + totalKg.toFixed(1) + '</div><div style="font-size:12px;color:var(--text-tertiary)">Zabrane Kg</div></div>' +
    '<div class="card" style="flex:1;min-width:120px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--accent-green)">' + completed.length + '</div><div style="font-size:12px;color:var(--text-tertiary)">Odebrane wpisy</div></div>' +
    '<div class="card" style="flex:1;min-width:120px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--accent-orange)">' + clientsSet.size + '</div><div style="font-size:12px;color:var(--text-tertiary)">Obsłużeni klienci</div></div>' +
    '</div>' +
    '<div class="sec-label">Obciążenie w tygodniu (Kg)</div>' +
    '<div class="card" style="margin-bottom:24px">' +
      [1,2,3,4,5,6,0].map(function(d) { return '' +
        '<div style="display:flex;align-items:center;margin-bottom:8px">' +
          '<div style="width:100px;font-size:12px;color:var(--text-secondary)">' + dayNames[d] + '</div>' +
          '<div style="flex:1;height:12px;background:var(--bg-secondary);border-radius:6px;overflow:hidden">' +
            '<div style="width:' + ((dayStats[d]/maxDayKg)*100) + '%;height:100%;background:var(--accent-blue)"></div>' +
          '</div>' +
          '<div style="width:60px;text-align:right;font-size:12px;font-weight:600">' + dayStats[d].toFixed(0) + '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="sec-label">Statystyki kierowców</div>' +
    '<div class="card">' +
      (Object.keys(driverStats).length === 0 ? '<div style="color:var(--text-tertiary);font-size:13px">Brak danych kierowców</div>' : '') +
      Object.keys(driverStats).sort(function(a,b){return driverStats[b].kg-driverStats[a].kg;}).map(function(drv) { return '' +
        '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<div style="font-weight:600;font-size:14px">' + esc(drv) + '</div>' +
          '<div style="font-size:13px"><span style="color:var(--accent-green)">' + driverStats[drv].count + '</span> odbiorów, <span style="font-weight:600">' + driverStats[drv].kg.toFixed(1) + 'kg</span></div>' +
        '</div>';
      }).join('') +
    '</div>';
  document.getElementById('reportsContent').innerHTML = html;
}

function loadLogs() {
  document.getElementById('logsContent').innerHTML='<div class="loader">'+t('loading')+'</div>';
  google.script.run.withFailureHandler(function(e){
    document.getElementById('logsContent').innerHTML='<div style="color:var(--accent-red)">Błąd: '+e.message+'</div>';
  }).withSuccessHandler(function(logs) {
    var html = '' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;background:var(--bg-card);border-radius:12px;overflow:hidden">' +
        '<tr style="background:var(--bg-secondary);text-align:left">' +
          '<th style="padding:10px">Data</th><th style="padding:10px">Kto</th><th style="padding:10px">Akcja</th><th style="padding:10px">ID/Szczegóły</th>' +
        '</tr>' +
        logs.map(function(l) { return '' +
          '<tr style="border-top:1px solid var(--border)">' +
            '<td style="padding:8px 10px;white-space:nowrap;color:var(--text-secondary)">' + esc(l.date) + '</td>' +
            '<td style="padding:8px 10px;font-weight:600">' + esc(l.user) + '</td>' +
            '<td style="padding:8px 10px;color:var(--accent-blue)">' + esc(l.action) + '</td>' +
            '<td style="padding:8px 10px">' + esc(l.target) + ' ' + esc(l.details) + '</td>' +
          '</tr>';
        }).join('') +
      '</table>';
    document.getElementById('logsContent').innerHTML = html;
  }).getLogs();
}

function changeWeek(diff){weekOffset+=diff;renderGrid();}
function filterSchedule() {
  const q = document.getElementById('scheduleSearch').value.toLowerCase();
  document.querySelectorAll('#grid1 .tag, #grid2 .tag').forEach(tag => {
    const nameEl = tag.querySelector('.tag-name');
    const name = (nameEl ? nameEl.textContent : '').toLowerCase();
    if (name.includes(q)) {
      tag.style.display = '';
    } else {
      tag.style.display = 'none';
    }
  });
}
function loadWeek(){
  document.getElementById('grid1').innerHTML='<div class="loader">'+t('loading')+'</div>';
  document.getElementById('grid2').innerHTML='';
  google.script.run.withFailureHandler(function(err){
    const msg = t('error_label') + ': '+(err&&err.message?err.message:'Nieznany błąd');
    const loader = document.querySelector('#grid1 .loader');
    if(loader) { loader.textContent = msg; loader.style.color = 'red'; } else alert(msg);
  }).withSuccessHandler(function(data){entries=data||[];renderGrid();}).getEntriesForWeeks([weekKey(weekOffset-1),weekKey(weekOffset),weekKey(weekOffset+1)]);
}

function renderGrid(){
  const d1s=getMonday(weekOffset);const d1e=new Date(d1s);d1e.setDate(d1s.getDate()+4);
  const d2s=getMonday(weekOffset+1);const d2e=new Date(d2s);d2e.setDate(d2s.getDate()+4);
  document.getElementById('titleWk1').textContent=fmtDate(d1s)+' – '+fmtDate(d1e);
  document.getElementById('titleWk2').textContent=t('grid_next_week_pfx')+fmtDate(d2s)+' – '+fmtDate(d2e);
  document.getElementById('grid1').innerHTML=buildGridHTML(weekOffset,weekKey(weekOffset));
  document.getElementById('grid2').innerHTML=buildGridHTML(weekOffset+1,weekKey(weekOffset+1));
  initSortables();
}

function initSortables() {
  if (!isAdmin) return;
  if (typeof Sortable === 'undefined') {
    console.warn("SortableJS is not loaded.");
    return;
  }
  document.querySelectorAll('.sortable-arr, .sortable-pick').forEach(el => {
    new Sortable(el, {
      group: 'entries',
      animation: 150,
      ghostClass: 'sortable-ghost',
      delay: window.innerWidth <= 768 ? 200 : 0, // Delay for mobile
      delayOnTouchOnly: true,
      onEnd: function(evt) {
        // Collect new order
        const orderedIds = Array.from(evt.to.children).map(c => c.getAttribute('data-id')).filter(id => id);
        if (orderedIds.length === 0) return;
        toast(currentLang === 'DE' ? 'Reihenfolge wird gespeichert...' : (currentLang === 'UA' ? 'Збереження порядку…' : 'Zapisywanie kolejności…'));
        
        // Optymistycznie zaktualizuj lokalne entries
        orderedIds.forEach((id, idx) => {
          const entry = entries.find(e => e.id === id);
          if(entry) entry.order = idx + 1;
        });

        google.script.run.withFailureHandler(e => {
          alert(t('error_label') + ': ' + e.message); loadWeek();
        }).withSuccessHandler(() => {
          toast(currentLang === 'DE' ? 'Reihenfolge gespeichert' : (currentLang === 'UA' ? 'Порядок збережено' : 'Kolejność zapisana'));
        }).updateEntriesOrder(orderedIds, getAdminToken());
      }
    });
  });
}

function buildGridHTML(offset,targetWkKey){
  const monday=getMonday(offset);const prevWkKey=weekKey(offset-1);
  const today=new Date();today.setHours(0,0,0,0);
  const days=Array.from({length:5},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d;});
  return days.map((d,i)=>{
    const isToday=d.getTime()===today.getTime();
    const arrived=entries.filter(e=>e.weekKey===targetWkKey&&e.arrDay===i);
    const sumArr=arrived.reduce((s,e)=>s+e.weight,0);
    let washToday=i===0?entries.filter(e=>e.weekKey===prevWkKey&&e.arrDay===4):entries.filter(e=>e.weekKey===targetWkKey&&e.arrDay===i-1);
    const sumWash=washToday.reduce((s,e)=>s+e.weight,0);
    const pickups=entries.filter(e=>e.pickWeekKey===targetWkKey&&e.pickDay===i&&!(e.weekKey===targetWkKey&&e.arrDay===i));
    const arrTags=arrived.sort((a,b)=>a.order-b.order).map(e=>{
      const typeBadge='<span class="laundry-type-badge type-'+esc(e.type || 'P')+'">'+esc(e.type || 'P')+'</span>';
      const kg=e.weight>0?'<span class="kg-badge">'+esc(e.weight)+'kg</span>':'';
      const urgentFlag=e.urgent?'<span style="color:var(--accent-red);font-size:11px;margin-right:2px">🚩</span>':'';
      return'<div class="tag '+(e.done?'tag-done':'tag-arr')+(isAdmin?' draggable':'')+'" data-id="'+esc(e.id)+'" onclick="openEdit('+jsArg(e.id)+',true)">'+urgentFlag+'<span class="tag-name">'+esc(e.client)+'</span>'+typeBadge+kg+'<span class="rt-badge rt-'+getRouteColorIdx(e.route)+'">T'+esc(e.route)+'</span><span style="opacity:0.3;font-size:16px;margin-left:auto;padding-left:2px">›</span></div>';
    }).join('');
    const pickTags=(function(){
      // Grupuj odbiory po kliencie — P+O tego samego klienta razem
      const byClient={};
      pickups.forEach(function(e){
        const key=e.client+'||'+e.route;
        if(!byClient[key]) byClient[key]={client:e.client,route:e.route,entries:[e],totalWeight:e.weight,types:[e.type||'P'],allDone:e.done,urgent:e.urgent,order:e.order,id:e.id};
        else{byClient[key].entries.push(e);byClient[key].totalWeight+=e.weight;if(byClient[key].types.indexOf(e.type||'P')===-1)byClient[key].types.push(e.type||'P');if(!e.done)byClient[key].allDone=false;if(e.urgent)byClient[key].urgent=true;byClient[key].order=Math.min(byClient[key].order, e.order);}
      });
      return Object.keys(byClient).map(key=>byClient[key]).sort((a,b)=>a.order-b.order).map(function(g){
        if(g.entries.length===1){
          const e=g.entries[0];
          const typeBadge='<span class="laundry-type-badge type-'+esc(e.type||'P')+'">'+esc(e.type||'P')+'</span>';
          const kg=e.weight>0?'<span class="kg-badge">'+esc(e.weight)+'kg</span>':'';
          const urgentFlag=e.urgent?'<span style="color:var(--accent-red);font-size:11px;margin-right:2px">🚩</span>':'';
          return'<div class="tag '+(e.done?'tag-done':'tag-pick')+(isAdmin?' draggable':'')+'" data-id="'+esc(e.id)+'" onclick="openEdit('+jsArg(e.id)+')">'+urgentFlag+'<span class="tag-name">'+esc(e.client)+'</span>'+typeBadge+kg+'<span class="rt-badge rt-'+getRouteColorIdx(e.route)+'">T'+esc(e.route)+'</span><span style="opacity:0.3;font-size:16px;margin-left:auto;padding-left:2px">›</span></div>';
        }else{
          const typesBadges=g.types.sort().map(function(tp){return'<span class="laundry-type-badge type-'+esc(tp)+'">'+esc(tp)+'</span>';}).join('');
          const kg=g.totalWeight>0?'<span class="kg-badge">'+g.totalWeight.toFixed(1)+'kg</span>':'';
          const urgentFlag=g.urgent?'<span style="color:var(--accent-red);font-size:11px;margin-right:2px">🚩</span>':'';
          return'<div class="tag '+(g.allDone?'tag-done':'tag-pick')+(isAdmin?' draggable':'')+'" data-id="'+esc(g.id)+'" onclick="openEdit('+jsArg(g.entries[0].id)+')">'+urgentFlag+'<span class="tag-name">'+esc(g.client)+'</span>'+typesBadges+kg+'<span class="rt-badge rt-'+getRouteColorIdx(g.route)+'">T'+esc(g.route)+'</span><span style="opacity:0.3;font-size:16px;margin-left:auto;padding-left:2px">›</span></div>';
        }
      }).join('');
    })();
    return'<div class="col'+(isToday?' col-today':'')+'">'+
      '<div class="col-header"><span class="col-date">'+fmtDate(d)+'</span><span class="col-day-name" style="flex:1;text-align:center">'+DAY_NAMES[i]+'</span>'+(isToday?'<span class="today-pill">'+t('grid_today')+'</span>':'')+'</div>'+
      '<div class="metrics-row">'+
        '<div class="metric-chip arr"><div class="metric-chip-label">'+t('grid_arrival')+'</div><div class="metric-chip-val">'+(sumArr>0?sumArr.toFixed(1):0)+' kg</div></div>'+
        '<div class="metric-chip wash"><div class="metric-chip-label">'+t('grid_wash')+'</div><div class="metric-chip-val">'+(sumWash>0?sumWash.toFixed(1):0)+' kg</div></div>'+
      '</div>'+
      '<div class="sec-label">'+t('grid_arrived_sec')+'</div>'+'<div class="sortable-arr">'+arrTags+'</div>'+
      (pickTags?'<div class="divider"></div><div class="sec-label">'+t('grid_pickup_sec')+'</div>'+'<div class="sortable-pick">'+pickTags+'</div>':'')+
      '<button class="add-btn" onclick="openAdd('+i+','+offset+')">'+t('grid_add_btn')+'</button>'+
    '</div>';
  }).join('');
}

function isRouteDaily(routeId){
  const name=(routeMap[routeId]||'').toLowerCase();
  return name.includes('codzien') || name.includes('pn-pt') || name.includes('mo-fr') || name.includes('täglich');
}

function updateDefaultPickup(mode){
  const pfx=mode==='add'?'m':'e';
  const arr=parseInt(document.getElementById(pfx+'ArrDay').value);

  // Sprawdź trasę wybranego klienta
  let routeId=null;
  if(mode==='add'){
    const cName=document.getElementById('mClient').value;
    const cObj=clients.find(c=>c.name===cName);
    if(cObj) routeId=cObj.route;
  } else {
    // W trybie edycji — weź trasę z edytowanego wpisu
    const entry=entries.find(e=>e.id===editingId);
    if(entry) routeId=entry.route;
  }

  let p=0,w=0;
  if(routeId && isRouteDaily(routeId)){
    // Trasa codzienna: odbiór następnego dnia
    if(arr<4){p=arr+1;w=0;}else{p=0;w=1;} // Pt→Pn nast. tydzień
  } else {
    // Trasy co drugi dzień: +2 dni (stara logika)
    if(arr===0){p=2;w=0;}else if(arr===1){p=3;w=0;}else if(arr===2){p=4;w=0;}else if(arr===3){p=1;w=1;}else if(arr===4){p=0;w=1;}
  }
  document.getElementById(pfx+'PickDay').value=p;document.getElementById(pfx+'PickWeek').value=w;
}

function setSegmentedVal(pfx, val){
  document.getElementById(pfx).value = val;
  const pBtn = document.getElementById(pfx+'_P');
  const oBtn = document.getElementById(pfx+'_O');
  if(val==='P'){
    pBtn.classList.add('active');
    oBtn.classList.remove('active');
  } else {
    pBtn.classList.remove('active');
    oBtn.classList.add('active');
  }
}

function openAdd(dayIdx,offset){
  if (!isAdmin && !currentDriver) {
    toast(currentLang === 'DE' ? 'Bitte melden Sie sich als Fahrer an' : (currentLang === 'UA' ? 'Увійдіть як водій' : 'Zaloguj się jako kierowca, aby dodać zamówienie'));
    openDriverSelect();
    return;
  }
  pendingTargetOffset=offset;
  let optionsHTML='';
  const routeIds=Object.keys(routeMap).map(Number).sort((a,b)=>a-b);
  // Filtrowanie tras:
  // - Admin BEZ wybranego kierowcy → widzi wszystko
  // - Admin Z wybranym kierowcą → widzi wszystko (admin ma pełny dostęp)
  // - Kierowca z przypisanymi trasami → widzi TYLKO swoje trasy
  // - Kierowca BEZ przypisanych tras → widzi wszystko
  let allowedRoutes = null;
  if (!isAdmin && currentDriver) {
    const freshDriver = drivers.find(function(d){ return d.id === currentDriver.id; });
    const driverRoutes = freshDriver ? freshDriver.routes : (currentDriver.routes || []);
    if (driverRoutes && driverRoutes.length > 0) {
      allowedRoutes = driverRoutes;
    }
  }
  routeIds.forEach(rId=>{
    if(allowedRoutes !== null && !allowedRoutes.includes(rId)) return;
    const rc=clients.filter(c=>c.route===rId);
    if(rc.length>0){optionsHTML+='<optgroup label="'+esc(getRouteName(rId))+'">';rc.forEach(c=>{optionsHTML+='<option value="'+esc(c.name)+'">'+esc(c.name)+'</option>';});optionsHTML+='</optgroup>';}
  });
  document.getElementById('mClient').innerHTML=optionsHTML;
  if(!optionsHTML){toast(t('toast_add_client_first'));return;}
  document.getElementById('mArrDay').value=dayIdx;document.getElementById('mWeight').value='';
  document.getElementById('mComment').value='';
  document.getElementById('mUrgent').checked=false;
  setSegmentedVal('mType', 'P');
  // Pokaż hint z nazwą kierowcy
  const hintEl=document.getElementById('addModalDriverHint');
  if(hintEl) hintEl.textContent=currentDriver ? currentDriver.name : '';
  updateDefaultPickup('add');document.getElementById('addModal').style.display='flex';
  lockScroll();
}
function closeAdd(){document.getElementById('addModal').style.display='none';unlockScroll();}
function confirmAdd(){
  const cName=document.getElementById('mClient').value;const arrDay=parseInt(document.getElementById('mArrDay').value);const pickDay=parseInt(document.getElementById('mPickDay').value);
  const isNextWk=document.getElementById('mPickWeek').value==='1';const wt=document.getElementById('mWeight').value;
  const type=document.getElementById('mType').value;
  const comment=document.getElementById('mComment').value;
  const isUrgent=document.getElementById('mUrgent').checked;
  if(wt!==''){const wtNum=parseFloat(wt.replace(',','.'));if(isNaN(wtNum)||wtNum<=0){toast(t('toast_weight_error'));return;}}
  const cObj=clients.find(c=>c.name===cName);let arrWk=weekKey(pendingTargetOffset);let pickWk=isNextWk?weekKey(pendingTargetOffset+1):arrWk;
  const parsedWeight=wt?parseFloat(String(wt).replace(',','.')):0;
  const route=cObj?cObj.route:1;
  closeAdd();

  // Optymistyczny update — dodaj do lokalnej tablicy od razu i przerenderuj
  const tempId='ID_'+Date.now();
  const newEntry={id:tempId,weekKey:arrWk,pickWeekKey:pickWk,client:cName,arrDay:arrDay,pickDay:pickDay,done:false,weight:(parsedWeight>0?parsedWeight:0),route:route,type:(type||'P').toUpperCase(),addedBy:currentDriver?currentDriver.name:(isAdmin?'Admin':''),addedAt:new Date().toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),pickedBy:'',comment:comment,urgent:isUrgent,order:9999};
  entries.push(newEntry);
  renderGrid();
  toast(t('toast_added')+cName);

  // Zapisz na serwerze w tle
  google.script.run.withFailureHandler(function(e){
    // Cofnij optymistyczny update przy błędzie
    entries=entries.filter(function(en){return en.id!==tempId;});
    renderGrid();
    alert(t('error_label') + ': ' + translateError(e.message));
  }).withSuccessHandler(function(res){
    if(res&&res.error){
      entries=entries.filter(function(en){return en.id!==tempId;});
      renderGrid();
      alert(t('error_label') + ': ' + translateError(res.error));
    } else if(res&&res.id){
      // Zaktualizuj tymczasowe ID na prawdziwe z serwera i przerenderuj
      const idx=entries.findIndex(function(en){return en.id===tempId;});
      if(idx!==-1) entries[idx].id=res.id;
      renderGrid();
    }
  }).addEntry(arrWk,cName,arrDay,pickDay,pickWk,wt,route,type, currentDriver ? currentDriver.name : (isAdmin ? 'Admin' : ''), isUrgent, comment);
}

// ── OPEN EDIT — rozgałęzienie user / admin ──
function openEdit(id, isArrival){
  const entry=entries.find(e=>e.id===id);if(!entry)return;
  if(!isAdmin){openViewEntry(entry, isArrival);return;}
  // Admin: pełny modal edycji
  editingId=id;
  document.getElementById('eClientName').textContent=entry.client+' — '+getRouteName(entry.route);
  // Meta info: kto przywiózł, kiedy, kto odebrał
  let metaParts=[];
  if(entry.addedBy) metaParts.push('<b>'+t('label_added_by')+':</b> '+esc(entry.addedBy));
  if(entry.addedAt) metaParts.push('<b>'+t('label_added_at')+':</b> '+esc(entry.addedAt));
  if(entry.pickedBy) metaParts.push('<b>'+t('label_picked_by')+':</b> '+esc(entry.pickedBy));
  if(entry.pickedAt) metaParts.push('<b>'+t('label_picked_at')+':</b> '+esc(entry.pickedAt));
  const metaEl=document.getElementById('eMetaInfo');
  if(metaParts.length>0){metaEl.innerHTML=metaParts.join('<br>');metaEl.style.display='block';}
  else{metaEl.style.display='none';}
  document.getElementById('eArrDay').value=entry.arrDay;document.getElementById('ePickDay').value=entry.pickDay;
  document.getElementById('ePickWeek').value=(entry.weekKey!==entry.pickWeekKey)?'1':'0';
  document.getElementById('eWeight').value=entry.weight>0?entry.weight:'';
  document.getElementById('eComment').value=entry.comment||'';
  document.getElementById('eUrgent').checked=entry.urgent||false;
  setSegmentedVal('eType', entry.type || 'P');
  const tBtn=document.getElementById('eToggleBtn');tBtn.textContent=entry.done ? t('btn_mark_undone') : t('btn_mark_done');
  document.getElementById('editModal').style.display='flex';
  lockScroll();
}

// ── VIEW ENTRY (użytkownik) ──
function openViewEntry(entry, isArrival){
  viewEntryId = entry.id;
  // Znajdź wszystkie wpisy tego klienta na ten sam dzień odbioru (grupowanie P+O)
  const grouped = entries.filter(function(e){
    return e.client === entry.client && e.route === entry.route &&
           e.pickWeekKey === entry.pickWeekKey && e.pickDay === entry.pickDay &&
           !(e.weekKey === entry.weekKey && e.arrDay === entry.arrDay && e.weekKey === e.pickWeekKey && e.arrDay === e.pickDay);
  });
  // Jeśli to jest karta z sekcji "Przybył" — pokaż tylko ten jeden wpis
  // Jeśli to jest karta z sekcji "Do odbioru" — pokaż zgrupowane
  const isPickupView = (entry.pickWeekKey && entry.pickDay !== undefined);
  const relatedEntries = grouped.length > 0 ? grouped : [entry];
  // Sprawdź czy kliknięty wpis jest w sekcji odbioru (nie przyjazdu)
  const allForPickup = entries.filter(function(e){
    return e.client === entry.client && e.route === entry.route &&
           e.pickWeekKey === entry.pickWeekKey && e.pickDay === entry.pickDay;
  });
  // Użyj zgrupowanych tylko jeśli jest więcej niż 1 wpis z różnymi typami
  const uniqueTypes = [];
  allForPickup.forEach(function(e){ if(uniqueTypes.indexOf(e.type||'P')===-1) uniqueTypes.push(e.type||'P'); });
  const showGrouped = uniqueTypes.length > 1;
  const displayEntries = showGrouped ? allForPickup : [entry];

  // Nazwa trasy w kolorze trasy
  const veClientEl = document.getElementById('veClientName');
  veClientEl.textContent = entry.client + ' — ' + getRouteName(entry.route);
  veClientEl.style.color = getRouteColor(entry.route);

  // Dzień przyjazdu z datą
  function entryDayDate(wkKey, dayIdx) {
    if (!wkKey) return DAY_NAMES[dayIdx];
    const parts = wkKey.split('-');
    if (parts.length < 3) return DAY_NAMES[dayIdx];
    const mon = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
    mon.setDate(mon.getDate() + dayIdx);
    return DAY_NAMES[dayIdx] + ', ' + mon.getDate() + ' ' + ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'][mon.getMonth()];
  }
  document.getElementById('veArrDay').textContent = entryDayDate(entry.weekKey, entry.arrDay);
  document.getElementById('vePickDay').textContent = entryDayDate(entry.pickWeekKey, entry.pickDay);

  // Typ i waga — jeśli zgrupowane, pokaż oba
  if(showGrouped){
    const typesStr = displayEntries.map(function(e){ return (e.type==='O'?t('type_o'):t('type_p'))+' ('+e.weight+'kg)'; }).join(' + ');
    document.getElementById('veType').textContent=typesStr;
    const totalWeight = displayEntries.reduce(function(s,e){return s+e.weight;},0);
    document.getElementById('veWeight').textContent=totalWeight>0?totalWeight+' kg':'—';
  } else {
    document.getElementById('veType').textContent=(entry.type === 'O') ? t('type_o') : t('type_p');
    document.getElementById('veWeight').textContent=entry.weight>0?entry.weight+' kg':'—';
  }

  const allDone = displayEntries.every(function(e){return e.done;});
  const statusEl=document.getElementById('veStatus');
  statusEl.textContent=allDone ? t('status_done') : t('status_pending');
  statusEl.style.color=allDone?'var(--accent-green)':'var(--text-tertiary)';

  // Pokaż kto przywiózł i kiedy wpisał
  const addedByRow=document.getElementById('veAddedByRow');
  const addedAtRow=document.getElementById('veAddedAtRow');
  const pickedByRow=document.getElementById('vePickedByRow');
  const addedByVal=entry.addedBy||'';
  const addedAtVal=entry.addedAt||'';
  const pickedByVal=entry.pickedBy||'';
  if(addedByVal){
    addedByRow.style.display='flex';
    document.getElementById('veAddedBy').textContent=addedByVal;
  } else { addedByRow.style.display='none'; }
  if(addedAtVal){
    addedAtRow.style.display='flex';
    document.getElementById('veAddedAt').textContent=addedAtVal;
  } else { addedAtRow.style.display='none'; }
  if(pickedByVal){
    pickedByRow.style.display='flex';
    document.getElementById('vePickedBy').textContent=pickedByVal;
  } else { pickedByRow.style.display='none'; }
  const pickedAtRow=document.getElementById('vePickedAtRow');
  const pickedAtVal=entry.pickedAt||'';
  if(pickedAtVal){
    pickedAtRow.style.display='flex';
    document.getElementById('vePickedAt').textContent=pickedAtVal;
  } else { pickedAtRow.style.display='none'; }
  
  const urgentRow = document.getElementById('veUrgentRow');
  urgentRow.style.display = entry.urgent ? 'flex' : 'none';

  const commentRow = document.getElementById('veCommentRow');
  if(entry.comment) {
    commentRow.style.display = 'flex';
    document.getElementById('veComment').textContent = entry.comment;
  } else {
    commentRow.style.display = 'none';
  }

  const tBtn=document.getElementById('veToggleBtn');
  tBtn.textContent=allDone ? t('btn_mark_undone') : t('btn_mark_done');
  tBtn.className='done-btn'+(allDone?' danger':'');
  tBtn.style.display = isArrival ? 'none' : '';
// Zapamiętywanie wybranej paczki wpisów do komentarza
let pendingToggleEntries = null;

function performToggle(displayEntries, commentText) {
  const allDone = displayEntries.every(function(e){return e.done;});
  // Optymistyczny toggle — zmień stan wszystkich wpisów w grupie
  displayEntries.forEach(function(de){
    const idx=entries.findIndex(function(en){return en.id===de.id;});
    if(idx!==-1){
      entries[idx].done=!allDone;
      entries[idx].pickedBy=(!allDone)?(currentDriver?currentDriver.name:''):'';
      entries[idx].pickedAt=(!allDone)?new Date().toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
      if (commentText !== undefined) entries[idx].comment = commentText;
    }
  });
  renderGrid();
  // Wyślij toggle dla każdego wpisu
  displayEntries.forEach(function(de){
    google.script.run.withFailureHandler(function(e){
      loadWeek(); // Przy błędzie przeładuj
    }).withSuccessHandler(function(res){
      if(res&&res.error) loadWeek();
    }).toggleDone(de.id, currentDriver ? currentDriver.name : '', commentText);
  });
}

  tBtn.onclick=function(){
    if (!isAdmin && !currentDriver) {
      toast(currentLang === 'DE' ? 'Bitte melden Sie sich als Fahrer an' : (currentLang === 'UA' ? 'Увійдіть як водій' : 'Zaloguj się jako kierowca'));
      openDriverSelect();
      return;
    }
    closeViewEntry();
    const ci = document.getElementById('veCommentInput');
    const commentText = (ci && isOwner) ? ci.value.trim() : undefined;
    performToggle(displayEntries, commentText);
  };

  // Przycisk Usuń — widoczny jeśli kierowca dodał choć jeden wpis w grupie
  const deleteRow=document.getElementById('veDeleteRow');
  const ownerCommentRow=document.getElementById('veOwnerCommentRow');
  // isOwner: kierowca dodał WSZYSTKIE wpisy (dla komentarza edytowalnego)
  const isOwner = currentDriver && displayEntries.every(function(de){
    return de.addedBy && de.addedBy === currentDriver.name;
  });
  // canDelete: kierowca dodał przynajmniej jeden wpis w grupie
  const ownEntries = currentDriver ? displayEntries.filter(function(de){
    return de.addedBy && de.addedBy === currentDriver.name;
  }) : [];
  const canDelete = ownEntries.length > 0 && isArrival;
  if(deleteRow) deleteRow.style.display = canDelete ? 'flex' : 'none';
  // Właściciel: pole edytowalne zamiast read-only
  const commentRow2 = document.getElementById('veCommentRow');
  const commentInput = document.getElementById('veCommentInput');
  if(isOwner) {
    if(commentRow2) commentRow2.style.display = 'none';
    if(ownerCommentRow) ownerCommentRow.style.display = 'block';
    if(commentInput) commentInput.value = entry.comment || '';
  } else {
    if(ownerCommentRow) ownerCommentRow.style.display = 'none';
  }
  if(canDelete){
    document.getElementById('veDeleteBtn').onclick=function(){
      const confirmMsg = currentLang === 'DE' ? 'Eintrag löschen?' : (currentLang === 'UA' ? 'Вилучити запис?' : 'Usunąć wpis?');
      if(!confirm(confirmMsg)) return;
      closeViewEntry();
      // Usuń tylko wpisy tego kierowcy
      const idsToRemove = ownEntries.map(function(de){return de.id;});
      entries=entries.filter(function(en){return idsToRemove.indexOf(en.id)===-1;});
      renderGrid();
      toast(t('toast_deleted'));
      idsToRemove.forEach(function(eid){
        google.script.run.withFailureHandler(function(e){
          loadWeek();
        }).withSuccessHandler(function(res){
          if(res&&res.error) loadWeek();
        }).removeOwnEntry(eid, currentDriver.name);
      });
    };
  }

  document.getElementById('viewEntryModal').style.display='flex';
  lockScroll();
}
function closeViewEntry(){document.getElementById('viewEntryModal').style.display='none';unlockScroll();}

function saveViewEntryComment(){
  if(!currentDriver||!viewEntryId) return;
  const ci=document.getElementById('veCommentInput');
  const comment=(ci?ci.value.trim():'');
  // Zapisz lokalnie w entries i pokaż wszystkim
  const idx=entries.findIndex(function(e){return e.id===viewEntryId;});
  if(idx!==-1){
    entries[idx].comment=comment;
    // Odśwież wyświetlenie komentarza w info-row
    const cr=document.getElementById('veCommentRow');
    const cv=document.getElementById('veComment');
    if(comment){
      if(cr) cr.style.display='flex';
      if(cv) cv.textContent=comment;
    } else {
      if(cr) cr.style.display='none';
    }
    renderGrid();
  }
  toast(currentLang==='DE'?'Kommentar gespeichert':(currentLang==='UA'?'Коментар збережено':'Komentarz zapisany'));
  // Wyślij na serwer
  google.script.run
    .withFailureHandler(function(){toast('Błąd zapisu komentarza');})
    .withSuccessHandler(function(res){if(res&&res.error) toast(res.error);})
    .saveCommentByDriver(viewEntryId, currentDriver.name, comment);
}

function closeEdit(){document.getElementById('editModal').style.display='none';editingId=null;unlockScroll();}
function saveEdit(){
  if(!editingId)return;const arrDay=parseInt(document.getElementById('eArrDay').value);const pickDay=parseInt(document.getElementById('ePickDay').value);
  const id=editingId;
  const isNextWk=document.getElementById('ePickWeek').value==='1';const wt=document.getElementById('eWeight').value;
  const type=document.getElementById('eType').value;
  const comment=document.getElementById('eComment').value;
  const isUrgent=document.getElementById('eUrgent').checked;
  if(wt!==''){const wtNum=parseFloat(wt.replace(',','.'));if(isNaN(wtNum)||wtNum<=0){toast(t('toast_weight_error'));return;}}
  closeEdit();
  const original=entries.find(e=>e.id===id);
  const fallback=original?{client:original.client,weekKey:original.weekKey,pickWeekKey:original.pickWeekKey,arrDay:original.arrDay,pickDay:original.pickDay,type:original.type}:null;
  google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + translateError(e.message))}).withSuccessHandler(function(res){if(res&&res.error)alert(t('error_label') + ': ' + translateError(res.error));else{toast(t('toast_saved'));loadWeek();}}).updateEntry(id,arrDay,pickDay,isNextWk,wt,fallback,getAdminToken(),type,isUrgent,comment);
}

function copyEntry(source) {
  let entry = null;
  if (source === 'edit' && editingId) {
    entry = entries.find(e => e.id === editingId);
    closeEdit();
  } else if (source === 'view' && viewEntryId) {
    entry = entries.find(e => e.id === viewEntryId);
    closeViewEntry();
  }
  if (!entry) return;
  // Open Add modal but prefilled
  openAdd(entry.arrDay, weekOffset);
  setTimeout(() => {
    document.getElementById('mClient').value = entry.client;
    document.getElementById('mWeight').value = entry.weight > 0 ? entry.weight : '';
    setSegmentedVal('mType', entry.type || 'P');
    document.getElementById('mPickWeek').value = (entry.weekKey !== entry.pickWeekKey) ? '1' : '0';
    document.getElementById('mPickDay').value = entry.pickDay;
    document.getElementById('mComment').value = entry.comment || '';
    document.getElementById('mUrgent').checked = entry.urgent || false;
  }, 50);
}

let viewEntryId = null; // store current view id for copying

function toggleDoneFromEdit(){if(!editingId)return;const id=editingId;closeEdit();const idx=entries.findIndex(function(en){return en.id===id;});if(idx!==-1){const newDone=!entries[idx].done;entries[idx].done=newDone;entries[idx].pickedBy=newDone?(currentDriver?currentDriver.name:''):'';entries[idx].pickedAt=newDone?new Date().toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';}renderGrid();google.script.run.withFailureHandler(function(e){if(idx!==-1){entries[idx].done=!entries[idx].done;entries[idx].pickedBy='';entries[idx].pickedAt='';}renderGrid();alert(t('error_label')+': '+translateError(e.message));}).withSuccessHandler(function(res){if(res&&res.error){if(idx!==-1){entries[idx].done=!entries[idx].done;entries[idx].pickedBy='';entries[idx].pickedAt='';}renderGrid();}}).toggleDone(id, currentDriver ? currentDriver.name : '');}
function deleteFromEdit(){
  if(!editingId)return;
  const entryToDel=entries.find(e=>e.id===editingId);
  const promptText = currentLang === 'DE' ? 'Eintrag löschen' : (currentLang === 'UA' ? 'Вилучити запис' : 'Usunąć wpis');
  if(!confirm(promptText + (entryToDel ? ' "' + esc(entryToDel.client) + '"' : '') + ' ?')) return;
  const id=editingId;closeEdit();
  google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + translateError(e.message))}).withSuccessHandler(function(){toast(t('toast_deleted'));loadWeek();}).removeEntry(id,getAdminToken());
}

var _histAllEntries=null;
function histSearch(){
  if(!_histAllEntries)return;
  const q=document.getElementById('histSearchInput');
  renderHistoryData(_histAllEntries, q?q.value.trim().toLowerCase():'');
}

function renderHistoryData(all, filter){
  const cont=document.getElementById('histContent');
  const L=currentLang;
  const lbl={
    pickups: L==='DE'?'Abh.':L==='UA'?'Видач':'Odb.',
    avg:     L==='DE'?'\u00D8':L==='UA'?'\u0421\u0435\u0440.':'\u015Ar.',
    brought: L==='DE'?'Gebracht':L==='UA'?'\u041F\u0440\u0438\u0432\u0456\u0437':'Przywiózł',
    addedAt: L==='DE'?'Eingetr.':L==='UA'?'Записано':'Wpisano',
    pickedBy:L==='DE'?'Abgeholt':L==='UA'?'Забрав':'Odebrał',
    pickedAt:L==='DE'?'am':L==='UA'?'':'',
    noData:  L==='DE'?'Keine Einträge':L==='UA'?'Немає записів':'Brak wpisów',
    noResult:L==='DE'?'Keine Ergebnisse':L==='UA'?'Немає результатів':'Brak wyników',
    pending: L==='DE'?'Ausstehend':L==='UA'?'Очікує':'Oczekuje',
    done:    L==='DE'?'Abgeholt':L==='UA'?'Забрано':'Odebrane',
  };
  if(!all.length){cont.innerHTML='<div class="loader">'+lbl.noData+'</div>';return;}
  const filtered=filter?all.filter(function(e){
    return (e.client||'').toLowerCase().includes(filter)
      ||(e.addedBy||'').toLowerCase().includes(filter)
      ||(e.pickedBy||'').toLowerCase().includes(filter)
      ||(e.comment||'').toLowerCase().includes(filter);
  }):all;
  if(!filtered.length){cont.innerHTML='<div class="loader">'+lbl.noResult+'</div>';return;}
  const byClient={};
  filtered.forEach(function(e){
    const key=e.client+'||'+e.route;
    if(!byClient[key])byClient[key]={client:e.client,route:e.route,entries:[]};
    byClient[key].entries.push(e);
  });
  const sorted=Object.values(byClient).sort(function(a,b){
    return (a.route||0)-(b.route||0)||a.client.localeCompare(b.client);
  });
  function parseMonth(e){
    const src=e.addedAt||e.pickedAt||'';
    if(!src)return null;
    const p=src.split(',')[0].split('.');
    return p.length===3?p[1].trim()+'.'+p[2].trim():null;
  }
  const cards=sorted.map(function(g){
    const entries=g.entries;
    const doneEnt=entries.filter(function(e){return e.done;});
    const totalKg=entries.reduce(function(s,e){return s+(e.weight||0);},0);
    const doneKg=doneEnt.reduce(function(s,e){return s+(e.weight||0);},0);
    const avgKg=doneEnt.length?(doneKg/doneEnt.length).toFixed(1):'—';
    const rColor=getRouteColor(g.route);
    const rIdx=getRouteColorIdx(g.route);
    const byMonth={};
    entries.forEach(function(e){
      const m=parseMonth(e)||'—';
      if(!byMonth[m])byMonth[m]=[];
      byMonth[m].push(e);
    });
    const monthBlocks=Object.keys(byMonth).sort(function(a,b){return b.localeCompare(a);}).map(function(m){
      const mes=byMonth[m];
      const mKg=mes.reduce(function(s,e){return s+(e.weight||0);},0);
      const mHead='<div class="hist-month-head">'
        +'<span style="font-size:11px;font-weight:800;color:var(--text-primary)">'+esc(m)+'</span>'
        +'<span style="font-size:10px;color:var(--text-tertiary);margin-left:auto">'+mes.length+'\u00D7 · <b style="color:var(--accent-blue)">'+mKg.toFixed(1)+' kg</b></span>'
        +'</div>';
      const rows=mes.sort(function(a,b){return (b.addedAt||'').localeCompare(a.addedAt||'');}).map(function(e){
        const tb='<span class="laundry-type-badge type-'+(e.type||'P')+'" style="font-size:9px;padding:1px 5px">'+(e.type||'P')+'</span>';
        const kb=e.weight>0?'<span style="font-size:11px;font-weight:600;color:var(--text-secondary)">'+e.weight+' kg</span>':'';
        const sb=e.done
          ?'<span style="font-size:10px;font-weight:700;color:var(--accent-green)">✓ '+lbl.done+'</span>'
          :'<span style="font-size:10px;font-weight:600;color:var(--accent-red)">⏳ '+lbl.pending+'</span>';
        const uf=e.urgent?'<span style="color:var(--accent-red)">🚩</span>':'';
        const infos=[];
        if(e.addedBy)infos.push('<span style="color:var(--text-tertiary)">'+lbl.brought+':</span> <b>'+esc(e.addedBy)+'</b>'+(e.addedAt?' <span style="color:var(--text-quaternary);font-size:10px">'+esc(e.addedAt)+'</span>':''));
        if(e.pickedBy)infos.push('<span style="color:var(--text-tertiary)">'+lbl.pickedBy+':</span> <b style="color:var(--accent-green)">'+esc(e.pickedBy)+'</b>'+(e.pickedAt?' <span style="color:var(--text-quaternary);font-size:10px">'+esc(e.pickedAt)+'</span>':''));
        if(e.comment)infos.push('💬 <i style="color:var(--text-tertiary)">'+esc(e.comment)+'</i>');
        return '<div class="hist-entry">'
          +'<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'+uf+tb+kb+sb+'</div>'
          +(infos.length?'<div class="hist-entry-info">'+infos.map(function(l){return'<span>'+l+'</span>';}).join('')+'</div>':'')
          +'</div>';
      }).join('');
      return mHead+rows;
    }).join('');
    const head='<div class="hist-card-head" style="border-top:3px solid '+rColor+'">'
      +'<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">'
        +'<span class="hist-client-name">'+esc(g.client)+'</span>'
        +'<span class="rt-badge rt-'+rIdx+'" style="font-size:10px;padding:2px 6px">T'+esc(g.route)+'</span>'
        +'<span style="font-size:11px;font-weight:600;color:'+rColor+'">'+esc(getRouteName(g.route))+'</span>'
      +'</div>'
      +'<div class="hist-card-stats">'
        +'<span><b style="color:var(--text-primary)">'+entries.length+'</b> <span style="color:var(--text-tertiary)">'+lbl.pickups+'</span></span>'
        +(totalKg>0?'<span><b style="color:var(--accent-blue)">'+totalKg.toFixed(1)+'</b> <span style="color:var(--text-tertiary)">kg</span></span>':'')
        +(doneEnt.length&&totalKg>0?'<span><b>'+avgKg+'</b> <span style="color:var(--text-tertiary)">kg '+lbl.avg+'</span></span>':'')
      +'</div>'
      +'</div>';
    return '<div class="hist-card hw">'+head+monthBlocks+'</div>';
  }).join('');
  cont.innerHTML='<div class="hist-grid">'+cards+'</div>';
}


function loadHistory(){
  const cont=document.getElementById('histContent');
  cont.innerHTML='<div class="loader">'+t('loading')+'</div>';

  const L=currentLang;
  const lbl={
    empty:   L==='DE'?'Kein Verlauf':L==='UA'?'Історія порожня':'Brak historii',
    noData:  L==='DE'?'Keine Abholungen':L==='UA'?'Немає видач':'Brak odbiorów',
    pickups: L==='DE'?'Abholungen':L==='UA'?'Видач':'Odbiorów',
    total:   L==='DE'?'Gesamt':L==='UA'?'Всього':'Suma',
    avg:     L==='DE'?'Ø/Abh.':L==='UA'?'Сер.':'Śr.',
  };

  google.script.run
    .withFailureHandler(function(e){
      cont.innerHTML='<div class="loader" style="color:var(--accent-red)">'+t('error_label')+': '+translateError(e.message)+'</div>';
    })
    .withSuccessHandler(function(all){
      if(!all||!all.length){
        cont.innerHTML='<div class="loader">'+(currentLang==='DE'?'Kein Verlauf':currentLang==='UA'?'Історія порожня':'Brak historii')+'</div>';
        return;
      }
      _histAllEntries=all;
      // Wyszukiwarka na górze
      const searchPlaceholder=currentLang==='DE'?'Suchen…':currentLang==='UA'?'Пошук…':'Szukaj…';
      document.getElementById('histSearchBar').innerHTML=
        '<div style="position:relative;margin-bottom:14px">'
          +'<svg style="position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:0.4" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.6"/><line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
          +'<input id="histSearchInput" type="search" placeholder="'+searchPlaceholder+'" oninput="histSearch()" '
          +'style="width:100%;box-sizing:border-box;padding:9px 14px 9px 36px;font-size:15px;font-family:var(--font);border-radius:12px;border:none;background:rgba(120,120,128,0.12);color:var(--text-primary);outline:none;-webkit-appearance:none;appearance:none">'
        +'</div>';
      renderHistoryData(all,'');
    })
    .getAllEntries();
}

function renderClientsList(){
  // Aktualizuj widoczność elementów admin
  document.getElementById('clientsAdminHeader').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('clientsHintDrag').style.display = isAdmin ? 'inline' : 'none';

  let html='';
  const routeIds=Object.keys(routeMap).map(Number).sort((a,b)=>a-b);
  const groups=[
    {title: currentLang === 'DE' ? '🗓 Tägliche Routen (Mo–Fr)' : (currentLang === 'UA' ? '🗓 Щоденні маршрути (Пн–Пт)' : '🗓 Trasy codzienne (Pn–Pt)'), keywords:['codzien','pn-pt'],ids:[]},
    {title: currentLang === 'DE' ? '🗓 Routen Mo – Mi – Fr' : (currentLang === 'UA' ? '🗓 Маршрути Пн – Ср – Пт' : '🗓 Trasy Pn – Śr – Pt'), keywords:['pn','śr','sr','pt'],ids:[]},
    {title: currentLang === 'DE' ? '🗓 Routen Di – Do' : (currentLang === 'UA' ? '🗓 Маршрути Вт – Чт' : '🗓 Trasy Wt – Czw'), keywords:['wt','cz'],ids:[]},
    {title: currentLang === 'DE' ? '📦 Andere Routen' : (currentLang === 'UA' ? '📦 Інші маршрути' : '📦 Pozostałe trasy'), keywords:[],ids:[]}
  ];
  routeIds.forEach(id=>{let name=getRouteName(id).toLowerCase();let matched=false;for(let j=0;j<3;j++){if(groups[j].keywords.some(kw=>name.includes(kw))){groups[j].ids.push(id);matched=true;break;}}if(!matched)groups[3].ids.push(id);});
  groups.forEach(g=>{
    if(!g.ids.length)return;
    html+='<div style="width:100%">';
    html+='<div class="route-group-header">'+g.title+'</div>';
    html+='<div class="grid" style="margin-bottom:8px">';
    g.ids.forEach(i=>{
      let rc=clients.filter(c=>c.route===i);
      const routeColor = getRouteColor(i);
      html+='<div class="col route-card" style="border-top-color:'+routeColor+'">';
      // Nagłówek trasy
      html+='<div class="col-header" style="padding-bottom:10px;margin-bottom:4px"><span class="route-id-badge" style="background:'+routeColor+'">T'+i+'</span><span class="route-title" style="color:'+routeColor+'">'+esc(getRouteName(i))+'</span>';
      if(isAdmin) html+='<span class="edit-icon" onclick="openRouteModal('+i+','+jsArg(getRouteName(i))+')">•••</span>';
      html+='</div>';
      html+='<div class="sortable-list" data-route="'+i+'">';
      rc.forEach((c,idx)=>{
        const dot = c.lat&&c.lng
          ? '<span class="gps-dot ok" title="' + t('gps_has') + '"></span>'
          : '<span class="gps-dot missing" title="' + t('gps_no') + '"></span>';
        html+='<div class="tag-client'+(isAdmin?' draggable':'')+'" data-name="'+esc(c.name)+'">';
        if(isAdmin) html+='<span class="drag-handle">⠿</span>';
        html+='<span class="client-order">'+(idx+1)+'</span>'
          +'<span class="client-name">'+esc(c.name)+'</span>'
          +dot;
        if(isAdmin) {
          const editBtnLbl = currentLang === 'DE' ? 'Bearbeiten' : (currentLang === 'UA' ? 'Редагувати' : 'Edytuj');
          html+='<span class="edit-icon" style="margin-left:8px" onclick="openEditClientModal('+jsArg(c.name)+','+Number(c.route)+','+jsArg(c.lat||'')+','+jsArg(c.lng||'')+')">' + editBtnLbl + '</span>';
        }
        html+='</div>';
      });
      html+='</div><div style="flex:1"></div><div class="divider" style="margin:8px 0"></div>';
      if(isAdmin) {
        const addBtnLbl = currentLang === 'DE' ? '+ Kunde hinzufügen' : (currentLang === 'UA' ? '+ додати клієнта' : '+ dodaj klienta');
        html+='<button class="add-btn" onclick="openNewClient('+i+')">' + addBtnLbl + '</button>';
      }
      html+='</div>';
    });
    html+='</div></div>';
  });
  const clientsContent=document.getElementById('clientsListContent');
  clientsContent.className='';
  clientsContent.innerHTML=html;

  if(isAdmin){
    document.querySelectorAll('.sortable-list').forEach(el=>{
      new Sortable(el,{group:'routes',animation:150,handle:'.drag-handle',ghostClass:'sortable-ghost',onEnd:function(evt){
        const fromRouteId=Number(evt.from.getAttribute('data-route'));const toRouteId=Number(evt.to.getAttribute('data-route'));
        const fromNames=Array.from(evt.from.children).map(c=>c.getAttribute('data-name'));const toNames=Array.from(evt.to.children).map(c=>c.getAttribute('data-name'));
        toast(currentLang === 'DE' ? 'Reihenfolge wird gespeichert...' : (currentLang === 'UA' ? 'Збереження порядку…' : 'Zapisywanie kolejności…'));
        google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message);renderClientsList();}).withSuccessHandler(function(){loadAppData(function(){renderClientsList();toast(currentLang === 'DE' ? 'Reihenfolge gespeichert' : (currentLang === 'UA' ? 'Порядок збережено' : 'Kolejność zapisana'));});}).updateRoutesOrder(fromRouteId,fromNames,toRouteId,toNames,getAdminToken());
      }});
    });
  }
}

function openAddRouteModal(){document.getElementById('rAddName').value='';document.getElementById('addRouteModal').style.display='flex';lockScroll();}
function closeAddRouteModal(){document.getElementById('addRouteModal').style.display='none';unlockScroll();}
function doAddRoute(){const name=document.getElementById('rAddName').value.trim();if(!name)return;closeAddRouteModal();toast(t('toast_creating'));google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message)}).withSuccessHandler(function(res){if(res&&res.error)alert(t('error_label') + ': ' + res.error);else{toast(t('toast_route_added'));loadAppData(function(){if(document.getElementById('clientsView').style.display==='block')renderClientsList();});}}).addRoute(name,getAdminToken());}

function openRouteModal(id,name){document.getElementById('rEditId').value=id;document.getElementById('rEditName').value=name;document.getElementById('routeModal').style.display='flex';lockScroll();}
function closeRouteModal(){document.getElementById('routeModal').style.display='none';unlockScroll();}
function saveRouteEdit(){const id=document.getElementById('rEditId').value;const newName=document.getElementById('rEditName').value.trim();if(!newName)return;closeRouteModal();google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message)}).withSuccessHandler(function(res){if(res&&res.error)alert(t('error_label') + ': ' + res.error);else{toast(t('toast_saved'));loadAppData(function(){if(document.getElementById('clientsView').style.display==='block')renderClientsList();if(document.getElementById('mainView').style.display==='block')renderGrid();});}}).updateRouteName(id,newName,getAdminToken());}
function deleteRoute(){const id=document.getElementById('rEditId').value;const rName=document.getElementById('rEditName').value;const confirmMsg = currentLang === 'DE' ? 'Route "'+esc(rName)+'" löschen?' : (currentLang === 'UA' ? 'Вилучити маршрут "'+esc(rName)+'"?' : 'Usunąć trasę "'+esc(rName)+'"?');if(!confirm(confirmMsg))return;closeRouteModal();google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message)}).withSuccessHandler(function(res){if(res&&res.error)alert(t('error_label') + ': ' + res.error);else{toast(t('toast_deleted'));loadAppData(function(){if(document.getElementById('clientsView').style.display==='block')renderClientsList();});}}).removeRoute(id,getAdminToken());}

function openNewClient(routeId){routeId=routeId||1;document.getElementById('newClientInput').value='';document.getElementById('newClientRoute').value=routeId;document.getElementById('clientModal').style.display='flex';lockScroll();}
function closeClientModal(){document.getElementById('clientModal').style.display='none';unlockScroll();}
function saveClient(){const name=document.getElementById('newClientInput').value.trim();const route=document.getElementById('newClientRoute').value;if(!name)return;closeClientModal();google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message)}).withSuccessHandler(function(res){if(res&&res.error)toast(t('error_label') + ': ' + res.error);else{toast(t('toast_added') + name);loadAppData(function(){if(document.getElementById('clientsView').style.display==='block')renderClientsList();});}}).addClient(name,route,getAdminToken());}

function openClientHistory(clientName) {
  document.getElementById('chTitle').textContent = 'Historia: ' + clientName;
  document.getElementById('chContent').innerHTML = '<div class="loader">Ładowanie...</div>';
  document.getElementById('clientHistoryModal').style.display = 'flex';
  
  google.script.run.withSuccessHandler(function(allEntries) {
    const clientEntries = allEntries.filter(e => e.client === clientName && e.done);
    if(clientEntries.length === 0) {
      document.getElementById('chContent').innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary)">Brak odebranych wpisów.</div>';
      return;
    }
    
    // Group by month
    const byMonth = {};
    clientEntries.forEach(e => {
      // Very basic extraction of MM.YYYY from pickedAt
      let mKey = 'Inne';
      if(e.pickedAt) {
        const parts = e.pickedAt.split(',')[0].split('.');
        if(parts.length === 3) mKey = parts[1] + '.' + parts[2];
      }
      if(!byMonth[mKey]) byMonth[mKey] = {count:0, kg:0};
      byMonth[mKey].count++;
      byMonth[mKey].kg += (e.weight || 0);
    });
    
    let html = '';
    Object.keys(byMonth).sort((a,b)=>b.localeCompare(a)).forEach(m => {
      let avg = byMonth[m].count > 0 ? (byMonth[m].kg / byMonth[m].count).toFixed(1) : 0;
      html += '' +
        '<div class="card" style="margin-bottom:12px">' +
          '<div style="font-weight:600;font-size:15px;margin-bottom:8px">' + m + '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary)">' +
            '<span>Odbiorów: <strong style="color:var(--text-primary)">' + byMonth[m].count + '</strong></span>' +
            '<span>Suma: <strong style="color:var(--accent-blue)">' + byMonth[m].kg.toFixed(1) + ' kg</strong></span>' +
            '<span>Średnio: <strong>' + avg + ' kg</strong></span>' +
          '</div>' +
        '</div>';
    });
    document.getElementById('chContent').innerHTML = html;
  }).getAllEntries();
}

function openEditClientModal(name,route,lat,lng){
  document.getElementById('ecOldName').value=name;
  document.getElementById('ecName').value=name;
  document.getElementById('ecRoute').value=route;
  document.getElementById('ecLat').value=lat||'';
  document.getElementById('ecLng').value=lng||'';
  // Badge kolorowy aktualnej trasy
  const badge=document.getElementById('ecRouteBadge');
  if(badge){
    badge.innerHTML='<span class="rt-badge rt-'+getRouteColorIdx(route)+'" style="font-size:12px;padding:3px 8px">T'+route+'</span>'
      +'<span style="font-size:13px;font-weight:600;color:'+getRouteColor(route)+'">'+esc(getRouteName(route))+'</span>';
  }
  // Odśwież badge przy zmianie selecta
  const sel=document.getElementById('ecRoute');
  sel.onchange=function(){
    const r=Number(this.value);
    if(badge){
      badge.innerHTML='<span class="rt-badge rt-'+getRouteColorIdx(r)+'" style="font-size:12px;padding:3px 8px">T'+r+'</span>'
        +'<span style="font-size:13px;font-weight:600;color:'+getRouteColor(r)+'">'+esc(getRouteName(r))+'</span>';
    }
  };
  document.getElementById('editClientModal').style.display='flex';
  lockScroll();
}
function closeEditClientModal(){document.getElementById('editClientModal').style.display='none';unlockScroll();}
function doSaveClientEdit(){const oldName=document.getElementById('ecOldName').value;const newName=document.getElementById('ecName').value.trim();const newRoute=document.getElementById('ecRoute').value;const lat=document.getElementById('ecLat').value;const lng=document.getElementById('ecLng').value;if(!newName)return;closeEditClientModal();google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message)}).withSuccessHandler(function(res){if(res&&res.error)alert(t('error_label') + ': ' + res.error);else{toast(t('toast_saved'));loadAppData(function(){if(document.getElementById('clientsView').style.display==='block')renderClientsList();});}}).updateClient(oldName,newName,newRoute,lat,lng,getAdminToken());}
function doDeleteClient(){const name=document.getElementById('ecOldName').value;const confirmMsg = currentLang === 'DE' ? '"' + esc(name) + '" löschen?' : (currentLang === 'UA' ? 'Вилучити "' + esc(name) + '"?' : 'Usunąć "' + esc(name) + '"?');if(!confirm(confirmMsg))return;closeEditClientModal();google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': ' + e.message)}).withSuccessHandler(function(res){if(res&&res.error)alert(t('error_label') + ': ' + res.error);else{toast(t('toast_deleted'));loadAppData(function(){if(document.getElementById('clientsView').style.display==='block')renderClientsList();});}}).removeClient(name,getAdminToken());}

function loadAppData(callback){
  google.script.run.withFailureHandler(function(e){alert((currentLang === 'DE' ? 'Verbindungsfehler: ' : (currentLang === 'UA' ? 'Помилка з\'єднання: ' : 'Błąd łączenia: ')) + e.message)}).withSuccessHandler(function(data){
    clients=data.clients||[];const rts=data.routes||[];routeMap={};rts.forEach(r=>{routeMap[r.id]=r.name;});
    drivers=data.drivers||[];
    if(currentDriver){var fresh=drivers.find(function(d){return d.id===currentDriver.id;});if(fresh)currentDriver=fresh;}
    updateRouteDropdowns();if(callback)callback();
  }).getAppData();
}

function buildMapLegend(routeIds){
  const legend=document.getElementById('mapLegend');legend.innerHTML='';
  routeIds.forEach(id=>{const color=getRouteColor(id);const div=document.createElement('div');div.className='legend-item'+(hiddenRoutes.has(id)?' hidden-route':'');div.setAttribute('data-route',id);div.innerHTML='<div class="legend-dot" style="background:'+color+'"></div>'+esc(getRouteName(id));div.onclick=function(){toggleRouteVisibility(id);};legend.appendChild(div);});
}

function toggleRouteVisibility(routeId){
  if(hiddenRoutes.has(routeId))hiddenRoutes.delete(routeId);else hiddenRoutes.add(routeId);
  if(mapLayers[routeId]){const vis=!hiddenRoutes.has(routeId);mapLayers[routeId].markers.forEach(m=>vis?m.addTo(myMap):myMap.removeLayer(m));if(mapLayers[routeId].polyline){if(vis)mapLayers[routeId].polyline.addTo(myMap);else myMap.removeLayer(mapLayers[routeId].polyline);}}
  document.querySelectorAll('.legend-item').forEach(el=>{const id=Number(el.getAttribute('data-route'));el.className='legend-item'+(hiddenRoutes.has(id)?' hidden-route':'');});
}

function initMap(){
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const tileUrl = isDark 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  if(!myMap){
    myMap=L.map('interactiveMap').setView([D_BASE_LAT,D_BASE_LNG],10);
    myTileLayer = L.tileLayer(tileUrl,{attribution:'© OpenStreetMap, © CartoDB'}).addTo(myMap);
  } else {
    if (myTileLayer) myTileLayer.setUrl(tileUrl);
    Object.values(mapLayers).forEach(layer=>{layer.markers.forEach(m=>myMap.removeLayer(m));if(layer.polyline)myMap.removeLayer(layer.polyline);});mapLayers={};
  }
  const baseName = currentLang === 'DE' ? 'Basis' : (currentLang === 'UA' ? 'База' : 'Baza');
  const baseIcon=L.divIcon({html:'<div style="background:var(--bg-card-solid,#fff);color:var(--text-primary,#1C1C1E);padding:4px 8px;border-radius:20px;font-weight:700;font-size:11px;border:2.5px solid var(--accent,#1266D6);white-space:nowrap;transform:translate(-50%,-50%);box-shadow:var(--shadow-md);display:flex;align-items:center;gap:4px;">🏢 ' + baseName + '</div>',className:''});
  if(baseMarker)myMap.removeLayer(baseMarker);
  const baseMapsLbl = currentLang === 'DE' ? 'In Google Maps öffnen' : (currentLang === 'UA' ? 'Відкрити в Google Maps' : 'Otwórz w Google Maps');
  const baseLatLngStr = Number(D_BASE_LAT).toFixed(6) + ', ' + Number(D_BASE_LNG).toFixed(6);
  const basePopupHtml = '<b>' + baseName + ' LEBUSER Textilservice Sp. z o.o.</b><br>' +
                        '<div style="margin-top:8px;font-size:11.5px;background:var(--bg-secondary);padding:4px 6px;border-radius:6px;user-select:all;text-align:center;font-family:monospace;">' + baseLatLngStr + '</div>' +
                        '<div style="margin-top:6px;text-align:center;"><a href="https://maps.google.com/?q=' + D_BASE_LAT + ',' + D_BASE_LNG + '" target="_blank" style="display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:6px 10px;border-radius:6px;font-size:11.5px;font-weight:600;">📍 ' + baseMapsLbl + '</a></div>';
  baseMarker=L.marker([D_BASE_LAT,D_BASE_LNG],{icon:baseIcon,zIndexOffset:1000}).addTo(myMap).bindPopup(basePopupHtml);
  const ids=Object.keys(routeMap).map(Number).sort((a,b)=>a-b);buildMapLegend(ids);
  ids.forEach(routeId=>{
    const color=getRouteColor(routeId);const rc=clients.filter(c=>c.route===routeId&&c.lat&&c.lng);mapLayers[routeId]={markers:[],polyline:null};
    rc.forEach((c,idx)=>{
      const icon=L.divIcon({
        html: '<div style="display:flex;align-items:center;background:var(--bg-card-solid,#fff);color:var(--text-primary,#1C1C1E);padding:2px 8px 2px 2px;border-radius:20px;font-weight:600;font-size:11px;border:1.5px solid var(--border-strong,rgba(0,0,0,0.15));white-space:nowrap;transform:translate(-50%,-50%);box-shadow:var(--shadow-md);">' +
              '<div style="background:'+color+';color:#fff;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-right:6px;flex-shrink:0;">'+(idx+1)+'</div>' +
              '<span style="margin-right:2px;">'+esc(c.name)+'</span>' +
              '</div>',
        className:''
      });
      const orderLbl = currentLang === 'DE' ? 'Reihenfolge' : (currentLang === 'UA' ? 'Порядок' : 'Kolejność');
      const mapsLbl = currentLang === 'DE' ? 'In Google Maps öffnen' : (currentLang === 'UA' ? 'Відкрити в Google Maps' : 'Otwórz w Google Maps');
      const latLngStr = Number(c.lat).toFixed(6) + ', ' + Number(c.lng).toFixed(6);
      const popupHtml = '<b>'+esc(c.name)+'</b><br>' +
                        '<span style="color:'+color+';font-weight:600">'+esc(getRouteName(routeId))+'</span><br>' +
                        '<small>' + orderLbl + ': '+(idx+1)+'</small><br>' +
                        '<div style="margin-top:8px;font-size:11.5px;background:var(--bg-secondary);padding:4px 6px;border-radius:6px;user-select:all;text-align:center;font-family:monospace;">' + latLngStr + '</div>' +
                        '<div style="margin-top:6px;text-align:center;"><a href="https://maps.google.com/?q=' + c.lat + ',' + c.lng + '" target="_blank" style="display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:6px 10px;border-radius:6px;font-size:11.5px;font-weight:600;">📍 ' + mapsLbl + '</a></div>';
      const marker=L.marker([c.lat,c.lng],{icon:icon});marker.bindPopup(popupHtml);
      if(!hiddenRoutes.has(routeId))marker.addTo(myMap);mapLayers[routeId].markers.push(marker);
    });
    if(rc.length>0){const pts=[[D_BASE_LAT,D_BASE_LNG],...rc.map(c=>[c.lat,c.lng]),[D_BASE_LAT,D_BASE_LNG]];const poly=L.polyline(pts,{color:color,weight:4,opacity:0.8});if(!hiddenRoutes.has(routeId))poly.addTo(myMap);mapLayers[routeId].polyline=poly;}
  });
  setTimeout(()=>myMap.invalidateSize(),100);
}

function locateUser(){
  if (!navigator.geolocation) {
    alert(currentLang === 'DE' ? 'Geolocation wird von Ihrem Browser nicht unterstützt' : (currentLang === 'UA' ? 'Геолокація не підтримується вашим браузером' : 'Geolokalizacja nie jest wspierana przez Twoją przeglądarkę'));
    return;
  }
  const btn = document.getElementById('locateMeBtn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '⏳';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    function(position) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (!myMap) return;
      myMap.setView([lat, lng], 13);
      if (userLocationMarker) {
        myMap.removeLayer(userLocationMarker);
      }
      const userIcon = L.divIcon({
        html: '<div class="user-pulse-marker"><div class="pulse-ring"></div><div class="pulse-dot"></div></div>',
        className: 'user-location-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      userLocationMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 2000 })
        .addTo(myMap)
        .bindPopup('<b>' + (currentLang === 'DE' ? 'Deine Position' : (currentLang === 'UA' ? 'Ваша позиція' : 'Twoja pozycja')) + '</b>');
    },
    function(error) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      let errMsg = '';
      if (error.code === error.PERMISSION_DENIED) {
        errMsg = currentLang === 'DE' ? 'Zugriff auf Standort verweigert' : (currentLang === 'UA' ? 'Доступ до геолокації відхилено' : 'Brak uprawnień do lokalizacji');
      } else {
        errMsg = currentLang === 'DE' ? 'Fehler beim Abrufen des Standorts' : (currentLang === 'UA' ? 'Не вдалося отримати місцезнаходження' : 'Błąd pobierania lokalizacji');
      }
      alert(errMsg);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// ══════════════════════════════════════════════════════
//  GRAFIK FILE SETTINGS PANEL
// ══════════════════════════════════════════════════════
let gfpLoaded = false;

function showGrafikFilePanel(show) {
  document.getElementById('grafikFilePanel').style.display = show ? 'block' : 'none';
  if (show && !gfpLoaded) loadGrafikFileInfo();
}

function loadGrafikFileInfo() {
  document.getElementById('gfpFileName').textContent = 'Ładowanie…';
  google.script.run
    .withFailureHandler(function(e) {
      document.getElementById('gfpFileName').textContent = 'Błąd połączenia';
      document.getElementById('gfpMonthTitle').textContent = e.message;
    })
    .withSuccessHandler(function(info) {
      gfpLoaded = true;
      if (info.error) {
        document.getElementById('gfpFileName').textContent = '⚠ Brak połączenia';
        document.getElementById('gfpMonthTitle').textContent = info.error;
        return;
      }
      document.getElementById('gfpFileName').textContent = info.fileName;
      document.getElementById('gfpMonthTitle').textContent = info.monthTitle ? '· ' + info.monthTitle : '';
      document.getElementById('gfpWeekCount').textContent =
        info.weekSheets && info.weekSheets.length ? '(' + info.weekSheets.length + ' tygodni)' : '';
      // Załaduj tygodnie do selecta
      const sel = document.getElementById('tlSheetSelect');
      if (sel) {
        const prev = sel.value;
        sel.innerHTML = '<option value="">— wybierz tydzień —</option>';
        (info.weekSheets || []).forEach(function(name) {
          const opt = document.createElement('option');
          opt.value = name; opt.textContent = name;
          sel.appendChild(opt);
        });
        if (prev && info.weekSheets && info.weekSheets.includes(prev)) sel.value = prev;
      }
    })
    .getGrafikFileInfo();
}

function toggleGfpEdit() {
  const panel = document.getElementById('gfpEditPanel');
  const btn = document.getElementById('gfpEditBtn');
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  btn.textContent = open ? '✕ Zamknij' : '⚙️ Zmień plik';
  if (open) setTimeout(function(){ document.getElementById('gfpIdInput').focus(); }, 50);
}

function connectGrafikFile() {
  const val = document.getElementById('gfpIdInput').value.trim();
  if (!val) return;
  document.getElementById('gfpError').textContent = currentLang === 'DE' ? 'Verbindung...' : (currentLang === 'UA' ? 'З\'єднання…' : 'Łączenie…');
  document.getElementById('gfpFileName').textContent = '⏳ ' + (currentLang === 'DE' ? 'Verifizierung...' : (currentLang === 'UA' ? 'Верифікація…' : 'Weryfikacja…'));
  google.script.run
    .withFailureHandler(function(e) {
      document.getElementById('gfpError').textContent = t('error_label') + ': ' + translateError(e.message);
      document.getElementById('gfpFileName').textContent = '⚠ ' + t('error_label');
    })
    .withSuccessHandler(function(res) {
      if (res.error) {
        document.getElementById('gfpError').textContent = translateError(res.error);
        document.getElementById('gfpFileName').textContent = '⚠ ' + t('error_label');
        return;
      }
      document.getElementById('gfpError').textContent = '';
      document.getElementById('gfpIdInput').value = '';
      toggleGfpEdit();
      gfpLoaded = false;
      loadGrafikFileInfo();
      const connText = currentLang === 'DE' ? '✓ Verbunden: ' : (currentLang === 'UA' ? '✓ Підключено: ' : '✓ Podłączono: ');
      const wkText = currentLang === 'DE' ? ' Wochen' : (currentLang === 'UA' ? ' тижнів' : ' tygodni');
      toast(connText + res.fileName + ' (' + (res.weekSheets||[]).length + wkText + ')');
    })
    .saveGrafikFileId(val, getAdminToken());
}

// ══════════════════════════════════════════════════════
//  TIMELINE EDITOR (Oś Czasu / Stanowiska)
// ══════════════════════════════════════════════════════
const STATIONS = {
  'T': {bg:'#607D8B',fc:'#fff',name:'Tunnel'},
  'S': {bg:'#2E7D32',fc:'#fff',name:'Składarka'},
  'M': {bg:'#E65100',fc:'#fff',name:'Magiel'},
  'R': {bg:'#C62828',fc:'#fff',name:'Roztrzep.'},
  'PR':{bg:'#00838F',fc:'#fff',name:'Pranie'},
  'P': {bg:'#6A1B9A',fc:'#fff',name:'Prasowanie'},
  'SZ':{bg:'#4E342E',fc:'#fff',name:'Szycie'},
  'PP':{bg:'#F9A825',fc:'#1a1a1a',name:'Punkt przyj.'},
  'SP':{bg:'#37474F',fc:'#fff',name:'Sprzątanie'},
  'O': {bg:'#AD1457',fc:'#fff',name:'Oznakowanie'},
  'PK':{bg:'#558B2F',fc:'#fff',name:'Pakowanie'},
  'SC':{bg:'#FF6F00',fc:'#fff',name:'Spedycja'},
  'K': {bg:'#1155cc',fc:'#fff',name:'Kierowca'},
  'W': {bg:'#f4f6f7',fc:'#aaa',name:'Wolne'},
  'UW':{bg:'#d6eaf8',fc:'#0c5460',name:'Urlop'},
  'L4':{bg:'#fcf3cf',fc:'#856404',name:'Choroba'}
};
const STATION_ORDER = ['T','S','M','R','PR','P','SZ','PP','SP','O','PK','SC','K'];

let tlData = null;        // loaded week data
let tlActiveDayIdx = 0;   // currently displayed day
let tlPendingCell = null; // {empIdx, dayIdx, hour}

function initTimelineView() {
  refreshTimelineSheets(true);
}

function refreshTimelineSheets(autoLoad) {
  google.script.run
    .withFailureHandler(function(e){ toast(t('error_label') + ': ' + e.message); })
    .withSuccessHandler(function(sheets) {
      const sel = document.getElementById('tlSheetSelect');
      const prev = sel.value;
      sel.innerHTML = '<option value="">' + t('tl_select_week') + '</option>';
      sheets.forEach(function(name) {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
      });
      if (prev && sheets.includes(prev)) sel.value = prev;
      else if (sheets.length > 0 && autoLoad) { sel.value = sheets[sheets.length - 1]; loadTimelineData(); }
    })
    .listWeeklySheets();
}

function loadTimelineData() {
  const sheetName = document.getElementById('tlSheetSelect').value;
  if (!sheetName) return;
  document.getElementById('tlGridContainer').innerHTML = '<div class="loader">' + t('loading_timeline') + '</div>';
  document.getElementById('tlDayTabs').innerHTML = '';
  document.getElementById('tlStats').style.display = 'none';
  google.script.run
    .withFailureHandler(function(e) {
      document.getElementById('tlGridContainer').innerHTML =
        '<div class="loader" style="color:var(--accent-red)">' + t('error_label') + ': ' + esc(translateError(e.message)) + '</div>';
    })
    .withSuccessHandler(function(data) {
      if (data.error) {
        document.getElementById('tlGridContainer').innerHTML =
          '<div class="loader" style="color:var(--accent-red)">' + esc(translateError(data.error)) + '</div>';
        return;
      }
      tlData = data;
      tlActiveDayIdx = 0;
      renderTlDayTabs();
      renderTlGrid();
    })
    .getWeeklyData(sheetName);
}

function renderTlDayTabs() {
  if (!tlData) return;
  const tabsEl = document.getElementById('tlDayTabs');
  tabsEl.innerHTML = '';
  tlData.days.forEach(function(d, i) {
    const btn = document.createElement('button');
    btn.className = 'tl-day-tab' + (d.isWeekend ? ' weekend' : '') + (i === tlActiveDayIdx ? ' active' : '');
    btn.textContent = d.label;
    btn.onclick = function() { tlActiveDayIdx = i; renderTlDayTabs(); renderTlGrid(); };
    tabsEl.appendChild(btn);
  });
}

function getStationClass(val) {
  if (!val) return '';
  const v = val.trim().toUpperCase();
  if (STATIONS[v]) return 'sc-' + v;
  return '';
}

function renderTlGrid() {
  if (!tlData || !tlData.days[tlActiveDayIdx]) return;
  const day = tlData.days[tlActiveDayIdx];
  const hours = [];
  for (let h = tlData.tlStart; h <= tlData.tlEnd; h++) hours.push(h);
  const now = new Date(); const curH = now.getHours();
  const isToday = false; // not tracked per week — just highlight current hour

  let html = '<div class="tl-container"><table class="tl-table"><thead><tr>';
  html += '<th class="tl-th-emp">Pracownik · ' + esc(day.label) + '</th>';
  hours.forEach(function(h) {
    const cur = (h === curH) ? ' current-hour' : '';
    html += '<th class="tl-th-time' + cur + '">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  let lastGroup = null;
  tlData.employees.forEach(function(emp, eIdx) {
    if (emp.group !== lastGroup) {
      lastGroup = emp.group;
      const col = GRAFIK_GROUP_COLORS ? getGrafikGroupColor(emp.group) : '#455a64';
      html += '<tr class="tl-group-row"><td colspan="' + (hours.length + 1) + '" style="background:' + col + '">' +
              esc(emp.group) + '</td></tr>';
    }
    html += '<tr>';
    html += '<td class="tl-td-emp">' + esc(emp.name) +
            '<span class="tl-hours">' + esc(String(emp.startH).replace('.', ':')) + '–' + esc(String(emp.koniecH).replace('.', ':')) + '</span></td>';

    const stations = emp.days[tlActiveDayIdx] || {};
    hours.forEach(function(h) {
      const val = stations[h] || '';
      const inShift = emp.startH > 0 && h >= emp.startH && h < emp.koniecH;
      const outsideCls = inShift ? '' : ' outside';
      const weCls = day.isWeekend ? ' we-col' : '';
      const sc = getStationClass(val);
      html += '<td class="tl-cell' + outsideCls + weCls + (sc ? ' ' + sc : '') + '">' +
              esc(val) + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  document.getElementById('tlGridContainer').innerHTML = html;
  renderTlStats();
}

function renderTlStats() {
  if (!tlData || !tlData.days[tlActiveDayIdx]) return;
  const day = tlData.days[tlActiveDayIdx];
  const statsEl = document.getElementById('tlStats');
  statsEl.style.display = 'block';
  document.getElementById('tlStatsDayLabel').textContent = day.label;

  // Zbierz grupy
  const groups = [];
  tlData.employees.forEach(function(emp) {
    if (!groups.includes(emp.group)) groups.push(emp.group);
  });

  // Policz stanowiska
  const stationStats = {}; // {station: {total_emp, total_hours, groups: {grp: {emp,h}}}}
  STATION_ORDER.forEach(function(s) {
    stationStats[s] = { emp: 0, hours: 0, groups: {} };
    groups.forEach(function(g) { stationStats[s].groups[g] = { emp: 0, hours: 0 }; });
  });

  tlData.employees.forEach(function(emp) {
    const stations = emp.days[tlActiveDayIdx] || {};
    const counted = {};
    Object.keys(stations).forEach(function(h) {
      const v = stations[h].toUpperCase();
      if (!stationStats[v]) return;
      if (!counted[v]) { counted[v] = true; stationStats[v].emp++; if (emp.group) stationStats[v].groups[emp.group] && stationStats[v].groups[emp.group].emp++; }
      stationStats[v].hours++;
      if (emp.group && stationStats[v].groups[emp.group]) stationStats[v].groups[emp.group].hours++;
    });
  });

  // Buduj tabelę statystyk
  const activeStations = STATION_ORDER.filter(function(s) { return stationStats[s].emp > 0; });
  if (!activeStations.length) { statsEl.style.display = 'none'; return; }

  let html = '<thead><tr><th>Stanowisko</th><th>∑ Os.</th><th>∑ Godz.</th>';
  groups.forEach(function(g) { html += '<th>' + esc(g.split('/')[0].trim()) + '</th>'; });
  html += '</tr></thead><tbody>';

  activeStations.forEach(function(s) {
    const st = stationStats[s]; const info = STATIONS[s] || {bg:'#888',fc:'#fff',name:s};
    html += '<tr>';
    html += '<td><span class="tl-stat-badge" style="background:' + info.bg + ';color:' + info.fc + '">' +
            s + '</span> <span style="font-size:11px;color:var(--text-secondary)">' + esc(info.name) + '</span></td>';
    html += '<td style="color:var(--text-primary)">' + st.emp + '</td>';
    html += '<td style="color:var(--accent-green)">' + st.hours + 'h</td>';
    groups.forEach(function(g) {
      const gs = st.groups[g] || {emp:0,hours:0};
      html += '<td style="font-size:11px">' + (gs.emp ? '<b>' + gs.emp + '</b> os. / ' + gs.hours + 'h' : '—') + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody>';
  document.getElementById('tlStatsTable').innerHTML = html;
}

// ══════════════════════════════════════════════════════
//  GRAFIK EDITOR
// ══════════════════════════════════════════════════════
let grafikData = null;
let pendingCell = null; // {empIdx, day}

const GRAFIK_GROUP_COLORS = {
  'ZD 1':'#2e7d32','ZD 2':'#c62828',
  'KIEROWCY / FAHRER':'#1565c0','KIEROWCY':'#1565c0',
  'BIURO / BÜRO':'#d35400','BIURO':'#d35400',
  'TECHNICZNY / TECHNIKER':'#607d8b','TECHNICZNY':'#607d8b'
};

function getGrafikGroupColor(grp){
  if(!grp) return '#455a64';
  const up=grp.toUpperCase();
  for(const k in GRAFIK_GROUP_COLORS){if(up.includes(k.toUpperCase()))return GRAFIK_GROUP_COLORS[k];}
  return '#455a64';
}

function getStatusClass(val){
  if(!val||val==='')return '';
  const v=val.trim().toUpperCase();
  if(v==='I')  return 'gc-I';
  if(v==='W')  return 'gc-W';
  if(v==='UW') return 'gc-UW';
  if(v==='L4') return 'gc-L4';
  if(v==='NN') return 'gc-NN';
  if(v.includes('+')) return 'gc-plus';
  if(!isNaN(parseFloat(v.replace(',','.')))) return 'gc-godz';
  return '';
}

function initGrafikEditor(){
  const today=new Date();
  const ym=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
  document.getElementById('grafikYMInput').value=ym;
  loadGrafikMonth();
}

function changeGrafikMonth(delta){
  const input=document.getElementById('grafikYMInput');
  if(!input.value)return;
  const [y,m]=input.value.split('-').map(Number);
  const dt=new Date(y,m-1+delta,1);
  input.value=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  loadGrafikMonth();
}

function loadGrafikMonth(){
  const ym=document.getElementById('grafikYMInput').value;
  if(!ym)return;
  document.getElementById('grafikEditorGrid').innerHTML='<div class="loader">'+t('loading_grafik')+'</div>';
  document.getElementById('grafikStats').style.display='none';
  google.script.run
    .withFailureHandler(function(e){
      document.getElementById('grafikEditorGrid').innerHTML='<div class="loader" style="color:var(--accent-red)">'+t('error_label')+': '+translateError(e.message)+'</div>';
    })
    .withSuccessHandler(function(data){
      if(data.error){
        document.getElementById('grafikEditorGrid').innerHTML='<div class="loader" style="color:var(--accent-red)">'+esc(translateError(data.error))+'</div>';
        return;
      }
      grafikData=data;
      renderGrafikGrid();
    })
    .getGrafikMonthData(ym);
}

function renderGrafikGrid(){
  if(!grafikData)return;
  const {year,month,daysInMonth,days,employees}=grafikData;
  const today=new Date();
  const todayDay=(today.getFullYear()===year&&today.getMonth()+1===month)?today.getDate():0;

  // Statystyki
  let totalI=0,totalW=0,totalUW=0,totalL4=0,totalNN=0,totalGodz=0;
  employees.forEach(emp=>{
    emp.days.forEach(v=>{
      const u=(v||'').trim().toUpperCase();
      if(u==='I')totalI++;
      else if(u==='W')totalW++;
      else if(u==='UW')totalUW++;
      else if(u==='L4')totalL4++;
      else if(u==='NN')totalNN++;
      else if(!isNaN(parseFloat(u.replace(',','.'))))totalGodz++;
    });
  });
  const statsEl=document.getElementById('grafikStats');
  statsEl.style.display='flex';
  const MIESIACE = currentLang === 'DE' ? 
    ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'] :
    (currentLang === 'UA' ? 
      ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'] :
      ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
    );
  const empText = currentLang === 'DE' ? 'Mitarbeiter' : (currentLang === 'UA' ? 'працівників' : 'pracowników');
  const daysText = currentLang === 'DE' ? 'Tage' : (currentLang === 'UA' ? 'днів' : 'dni');
  const planText = currentLang === 'DE' ? 'Plan' : (currentLang === 'UA' ? 'план' : 'plan');
  const hoursText = currentLang === 'DE' ? 'Std.' : (currentLang === 'UA' ? 'год.' : 'godz.');
  
  statsEl.innerHTML=
    '<div class="grafik-stat-chip"><b style="color:var(--accent-green)">'+employees.length+'</b>'+empText+'</div>'+
    '<div class="grafik-stat-chip"><b style="color:var(--text-primary)">'+MIESIACE[month-1]+' '+year+'</b>'+daysInMonth+' '+daysText+'</div>'+
    '<div class="grafik-stat-chip"><b style="color:#432874">'+totalI+'</b>I — plan</div>'+
    '<div class="grafik-stat-chip"><b style="color:#155724">'+totalGodz+'</b>'+hoursText+'</div>'+
    '<div class="grafik-stat-chip"><b style="color:#0c5460">'+totalUW+'</b>UW</div>'+
    '<div class="grafik-stat-chip"><b style="color:#856404">'+totalL4+'</b>L4</div>'+
    (totalNN?'<div class="grafik-stat-chip"><b style="color:#721c24">'+totalNN+'</b>NN</div>':'');

  // Buduj tabelę
  let html='<div class="grafik-container"><table class="grafik-table"><thead>';
  // Wiersz 1: numery dni
  const empColHeader = currentLang === 'DE' ? 'Mitarbeiter' : (currentLang === 'UA' ? 'Працівник' : 'Pracownik');
  html+='<tr><th class="grafik-th-name">'+empColHeader+'</th>';
  days.forEach(d=>{
    const cls=d.weekend?'we':(d.d===todayDay?'today-col':'');
    html+='<th class="grafik-th-day '+cls+'">'+d.d+'</th>';
  });
  html+='</tr>';
  // Wiersz 2: nazwy dni
  const subTh = currentLang === 'DE' ? 'Start–Ende · Zelle zum Bearbeiten anklicken' : (currentLang === 'UA' ? 'Початок–Кінець · клацніть на комірку для редагування' : 'Start–Kon. · kliknij komórkę aby edytować');
  html+='<tr><th class="grafik-th-name" style="font-weight:500;font-size:9px">'+subTh+'</th>';
  days.forEach(d=>{
    const cls=d.weekend?'we':(d.d===todayDay?'today-col':'');
    const translatedName = translateDayShort(d.name);
    html+='<th class="grafik-th-day '+cls+'" style="font-size:9px;opacity:0.8">'+translatedName+'</th>';
  });
  html+='</tr></thead><tbody>';

  let currentGroup=null;
  employees.forEach(function(emp,eIdx){
    if(emp.group!==currentGroup){
      currentGroup=emp.group;
      const color=getGrafikGroupColor(currentGroup);
      html+='<tr class="grafik-group-row"><td colspan="'+(daysInMonth+1)+'" style="background:'+color+'">'+esc(currentGroup)+'</td></tr>';
    }
    html+='<tr>';
    html+='<td class="grafik-td-name">'+esc(emp.name)+'<span class="emp-hours">'+esc(emp.start)+'–'+esc(emp.koniec)+'</span></td>';
    for(let d=1;d<=daysInMonth;d++){
      const val=emp.days[d-1]||'';
      const sc=getStatusClass(val);
      const we=days[d-1].weekend;
      const todayCls=d===todayDay?' today-col':'';
      const bgCls=sc||(we?'we':'');
      html+='<td class="grafik-cell '+bgCls+todayCls+'">'+esc(val)+'</td>';
    }
    html+='</tr>';
  });

  html+='</tbody></table></div>';
  document.getElementById('grafikEditorGrid').innerHTML=html;
}

// ══════════════════════════════════════════════════════

  // ── START ──
  console.log("App initialization started...");
  try {
    google.script.run
      .withFailureHandler(function(err){
        const alertMsg = currentLang === 'DE' ? 'Fehler: Führen Sie die Funktion TEST_ZgodyGoogle im Editor aus! ' : (currentLang === 'UA' ? 'Помилка: Запустіть функцію TEST_ZgodyGoogle в редакторі! ' : 'Błąd: Uruchom funkcję TEST_ZgodyGoogle w edytorze! ');
        const fullMsg = alertMsg + translateError(err ? err.message : 'Unknown');
        const loader = document.querySelector('.loader');
        if (loader) { loader.textContent = fullMsg; loader.style.color = 'red'; }
        else alert(fullMsg);
      })
      .withSuccessHandler(function(data){
        console.log("getAppData success", data);
        if (!data) {
          const loader = document.querySelector('.loader');
          if (loader) { loader.textContent = "Błąd: data is null"; loader.style.color = 'red'; }
          return;
        }
        clients=data.clients||[];
    drivers=data.drivers||[];
    // Wczytaj kierowcę z localStorage i zwaliduj czy nadal istnieje w bazie
    try {
      const stored = JSON.parse(localStorage.getItem('currentDriver'));
      if (stored && stored.id) {
        currentDriver = drivers.find(function(d){ return d.id === stored.id; }) || null;
        if (!currentDriver) {
          localStorage.removeItem('currentDriver'); // usunięty kierowca
        } else {
          // Aktualizuj localStorage z najnowszymi danymi z bazy (trasy mogły się zmienić)
          localStorage.setItem('currentDriver', JSON.stringify(currentDriver));
        }
      } else {
        currentDriver = null;
      }
    } catch(e) { currentDriver = null; localStorage.removeItem('currentDriver'); }
    
    const rts=data.routes||[];
    routeMap={};rts.forEach(r=>{routeMap[r.id]=r.name;});
    // Sprawdź sesję admin z localStorage
    const expires = checkAdminSession();
    applyAdminState(expires);
    try {
      setLanguage(currentLang);
    } catch(e) {
      console.error("setLanguage error", e);
      const loader = document.querySelector('.loader');
      if (loader) { loader.textContent = "Błąd: " + e.message; loader.style.color = 'red'; }
    }
    if(!clients||!clients.length||!rts.length){
      google.script.run.withFailureHandler(function(e){alert(t('error_label') + ': '+translateError(e.message))}).withSuccessHandler(function(){loadAppData(function(){switchView('main');});}).initSheets();
    }else{updateRouteDropdowns();switchView('main');}
  }).getAppData();
  } catch(e) {
    const loader = document.querySelector('.loader');
    if (loader) { loader.textContent = "Błąd startu: " + e.message; loader.style.color = 'red'; }
  }

function triggerArchive() {
  if (!isAdmin) {
    toast('Brak uprawnień');
    return;
  }
  const confirmMsg = currentLang === 'DE' ? 'Daten älter als 60 Tage wirklich archivieren?' : (currentLang === 'UA' ? 'Архівувати дані старіші за 60 днів?' : 'Czy na pewno zarchiwizować dane starsze niż 60 dni? Zostaną przeniesione do zakładek Archiwum.');
  if (!confirm(confirmMsg)) return;

  const btn = document.querySelector('#logsView button.primary');
  const originalText = btn.innerHTML;
  btn.innerHTML = '🗃️ Archiwizowanie...';
  btn.disabled = true;

  google.script.run.withFailureHandler(function(e) {
    toast('Błąd archiwizacji: ' + String(e));
    btn.innerHTML = originalText;
    btn.disabled = false;
  }).withSuccessHandler(function(res) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    if (res && res.error) {
      toast('Błąd: ' + res.error);
    } else {
      toast(`Archiwizacja zakończona! Przeniesiono wpisów: ${res.count || 0}`);
      loadWeek(); // Przeładuj główny kalendarz po usunięciu
      loadLogs(); // Przeładuj logi
    }
  }).archiveOldData(getAdminToken());
}
