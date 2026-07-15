// Vitest setup: initialize i18next so components render real English strings
// (jsdom's navigator.language is en-US, so tests always run in English).
import '@/i18n';
// Extend vitest's expect with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom';
