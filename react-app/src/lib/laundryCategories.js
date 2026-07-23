export const LAUNDRY_CATEGORIES = Object.freeze([
  { code: 'P', translationKey: 'entry.sheets' },
  { code: 'O', translationKey: 'entry.tablecloths' },
  { code: 'F', translationKey: 'entry.terry' },
  { code: 'R', translationKey: 'entry.workwear' },
]);

export const DEFAULT_LAUNDRY_CATEGORIES = Object.freeze(['P', 'O']);

const CATEGORY_CODES = new Set(LAUNDRY_CATEGORIES.map(category => category.code));

export function normalizeLaundryCategories(categories, fallback = DEFAULT_LAUNDRY_CATEGORIES) {
  const source = Array.isArray(categories) ? categories : fallback;
  const selected = new Set(
    source
      .map(value => String(value || '').trim().toUpperCase())
      .filter(code => CATEGORY_CODES.has(code)),
  );
  return LAUNDRY_CATEGORIES
    .map(category => category.code)
    .filter(code => selected.has(code));
}

export function laundryCategoriesForClient(client, routes = []) {
  if (Array.isArray(client?.laundry_categories)) {
    return normalizeLaundryCategories(client.laundry_categories, []);
  }
  const route = routes.find(item => Number(item.id) === Number(client?.route_id));
  return route?.is_workwear === true ? ['R'] : [...DEFAULT_LAUNDRY_CATEGORIES];
}

export function firstAllowedLaundryType(client, routes = [], preferredType = null) {
  const categories = laundryCategoriesForClient(client, routes);
  const preferred = String(preferredType || '').toUpperCase();
  return categories.includes(preferred) ? preferred : categories[0] || null;
}

export function laundryTypeFlags(types = []) {
  const selected = new Set(
    types.map(type => String(type || 'P').toUpperCase()),
  );
  return {
    hasP: selected.has('P'),
    hasO: selected.has('O'),
    hasF: selected.has('F'),
    hasR: selected.has('R'),
  };
}

export function laundryTypeTranslationKey(type) {
  return LAUNDRY_CATEGORIES.find(category => category.code === type)?.translationKey
    || 'entry.sheets';
}

export function laundryTypeLabel(type, t) {
  return t(laundryTypeTranslationKey(type));
}
