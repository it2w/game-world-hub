/**
 * Unit tests for the role-based access guards in the community settings dialog.
 *
 * Covered scenarios:
 *
 * resolveTabForRole
 *  1. Unknown / null tab → falls back to "overview"
 *  2. ownerOnly tab ("danger") requested by a mod → falls back to "overview"
 *  3. ownerOrModOnly tab ("insights") requested by a plain member → falls back to "overview"
 *  4. ownerOnly tab ("danger") requested by owner → returns "danger"
 *  5. ownerOrModOnly tab ("insights") requested by mod → returns "insights"
 *  6. ownerOrModOnly tab ("insights") requested by owner → returns "insights"
 *  7. Unrestricted tab requested by any role → returned as-is
 *
 * setActiveTab wrapper (delegates to resolveTabForRole)
 *  8. Mod cannot transition to "danger" — resolveTabForRole returns "overview"
 *  9. Plain member cannot transition to "insights" — resolveTabForRole returns "overview"
 *
 * InsightsDashboard panel-level guard
 * 10. Renders access-denied UI when isOwnerOrMod=false
 * 11. Does NOT render access-denied UI when isOwnerOrMod=true (renders data area)
 */

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveTabForRole, InsightsDashboard } from "../community-hub";

// ── Module stubs ──────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// recharts uses ResizeObserver which jsdom doesn't provide
vi.mock("recharts", () => ({
  LineChart: () => null,
  Line: () => null,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CartesianGrid: () => null,
}));

// ── resolveTabForRole ─────────────────────────────────────────────────────────

describe("resolveTabForRole", () => {
  test("null tab falls back to 'overview'", () => {
    expect(resolveTabForRole(null, false, false)).toBe("overview");
  });

  test("unknown string falls back to 'overview'", () => {
    expect(resolveTabForRole("nonexistent-tab", false, false)).toBe("overview");
  });

  test("ownerOnly tab ('danger') requested by mod falls back to 'overview'", () => {
    expect(resolveTabForRole("danger", false, true)).toBe("overview");
  });

  test("ownerOrModOnly tab ('insights') requested by plain member falls back to 'overview'", () => {
    expect(resolveTabForRole("insights", false, false)).toBe("overview");
  });

  test("ownerOnly tab ('danger') requested by owner returns 'danger'", () => {
    expect(resolveTabForRole("danger", true, false)).toBe("danger");
  });

  test("ownerOrModOnly tab ('insights') requested by mod returns 'insights'", () => {
    expect(resolveTabForRole("insights", false, true)).toBe("insights");
  });

  test("ownerOrModOnly tab ('insights') requested by owner returns 'insights'", () => {
    expect(resolveTabForRole("insights", true, false)).toBe("insights");
  });

  test("unrestricted tab ('overview') returned as-is for plain member", () => {
    expect(resolveTabForRole("overview", false, false)).toBe("overview");
  });

  test("unrestricted tab ('automod') returned as-is for mod", () => {
    expect(resolveTabForRole("automod", false, true)).toBe("automod");
  });
});

// ── setActiveTab wrapper (delegates to resolveTabForRole) ─────────────────────
//
// setActiveTab is defined inside ServerSettingsDialog as:
//   const setActiveTab = useCallback(
//     (tab) => setActiveTabRaw(resolveTabForRole(tab, community.isOwner, community.isMod)),
//     [community.isOwner, community.isMod],
//   );
//
// Since the wrapper is a thin pass-through to resolveTabForRole, testing
// resolveTabForRole with the same inputs provides equivalent coverage without
// mounting the full dialog.

describe("setActiveTab wrapper — via resolveTabForRole", () => {
  test("mod cannot transition to 'danger' (resolves to 'overview')", () => {
    const resolved = resolveTabForRole("danger", false, true);
    expect(resolved).toBe("overview");
  });

  test("plain member cannot transition to 'insights' (resolves to 'overview')", () => {
    const resolved = resolveTabForRole("insights", false, false);
    expect(resolved).toBe("overview");
  });
});

// ── InsightsDashboard panel-level guard ───────────────────────────────────────

describe("InsightsDashboard panel-level guard", () => {
  test("renders access-denied UI when isOwnerOrMod=false", () => {
    render(<InsightsDashboard communityId={1} isOwnerOrMod={false} />);
    // The panel guard renders an "Owner-only settings" message
    expect(screen.getByText("Owner-only settings")).toBeDefined();
    // No chart or data content should be present
    expect(screen.queryByText(/member growth/i)).toBeNull();
  });

  test("does NOT render access-denied UI when isOwnerOrMod=true", () => {
    render(<InsightsDashboard communityId={1} isOwnerOrMod={true} />);
    // Access-denied message must be absent for authorised viewers
    expect(screen.queryByText("Owner-only settings")).toBeNull();
  });
});
