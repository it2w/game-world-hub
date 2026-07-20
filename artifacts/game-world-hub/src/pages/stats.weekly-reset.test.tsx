import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsPage from "./stats";

/**
 * Confirms that the weekly activity bar chart resets to all-zero values when
 * the API response changes to a new (empty) week while the page is still open —
 * i.e. the component does not retain stale bar data across week boundaries.
 *
 * Strategy
 * --------
 * recharts renders into SVG which jsdom cannot measure, so we intercept the
 * `data` prop that StatsPage passes to <BarChart>.  The mock writes each render's
 * data array to `capturedChartData`, which the tests then inspect directly.
 *
 * Query cache updates are applied via `queryClient.setQueryData` (matching what
 * React Query's background-refetch would do) and `rerender` is called to force
 * a synchronous re-render, mirroring the real mid-session scenario.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/stats", vi.fn()],
}));

// Capture the `data` prop passed to <BarChart> on every render so tests can
// assert the exact weeklyData the chart receives.
let capturedChartData: Record<string, unknown>[] = [];

vi.mock("recharts", () => ({
  BarChart: ({
    data,
    children,
  }: {
    data: Record<string, unknown>[];
    children: React.ReactNode;
  }) => {
    capturedChartData = data ?? [];
    return <div data-testid="bar-chart">{children}</div>;
  },
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock("@/components/tier-badge", () => ({
  TierBadge: () => null,
}));

vi.mock("@/components/pro-badge", () => ({
  ProBadge: () => null,
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
  useGetMe: () => ({ data: { id: 1, username: "testuser", isPro: true } }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ME = { id: 1, username: "testuser", isPro: true };

const STATS = {
  totalLfgPosts: 10,
  totalLfgResponses: 5,
  totalFriends: 3,
  totalMessages: 20,
  totalPhotos: 2,
  memberSince: "2024-01-01T00:00:00.000Z",
  isPro: true,
  xpProgress: {
    totalXp: 1000,
    level: 5,
    tier: "Gold",
    tierLevel: 2,
    xpIntoLevel: 500,
    xpForNext: 1000,
  },
};

/** A week with real activity — used to seed the "current week" state. */
const WEEKLY_WITH_ACTIVITY = {
  lfgPosts:     [2, 0, 3, 1, 4, 0, 2],
  lfgResponses: [1, 0, 2, 0, 1, 0, 1],
  messages:     [5, 3, 7, 2, 6, 1, 4],
};

/** All-zeros — what the API returns at the start of a brand-new week. */
const WEEKLY_NEW_WEEK = {
  lfgPosts:     [0, 0, 0, 0, 0, 0, 0],
  lfgResponses: [0, 0, 0, 0, 0, 0, 0],
  messages:     [0, 0, 0, 0, 0, 0, 0],
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient(
  weeklyData: typeof WEEKLY_WITH_ACTIVITY | typeof WEEKLY_NEW_WEEK | null = WEEKLY_WITH_ACTIVITY,
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  qc.setQueryData(["me"], ME);
  qc.setQueryData(["stats", "me"], STATS);
  if (weeklyData !== null) {
    qc.setQueryData(["stats", "me", "weekly"], weeklyData);
  }
  return qc;
}

function renderStats(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <StatsPage />
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StatsPage — weekly chart resets to zero when a new week starts", () => {
  beforeEach(() => {
    capturedChartData = [];
  });

  test("chart renders with non-zero bar values for the current week", () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    renderStats(qc);

    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(capturedChartData).toHaveLength(7);

    const hasNonZero = capturedChartData.some(
      (d) =>
        (d.lfgPosts as number) > 0 ||
        (d.lfgResponses as number) > 0 ||
        (d.messages as number) > 0,
    );
    expect(hasNonZero).toBe(true);
  });

  test("chart resets to all-zero bars when the weekly query updates to a new week", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    // Sanity-check: initial render shows non-zero activity.
    const initiallyHasNonZero = capturedChartData.some(
      (d) =>
        (d.lfgPosts as number) > 0 ||
        (d.lfgResponses as number) > 0 ||
        (d.messages as number) > 0,
    );
    expect(initiallyHasNonZero).toBe(true);

    // Simulate the week rolling over: React Query's background poll returns
    // the new week's data and the cache is updated in-place.
    await act(async () => {
      qc.setQueryData(["stats", "me", "weekly"], WEEKLY_NEW_WEEK);
    });

    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );

    // Every bar value must now be zero — no stale values retained.
    expect(capturedChartData).toHaveLength(7);
    const allZero = capturedChartData.every(
      (d) =>
        d.lfgPosts === 0 && d.lfgResponses === 0 && d.messages === 0,
    );
    expect(allZero).toBe(true);
  });

  test("chart preserves correct day labels after the week reset", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    await act(async () => {
      qc.setQueryData(["stats", "me", "weekly"], WEEKLY_NEW_WEEK);
    });

    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );

    const renderedDays = capturedChartData.map((d) => d.day);
    expect(renderedDays).toEqual(DAYS);
  });

  test("chart correctly falls back to zero for every day when weeklyRaw is undefined (loading state not yet resolved)", () => {
    // No weekly query data seeded — mirrors the brief window before the first
    // poll completes, or a momentary cache miss during a week transition.
    const qc = makeClient(null);
    renderStats(qc);

    expect(capturedChartData).toHaveLength(7);
    const allFallbackToZero = capturedChartData.every(
      (d) =>
        d.lfgPosts === 0 && d.lfgResponses === 0 && d.messages === 0,
    );
    expect(allFallbackToZero).toBe(true);
  });

  test("transitioning from non-zero to all-zero does not leave any day with a stale positive value", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    await act(async () => {
      qc.setQueryData(["stats", "me", "weekly"], WEEKLY_NEW_WEEK);
    });

    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );

    // Explicit per-metric checks — ensures no single series silently retains stale data.
    capturedChartData.forEach((dayEntry, i) => {
      expect(dayEntry.lfgPosts, `lfgPosts stale on day ${i} (${dayEntry.day})`).toBe(0);
      expect(dayEntry.lfgResponses, `lfgResponses stale on day ${i} (${dayEntry.day})`).toBe(0);
      expect(dayEntry.messages, `messages stale on day ${i} (${dayEntry.day})`).toBe(0);
    });
  });
});

// ─── Stat card live-update tests ──────────────────────────────────────────────

const STATS_UPDATED = {
  ...STATS,
  totalLfgPosts: 25,
  totalMessages: 80,
  totalFriends: 7,
};

describe("StatsPage — summary stat cards update live without a page reload", () => {
  test("stat cards display initial totals from the cache", () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    renderStats(qc);

    expect(screen.getByText("10")).toBeInTheDocument(); // totalLfgPosts
    expect(screen.getByText("20")).toBeInTheDocument(); // totalMessages
    expect(screen.getByText("3")).toBeInTheDocument();  // totalFriends
  });

  test("stat cards re-render with new totals when the summary cache is updated", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    // Confirm initial values are shown.
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();

    // Simulate a background refetch updating the ["stats", "me"] cache.
    await act(async () => {
      qc.setQueryData(["stats", "me"], STATS_UPDATED);
    });

    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );

    // New values must appear; stale values must be gone.
    expect(screen.getByText("25")).toBeInTheDocument(); // updated totalLfgPosts
    expect(screen.getByText("80")).toBeInTheDocument(); // updated totalMessages
    expect(screen.getByText("7")).toBeInTheDocument();  // updated totalFriends
    expect(screen.queryByText("10")).not.toBeInTheDocument(); // old lfgPosts gone
  });

  test("updating only totalLfgPosts leaves other counters intact", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    await act(async () => {
      qc.setQueryData(["stats", "me"], { ...STATS, totalLfgPosts: 99 });
    });

    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText("99")).toBeInTheDocument();  // updated
    expect(screen.getByText("20")).toBeInTheDocument();  // messages unchanged
    expect(screen.getByText("3")).toBeInTheDocument();   // friends unchanged
  });

  test("updating only totalMessages leaves other counters intact", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    await act(async () => {
      qc.setQueryData(["stats", "me"], { ...STATS, totalMessages: 150 });
    });

    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText("150")).toBeInTheDocument(); // updated
    expect(screen.getByText("10")).toBeInTheDocument();  // lfgPosts unchanged
  });

  test("stat cards show updated values from two successive cache writes", async () => {
    const qc = makeClient(WEEKLY_WITH_ACTIVITY);
    const { rerender } = renderStats(qc);

    // First update.
    await act(async () => {
      qc.setQueryData(["stats", "me"], { ...STATS, totalLfgPosts: 30 });
    });
    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText("30")).toBeInTheDocument();

    // Second update — simulates a further refetch cycle.
    await act(async () => {
      qc.setQueryData(["stats", "me"], { ...STATS, totalLfgPosts: 45 });
    });
    rerender(
      <QueryClientProvider client={qc}>
        <StatsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.queryByText("30")).not.toBeInTheDocument();
  });
});
