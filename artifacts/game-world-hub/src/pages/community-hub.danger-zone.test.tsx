/**
 * Tests confirming that DangerZonePanel enforces an ownership check
 * independently of the nav-filter that hides the "danger" tab.
 *
 * A moderator who somehow sets activeTab = "danger" (e.g. via a future
 * URL-driven param or a direct state mutation) must NOT see the Delete
 * Community button — the panel's own guard must stop them.
 *
 * Covered scenarios:
 *  1. Owner sees the Delete Community button (happy path)
 *  2. Non-owner (mod) does NOT see the Delete button
 *  3. Regular member does NOT see the Delete button
 */

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DangerZonePanel } from "./community-hub";

// ── Module stubs ──────────────────────────────────────────────────────────────

// react-i18next: return the key as the translation (or the fallback)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Only use fallback when it is a plain string; object args are interpolation
    // options and must be ignored so they don't end up as React children.
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// wouter: useLocation is called inside DangerZonePanel
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useParams: () => ({}),
}));

// @workspace/api-client-react: customFetch is used by the delete mutation
vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

// @tanstack/react-query: useMutation must return a minimal stub
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// @/hooks/use-toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DangerZonePanel ownership guard", () => {
  test("owner sees the Delete Community button", () => {
    render(<DangerZonePanel community={makeCommunity({ isOwner: true })} onClose={vi.fn()} />);
    // The delete button is rendered (may be disabled until name matches)
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
  });

  test("mod (isOwner=false, isMod=true) does NOT see the Delete button", () => {
    render(
      <DangerZonePanel
        community={makeCommunity({ isOwner: false, isMod: true })}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  test("regular member (isOwner=false, isMod=false) does NOT see the Delete button", () => {
    render(
      <DangerZonePanel
        community={makeCommunity({ isOwner: false, isMod: false })}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });
});
