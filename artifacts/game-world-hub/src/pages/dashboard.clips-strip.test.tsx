/**
 * Unit tests for the gwh:clip-uploaded and gwh:clip-deleted window-event
 * handlers that keep the friends-clips strip on the dashboard accurate when a
 * friend uploads or deletes a clip during a live session.
 *
 * Both handlers live in the CommunityHighlights component (dashboard.tsx).
 * The component is rendered directly (not through a hook copy) so that
 * regressions in the real production effects — wrong query key, missing
 * handler, wrong cache update — are caught rather than hidden behind a local
 * duplicate.
 *
 * The QueryClient is provided via QueryClientProvider so that the
 * `useQueryClient()` call inside the component returns the same instance that
 * the test can spy on and inspect.
 *
 * Scenarios covered:
 *  1. gwh:clip-uploaded triggers invalidateQueries for "friend-clips-dashboard".
 *  2. Firing gwh:clip-uploaded multiple times invalidates on each event.
 *  3. Handlers are removed on unmount — no stale callbacks fire afterwards.
 *  4. gwh:clip-deleted removes the matching clip from the cached strip.
 *  5. gwh:clip-deleted with an unknown clipId leaves the strip unchanged.
 *  6. gwh:clip-deleted when the cache is undefined does not crash.
 *  7. gwh:clip-deleted removes only the target clip from a multi-item strip.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommunityHighlights } from "./dashboard";

// ─── Module mocks (same set as dashboard.spotlight.test.tsx) ──────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fireClipUploaded() {
  window.dispatchEvent(new CustomEvent("gwh:clip-uploaded"));
}

function fireClipDeleted(clipId: number, ownerId = 99) {
  window.dispatchEvent(
    new CustomEvent("gwh:clip-deleted", { detail: { clipId, ownerId } }),
  );
}

// ─── gwh:clip-uploaded tests ──────────────────────────────────────────────────

describe("gwh:clip-uploaded handler in CommunityHighlights", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeClient();
  });

  test("invalidates friend-clips-dashboard when gwh:clip-uploaded fires", async () => {
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderHighlights(qc);

    await act(async () => {
      fireClipUploaded();
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["friend-clips-dashboard"] });
  });

  test("invalidates the query each time the event fires (multiple uploads)", async () => {
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderHighlights(qc);

    await act(async () => {
      fireClipUploaded();
      fireClipUploaded();
      fireClipUploaded();
    });

    // invalidateQueries may also be called for other reasons on mount; assert at least 3
    const dashboardCalls = spy.mock.calls.filter(
      ([arg]) =>
        arg &&
        typeof arg === "object" &&
        "queryKey" in arg &&
        Array.isArray((arg as any).queryKey) &&
        (arg as any).queryKey[0] === "friend-clips-dashboard",
    );
    expect(dashboardCalls.length).toBeGreaterThanOrEqual(3);
  });

  test("listener is removed on unmount so no stale invalidations fire after cleanup", async () => {
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { unmount } = renderHighlights(qc);

    unmount();
    spy.mockClear();

    await act(async () => {
      fireClipUploaded();
    });

    const dashboardCalls = spy.mock.calls.filter(
      ([arg]) =>
        arg &&
        typeof arg === "object" &&
        "queryKey" in arg &&
        Array.isArray((arg as any).queryKey) &&
        (arg as any).queryKey[0] === "friend-clips-dashboard",
    );
    expect(dashboardCalls.length).toBe(0);
  });
});

// ─── gwh:clip-deleted tests ───────────────────────────────────────────────────

describe("gwh:clip-deleted handler in CommunityHighlights", () => {
  test("removes the clip with the matching clipId from the cached strip", async () => {
    const qc = makeClient(CLIPS);
    renderHighlights(qc);

    await act(async () => {
      fireClipDeleted(2);
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    expect(cached).toHaveLength(2);
    expect(cached.find((c) => c.id === 2)).toBeUndefined();
    expect(cached.map((c) => c.id)).toEqual([1, 3]);
  });

  test("leaves the strip unchanged when the deleted clipId is not in the cache", async () => {
    const qc = makeClient(CLIPS);
    renderHighlights(qc);

    await act(async () => {
      fireClipDeleted(999);
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    expect(cached).toHaveLength(3);
    expect(cached.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  test("does not crash when the cache is undefined (cold cache)", async () => {
    const qc = makeClient(); // no initial clips

    expect(() => {
      renderHighlights(qc);
    }).not.toThrow();

    await expect(
      act(async () => {
        fireClipDeleted(5);
      }),
    ).resolves.not.toThrow();

    // Cache was populated by the query (empty array from mocked customFetch).
    // After a delete against an empty cache the strip should still be empty — no crash.
    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"]);
    expect(Array.isArray(cached) ? cached.length : 0).toBe(0);
  });

  test("removes only the target clip when the strip has many entries", async () => {
    const manyClips: ClipRow[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      title: `Clip ${i + 1}`,
      reactionCount: i,
    }));
    const qc = makeClient(manyClips);
    renderHighlights(qc);

    await act(async () => {
      fireClipDeleted(5);
    });

    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    expect(cached).toHaveLength(7);
    expect(cached.find((c) => c.id === 5)).toBeUndefined();
    expect(cached.map((c) => c.id)).toEqual([1, 2, 3, 4, 6, 7, 8]);
  });

  test("listener is removed on unmount so deleted clips are not retroactively removed", async () => {
    const qc = makeClient(CLIPS);
    const { unmount } = renderHighlights(qc);

    unmount();

    await act(async () => {
      fireClipDeleted(1);
    });

    // Cache must be untouched because the listener was already removed
    const cached = qc.getQueryData<ClipRow[]>(["friend-clips-dashboard"])!;
    expect(cached).toHaveLength(3);
  });
});
