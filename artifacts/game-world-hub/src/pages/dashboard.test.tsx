import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommunityHighlights } from "./dashboard";

/**
 * Verifies the gwh:clip-reaction event handler inside CommunityHighlights:
 *
 *  (a) Is a no-op when the ["friend-clips-dashboard"] cache is empty / undefined
 *      — the handler runs without throwing and the component stays mounted.
 *
 *  (b) A reaction event for a clipId NOT present in the friends list leaves every
 *      reactionCount in the cache unchanged.
 *
 *  (c) A reaction event for a clipId that IS in the friends list updates only
 *      that entry's reactionCount (derived from the sum of the reactions map)
 *      and leaves all other entries untouched.
 */

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

// customFetch is hoisted so individual tests can override it per-test.
const mockCustomFetch = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  get customFetch() { return mockCustomFetch; },
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIP_1 = {
  id: 1,
  ownerId: 10,
  title: "Ace Round",
  game: "Valorant",
  mimeType: "video/mp4",
  isVideo: true,
  thumbnailUrl: "/api/clips/1/thumb",
  reactionCount: 3,
  viewCount: 1200,
  createdAt: new Date(Date.now() - 120_000).toISOString(),
  owner: { displayName: "PlayerOne", username: "p1", avatarUrl: null },
};

const CLIP_2 = {
  id: 2,
  ownerId: 20,
  title: "Clutch Play",
  game: "CS2",
  mimeType: "video/mp4",
  isVideo: true,
  thumbnailUrl: "/api/clips/2/thumb",
  reactionCount: 7,
  viewCount: 5000,
  createdAt: new Date(Date.now() - 600_000).toISOString(),
  owner: { displayName: "PlayerTwo", username: "p2", avatarUrl: null },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a QueryClient and, when `clips` is provided, pre-seed the
 * friend-clips-dashboard cache so the component reads it synchronously
 * (no network fetch needed).
 */
function makeClient(clips?: typeof CLIP_1[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (clips !== undefined) {
    qc.setQueryData(["friend-clips-dashboard"], clips);
  }
  return qc;
}

function renderHighlights(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <CommunityHighlights activity={[]} />
    </QueryClientProvider>,
  );
}

function fireReactionEvent(clipId: number, reactions: Record<string, number>) {
  window.dispatchEvent(
    new CustomEvent("gwh:clip-reaction", {
      detail: { clipId, reactions, actingUserId: 99 },
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CommunityHighlights — gwh:clip-reaction event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: keep the fetch pending so it never populates the cache.
    // Individual tests that want populated cache use makeClient(clips) instead.
    mockCustomFetch.mockReturnValue(new Promise(() => {}));
  });

  test("(a) no-op when cache is undefined — handler runs without throwing", async () => {
    // No seed → cache stays undefined (fetch is pending, never resolves).
    const qc = makeClient(undefined);
    renderHighlights(qc);

    // Fire event — handler must not throw
    await act(async () => {
      fireReactionEvent(1, { "🔥": 5 });
    });

    // Cache should still be undefined (the map branch `if (!old) return old` fires)
    expect(qc.getQueryData(["friend-clips-dashboard"])).toBeUndefined();
  });

  test("(a) no-op when cache is an empty array — handler keeps the array empty", async () => {
    const qc = makeClient([]);
    renderHighlights(qc);

    await act(async () => {
      fireReactionEvent(1, { "🔥": 5 });
    });

    expect(qc.getQueryData(["friend-clips-dashboard"])).toEqual([]);
  });

  test("(b) reaction for a clip NOT in the friends list leaves the cache unchanged", async () => {
    const qc = makeClient([CLIP_1, CLIP_2]);
    renderHighlights(qc);

    // clipId 999 is not in the cache
    await act(async () => {
      fireReactionEvent(999, { "🔥": 10, "❤️": 2 });
    });

    const cached = qc.getQueryData<typeof CLIP_1[]>(["friend-clips-dashboard"]);
    expect(cached).toHaveLength(2);
    expect(cached![0].reactionCount).toBe(CLIP_1.reactionCount); // 3 — unchanged
    expect(cached![1].reactionCount).toBe(CLIP_2.reactionCount); // 7 — unchanged
  });

  test("(c) reaction for a clip IN the friends list updates only that entry's reactionCount", async () => {
    const qc = makeClient([CLIP_1, CLIP_2]);
    renderHighlights(qc);

    // React to clip 1: total = 4 + 2 = 6
    await act(async () => {
      fireReactionEvent(1, { "🔥": 4, "❤️": 2 });
    });

    const cached = qc.getQueryData<typeof CLIP_1[]>(["friend-clips-dashboard"]);
    expect(cached).toHaveLength(2);
    // Clip 1's count should now be the sum of the reactions map (6)
    expect(cached![0].reactionCount).toBe(6);
    // Clip 2's count should be untouched
    expect(cached![1].reactionCount).toBe(CLIP_2.reactionCount); // 7
  });

  test("(c) rendered reaction count updates in the UI after a matching event", async () => {
    const qc = makeClient([CLIP_1, CLIP_2]);
    renderHighlights(qc);

    // Initial render: clip 1 shows 3 reactions, clip 2 shows 7 reactions.
    // The reaction count is a leaf <div> containing only text nodes ("🔥 <n>").
    // We match only leaf divs (no child elements) so ancestor containers that
    // also contain "🔥" and the number somewhere in their subtree don't fire.
    const reactionDivText = (n: number) =>
      (_: string, el: Element | null) => {
        if (!el || el.tagName.toLowerCase() !== "div") return false;
        // Leaf check: no child element nodes (only text nodes allowed)
        if (el.children.length > 0) return false;
        return /🔥/.test(el.textContent ?? "") && el.textContent?.includes(String(n)) === true;
      };

    expect(screen.getByText(reactionDivText(3))).toBeInTheDocument();
    expect(screen.getByText(reactionDivText(7))).toBeInTheDocument();

    // Fire a reaction that changes clip 1's total to 9 (🔥6 + ❤️3)
    await act(async () => {
      fireReactionEvent(1, { "🔥": 6, "❤️": 3 });
    });

    // Wait for React Query observer to propagate the cache update to the component
    await waitFor(() => {
      expect(screen.queryByText(reactionDivText(3))).not.toBeInTheDocument();
    });

    expect(screen.getByText(reactionDivText(9))).toBeInTheDocument();
    expect(screen.getByText(reactionDivText(7))).toBeInTheDocument();
  });

  test("(c) multiple sequential events accumulate correctly — last event wins", async () => {
    const qc = makeClient([CLIP_1, CLIP_2]);
    renderHighlights(qc);

    await act(async () => {
      fireReactionEvent(2, { "🔥": 2 }); // clip 2 → total 2
    });

    await act(async () => {
      fireReactionEvent(2, { "🔥": 5, "❤️": 3 }); // clip 2 → total 8
    });

    const cached = qc.getQueryData<typeof CLIP_1[]>(["friend-clips-dashboard"]);
    expect(cached![1].reactionCount).toBe(8);
    // Clip 1 remains untouched
    expect(cached![0].reactionCount).toBe(CLIP_1.reactionCount); // 3
  });
});
