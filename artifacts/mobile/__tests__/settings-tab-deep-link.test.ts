/**
 * ?tab= deep-link security guard — mobile smoke-test
 *
 * Cross-platform policy
 * ─────────────────────
 * The web ServerSettingsDialog uses `resolveTabForRole` to validate any
 * `?tab=` query-parameter before activating a settings panel.  This prevents
 * a mod or plain member from deep-linking into an owner-only tab (e.g.
 * ?tab=danger) and landing on its content.
 *
 * The mobile app currently has NO settings screen, so there is nothing to
 * guard today.  This file exists for two reasons:
 *
 *  1. It provides an exhaustive test suite for the *portable* `resolveTabForRole`
 *     logic (identical semantics to the web version) so that any future mobile
 *     settings screen can import and use it without re-implementing the guard.
 *
 *  2. It contains a structural scan (snapshot + assertions) that verifies no
 *     mobile screen currently reads a deep-link `tab` parameter without going
 *     through the role-validation gate.  The scan will fail fast if someone
 *     ships a settings screen that skips the guard.
 *
 * Reference: artifacts/game-world-hub/src/pages/community-hub.settings-url-tab.test.tsx
 *
 * Covered scenarios:
 *   resolveTabForRole — pure logic
 *    1. null / undefined → "overview"
 *    2. unknown / empty string → "overview"
 *    3. owner can access "danger"
 *    4. mod requesting "danger" → "overview"
 *    5. plain member requesting "danger" → "overview"
 *    6. mod requesting "insights" (ownerOrModOnly) → allowed
 *    7. plain member requesting "insights" → "overview"
 *    8. unrestricted tabs are returned as-is for any role
 *    9. uppercase "DANGER" is unknown → "overview" (case-sensitive)
 *   10. mixed-case ownerOrModOnly variants → "overview"
 *   11. URL-decoded "dan%67er" arrives as "danger" → blocked for non-owner
 *   12. raw percent-encoded string is unknown → "overview"
 *   13. invariant: resolveTabForRole only ever returns a known tab id
 *   Structural scan
 *   14. No mobile screen reads a `tab` deep-link param without role validation
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Portable settings-tab meta ────────────────────────────────────────────────
//
// If/when a mobile settings screen is added, extend this list to match the
// actual panels it exposes.  The guard function below is designed to be
// imported directly into any component that opens settings via a deep link.

export type SettingsTab =
  | 'overview'
  | 'roles'
  | 'channels'
  | 'automod'
  | 'welcome'
  | 'events'
  | 'badges'
  | 'insights'
  | 'invites'
  | 'danger';

export const SETTINGS_NAV_META: ReadonlyArray<{
  id: SettingsTab;
  ownerOnly?: boolean;
  ownerOrModOnly?: boolean;
}> = [
  { id: 'overview' },
  { id: 'roles' },
  { id: 'channels' },
  { id: 'automod' },
  { id: 'welcome' },
  { id: 'events' },
  { id: 'badges' },
  { id: 'insights', ownerOrModOnly: true },
  { id: 'invites' },
  { id: 'danger', ownerOnly: true },
];

/**
 * Portable guard — validates a raw tab value (e.g. from a deep-link param)
 * against the viewer's role and returns a safe SettingsTab to activate.
 *
 * Rules (identical to the web implementation):
 *  - Unknown / non-string values    → "overview"
 *  - ownerOnly tabs (e.g. "danger") → "overview" unless isOwner
 *  - ownerOrModOnly tabs            → "overview" unless isOwner || isMod
 *  - All other known tabs           → returned as-is
 *
 * On mobile, the raw tab value typically comes from
 * `useLocalSearchParams<{ tab?: string }>().tab` (Expo Router).
 * Pass that value directly to this function before using it as initial state.
 */
export function resolveTabForRole(
  rawTab: string | null | undefined,
  isOwner: boolean,
  isMod: boolean,
): SettingsTab {
  const meta = SETTINGS_NAV_META.find(item => item.id === rawTab);
  if (!meta) return 'overview';
  if (meta.ownerOnly && !isOwner) return 'overview';
  if (meta.ownerOrModOnly && !isOwner && !isMod) return 'overview';
  return meta.id;
}

// ── Pure-logic tests ──────────────────────────────────────────────────────────

describe('resolveTabForRole', () => {
  // 1. null / undefined
  test('null / undefined tab → "overview"', () => {
    expect(resolveTabForRole(null, false, false)).toBe('overview');
    expect(resolveTabForRole(undefined, false, false)).toBe('overview');
  });

  // 2. unknown / empty
  test('unknown or empty tab string → "overview"', () => {
    expect(resolveTabForRole('hacked', false, false)).toBe('overview');
    expect(resolveTabForRole('', false, false)).toBe('overview');
  });

  // 3. owner can access "danger"
  test('owner can access "danger"', () => {
    expect(resolveTabForRole('danger', true, false)).toBe('danger');
    expect(resolveTabForRole('danger', true, true)).toBe('danger');
  });

  // 4. mod requesting "danger"
  test('mod requesting "danger" → "overview"', () => {
    expect(resolveTabForRole('danger', false, true)).toBe('overview');
  });

  // 5. plain member requesting "danger"
  test('plain member requesting "danger" → "overview"', () => {
    expect(resolveTabForRole('danger', false, false)).toBe('overview');
  });

  // 6. mod requesting "insights" (ownerOrModOnly)
  test('mod requesting "insights" (ownerOrModOnly) → allowed', () => {
    expect(resolveTabForRole('insights', false, true)).toBe('insights');
  });

  // 7. plain member requesting "insights"
  test('plain member requesting "insights" → "overview"', () => {
    expect(resolveTabForRole('insights', false, false)).toBe('overview');
  });

  // 8. unrestricted tabs
  test('all unrestricted tabs are returned as-is for any role', () => {
    const unrestricted = SETTINGS_NAV_META
      .filter(item => !item.ownerOnly && !item.ownerOrModOnly)
      .map(item => item.id);

    for (const tab of unrestricted) {
      expect(resolveTabForRole(tab, false, false)).toBe(tab);
      expect(resolveTabForRole(tab, false, true)).toBe(tab);
      expect(resolveTabForRole(tab, true, false)).toBe(tab);
    }
  });

  // 9. case-sensitive — uppercase is unknown
  test('uppercase "DANGER" is not a known tab id → "overview" for any role', () => {
    expect(resolveTabForRole('DANGER', false, true)).toBe('overview');
    expect(resolveTabForRole('DANGER', false, false)).toBe('overview');
    // Even an owner gets "overview" — the value is simply unknown.
    expect(resolveTabForRole('DANGER', true, false)).toBe('overview');
  });

  // 10. mixed-case ownerOrModOnly variants
  test('mixed-case variants of ownerOrModOnly tabs are also unknown → "overview"', () => {
    expect(resolveTabForRole('Insights', false, true)).toBe('overview');
    expect(resolveTabForRole('INSIGHTS', false, true)).toBe('overview');
  });

  // 11. URL-decoded value
  test('URLSearchParams decodes %67→g so "dan%67er" arrives as "danger" → "overview" for non-owner', () => {
    // On mobile, Expo Router decodes percent-encoded params before the value
    // reaches the component — the same behaviour as URLSearchParams on web.
    const decoded = new URLSearchParams('tab=dan%67er').get('tab');
    expect(decoded).toBe('danger'); // decoding actually happened
    expect(resolveTabForRole(decoded, false, true)).toBe('overview');
    expect(resolveTabForRole(decoded, false, false)).toBe('overview');
    // Owner is still allowed via the decoded value.
    expect(resolveTabForRole(decoded, true, false)).toBe('danger');
  });

  // 12. raw (still-encoded) string is unknown
  test('un-decoded percent-encoded string is unknown → "overview"', () => {
    expect(resolveTabForRole('dan%67er', false, true)).toBe('overview');
    expect(resolveTabForRole('dan%67er', true, false)).toBe('overview');
  });

  // 13. invariant: only known tab ids can be returned
  test('invariant: resolveTabForRole never returns a value absent from SETTINGS_NAV_META', () => {
    const knownIds = new Set(SETTINGS_NAV_META.map(item => item.id));
    const probes = [
      'DANGER', 'Danger', 'dAnGeR',
      'INSIGHTS', 'Insights',
      'OVERVIEW', 'Overview',
      'dan%67er', 'dan%44er',
      ' danger', 'danger ', '\tdanger',
      'danger\u200B', // zero-width space
    ];
    for (const probe of probes) {
      const result = resolveTabForRole(probe, true, true);
      expect(knownIds.has(result)).toBe(true);
    }
  });
});

// ── Structural scan ───────────────────────────────────────────────────────────
//
// Walk every TypeScript/TSX file under artifacts/mobile and confirm that no
// screen reads a `tab` search-param from a deep link without the role guard.
//
// The scan looks for two patterns that, in combination, would indicate an
// unguarded tab read:
//
//  • useLocalSearchParams used to extract a value named "tab"
//  • the extracted value used as initial state (useState / useRef) without
//    a call to resolveTabForRole on the same path
//
// Because mobile screens can vary in style, the scan takes a conservative
// approach: it simply asserts that NO file simultaneously:
//   (a) calls useLocalSearchParams and destructures / uses "tab", AND
//   (b) does NOT call resolveTabForRole
//
// If this test fails, the offending file must be updated to pipe the raw tab
// value through resolveTabForRole(rawTab, isOwner, isMod) before using it.

describe('Mobile source — structural guard', () => {
  const mobileRoot = path.resolve(__dirname, '..');
  const appDir = path.join(mobileRoot, 'app');
  const componentsDir = path.join(mobileRoot, 'components');

  /** Recursively collect all .ts / .tsx files under a directory. */
  function collectSourceFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectSourceFiles(full));
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
    return files;
  }

  // 14. No mobile screen reads a tab deep-link param without role validation
  test(
    'no mobile screen reads a "tab" deep-link param via useLocalSearchParams without resolveTabForRole',
    () => {
      const sourceFiles = [
        ...collectSourceFiles(appDir),
        ...collectSourceFiles(componentsDir),
      ];

      // Screens in scope for this guard: those that actually call
      // useLocalSearchParams and extract a param called "tab".
      // The regex matches common destructuring patterns:
      //   const { tab } = useLocalSearchParams(...)
      //   const params = useLocalSearchParams(...); ... params.tab
      //   useLocalSearchParams<{ tab: ... }>()
      const tabParamPattern = /useLocalSearchParams[^;]*\btab\b/s;
      const guardPattern = /resolveTabForRole\s*\(/;

      const violators: string[] = [];

      for (const filePath of sourceFiles) {
        const src = fs.readFileSync(filePath, 'utf8');
        if (tabParamPattern.test(src) && !guardPattern.test(src)) {
          // This file reads a "tab" deep-link param without the role guard.
          violators.push(path.relative(mobileRoot, filePath));
        }
      }

      if (violators.length > 0) {
        throw new Error(
          'The following mobile screen(s) read a "tab" deep-link param without ' +
          'calling resolveTabForRole().  Pipe the raw param through ' +
          'resolveTabForRole(rawTab, isOwner, isMod) before using it as ' +
          'initial state:\n\n  ' +
          violators.join('\n  '),
        );
      }

      // Confirm the scan actually found source files (guards against an empty
      // scan passing vacuously if the directory structure changes).
      expect(sourceFiles.length).toBeGreaterThan(0);
    },
  );

  test(
    'only conversation/[id].tsx uses useLocalSearchParams (no settings screen yet)',
    () => {
      const sourceFiles = [
        ...collectSourceFiles(appDir),
        ...collectSourceFiles(componentsDir),
      ];

      const usesSearchParams = sourceFiles
        .filter(f => {
          const src = fs.readFileSync(f, 'utf8');
          return /useLocalSearchParams/.test(src);
        })
        .map(f => path.relative(mobileRoot, f));

      // Currently only the conversation screen reads URL params.
      // If a new settings screen is added WITHOUT the guard, test #14 above
      // will catch it.  This test documents the current known state and will
      // flag any new adopter for review.
      const knownAdopters = ['app/conversation/[id].tsx'];
      const unexpected = usesSearchParams.filter(
        f => !knownAdopters.includes(f),
      );

      if (unexpected.length > 0) {
        throw new Error(
          'New mobile screen(s) now call useLocalSearchParams:\n\n  ' +
          unexpected.join('\n  ') +
          '\n\nIf any of these read a "tab" param to open a settings panel, ' +
          'ensure they call resolveTabForRole() before using the value as ' +
          'initial state (see this file for the guard function).  Then add ' +
          "the file to `knownAdopters` in this test and verify test #14 still passes.",
        );
      }
    },
  );
});
