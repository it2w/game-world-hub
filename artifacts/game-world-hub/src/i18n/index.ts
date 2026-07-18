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
import enAdmin from './locales/en/admin.json';
import arAdmin from './locales/ar/admin.json';
import enOwner from './locales/en/owner.json';
import arOwner from './locales/ar/owner.json';
import enChallenges from './locales/en/challenges.json';
import arChallenges from './locales/ar/challenges.json';
import enStats from './locales/en/stats.json';
import arStats from './locales/ar/stats.json';
import enRooms from './locales/en/rooms.json';
import arRooms from './locales/ar/rooms.json';

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
    admin: enAdmin,
    owner: enOwner,
    challenges: enChallenges,
    stats: enStats,
    rooms: enRooms,
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
    admin: arAdmin,
    owner: arOwner,
    challenges: arChallenges,
    stats: arStats,
    rooms: arRooms,
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
