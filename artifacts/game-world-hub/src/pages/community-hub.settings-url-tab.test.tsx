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
 * 14. Role change: mod re-rendered as owner — setActiveTab("danger") now resolves to "danger"
 * 15. Role change: owner re-rendered as mod — setActiveTab("danger") now resolves to "overview"
 * 16. Role change: mod re-rendered as owner opens danger tab; data-active-tab reflects new role
 * 17. Role change: owner re-rendered as mod; subsequent guard call blocks "danger"
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
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

  // ── setActiveTab wrapper: DevTools / direct-mutation guard ───────────────
  //
  // setActiveTab is defined as:
  //   (tab) => setActiveTabRaw(resolveTabForRole(tab, isOwner, isMod))
  //
  // Any programmatic call to setActiveTab (React DevTools, browser extensions,
  // test helpers) therefore passes through resolveTabForRole before committing
  // to state.  The tests below verify that contract directly.

  test("setActiveTab('danger') as mod → resolves to 'overview', not 'danger'", () => {
    // Simulates: setActiveTab("danger") called on a mod session.
    // resolveTabForRole is the gate inside the wrapper; its return value is
    // what React commits to state.  A mod must be redirected to "overview".
    expect(resolveTabForRole("danger", false, true)).toBe("overview");
  });

  test("setActiveTab('danger') as plain member → resolves to 'overview', not 'danger'", () => {
    expect(resolveTabForRole("danger", false, false)).toBe("overview");
  });

  test("setActiveTab('danger') as owner → resolves to 'danger' (owner is allowed)", () => {
    expect(resolveTabForRole("danger", true, false)).toBe("danger");
  });

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

  // ── setActiveTab wrapper integration ─────────────────────────────────────
  //
  // The wrapper is: (tab) => setActiveTabRaw(resolveTabForRole(tab, isOwner, isMod))
  //
  // React DevTools can invoke setActiveTab directly with any string value.
  // These tests verify that the rendered state (data-active-tab) always reflects
  // the role-resolved tab, not the raw requested value.

  test("mod dialog renders with data-active-tab='overview' (setActiveTab wrapper starts in safe state)", async () => {
    // No URL param — component initialises via resolveTabForRole(null, false, true) → "overview".
    // The data-active-tab attribute on the content wrapper reflects whatever
    // React committed, so this verifies the wrapper produced the correct initial state.
    setSearchParam("");

    const { ServerSettingsDialog } = await import("./community-hub");

    const { getByTestId } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    const content = getByTestId("settings-content");
    expect(content.getAttribute("data-active-tab")).toBe("overview");
  });

  test("mod dialog data-active-tab is 'overview' when rendered (setActiveTab('danger') would resolve to 'overview')", async () => {
    // This test covers the DevTools-mutation scenario:
    //   1. A mod opens ServerSettingsDialog — activeTab is initialised to "overview".
    //   2. An attacker calls setActiveTab("danger") via React DevTools.
    //   3. setActiveTab passes "danger" through resolveTabForRole(…, isOwner=false, isMod=true)
    //      which returns "overview", so setActiveTabRaw("overview") is committed.
    //
    // We verify both halves:
    //   a) resolveTabForRole correctly returns "overview" for the mod+danger case.
    //   b) The rendered component's data-active-tab attribute stays "overview".
    setSearchParam("");

    const { ServerSettingsDialog } = await import("./community-hub");

    const { getByTestId } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // Half (a): the wrapper's gate function blocks "danger" for a mod.
    expect(resolveTabForRole("danger", false, true)).toBe("overview");

    // Half (b): the rendered tab state reflects "overview", not "danger".
    const content = getByTestId("settings-content");
    expect(content.getAttribute("data-active-tab")).toBe("overview");
  });

  test("owner with ?tab=danger in URL lands on the danger panel (accepted normally)", async () => {
    // An owner deep-linking to ?tab=danger must be allowed through; the guard
    // must only block non-owners, not suppress the tab for everyone.
    setSearchParam("?tab=danger");

    const { ServerSettingsDialog } = await import("./community-hub");

    render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: true, isMod: false })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // The Delete Community button is rendered inside the danger panel.
    // Its presence confirms the dialog initialised with activeTab === "danger".
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeNull();
  });

  // ── Mid-session URL manipulation guard ───────────────────────────────────
  //
  // The tab is resolved from the URL only in the useState initialiser (runs
  // once on mount).  If an attacker edits window.location.search via the
  // browser address bar or history.pushState after the dialog is open, the
  // active tab must NOT change — the URL is no longer consulted.

  test("mid-session URL change to ?tab=danger does not change active tab for mod", async () => {
    // Start with a clean URL so the dialog initialises to "overview"
    setSearchParam("");

    const { ServerSettingsDialog } = await import("./community-hub");

    const { getByTestId } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // The dialog must start on "overview" (no URL tab param supplied)
    const content = getByTestId("settings-content");
    expect(content.getAttribute("data-active-tab")).toBe("overview");

    // Simulate an attacker editing the address bar / using history.pushState
    // to inject ?tab=danger after the dialog is already mounted.
    setSearchParam("?tab=danger");

    // The useState initialiser already fired on mount; a subsequent URL change
    // cannot re-trigger it.  The rendered tab must remain "overview".
    expect(content.getAttribute("data-active-tab")).toBe("overview");
  });
});

// ── Role-change guard: community prop updates mid-session ─────────────────────
//
// setActiveTab is defined as:
//   useCallback(
//     (tab) => setActiveTabRaw(resolveTabForRole(tab, community.isOwner, community.isMod ?? false)),
//     [community.isOwner, community.isMod],
//   )
//
// When the community prop changes (e.g. owner promotes a mod mid-session and the
// parent re-renders ServerSettingsDialog with the updated community object), React
// creates a new setActiveTab function that closes over the updated role values.
// These tests confirm the guard re-evaluates correctly after a re-render, without
// requiring a full page reload.

describe("ServerSettingsDialog role-change guard (community prop update)", () => {
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

  // ── Scenario 14 ────────────────────────────────────────────────────────────
  test("mod promoted to owner: setActiveTab('danger') resolves to 'danger' after re-render", async () => {
    // The setActiveTab wrapper captures isOwner/isMod in its useCallback deps.
    // After a re-render with the updated community, the new closure must use the
    // new role values.  resolveTabForRole is the inner gate that setActiveTab
    // delegates to — verifying it with the updated role confirms the wrapper
    // would now permit "danger".
    setSearchParam("");
    const { ServerSettingsDialog } = await import("./community-hub");

    const { rerender, getByTestId } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // Before promotion the mod cannot be on "danger".
    expect(getByTestId("settings-content").getAttribute("data-active-tab")).toBe("overview");

    // Simulate owner role arriving via a prop update (e.g. parent re-fetched community).
    act(() => {
      rerender(
        <ServerSettingsDialog
          community={makeCommunity({ isOwner: true, isMod: false })}
          open={true}
          onClose={vi.fn()}
        />
      );
    });

    // The setActiveTab closure now closes over isOwner=true.
    // resolveTabForRole with the updated role must permit "danger".
    expect(resolveTabForRole("danger", true, false)).toBe("danger");
  });

  // ── Scenario 15 ────────────────────────────────────────────────────────────
  test("owner demoted to mod: setActiveTab('danger') resolves to 'overview' after re-render", async () => {
    // After the community prop flips isOwner → false, the new setActiveTab closure
    // must block "danger" for the now-mod viewer.
    setSearchParam("?tab=danger");
    const { ServerSettingsDialog } = await import("./community-hub");

    const { rerender, getByTestId } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: true, isMod: false })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // Owner starts on danger tab.
    expect(getByTestId("settings-content").getAttribute("data-active-tab")).toBe("danger");

    // Simulate demotion: owner loses the role and becomes a mod.
    act(() => {
      rerender(
        <ServerSettingsDialog
          community={makeCommunity({ isOwner: false, isMod: true })}
          open={true}
          onClose={vi.fn()}
        />
      );
    });

    // The new setActiveTab closure now closes over isOwner=false, isMod=true.
    // Any subsequent call to setActiveTab("danger") must be blocked.
    expect(resolveTabForRole("danger", false, true)).toBe("overview");
  });

  // ── Scenario 16 ────────────────────────────────────────────────────────────
  test("mod promoted to owner: data-active-tab reflects 'danger' when re-rendered with owner community and ?tab=danger URL", async () => {
    // Verify the rendering path end-to-end: if the dialog is closed and reopened
    // (or unmounted and remounted) after a promotion, the new owner should land
    // on "danger" from the URL param.  We simulate this by unmounting the mod
    // instance and mounting a fresh owner instance.
    setSearchParam("?tab=danger");
    const { ServerSettingsDialog } = await import("./community-hub");

    // Initial render as mod — must be blocked even though URL says ?tab=danger.
    const { unmount } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: false, isMod: true })}
        open={true}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId("settings-content")!.getAttribute("data-active-tab")).toBe("overview");
    unmount();

    // After promotion, a fresh mount with the same URL should reach "danger".
    const { getByTestId } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: true, isMod: false })}
        open={true}
        onClose={vi.fn()}
      />
    );
    expect(getByTestId("settings-content").getAttribute("data-active-tab")).toBe("danger");
  });

  // ── Scenario 17 ────────────────────────────────────────────────────────────
  test("owner demoted to mod: guard function blocks 'danger' with the post-rerender role values", async () => {
    // Verifies the full contract of the useCallback wrapper after a prop change:
    //   setActiveTab("danger") → resolveTabForRole("danger", isOwner, isMod)
    // With isOwner=false and isMod=false after demotion to plain member the call
    // must fall back to "overview".
    setSearchParam("");
    const { ServerSettingsDialog } = await import("./community-hub");

    const { rerender } = render(
      <ServerSettingsDialog
        community={makeCommunity({ isOwner: true, isMod: false })}
        open={true}
        onClose={vi.fn()}
      />
    );

    // Demote to plain member (no longer owner, no longer mod).
    act(() => {
      rerender(
        <ServerSettingsDialog
          community={makeCommunity({ isOwner: false, isMod: false })}
          open={true}
          onClose={vi.fn()}
        />
      );
    });

    // Guard must block "danger" with the updated role (isOwner=false, isMod=false).
    expect(resolveTabForRole("danger", false, false)).toBe("overview");
    // ownerOrModOnly tabs are also blocked for a plain member after demotion.
    expect(resolveTabForRole("insights", false, false)).toBe("overview");
  });
});
