import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import pl from './locales/pl.json';
import de from './locales/de.json';

export const SUPPORTED_LANGUAGES = ['pl', 'de'];
export const LANGUAGE_STORAGE_KEY = 'lebuser_lang';
export const DEFAULT_LANGUAGE = 'pl';

const syncDocumentLanguage = (language) => {
  if (typeof document === 'undefined') return;
  const normalizedLanguage = language?.split('-')[0];
  document.documentElement.lang = SUPPORTED_LANGUAGES.includes(normalizedLanguage)
    ? normalizedLanguage
    : DEFAULT_LANGUAGE;
};

i18n.on('languageChanged', syncDocumentLanguage);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pl: { translation: pl },
      de: { translation: de },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    // Wykrywanie: najpierw zapamiętany wybór, potem język urządzenia.
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React sam zabezpiecza przed XSS
    },
    returnNull: false,
  });

syncDocumentLanguage(i18n.resolvedLanguage || i18n.language);

export default i18n;
