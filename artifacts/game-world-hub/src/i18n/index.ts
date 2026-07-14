import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import arCommon from './locales/ar/common.json';
import enAuth from './locales/en/auth.json';
import arAuth from './locales/ar/auth.json';
import enDashboard from './locales/en/dashboard.json';
import arDashboard from './locales/ar/dashboard.json';
import enFriends from './locales/en/friends.json';
import arFriends from './locales/ar/friends.json';
import enChat from './locales/en/chat.json';
import arChat from './locales/ar/chat.json';
import enParties from './locales/en/parties.json';
import arParties from './locales/ar/parties.json';
import enLfg from './locales/en/lfg.json';
import arLfg from './locales/ar/lfg.json';
import enRanks from './locales/en/ranks.json';
import arRanks from './locales/ar/ranks.json';
import enLibrary from './locales/en/library.json';
import arLibrary from './locales/ar/library.json';
import enProfile from './locales/en/profile.json';
import arProfile from './locales/ar/profile.json';
import enSettings from './locales/en/settings.json';
import arSettings from './locales/ar/settings.json';
import enLanding from './locales/en/landing.json';
import arLanding from './locales/ar/landing.json';

export const LANGS = ['en', 'ar'] as const;
export type AppLanguage = (typeof LANGS)[number];

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    friends: enFriends,
    chat: enChat,
    parties: enParties,
    lfg: enLfg,
    ranks: enRanks,
    library: enLibrary,
    profile: enProfile,
    settings: enSettings,
    landing: enLanding,
  },
  ar: {
    common: arCommon,
    auth: arAuth,
    dashboard: arDashboard,
    friends: arFriends,
    chat: arChat,
    parties: arParties,
    lfg: arLfg,
    ranks: arRanks,
    library: arLibrary,
    profile: arProfile,
    settings: arSettings,
    landing: arLanding,
  },
};

export function isRtl(lang: string | undefined): boolean {
  return !!lang && lang.startsWith('ar');
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...LANGS],
    load: 'languageOnly',
    defaultNS: 'common',
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
    detection: {
      // First visit: follow the browser language; afterwards the user's
      // explicit choice (stored in localStorage) always wins.
      // ?lng=ar|en overrides for that visit (useful for testing/support links).
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'gwh_lang',
    },
  });

export default i18n;
