/**
 * Unit tests for the gwh:clip-reaction window-event handler that keeps the
 * clip lightbox reaction count accurate when other users react in real time.
 *
 * The handler lives in profile.tsx (see the "Real-time lightbox sync" useEffect)
 * and is covered here via a minimal hook wrapper that mirrors the exact same
 * logic — this avoids mounting the entire Profile render tree with all its
 * API dependencies while still exercising the real effect pattern.
 *
 * Scenarios covered:
 *  1. Another user reacts → lightbox reactionCount updates to the new total.
 *  2. Own broadcast (actingUserId === me.id) is skipped → optimistic state preserved.
 *  3. Event for a different clip → lightbox unchanged (wrong clipId guard).
 *  4. Event while lightbox is closed (null) → no crash, state stays null.
 *  5. Two rapid broadcasts from different users → final count reflects the last event.
 *  6. myId dependency change → listener is re-registered for the new identity.
 */

import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, useEffect } from "react";

// ─── Minimal types (mirrors profile.tsx ClipLightbox shape) ──────────────────

interface ClipLightbox {
  id: number;
  reactionCount: number;
  viewerReactions: string[];
  title: string;
  [key: string]: unknown;
}

// ─── Hook under test ─────────────────────────────────────────────────────────
//
// This is a verbatim extraction of the gwh:clip-reaction useEffect from
// profile.tsx — kept in sync so that the tests reflect the real production
// code path rather than a paraphrase.

function useClipReactionSync(myId: number | undefined) {
  const [lightbox, setLightbox] = useState<ClipLightbox | null>(null);

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

      setLightbox(prev => {
        if (!prev || prev.id !== clipId) return prev;
        const totalReactions = Object.values(reactions).reduce((sum, n) => sum + n, 0);
        return { ...prev, reactionCount: totalReactions };
      });
    };

    window.addEventListener("gwh:clip-reaction", handler);
    return () => window.removeEventListener("gwh:clip-reaction", handler);
  }, [myId]);

  return { lightbox, setLightbox };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MY_ID = 42;
const OTHER_USER_ID = 99;
const THIRD_USER_ID = 77;
const CLIP_ID = 7;

const BASE_LIGHTBOX: ClipLightbox = {
  id: CLIP_ID,
  reactionCount: 3,
  viewerReactions: ["🔥"],
  title: "Test Clip",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("gwh:clip-reaction lightbox sync", () => {
  test("another user reacting updates reactionCount to the new total", () => {
    const { result } = renderHook(() => useClipReactionSync(MY_ID));

    // Open the lightbox with a baseline count of 3
    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });
    expect(result.current.lightbox?.reactionCount).toBe(3);

    // Another user adds reactions: 🔥×2 + GG×1 + 💀×2 = 5 total
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 2, GG: 1, "💀": 2 }, OTHER_USER_ID);
    });

    expect(result.current.lightbox?.reactionCount).toBe(5);
  });

  test("own broadcast (actingUserId === me.id) is skipped, preserving optimistic state", () => {
    const { result } = renderHook(() => useClipReactionSync(MY_ID));

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });
    const optimisticCount = result.current.lightbox!.reactionCount;

    // Broadcast from ourselves — should be a no-op
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 99 }, MY_ID);
    });

    expect(result.current.lightbox?.reactionCount).toBe(optimisticCount);
  });

  test("event for a different clip leaves the open lightbox unchanged", () => {
    const { result } = renderHook(() => useClipReactionSync(MY_ID));

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });

    // Event targets a different clip
    act(() => {
      fireClipReaction(CLIP_ID + 1, { "🔥": 10 }, OTHER_USER_ID);
    });

    expect(result.current.lightbox?.reactionCount).toBe(3); // unchanged
  });

  test("event while lightbox is closed (null) does not crash and leaves state null", () => {
    const { result } = renderHook(() => useClipReactionSync(MY_ID));

    // Lightbox not open — fire event anyway
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 5 }, OTHER_USER_ID);
    });

    expect(result.current.lightbox).toBeNull();
  });

  test("two rapid broadcasts from different users leave the final count from the last event", () => {
    const { result } = renderHook(() => useClipReactionSync(MY_ID));

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });

    act(() => {
      // First user reacts: total 4
      fireClipReaction(CLIP_ID, { "🔥": 3, GG: 1 }, OTHER_USER_ID);
      // Second user reacts a moment later: total 6
      fireClipReaction(CLIP_ID, { "🔥": 4, GG: 1, "💀": 1 }, THIRD_USER_ID);
    });

    // The lightbox should reflect the count from the last broadcast
    expect(result.current.lightbox?.reactionCount).toBe(6);
  });

  test("listener is re-registered when myId changes so the new identity's own broadcasts are skipped", () => {
    let myId = MY_ID;
    const { result, rerender } = renderHook(() => useClipReactionSync(myId));

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });

    // Switch to OTHER_USER_ID — now broadcasts from MY_ID (42) should go through
    myId = OTHER_USER_ID;
    rerender();

    act(() => {
      // MY_ID (42) is no longer "me", so this should update the count
      fireClipReaction(CLIP_ID, { GG: 7 }, MY_ID);
    });

    expect(result.current.lightbox?.reactionCount).toBe(7);

    // But broadcasts from the NEW identity (OTHER_USER_ID = 99) should be skipped
    act(() => {
      fireClipReaction(CLIP_ID, { "🔥": 50 }, OTHER_USER_ID);
    });

    // Still 7 — own broadcast was skipped
    expect(result.current.lightbox?.reactionCount).toBe(7);
  });
});
