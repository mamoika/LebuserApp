// Dane przykładowe dla makiet UX „Dyspozytornia" i „Karta kursu kierowcy".
// Wyłącznie do podglądu — nic tu nie jest zapisywane do Supabase.

export const MOCK_DRIVERS = [
  { id: 'mk', name: 'Marek Kowalski', initials: 'MK' },
  { id: 'an', name: 'Anna Nowak', initials: 'AN' },
  { id: 'tw', name: 'Tomasz Wiśniewski', initials: 'TW' },
  { id: 'pz', name: 'Piotr Zieliński', initials: 'PZ' },
];

// Kolumny dyspozytorni — dokładnie tak, jak w propozycji.
export const BOARD_COLUMNS = [
  { key: 'planning', label: 'Do zaplanowania' },
  { key: 'ready', label: 'Gotowe do wyjazdu' },
  { key: 'active', label: 'W trasie' },
  { key: 'settlement', label: 'Do rozliczenia' },
  { key: 'closed', label: 'Zamknięte' },
];

export const INITIAL_KURSY = [
  {
    id: 'k1',
    routeDisplay: 5,
    routeName: 'Podgórze – Piątek',
    status: 'planning',
    driverId: null,
    car: null,
    stopsTotal: 9,
    plannedStart: null,
    problem: null,
  },
  {
    id: 'k2',
    routeDisplay: 2,
    routeName: 'Osiedle Wschód',
    status: 'ready',
    driverId: 'an',
    car: 'isuzu',
    stopsTotal: 7,
    plannedStart: '06:30',
    problem: null,
  },
  {
    id: 'k3',
    routeDisplay: 3,
    routeName: 'Strefa Przemysłowa',
    status: 'active',
    driverId: 'mk',
    car: 'fiat',
    stopsTotal: 10,
    currentStop: 5,
    startedAt: '06:32',
    problem: { label: 'Częściowy odbiór — Pralnia Wschód' },
  },
  {
    id: 'k4',
    routeDisplay: 4,
    routeName: 'Górna – Hotele',
    status: 'active',
    driverId: 'tw',
    car: 'merc',
    stopsTotal: 8,
    currentStop: 8,
    startedAt: '06:10',
    problem: null,
  },
  {
    id: 'k5',
    routeDisplay: 1,
    routeName: 'Centrum Poniedziałek',
    status: 'settlement',
    driverId: 'pz',
    car: 'iveco',
    stopsTotal: 10,
    reportedKm: 182,
    reportedHours: '6:15–14:05',
    kmApproved: false,
    hoursApproved: false,
    problem: null,
  },
  {
    id: 'k6',
    routeDisplay: 2,
    routeName: 'Osiedle Wschód (wczoraj)',
    status: 'closed',
    driverId: 'an',
    car: 'isuzu',
    stopsTotal: 7,
    reportedKm: 96,
    reportedHours: '6:28–12:40',
    kmApproved: true,
    hoursApproved: true,
    problem: null,
  },
];

// Dziennik kursu — wpisy historii dla panelu bocznego w Dyspozytorni.
export const MOCK_TRIP_LOG = {
  k3: [
    { time: '06:32', type: 'start', label: 'Kurs rozpoczęty', detail: 'Marek Kowalski · Fiat' },
    { time: '06:51', type: 'stop', label: 'Obsłużono: Pralnia Chemiczna Wschód', detail: 'Odbiór 3 wózki' },
    { time: '07:14', type: 'problem', label: 'Częściowy odbiór', detail: 'Pralnia Wschód — odebrano 2 z 3 wózków, reszta jutro' },
    { time: '07:36', type: 'stop', label: 'Obsłużono: Hotel Merkury', detail: 'Dostawa 24 kg pościel, odbiór 2 wózki ręczniki' },
    { time: '07:58', type: 'stop', label: 'Obsłużono: Restauracja Bella', detail: 'Dostawa 8 kg obrusy' },
    { time: '08:20', type: 'stop', label: 'Obsłużono: Pensjonat Nad Stawem', detail: 'Odbiór 1 wózek' },
  ],
  k4: [
    { time: '06:10', type: 'start', label: 'Kurs rozpoczęty', detail: 'Tomasz Wiśniewski · Mercedes' },
    { time: '06:24', type: 'stop', label: 'Obsłużono: Hotel Astoria', detail: 'Dostawa 40 kg pościel' },
    { time: '06:52', type: 'handoff', label: 'Przekazanie kierowcy', detail: 'Tomasz Wiśniewski → pozostaje ten sam kierowca (test zmiany odwołany)' },
    { time: '07:15', type: 'stop', label: 'Obsłużono: Hotel Panorama', detail: 'Odbiór 4 wózki' },
    { time: '08:02', type: 'car', label: 'Zmiana auta', detail: 'Mercedes → Iveco (kontrola techniczna)' },
    { time: '09:40', type: 'stop', label: 'Obsłużono: 6 kolejnych klientów', detail: 'Bez uwag' },
  ],
  k5: [
    { time: '06:15', type: 'start', label: 'Kurs rozpoczęty', detail: 'Piotr Zieliński · Iveco' },
    { time: '06:15', type: 'stop', label: '10 przystanków obsłużonych', detail: 'Bez uwag' },
    { time: '14:05', type: 'finish', label: 'Kurs zakończony', detail: 'Zgłoszono licznik: 182 km' },
    { time: '14:06', type: 'settlement', label: 'Zgłoszono godziny pracy', detail: '6:15–14:05 (7h 50m)' },
  ],
  k6: [
    { time: '06:28', type: 'start', label: 'Kurs rozpoczęty', detail: 'Anna Nowak · Isuzu' },
    { time: '12:40', type: 'finish', label: 'Kurs zakończony', detail: 'Zgłoszono licznik: 96 km' },
    { time: '13:10', type: 'settlement', label: 'Zatwierdzono kilometry i godziny', detail: 'Admin: zatwierdzone bez zmian' },
  ],
};

// Przystanki dla makiety kierowcy — kurs k3 (Strefa Przemysłowa), aktualnie przystanek 5 z 10.
export const MOCK_DRIVER_COURSE = {
  id: 'k3',
  routeDisplay: 3,
  routeName: 'Strefa Przemysłowa',
  driverName: 'Marek Kowalski',
  car: 'fiat',
  startStopIndex: 4, // 0-based → „Przystanek 5 z 11"
  stops: [
    {
      id: 's1',
      name: 'Pralnia Chemiczna Wschód',
      address: 'ul. Przemysłowa 12, Bydgoszcz',
      tasks: [{ type: 'odbior', qty: 3, unit: 'wózki' }],
      note: null,
    },
    {
      id: 's2',
      name: 'Hotel Merkury',
      address: 'ul. Focha 8, Bydgoszcz',
      tasks: [{ type: 'dostawa', qty: 24, unit: 'kg pościel' }],
      note: null,
    },
    {
      id: 's3',
      name: 'Restauracja Bella',
      address: 'ul. Gdańska 44, Bydgoszcz',
      tasks: [{ type: 'dostawa', qty: 8, unit: 'kg obrusy' }],
      note: null,
    },
    {
      id: 's4',
      name: 'Pensjonat Nad Stawem',
      address: 'ul. Jesionowa 3, Bydgoszcz',
      tasks: [{ type: 'odbior', qty: 1, unit: 'wózek' }],
      note: null,
    },
    {
      id: 's5',
      name: 'Hotel Panorama',
      address: 'ul. Toruńska 120, Bydgoszcz',
      tasks: [
        { type: 'dostawa', qty: 24, unit: 'kg pościel' },
        { type: 'odbior', qty: 2, unit: 'wózki ręczniki' },
      ],
      note: 'Wejście z tyłu budynku, kod 4521',
    },
    {
      id: 's6',
      name: 'Salon Fryzjerski Venus',
      address: 'ul. Kwiatowa 9, Bydgoszcz',
      tasks: [{ type: 'dostawa', qty: 5, unit: 'kg fartuchy' }],
      note: null,
    },
    {
      id: 's7',
      name: 'Restauracja Stary Port',
      address: 'ul. Nadrzeczna 2, Bydgoszcz',
      tasks: [{ type: 'odbior', qty: 2, unit: 'wózki' }],
      note: null,
    },
    {
      id: 's8',
      name: 'Hotel Astoria',
      address: 'ul. Focha 15, Bydgoszcz',
      tasks: [{ type: 'dostawa', qty: 40, unit: 'kg pościel' }],
      note: null,
    },
    {
      id: 's9',
      name: 'Klinika Zdrowie',
      address: 'ul. Lekarska 6, Bydgoszcz',
      tasks: [{ type: 'odbior', qty: 4, unit: 'wózki fartuchy' }],
      note: 'Odbiór tylko z magazynu w podwórzu',
    },
    {
      id: 's10',
      name: 'Restauracja Bella (dostawa popołudniowa)',
      address: 'ul. Gdańska 44, Bydgoszcz',
      tasks: [{ type: 'dostawa', qty: 3, unit: 'kg serwetki' }],
      note: null,
    },
  ],
};

export const PROBLEM_OPTIONS = [
  { key: 'partial', label: 'Częściowy odbiór', hint: 'Odebrano mniej niż zaplanowano' },
  { key: 'closed', label: 'Klient zamknięty / nieobecny', hint: 'Nie udało się zrealizować przystanku' },
  { key: 'extra', label: 'Dodatkowy postój', hint: 'Postój poza planem trasy' },
  { key: 'car', label: 'Zmiana auta', hint: 'Zamyka bieżący odcinek, otwiera nowy' },
  { key: 'handoff', label: 'Przekaż kierowcy', hint: 'Kurs zostaje ten sam, zmienia się wykonujący' },
];
