import i18n from '../i18n';

export function getEaster(year) {
  const f = Math.floor,
        G = year % 19,
        C = f(year / 100),
        H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
        I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11)),
        J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
        L = I - J,
        month = 3 + f((L + 40) / 44),
        day = L + 28 - 31 * f(month / 4);
  return new Date(year, month - 1, day);
}

export function getHolidays(year) {
  const easter = getEaster(year);
  
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);

  const holidays = [
    { name: i18n.t('dates.holidays.newYear'), date: new Date(year, 0, 1) },
    { name: i18n.t('dates.holidays.epiphany'), date: new Date(year, 0, 6) },
    { name: i18n.t('dates.holidays.easter'), date: easter },
    { name: i18n.t('dates.holidays.easterMonday'), date: easterMonday },
    { name: i18n.t('dates.holidays.labourDay'), date: new Date(year, 4, 1) },
    { name: i18n.t('dates.holidays.constitutionDay'), date: new Date(year, 4, 3) },
    { name: i18n.t('dates.holidays.pentecost'), date: new Date(easter.getTime() + 49 * 24 * 60 * 60 * 1000) },
    { name: i18n.t('dates.holidays.corpusChristi'), date: corpusChristi },
    { name: i18n.t('dates.holidays.assumption'), date: new Date(year, 7, 15) },
    { name: i18n.t('dates.holidays.allSaints'), date: new Date(year, 10, 1) },
    { name: i18n.t('dates.holidays.independenceDay'), date: new Date(year, 10, 11) },
    { name: i18n.t('dates.holidays.christmasFirst'), date: new Date(year, 11, 25) },
    { name: i18n.t('dates.holidays.christmasSecond'), date: new Date(year, 11, 26) }
  ];

  return holidays;
}

export function isHoliday(dateObj) {
  const year = dateObj.getFullYear();
  const holidays = getHolidays(year);

  return holidays.find(h =>
    h.date.getDate() === dateObj.getDate() &&
    h.date.getMonth() === dateObj.getMonth()
  );
}
