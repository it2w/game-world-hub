/**
 * Unit tests for the gwh:clip-reaction window-event handler that keeps the
 * friends-clips strip reaction counts accurate when another user reacts to a
 * clip during a live session.
 *
 * The handler lives in the CommunityHighlights component (dashboard.tsx,
 * lines ~512-530). The component is rendered directly so that regressions in
 * the real production effect are caught rather than hidden behind a local
 * duplicate.
 *
 * The QueryClient is provided via QueryClientProvider so that the
 * `useQueryClient()` call inside the component returns the same instance that
 * the test can spy on and inspect.
 *
 * Scenarios covered:
 *  1. gwh:clip-reaction patches the reactionCount for the matching clip to the
 *     new total derived from the reactions map.
 *  2. gwh:clip-reaction for a clip not in the cache is a no-op (no crash, no
 *     spurious update to the other entries).
 *  3. gwh:clip-reaction when the cache is undefined does not crash.
 *  4. gwh:clip-reaction updates only the target clip when the strip has many
 *     entries.
 *  5. gwh:clip-reaction with multiple distinct emoji values sums them correctly.
 *  6. Listener is removed on unmount — no stale callbacks fire afterwards.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommunityHighlights } from "./dashboard";

// ─── Module mocks (same set as dashboard.clips-strip.test.tsx) ───────────────

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

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn().mockResolvedValue([]),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ClipRow = { id: number; title: string; reactionCount: number; [key: string]: unknown };

const CLIPS: ClipRow[] = [
  { id: 1, title: "ACE Round Valorant",    reactionCount: 5 },
  { id: 2, title: "Apex Predator Montage", reactionCount: 2 },
  { id: 3, title: "5K AWP CS2 Premier",    reactionCount: 9 },
];

function makeClient(initialClips?: ClipRow[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (initialClips) {
    qc.setQueryData(["friend-clips-dashboard"], initialClips);
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

function fireClipReaction(
  clipId: number,
  reactions: Record<string, number>,
  actingUserId = 42,
) {
  window.dispatchEvent(
    new CustomEvent("gwh:clip-reaction", {
      detail: { clipId, reactions, actingUserId },
    }),
  );
}

// ─── gwh:clip-reaction tests ─────────────────────────────────────────────────

describe("gwh:clip-reaction handler in CommunityHighlights", () => {
  test("patches reactionCount for the matching clip to the new total", async () => {
    const qc = makeClient(CLIPS);
    renderHighlights(qc);

    await act(async () => {
      fireClipReaction(2, { "👍": 3, "🔥": 4 });
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    const clip2 = cached.find((c) => c.id === 2);
    expect(clip2).toBeDefined();
    // 3 + 4 = 7
    expect(clip2!.reactionCount).toBe(7);
  });

  test("does not modify other clips when a specific clip is reacted to", async () => {
    const qc = makeClient(CLIPS);
    renderHighlights(qc);

    await act(async () => {
      fireClipReaction(2, { "🔥": 10 });
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    // Clip 1 and 3 should be untouched
    expect(cached.find((c) => c.id === 1)!.reactionCount).toBe(5);
    expect(cached.find((c) => c.id === 3)!.reactionCount).toBe(9);
    // Clip 2 updated
    expect(cached.find((c) => c.id === 2)!.reactionCount).toBe(10);
  });

  test("is a no-op when the reacted clipId is not in the cache", async () => {
    const qc = makeClient(CLIPS);
    renderHighlights(qc);

    await act(async () => {
      fireClipReaction(999, { "👍": 5 });
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    // All original counts must be unchanged
    expect(cached).toHaveLength(3);
    expect(cached.find((c) => c.id === 1)!.reactionCount).toBe(5);
    expect(cached.find((c) => c.id === 2)!.reactionCount).toBe(2);
    expect(cached.find((c) => c.id === 3)!.reactionCount).toBe(9);
  });

  test("does not crash when the cache is undefined (cold cache)", async () => {
    const qc = makeClient(); // no initial clips

    expect(() => {
      renderHighlights(qc);
    }).not.toThrow();

    await expect(
      act(async () => {
        fireClipReaction(1, { "🔥": 3 });
      }),
    ).resolves.not.toThrow();
  });

  test("sums multiple emoji reaction values correctly", async () => {
    const qc = makeClient(CLIPS);
    renderHighlights(qc);

    await act(async () => {
      fireClipReaction(1, { "👍": 1, "🔥": 2, "😮": 3, "❤️": 4, "😂": 5 });
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    // 1+2+3+4+5 = 15
    expect(cached.find((c) => c.id === 1)!.reactionCount).toBe(15);
  });

  test("updates only the target clip in a large strip", async () => {
    const manyClips: ClipRow[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      title: `Clip ${i + 1}`,
      reactionCount: i * 2,
    }));
    const qc = makeClient(manyClips);
    renderHighlights(qc);

    await act(async () => {
      // Clip id=5 originally has reactionCount = 4*2 = 8; update to 20
      fireClipReaction(5, { "🔥": 12, "👍": 8 });
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    expect(cached).toHaveLength(8);
    expect(cached.find((c) => c.id === 5)!.reactionCount).toBe(20);
    // Spot-check neighbours are untouched
    expect(cached.find((c) => c.id === 4)!.reactionCount).toBe(6);
    expect(cached.find((c) => c.id === 6)!.reactionCount).toBe(10);
  });

  test("listener is removed on unmount so stale reaction updates do not fire", async () => {
    const qc = makeClient(CLIPS);
    const { unmount } = renderHighlights(qc);

    unmount();

    // Fire after unmount — the handler must be gone
    await act(async () => {
      fireClipReaction(1, { "🔥": 999 });
    });

    // Cache was seeded before unmount; clip 1 must still have reactionCount=5
    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    expect(cached.find((c) => c.id === 1)!.reactionCount).toBe(5);
  });
});
