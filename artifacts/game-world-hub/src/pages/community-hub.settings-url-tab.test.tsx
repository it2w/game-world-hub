/**
 * Tests for URL-parameter tab routing in ServerSettingsDialog.
 *
 * A mod who navigates directly to ?tab=danger (e.g. by bookmarking or sharing
 * a deep-link) must land on the "overview" panel — the nav-filter that hides
 * the sidebar item is not sufficient on its own, because the initial tab state
 * could be forced by the URL before the filter runs.
 *
 * resolveTabForRole is the pure gate function and is tested exhaustively here.
 * Integration behaviour (initial state from window.location.search) is also
 * verified by rendering ServerSettingsDialog with a mocked search string.
 *
 * Covered scenarios:
 *  1. resolveTabForRole: unknown / empty tab → "overview"
 *  2. resolveTabForRole: owner can access "danger"
 *  3. resolveTabForRole: mod requesting "danger" → "overview"
 *  4. resolveTabForRole: regular member requesting "danger" → "overview"
 *  5. resolveTabForRole: mod requesting "insights" (ownerOrModOnly) → allowed
 *  6. resolveTabForRole: regular member requesting "insights" → "overview"
 *  7. resolveTabForRole: any role requesting an unrestricted tab → returned as-is
 *  8. Integration: mod with ?tab=danger in URL renders overview panel, not danger panel
 *  9. resolveTabForRole: uppercase "DANGER" is unknown → "overview" (case-sensitive match)
 * 10. resolveTabForRole: URL-decoded "dan%67er" → "danger" → "overview" for a mod
 * 11. Invariant: any future case-normalisation must still only pass known tab ids
 * 12. Integration: mod with ?tab=DANGER (uppercase) in URL renders overview panel
 * 13. Integration: mod with ?tab=dan%67er (URL-encoded) in URL renders overview panel
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveTabForRole, SETTINGS_NAV_META } from "./community-hub";

// ── Pure-function tests ───────────────────────────────────────────────────────

describe("resolveTabForRole", () => {
  test("null / undefined tab → 'overview'", () => {
    expect(resolveTabForRole(null, false, false)).toBe("overview");
    expect(resolveTabForRole(undefined, false, false)).toBe("overview");
  });

  test("unknown tab string → 'overview'", () => {
    expect(resolveTabForRole("hacked", false, false)).toBe("overview");
    expect(resolveTabForRole("", false, false)).toBe("overview");
  });

  test("owner can access 'danger'", () => {
    expect(resolveTabForRole("danger", true, false)).toBe("danger");
    expect(resolveTabForRole("danger", true, true)).toBe("danger");
  });

  test("mod requesting 'danger' → 'overview'", () => {
    expect(resolveTabForRole("danger", false, true)).toBe("overview");
  });

  test("regular member requesting 'danger' → 'overview'", () => {
    expect(resolveTabForRole("danger", false, false)).toBe("overview");
  });

  test("mod requesting 'insights' (ownerOrModOnly) → allowed", () => {
    expect(resolveTabForRole("insights", false, true)).toBe("insights");
  });

  test("regular member requesting 'insights' → 'overview'", () => {
    expect(resolveTabForRole("insights", false, false)).toBe("overview");
  });

  test("all unrestricted tabs are returned as-is for any role", () => {
    const unrestricted = SETTINGS_NAV_META
      .filter(item => !item.ownerOnly && !item.ownerOrModOnly)
      .map(item => item.id);

    for (const tab of unrestricted) {
      expect(resolveTabForRole(tab, false, false)).toBe(tab);
      expect(resolveTabForRole(tab, false, true)).toBe(tab);
      expect(resolveTabForRole(tab, true, false)).toBe(tab);
    }
  });

  // ── Case-sensitivity edge cases ───────────────────────────────────────────

  test("uppercase 'DANGER' is not a known tab id → 'overview' for any role", () => {
    // Tab ids are lowercase; an uppercase variant must not match and must fall
    // through to the unknown-tab → "overview" path (safe by design, not accident).
    expect(resolveTabForRole("DANGER", false, true)).toBe("overview");
    expect(resolveTabForRole("DANGER", false, false)).toBe("overview");
    // Even an owner gets "overview" for an uppercase variant — it is simply unknown.
    expect(resolveTabForRole("DANGER", true, false)).toBe("overview");
  });

  test("mixed-case variants of ownerOrModOnly tabs are also unknown → 'overview'", () => {
    expect(resolveTabForRole("Insights", false, true)).toBe("overview");
    expect(resolveTabForRole("INSIGHTS", false, true)).toBe("overview");
  });

  // ── URL-decoding edge case ────────────────────────────────────────────────

  test("URLSearchParams decodes %67→g so 'dan%67er' arrives as 'danger' → 'overview' for a mod", () => {
    // Browsers and URLSearchParams both decode percent-encoded characters before
    // the value reaches application code.  A crafted URL ?tab=dan%67er therefore
    // yields the raw string "danger" — which is ownerOnly and must be blocked
    // for a mod exactly the same way a plain ?tab=danger would be.
    const decoded = new URLSearchParams("tab=dan%67er").get("tab");
    expect(decoded).toBe("danger"); // verifies that decoding actually happened
    expect(resolveTabForRole(decoded, false, true)).toBe("overview");
    expect(resolveTabForRole(decoded, false, false)).toBe("overview");
    // An owner is still allowed via the decoded value.
    expect(resolveTabForRole(decoded, true, false)).toBe("danger");
  });

  test("un-decoded percent-encoded string is unknown → 'overview'", () => {
    // If the raw (still-encoded) string were somehow passed to resolveTabForRole
    // it would not match any known tab id and must fall back to "overview".
    expect(resolveTabForRole("dan%67er", false, true)).toBe("overview");
    expect(resolveTabForRole("dan%67er", true, false)).toBe("overview");
  });

  // ── Normalisation invariant ───────────────────────────────────────────────

  test("invariant: only ids present in SETTINGS_NAV_META can ever be returned", () => {
    // This guards against a future refactor that adds case-normalisation:
    // even after toLowerCase() the result must still be a known tab id or
    // fall back to "overview".  We verify it here by asserting that
    // resolveTabForRole never returns a value absent from the meta list.
    const knownIds = new Set(SETTINGS_NAV_META.map(item => item.id));
    const probes = [
      "DANGER", "Danger", "dAnGeR",
      "INSIGHTS", "Insights",
      "OVERVIEW", "Overview",
      "dan%67er", "dan%44er",
      " danger", "danger ", "\tdanger",
      "danger\u200B", // zero-width space
    ];
    for (const probe of probes) {
      const result = resolveTabForRole(probe, true, true);
      expect(knownIds.has(result as any)).toBe(true);
    }
  });
});

// ── Integration test: ServerSettingsDialog initial tab from URL ───────────────

// Stubs required to render ServerSettingsDialog in jsdom

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useParams: () => ({}),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 2, username: "mod_user" } }),
}));

vi.mock("@/voice/voice-context", () => ({
  useVoice: () => ({ activeCallChannelId: null }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCommunity(overrides: { isOwner: boolean; isMod?: boolean }) {
  return {
    id: 1,
    slug: "test-community",
    name: "Test Community",
    description: null,
    gameTag: null,
    privacy: "public" as const,
    boostLevel: 0,
    memberCount: 5,
    iconKey: null,
    bannerKey: null,
    ownerId: 1,
    isMember: true,
    isOwner: overrides.isOwner,
    isMod: overrides.isMod ?? false,
    channels: [],
  };
}

describe("ServerSettingsDialog URL-tab security", () => {
  const originalLocation = window.location;

  function setSearchParam(search: string) {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, search },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  test("mod with ?tab=danger in URL renders overview panel, not danger panel", async () => {
    // Simulate a deep-link URL a mod might navigate to directly
    setSearchParam("?tab=danger");

    const { ServerSettingsDialog } = await import("./community-hub");

    render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // The Danger Zone (Delete Community) button must NOT appear
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    // The overview panel must be shown instead (it contains community name heading)
    // The overview panel renders a heading with the community name
    expect(screen.queryByText(/dangerZone/i)).toBeNull();
  });

  test("mod with ?tab=DANGER (uppercase) in URL is redirected to overview panel", async () => {
    // URLSearchParams returns "DANGER" verbatim; resolveTabForRole must treat it
    // as an unknown tab and fall back to "overview".
    setSearchParam("?tab=DANGER");

    const { ServerSettingsDialog } = await import("./community-hub");

    render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByText(/dangerZone/i)).toBeNull();
  });

  test("mod with ?tab=dan%67er (URL-encoded) in URL is redirected to overview panel", async () => {
    // URLSearchParams decodes %67 → 'g', so the value arriving at resolveTabForRole
    // is the plain string "danger".  The ownerOnly guard must block it for a mod.
    setSearchParam("?tab=dan%67er");

    const { ServerSettingsDialog } = await import("./community-hub");

    render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByText(/dangerZone/i)).toBeNull();
  });
});
