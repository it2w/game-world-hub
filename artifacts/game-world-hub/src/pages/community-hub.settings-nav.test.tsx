/**
 * Unit tests for the ServerSettingsDialog nav-item filter logic.
 *
 * Uses the real SETTINGS_NAV_META exported from community-hub.tsx so that
 * any changes to the nav config automatically affect these assertions.
 *
 * The filter determines which settings tabs are visible based on the
 * viewer's role in the community:
 *
 *  - ownerOnly tabs   → visible only to isOwner=true
 *  - ownerOrModOnly   → visible to isOwner=true OR isMod=true
 *  - default          → visible to all authenticated members
 *
 * The "Danger Zone" tab (Delete Community) carries ownerOnly=true and
 * must never appear for mods.
 *
 * Covered scenarios:
 *  1. Owner sees all tabs (including "danger" and "insights")
 *  2. Mod does NOT see the "danger" tab
 *  3. Mod DOES see the "insights" tab (ownerOrModOnly)
 *  4. Regular member does NOT see "danger"
 *  5. Regular member does NOT see "insights" (ownerOrModOnly)
 *  6. Regular member sees all non-restricted tabs
 */

import { describe, test, expect } from "vitest";
import { SETTINGS_NAV_META, type SettingsTab } from "./community-hub";

// ── Replicate the exact filter from ServerSettingsDialog ──────────────────────

function filterNavItems(isOwner: boolean, isMod: boolean): SettingsTab[] {
  return SETTINGS_NAV_META
    .filter(item => {
      if (item.ownerOnly) return isOwner;
      if (item.ownerOrModOnly) return isOwner || isMod;
      return true;
    })
    .map(item => item.id);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ServerSettingsDialog nav-item filter (real SETTINGS_NAV_META)", () => {
  test("owner sees all tabs including 'danger' and 'insights'", () => {
    const tabs = filterNavItems(true, true);
    expect(tabs).toContain("danger");
    expect(tabs).toContain("insights");
    expect(tabs.length).toBe(SETTINGS_NAV_META.length);
  });

  test("mod does NOT see the 'danger' tab", () => {
    const tabs = filterNavItems(false, true);
    expect(tabs).not.toContain("danger");
  });

  test("mod DOES see the 'insights' tab (ownerOrModOnly)", () => {
    const tabs = filterNavItems(false, true);
    expect(tabs).toContain("insights");
  });

  test("regular member does NOT see 'danger'", () => {
    const tabs = filterNavItems(false, false);
    expect(tabs).not.toContain("danger");
  });

  test("regular member does NOT see 'insights'", () => {
    const tabs = filterNavItems(false, false);
    expect(tabs).not.toContain("insights");
  });

  test("regular member sees all non-restricted tabs", () => {
    const tabs = filterNavItems(false, false);
    const unrestricted: SettingsTab[] = [
      "overview", "roles", "channels", "automod", "welcome",
      "events", "badges", "invites",
    ];
    for (const tab of unrestricted) {
      expect(tabs).toContain(tab);
    }
  });
});
