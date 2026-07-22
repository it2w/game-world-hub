/**
 * Unit tests verifying that the friends-clips-dashboard query refetches when
 * the window regains focus and the cached data is stale.
 *
 * The focus behaviour is driven by the `refetchOnWindowFocus: true` option set
 * directly on the `useQuery` call inside CommunityHighlights (dashboard.tsx).
 * These tests confirm that:
 *   1. Focusing the window after data is invalidated (stale) triggers a new fetch.
 *   2. Focusing the window while data is still fresh does NOT trigger a fetch.
 *   3. The focus listener is cleaned up on unmount — no refetch fires afterwards.
 *   4. The strip keeps showing its previous clips while a background refetch is in flight
 *      (placeholderData: keepPreviousData — no blank flash).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { CommunityHighlights } from "./dashboard";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/voice/voice-context", () => ({
  useVoice: () => ({
    joinVipLounge: vi.fn(),
    callUser: vi.fn(),
    currentChannelId: null,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockCustomFetch = vi.fn().mockResolvedValue([]);

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => mockCustomFetch(...args),
  useGetMe: () => ({ data: undefined }),
  useGetOnlineFriendsSummary: () => ({ data: undefined }),
  useGetPartyActivityFeed: () => ({ data: undefined }),
  useListPartyInvites: () => ({ data: undefined }),
  useBlockUser: () => ({ mutate: vi.fn() }),
  useAcceptPartyInvite: () => ({ mutate: vi.fn() }),
  useDeclinePartyInvite: () => ({ mutate: vi.fn() }),
  getGetMeQueryKey: () => ["me"],
  getGetOnlineFriendsSummaryQueryKey: () => ["online-friends"],
  getGetPartyActivityFeedQueryKey: () => ["party-activity"],
  getListPartyInvitesQueryKey: () => ["party-invites"],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/i18n", () => ({ default: { language: "en" } }));

vi.mock("@/components/daily-quests-widget", () => ({
  DailyQuestsWidget: () => null,
}));

vi.mock("@/pages/battle-pass", () => ({
  BattlePassWidget: () => null,
}));

vi.mock("@/components/global-chat", () => ({
  GlobalChat: () => null,
}));

vi.mock("@/components/pro-badge", () => ({
  ProBadge: () => null,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

function renderHighlights(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <CommunityHighlights activity={[]} />
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("friends-clips-dashboard refetchOnWindowFocus", () => {
  beforeEach(() => {
    mockCustomFetch.mockClear();
    mockCustomFetch.mockResolvedValue([]);
    // Start unfocused so mount itself does not trigger a focus-based refetch.
    focusManager.setFocused(false);
  });

  afterEach(() => {
    // Restore default focus manager state so other tests are not polluted.
    focusManager.setFocused(undefined);
  });

  test("refetches the friends-clips endpoint when the window regains focus and data is stale", async () => {
    const qc = makeClient();
    renderHighlights(qc);

    // Wait for the initial mount fetch to complete.
    await act(async () => {
      await Promise.resolve();
    });

    // Mark the query as invalidated (stale) without triggering an immediate
    // refetch — this is the state after a friend uploads while the tab was hidden.
    await act(async () => {
      await qc.invalidateQueries({
        queryKey: ["friend-clips-dashboard"],
        refetchType: "none",
      });
    });

    mockCustomFetch.mockClear();

    // Simulate the window regaining focus.
    await act(async () => {
      focusManager.setFocused(true);
      // Allow the React Query observer to react and schedule the refetch.
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stale query must have been refetched via the focus event.
    expect(mockCustomFetch).toHaveBeenCalledWith("/api/clips/friends?limit=4");
  });

  test("does not issue an extra fetch when data is still fresh at the moment of focus", async () => {
    const qc = makeClient();
    renderHighlights(qc);

    // Wait for the initial fetch to settle (data is now fresh).
    await act(async () => {
      await Promise.resolve();
    });

    mockCustomFetch.mockClear();

    // Simulate focus while data is still within staleTime — no refetch expected.
    await act(async () => {
      focusManager.setFocused(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCustomFetch).not.toHaveBeenCalled();
  });

  test("does not refetch after the component unmounts even if focus fires", async () => {
    const qc = makeClient();
    const { unmount } = renderHighlights(qc);

    await act(async () => {
      await Promise.resolve();
    });

    // Mark stale, then unmount before focusing.
    await act(async () => {
      await qc.invalidateQueries({
        queryKey: ["friend-clips-dashboard"],
        refetchType: "none",
      });
    });

    unmount();
    mockCustomFetch.mockClear();

    // Focus fires after unmount — no active observer, so no refetch.
    await act(async () => {
      focusManager.setFocused(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCustomFetch).not.toHaveBeenCalled();
  });

  test("strip keeps previous clips visible while a background refetch is in flight (no blank flash)", async () => {
    // Pre-seed the cache with one clip so the strip renders it immediately.
    const previousClip = {
      id: 42,
      ownerId: 7,
      title: "Ace Round Valorant",
      game: "Valorant",
      mimeType: "image/jpeg",
      isVideo: false,
      thumbnailUrl: "/thumb.jpg",
      reactionCount: 3,
      viewCount: 1200,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      owner: { displayName: "Khalid", username: "khalid99", avatarUrl: null },
    };

    const qc = makeClient();
    qc.setQueryData(["friend-clips-dashboard"], [previousClip]);

    // Make the next fetch hang indefinitely so we can inspect the UI mid-flight.
    let resolveRefetch!: (value: unknown) => void;
    const hangingFetch = new Promise((res) => { resolveRefetch = res; });
    mockCustomFetch.mockReturnValueOnce(hangingFetch);

    renderHighlights(qc);

    // Wait for initial render with seeded data.
    await act(async () => {
      await Promise.resolve();
    });

    // The clip title should be visible right away.
    expect(screen.getByText("Ace Round Valorant")).toBeTruthy();

    // Invalidate (mark stale) without triggering an immediate refetch.
    await act(async () => {
      await qc.invalidateQueries({
        queryKey: ["friend-clips-dashboard"],
        refetchType: "none",
      });
    });

    mockCustomFetch.mockClear();
    mockCustomFetch.mockReturnValueOnce(hangingFetch);

    // Simulate window focus to kick off the background refetch.
    await act(async () => {
      focusManager.setFocused(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The refetch is now in flight but not yet resolved.
    // The strip must still show the previous clip (no blank flash).
    expect(screen.getByText("Ace Round Valorant")).toBeTruthy();

    // Clean up: let the hanging fetch resolve so React Query doesn't leak.
    resolveRefetch([previousClip]);
  });
});
