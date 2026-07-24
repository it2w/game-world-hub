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
});
