import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import Admin, { AnalyticsPanel } from "./admin";

/**
 * Component tests for the Admin panel (admin.tsx).
 *
 * Covers:
 *   1. Analytics tab is hidden when `can_view_analytics = false`
 *   2. Analytics tab appears when `can_view_analytics = true`
 *   3. Analytics data is fetched and charts render when the panel is visible
 *   4. Range selector (30d / 90d) fires the correct analytics API request
 *
 * Tab-visibility tests render the full `Admin` component (gating logic lives
 * there). Fetch and range-selector tests render `AnalyticsPanel` in isolation
 * so they are not affected by Radix Tabs' lazy-mount behaviour.
 *
 * All network, React-Query, and routing layers are stubbed.
 * Recharts is replaced with a lightweight stub so jsdom never touches SVG.
 */

// ─── Hoisted fakes ────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  // Mutable slot: controls what /api/admin/me resolves to.
  // Set to null to simulate a failed fetch.
  let adminMeResponse: Record<string, unknown> | null = null;

  const customFetch = vi.fn();

  return {
    customFetch,
    setAdminMe: (v: Record<string, unknown> | null) => { adminMeResponse = v; },
    getAdminMe: () => adminMeResponse,
  };
});

// ─── Default fetch implementation (reinstated in every beforeEach) ─────────────

function installDefaultFetch() {
  h.customFetch.mockImplementation(async (url: string) => {
    if (url === "/api/admin/me") {
      const resp = h.getAdminMe();
      if (resp === null) throw new Error("no admin me");
      return resp;
    }
    if (url.startsWith("/api/admin/analytics")) {
      const range = url.includes("range=90") ? 90 : 30;
      return {
        range,
        newUsers:       [{ date: "2024-01-01", count: 5 }],
        dau:            [{ date: "2024-01-01", count: 10 }],
        lfgPosts:       [{ date: "2024-01-01", count: 3 }],
        proActivations: [{ date: "2024-01-01", count: 1 }],
        summary: { peakDau: 10, proConvRate: 2.5 },
      };
    }
    // Fallback for chat-deletions and any other admin endpoints.
    return { items: [], total: 0, limit: 50, offset: 0 };
  });
}

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  customFetch: h.customFetch,
  useListAdminUsers:            () => ({ data: { items: [] }, isLoading: false }),
  useAdminActivatePro:          () => ({ mutate: vi.fn(), isPending: false }),
  useAdminDeactivatePro:        () => ({ mutate: vi.fn(), isPending: false }),
  useAdminPromoteUser:          () => ({ mutate: vi.fn(), isPending: false }),
  useListActivationCodes:       () => ({ data: { items: [] }, isLoading: false }),
  useCreateActivationCode:      () => ({ mutate: vi.fn(), isPending: false }),
  useDisableActivationCode:     () => ({ mutate: vi.fn(), isPending: false }),
  useListAdminProSubscriptions: () => ({ data: { items: [] }, isLoading: false }),
  getListAdminUsersQueryKey:            () => ["admin-users"],
  getListActivationCodesQueryKey:       () => ["admin-codes"],
  getListAdminProSubscriptionsQueryKey: () => ["admin-subs"],
  getGetMeQueryKey:                     () => ["me"],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Recharts uses ResizeObserver + SVG features absent in jsdom.
// Replace with lightweight stubs so tests stay fast and deterministic.
vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area:              () => null,
  XAxis:             () => null,
  YAxis:             () => null,
  Tooltip:           () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeAdminMe(overrides: Partial<{
  can_manage_pro: boolean;
  can_suspend_users: boolean;
  can_delete_content: boolean;
  can_view_reports: boolean;
  can_manage_codes: boolean;
  can_broadcast: boolean;
  can_view_analytics: boolean;
  can_manage_admins: boolean;
}> = {}) {
  return {
    id: 1,
    username: "admin",
    permissions: {
      can_manage_pro: true,
      can_suspend_users: true,
      can_delete_content: true,
      can_view_reports: false,
      can_manage_codes: true,
      can_broadcast: false,
      can_view_analytics: false,
      can_manage_admins: false,
      ...overrides,
    },
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // mockReset wipes call history AND previously installed implementations so
  // a stale mockImplementationOnce / mockRejectedValueOnce never leaks.
  h.customFetch.mockReset();
  installDefaultFetch();
  h.setAdminMe(makeAdminMe()); // default: no analytics permission
});

// ─── 1. Tab visibility (full Admin component) ─────────────────────────────────

describe("Admin panel — Analytics tab visibility", () => {
  test("Analytics tab is absent when can_view_analytics = false", async () => {
    h.setAdminMe(makeAdminMe({ can_view_analytics: false }));

    await act(async () => { render(<Admin />); });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/me");
    });

    expect(screen.queryByRole("tab", { name: /analytics/i })).not.toBeInTheDocument();
  });

  test("Analytics tab IS present when can_view_analytics = true", async () => {
    h.setAdminMe(makeAdminMe({ can_view_analytics: true }));

    await act(async () => { render(<Admin />); });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /analytics/i })).toBeInTheDocument();
    });
  });

  test("Analytics tab is absent while /api/admin/me is still pending (null on mount)", () => {
    // Stall indefinitely for this one call only.
    h.customFetch.mockImplementationOnce(() => new Promise(() => { /* never */ }));

    render(<Admin />);

    // Synchronously: adminMe is null → canViewAnalytics = false.
    expect(screen.queryByRole("tab", { name: /analytics/i })).not.toBeInTheDocument();
  });

  test("Analytics tab stays absent when /api/admin/me fetch fails", async () => {
    // Reject only the first call; subsequent calls fall back to the default impl.
    h.customFetch.mockRejectedValueOnce(new Error("network error"));

    await act(async () => { render(<Admin />); });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalled();
    });

    // Component swallows the error and keeps adminMe = null → tab hidden.
    expect(screen.queryByRole("tab", { name: /analytics/i })).not.toBeInTheDocument();
  });
});

// ─── 2. Analytics panel — data fetch (AnalyticsPanel in isolation) ────────────

describe("AnalyticsPanel — initial data fetch", () => {
  test("fetches analytics data with range=30 on mount", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=30");
    });
  });

  test("renders one chart card per metric after data loads", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    await waitFor(() => {
      const charts = screen.getAllByTestId("area-chart");
      // newUsers, dau, lfgPosts, proActivations → 4 charts
      expect(charts.length).toBe(4);
    });
  });

  test("summary metrics are displayed after data loads", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    // peakDau=10, proConvRate=2.5 from the mock.
    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("2.5%")).toBeInTheDocument();
    });
  });

  test("renders skeleton placeholders while data is loading", () => {
    // Stall the fetch so the panel stays in the loading state.
    h.customFetch.mockImplementationOnce(() => new Promise(() => { /* never */ }));

    render(<AnalyticsPanel />);

    // The loading spinner is rendered (Loader2 icon has animate-spin class).
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });
});

// ─── 3. Range selector (AnalyticsPanel in isolation) ──────────────────────────

describe("AnalyticsPanel — range selector", () => {
  test("30d button carries the active style on initial render", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    const btn30 = screen.getByRole("button", { name: /^30d$/i });
    expect(btn30.className).toMatch(/border-primary/);
  });

  test("90d button does NOT carry the active style on initial render", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    const btn90 = screen.getByRole("button", { name: /^90d$/i });
    expect(btn90.className).not.toMatch(/border-primary/);
  });

  test("clicking 90d fetches analytics with range=90", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    // Wait for the initial 30d fetch to settle.
    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=30");
    });

    h.customFetch.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^90d$/i }));
    });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=90");
    });
  });

  test("90d button becomes active after clicking it", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=30");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^90d$/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^90d$/i }).className).toMatch(/border-primary/);
    });
  });

  test("switching back to 30d re-fetches with range=30", async () => {
    await act(async () => { render(<AnalyticsPanel />); });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=30");
    });

    // Switch to 90d.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^90d$/i }));
    });
    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=90");
    });

    h.customFetch.mockClear();

    // Switch back to 30d.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^30d$/i }));
    });

    await waitFor(() => {
      expect(h.customFetch).toHaveBeenCalledWith("/api/admin/analytics?range=30");
    });
  });
});
