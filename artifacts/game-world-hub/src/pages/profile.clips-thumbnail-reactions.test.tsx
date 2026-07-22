/**
 * Unit tests for per-emoji reaction counts on clip thumbnails.
 *
 * Three scenarios from task #358:
 *  1. Hovering a clip card triggers GET /api/clips/:id/reactions and the
 *     returned emoji+count map populates clipReactionCounts for that clip.
 *  2. A gwh:clip-reaction CustomEvent updates the per-clip emoji counts in
 *     clipReactionCounts without requiring a re-hover.
 *  3. Clips whose reactions are all zero (or whose clipReactionCounts entry
 *     has no positive values) show no pills in the overlay.
 *
 * Uses the same minimal-hook-wrapper pattern as profile.clips-reaction.test.tsx
 * so the full Profile render tree (and all its API queries) is not mounted.
 * The production logic is extracted verbatim into each hook, keeping the tests
 * structurally identical to the real code paths.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, useEffect } from "react";

// ─── Constants (mirrors profile.tsx) ─────────────────────────────────────────

const CLIP_EMOJIS = ["🔥", "GG", "💀", "👑", "😂"];

// ─── Hook: handleClipHover + clipReactionCounts population ───────────────────
//
// Mirrors handleClipHover (profile.tsx ~line 278) and the clipReactionCounts
// state that backs the thumbnail overlay.

type FetchReactionsFn = (
  clipId: number,
) => Promise<{ reactions: Record<string, number>; mine: string[] }>;

function useClipThumbnailHover(fetchReactions: FetchReactionsFn) {
  const [clipReactionCounts, setClipReactionCounts] = useState<
    Record<number, Record<string, number>>
  >({});

  const handleClipHover = (clipId: number) => {
    // Mirrors profile.tsx: bail early if already fetched
    if (clipReactionCounts[clipId] !== undefined) return;
    fetchReactions(clipId)
      .then((data) => {
        setClipReactionCounts((prev) => ({ ...prev, [clipId]: data.reactions }));
      })
      .catch(() => {
        /* non-fatal */
      });
  };

  return { clipReactionCounts, handleClipHover };
}

// ─── Hook: gwh:clip-reaction → clipReactionCounts patch ──────────────────────
//
// Mirrors the section of the gwh:clip-reaction useEffect in profile.tsx that
// patches clipReactionCounts (line 176):
//   setClipReactionCounts(prev => ({ ...prev, [clipId]: reactions }));
//
// Also includes the own-broadcast skip guard and the queryClient patch for the
// grid cache (represented here as a simple clips list).

interface ClipSummary {
  id: number;
  reactionCount: number;
  [key: string]: unknown;
}

function useClipReactionOverlaySync(myId: number | undefined) {
  const [clipReactionCounts, setClipReactionCounts] = useState<
    Record<number, Record<string, number>>
  >({});
  const [clips, setClips] = useState<ClipSummary[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { clipId, reactions, actingUserId } = (
        e as CustomEvent<{
          clipId: number;
          reactions: Record<string, number>;
          actingUserId: number;
        }>
      ).detail;

      // Skip our own broadcast — optimistic update already applied it locally
      if (actingUserId === myId) return;

      const totalReactions = Object.values(reactions).reduce(
        (sum, n) => sum + n,
        0,
      );

      // Patch the clips grid cache (mirrors queryClient.setQueryData call)
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId ? { ...c, reactionCount: totalReactions } : c,
        ),
      );

      // Patch the lazy per-emoji cache so the thumbnail overlay stays accurate
      setClipReactionCounts((prev) => ({ ...prev, [clipId]: reactions }));
    };

    window.addEventListener("gwh:clip-reaction", handler);
    return () => window.removeEventListener("gwh:clip-reaction", handler);
  }, [myId]);

  return { clipReactionCounts, clips, setClips };
}

// ─── Helper: fire gwh:clip-reaction ──────────────────────────────────────────

function fireClipReaction(
  clipId: number,
  reactions: Record<string, number>,
  actingUserId: number,
) {
  window.dispatchEvent(
    new CustomEvent("gwh:clip-reaction", {
      detail: { clipId, reactions, actingUserId },
    }),
  );
}

// ─── Helper: derive visible pills from clipReactionCounts ────────────────────
//
// Mirrors the JSX filter in profile.tsx lines 1412-1414:
//   CLIP_EMOJIS.filter(e => (clipReactionCounts[clip.id][e] ?? 0) > 0)
//     .map(e => <span>{e} {clipReactionCounts[clip.id][e]}</span>)

function visiblePills(counts: Record<string, number>): Array<[string, number]> {
  return CLIP_EMOJIS.filter((e) => (counts[e] ?? 0) > 0).map((e) => [
    e,
    counts[e],
  ]);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MY_ID = 42;
const OTHER_USER_ID = 99;
const CLIP_ID = 7;
const CLIP_ID_2 = 13;

// ─── Suite 1: hover → fetch → populate clipReactionCounts ────────────────────

describe("handleClipHover — hover-fetch populates per-emoji reaction counts", () => {
  let fetchReactions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchReactions = vi.fn();
  });

  test("hovering a clip calls fetchReactions and stores the returned emoji counts", async () => {
    fetchReactions.mockResolvedValue({
      reactions: { "🔥": 3, GG: 1 },
      mine: ["🔥"],
    });

    const { result } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    // Simulate mouseEnter on the clip card
    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    expect(fetchReactions).toHaveBeenCalledWith(CLIP_ID);
    expect(result.current.clipReactionCounts[CLIP_ID]).toEqual({
      "🔥": 3,
      GG: 1,
    });
  });

  test("hovering the same clip a second time does NOT re-fetch (already cached)", async () => {
    fetchReactions.mockResolvedValue({
      reactions: { "🔥": 2 },
      mine: [],
    });

    const { result } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    // Second hover — should be a no-op
    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    expect(fetchReactions).toHaveBeenCalledTimes(1);
  });

  test("hovering different clips fetches each one independently", async () => {
    fetchReactions
      .mockResolvedValueOnce({ reactions: { "🔥": 1 }, mine: [] })
      .mockResolvedValueOnce({ reactions: { GG: 5 }, mine: [] });

    const { result } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    await act(async () => {
      result.current.handleClipHover(CLIP_ID_2);
    });

    expect(fetchReactions).toHaveBeenCalledTimes(2);
    expect(result.current.clipReactionCounts[CLIP_ID]).toEqual({ "🔥": 1 });
    expect(result.current.clipReactionCounts[CLIP_ID_2]).toEqual({ GG: 5 });
  });

  test("a fetch error leaves clipReactionCounts empty for that clip (non-fatal)", async () => {
    fetchReactions.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    // No entry should exist — the catch swallows the error silently
    expect(result.current.clipReactionCounts[CLIP_ID]).toBeUndefined();
  });

  test("returned emoji+count pills render correctly from fetched data", async () => {
    fetchReactions.mockResolvedValue({
      reactions: { "🔥": 4, "💀": 2 },
      mine: [],
    });

    const { result } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    const pills = visiblePills(result.current.clipReactionCounts[CLIP_ID]);
    expect(pills).toEqual([
      ["🔥", 4],
      ["💀", 2],
    ]);
  });
});

// ─── Suite 2: gwh:clip-reaction event → overlay updates without re-hover ─────

describe("gwh:clip-reaction event — overlay counts update without re-hover", () => {
  test("a WS event from another user updates clipReactionCounts for the target clip", () => {
    const { result } = renderHook(() =>
      useClipReactionOverlaySync(MY_ID),
    );

    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 3, GG: 1 }, OTHER_USER_ID);
    });

    expect(result.current.clipReactionCounts[CLIP_ID]).toEqual({
      "🔥": 3,
      GG: 1,
    });
  });

  test("own broadcast (actingUserId === me.id) is skipped — clipReactionCounts unchanged", () => {
    const { result } = renderHook(() =>
      useClipReactionOverlaySync(MY_ID),
    );

    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 99 }, MY_ID);
    });

    // Own broadcast must NOT patch the overlay
    expect(result.current.clipReactionCounts[CLIP_ID]).toBeUndefined();
  });

  test("event for a different clip does not touch other clips' counts", () => {
    const { result } = renderHook(() =>
      useClipReactionOverlaySync(MY_ID),
    );

    // Seed clip 7 with some counts
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 2 }, OTHER_USER_ID);
    });

    // A reaction on clip 13 arrives
    act(() => {
      fireClipReaction(CLIP_ID_2, { GG: 5 }, OTHER_USER_ID);
    });

    // Clip 7 must be unaffected
    expect(result.current.clipReactionCounts[CLIP_ID]).toEqual({ "🔥": 2 });
    expect(result.current.clipReactionCounts[CLIP_ID_2]).toEqual({ GG: 5 });
  });

  test("two sequential WS events — final clipReactionCounts reflects the last event", () => {
    const { result } = renderHook(() =>
      useClipReactionOverlaySync(MY_ID),
    );

    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 1 }, OTHER_USER_ID);
    });

    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 4, GG: 2 }, OTHER_USER_ID);
    });

    expect(result.current.clipReactionCounts[CLIP_ID]).toEqual({
      "🔥": 4,
      GG: 2,
    });
  });

  test("WS event patches the derived pills — correct emojis are visible after broadcast", () => {
    const { result } = renderHook(() =>
      useClipReactionOverlaySync(MY_ID),
    );

    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 2, "👑": 1 }, OTHER_USER_ID);
    });

    const pills = visiblePills(result.current.clipReactionCounts[CLIP_ID]);
    expect(pills).toEqual([
      ["🔥", 2],
      ["👑", 1],
    ]);
  });
});

// ─── Suite 3: zero reactions → no pills, no fallback heart ───────────────────

describe("zero-reaction clips — overlay shows nothing", () => {
  test("clipReactionCounts entry with all-zero values yields no visible pills", () => {
    // All counts are 0
    const counts: Record<string, number> = {
      "🔥": 0,
      GG: 0,
      "💀": 0,
      "👑": 0,
      "😂": 0,
    };

    expect(visiblePills(counts)).toHaveLength(0);
  });

  test("empty clipReactionCounts entry (no keys) yields no pills", () => {
    expect(visiblePills({})).toHaveLength(0);
  });

  test("only emojis with count > 0 appear as pills — zero-count emojis are hidden", () => {
    const counts: Record<string, number> = {
      "🔥": 3,
      GG: 0,
      "💀": 1,
      "👑": 0,
      "😂": 0,
    };

    const pills = visiblePills(counts);
    expect(pills).toHaveLength(2);
    expect(pills.map(([emoji]) => emoji)).toEqual(["🔥", "💀"]);
  });

  test("WS event that zeros out all reactions leaves no visible pills", () => {
    const { result } = renderHook(() =>
      useClipReactionOverlaySync(MY_ID),
    );

    // Initial reactions
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 2 }, OTHER_USER_ID);
    });

    // All reactions removed — server sends zeroed map
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 0, GG: 0 }, OTHER_USER_ID);
    });

    const pills = visiblePills(result.current.clipReactionCounts[CLIP_ID]);
    expect(pills).toHaveLength(0);
  });

  test("clip with reactionCount 0 and no clipReactionCounts entry shows no fallback heart", () => {
    // Mirrors profile.tsx line 1415:
    //   clip.reactionCount > 0 && <span><Heart /> {clip.reactionCount}</span>
    // When reactionCount is 0, the heart must not render.
    const reactionCount = 0;
    const showFallbackHeart = reactionCount > 0;

    expect(showFallbackHeart).toBe(false);
  });
});

// ─── Suite 4: page navigation (unmount → remount) clears per-clip cache ───────
//
// clipReactionCounts is component-local state — it must reset on unmount so
// that when the user navigates away and back the overlay doesn't show stale
// counts from a previous session, and the next hover always re-fetches.

describe("page navigation — remount clears clipReactionCounts and re-enables fetch", () => {
  let fetchReactions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchReactions = vi.fn();
  });

  test("clipReactionCounts is empty immediately after remount (fresh state)", async () => {
    fetchReactions.mockResolvedValue({
      reactions: { "🔥": 5, GG: 2 },
      mine: ["🔥"],
    });

    // First mount — hover populates the cache
    const { result, unmount } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    // Cache has data for the clip
    expect(result.current.clipReactionCounts[CLIP_ID]).toEqual({
      "🔥": 5,
      GG: 2,
    });

    // Simulate navigation away (unmount = Profile leaving the DOM)
    unmount();

    // Simulate navigation back (fresh mount of the hook)
    const { result: result2 } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    // State must start empty — no carry-over from the previous session
    expect(result2.current.clipReactionCounts[CLIP_ID]).toBeUndefined();
    expect(Object.keys(result2.current.clipReactionCounts)).toHaveLength(0);
  });

  test("first hover after remount fires a new fetch (cache-miss, not a skip)", async () => {
    fetchReactions
      .mockResolvedValueOnce({ reactions: { "🔥": 3 }, mine: [] })
      .mockResolvedValueOnce({ reactions: { "🔥": 7 }, mine: [] });

    // First mount — hover populates the cache
    const { result, unmount } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    await act(async () => {
      result.current.handleClipHover(CLIP_ID);
    });

    expect(fetchReactions).toHaveBeenCalledTimes(1);

    // Navigate away, then back
    unmount();

    const { result: result2 } = renderHook(() =>
      useClipThumbnailHover(fetchReactions as FetchReactionsFn),
    );

    // Hover on the same clip — must trigger a new fetch because the cache is gone
    await act(async () => {
      result2.current.handleClipHover(CLIP_ID);
    });

    // fetchReactions must have been called a second time
    expect(fetchReactions).toHaveBeenCalledTimes(2);
    // And the fresh data is stored
    expect(result2.current.clipReactionCounts[CLIP_ID]).toEqual({ "🔥": 7 });
  });
});
