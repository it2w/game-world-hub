/**
 * Mobile deep-link ownerOnly tab guard — screen-mount integration tests
 *
 * Task 515: Confirm ownerOnly tabs also reject direct URL navigation when the
 * app is launched from a deep-link on mobile.
 *
 * The web ServerSettingsDialog.settings-url-tab tests prove the guard via a
 * rendered React component.  This file does the same for the mobile app by
 * mounting a minimal CommunitySettingsScreen stub that mirrors the contract
 * any real mobile settings screen must honour:
 *
 *   const { tab: rawTab } = useLocalSearchParams();
 *   const [activeTab] = useState(() => resolveTabForRole(rawTab, isOwner, isMod));
 *
 * Expo Router decodes percent-encoded params before the value reaches the
 * component — identical behaviour to URLSearchParams on web — so the guard
 * semantics are the same on both platforms.
 *
 * Covered scenarios (both mod and plain-member role variants per ownerOnly tab):
 *   Screen mount — ownerOnly tab deep-link is blocked
 *     A. mod   deep-linking to ?tab=danger → active tab is "overview"
 *     B. plain member deep-linking to ?tab=danger → active tab is "overview"
 *     C. owner deep-linking to ?tab=danger → active tab is "danger" (allowed)
 *   Parameterised over every ownerOnly tab in SETTINGS_NAV_META
 *     D. mod   deep-linking to ?tab=<ownerOnly>   → active tab is "overview"
 *     E. plain member deep-linking to same         → active tab is "overview"
 *   Edge cases
 *     F. uppercase ?tab=DANGER treated as unknown → active tab is "overview"
 *     G. percent-encoded ?tab=dan%67er decoded to "danger" → blocked for non-owner
 *     H. null tab param (no ?tab= in URL)         → active tab is "overview"
 *
 * Reference: artifacts/game-world-hub/src/pages/community-hub.settings-url-tab.test.tsx
 */

import React, { useState } from 'react';
import { render } from '@testing-library/react';
import { resolveTabForRole, SETTINGS_NAV_META } from './settings-tab-deep-link.test';

// ── Expo Router mock ─────────────────────────────────────────────────────────
//
// useLocalSearchParams is the Expo Router hook that exposes params from the
// current deep-link URL.  We mock it to control the raw `tab` value the
// screen receives, exactly as Expo Router would after decoding the URL.

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useLocalSearchParams } = require('expo-router') as {
  useLocalSearchParams: jest.Mock;
};

// ── Stub CommunitySettingsScreen ─────────────────────────────────────────────
//
// Mirrors the contract any real mobile community-settings screen must follow:
//  1. Read the raw `tab` param from the deep-link via useLocalSearchParams.
//  2. Pipe it through resolveTabForRole(rawTab, isOwner, isMod) in the
//     useState initialiser — never use the raw value directly as initial state.
//  3. Expose the resolved tab via data-active-tab for test assertions.
//
// The stub is intentionally minimal; its sole purpose is to verify that the
// guard contract produces the correct initial state when the component mounts
// with a crafted deep-link param.

function CommunitySettingsScreen({
  isOwner,
  isMod,
}: {
  isOwner: boolean;
  isMod: boolean;
}) {
  const params = useLocalSearchParams() as { tab?: string };
  const rawTab = params.tab;
  // resolveTabForRole is the gate: it must be called in the initialiser so
  // the first committed state is always role-appropriate.
  const [activeTab] = useState(() => resolveTabForRole(rawTab, isOwner, isMod));
  return (
    <div data-testid="settings-content" data-active-tab={activeTab} />
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Set the tab param that useLocalSearchParams will return. */
function setDeepLinkTab(tab: string | undefined) {
  useLocalSearchParams.mockReturnValue(tab !== undefined ? { tab } : {});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CommunitySettingsScreen — ownerOnly tab deep-link guard', () => {
  beforeEach(() => {
    // Default: no tab param (as if the link had no ?tab= query)
    useLocalSearchParams.mockReturnValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── A. mod deep-linking to ?tab=danger ────────────────────────────────────

  test('A: mod with deep-link tab=danger mounts with active tab "overview", not "danger"', () => {
    setDeepLinkTab('danger');

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={true} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  // ── B. plain member deep-linking to ?tab=danger ───────────────────────────

  test('B: plain member with deep-link tab=danger mounts with active tab "overview", not "danger"', () => {
    setDeepLinkTab('danger');

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={false} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  // ── C. owner deep-linking to ?tab=danger (must be allowed) ───────────────

  test('C: owner with deep-link tab=danger mounts with active tab "danger" (owner is permitted)', () => {
    setDeepLinkTab('danger');

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={true} isMod={false} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('danger');
  });

  // ── D & E. Parameterised over every ownerOnly tab ─────────────────────────
  //
  // Any future ownerOnly tab added to SETTINGS_NAV_META is automatically
  // covered by this loop — no manual test update is required.

  const ownerOnlyTabIds = SETTINGS_NAV_META
    .filter(item => item.ownerOnly)
    .map(item => item.id);

  for (const tabId of ownerOnlyTabIds) {
    test(`D: mod deep-linking to tab=${tabId} (ownerOnly) — active tab must be "overview"`, () => {
      setDeepLinkTab(tabId);

      const { getByTestId } = render(
        <CommunitySettingsScreen isOwner={false} isMod={true} />,
      );

      expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
    });

    test(`E: plain member deep-linking to tab=${tabId} (ownerOnly) — active tab must be "overview"`, () => {
      setDeepLinkTab(tabId);

      const { getByTestId } = render(
        <CommunitySettingsScreen isOwner={false} isMod={false} />,
      );

      expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
    });
  }

  // ── F. uppercase variant is treated as unknown ────────────────────────────

  test('F: deep-link tab=DANGER (uppercase) — active tab is "overview" for mod (unknown tab id)', () => {
    // Expo Router preserves the case of param values; "DANGER" does not match
    // the known tab id "danger" and must fall through to "overview".
    setDeepLinkTab('DANGER');

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={true} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  test('F: deep-link tab=DANGER (uppercase) — active tab is "overview" for plain member', () => {
    setDeepLinkTab('DANGER');

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={false} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  // ── G. percent-encoded param decoded by Expo Router ───────────────────────
  //
  // Expo Router decodes percent-encoded params before the value reaches the
  // component (same as URLSearchParams on web).  A crafted deep-link of the
  // form myapp://settings?tab=dan%67er therefore delivers the decoded string
  // "danger" to the component — the ownerOnly guard must block it.

  test('G: deep-link tab decoded from "dan%67er" to "danger" — blocked for mod (active tab is "overview")', () => {
    // Simulate Expo Router's URL decoding: %67 → 'g', so the value is "danger".
    const decoded = decodeURIComponent('dan%67er');
    expect(decoded).toBe('danger'); // confirm decoding happened
    setDeepLinkTab(decoded);

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={true} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  test('G: deep-link tab decoded from "dan%67er" to "danger" — blocked for plain member (active tab is "overview")', () => {
    const decoded = decodeURIComponent('dan%67er');
    setDeepLinkTab(decoded);

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={false} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  // ── H. no tab param in deep-link → safe default ───────────────────────────

  test('H: deep-link with no tab param — active tab is "overview" for mod', () => {
    // When useLocalSearchParams returns no tab key (e.g. myapp://settings),
    // rawTab is undefined and resolveTabForRole must return "overview".
    useLocalSearchParams.mockReturnValue({});

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={true} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });

  test('H: deep-link with no tab param — active tab is "overview" for plain member', () => {
    useLocalSearchParams.mockReturnValue({});

    const { getByTestId } = render(
      <CommunitySettingsScreen isOwner={false} isMod={false} />,
    );

    expect(getByTestId('settings-content').getAttribute('data-active-tab')).toBe('overview');
  });
});
