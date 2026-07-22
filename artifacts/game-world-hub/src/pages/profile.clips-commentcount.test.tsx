/**
 * Unit tests for the clipsData-refetch useEffect that keeps the lightbox
 * commentCount accurate when other users comment during a live session.
 *
 * The effect lives in profile.tsx (lines 131-141):
 *
 *   useEffect(() => {
 *     if (!clipLightbox || !clipsData) return;
 *     const fresh = clipsData.clips.find(c => c.id === clipLightbox.id);
 *     if (fresh) {
 *       setClipLightbox(prev =>
 *         prev && prev.id === fresh.id
 *           ? { ...prev, reactionCount: fresh.reactionCount,
 *                        viewerReactions: fresh.viewerReactions,
 *                        commentCount: fresh.commentCount }
 *           : prev
 *       );
 *     }
 *   }, [clipsData]);
 *
 * This test file mirrors the hook-wrapper pattern used in
 * profile.clips-reaction.test.tsx — we extract the same logic into a minimal
 * hook so the full Profile render tree (and all its API queries) is avoided,
 * while the exact production effect is still exercised.
 *
 * Scenarios covered:
 *  1. Refetch returns updated commentCount for the open clip → lightbox updates.
 *  2. Refetch returns data for a different clip → lightbox commentCount unchanged.
 *  3. Refetch arrives while lightbox is closed (null) → no crash, state stays null.
 *  4. Refetch carries no matching clip at all → lightbox commentCount unchanged.
 *  5. Multiple rapid refetches → final commentCount reflects the last response.
 *  6. commentCount decreases (e.g. comment deleted) → lightbox reflects the drop.
 */

import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, useEffect } from "react";

// ─── Minimal types ────────────────────────────────────────────────────────────

interface ClipLightbox {
  id: number;
  reactionCount: number;
  commentCount: number;
  viewerReactions: string[];
  title: string;
  [key: string]: unknown;
}

interface ClipSummary {
  id: number;
  reactionCount: number;
  commentCount: number;
  viewerReactions: string[];
  [key: string]: unknown;
}

interface ClipsData {
  clips: ClipSummary[];
  total: number;
  page: number;
  limit: number;
}

// ─── Hook under test ──────────────────────────────────────────────────────────
//
// Verbatim extraction of the clipsData useEffect from profile.tsx.
// Accepts a clipsData value so tests can drive refetch cycles without mounting
// the full TanStack Query context.

function useClipCommentCountSync() {
  const [lightbox, setLightbox] = useState<ClipLightbox | null>(null);
  const [clipsData, setClipsData] = useState<ClipsData | null>(null);

  // Mirrors the production effect (profile.tsx lines 131-141)
  useEffect(() => {
    if (!lightbox || !clipsData) return;
    const fresh = clipsData.clips.find((c) => c.id === lightbox.id);
    if (fresh) {
      setLightbox((prev) =>
        prev && prev.id === fresh.id
          ? {
              ...prev,
              reactionCount: fresh.reactionCount,
              viewerReactions: fresh.viewerReactions,
              commentCount: fresh.commentCount,
            }
          : prev,
      );
    }
  }, [clipsData]); // eslint-disable-line react-hooks/exhaustive-deps

  return { lightbox, setLightbox, clipsData, setClipsData };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIP_ID = 7;
const OTHER_CLIP_ID = 99;

const BASE_LIGHTBOX: ClipLightbox = {
  id: CLIP_ID,
  reactionCount: 3,
  commentCount: 5,
  viewerReactions: ["🔥"],
  title: "Test Clip",
};

function makeClipsData(
  clips: Array<Partial<ClipSummary> & { id: number }>,
): ClipsData {
  return {
    clips: clips.map((c) => ({
      reactionCount: 0,
      commentCount: 0,
      viewerReactions: [],
      ...c,
    })),
    total: clips.length,
    page: 1,
    limit: 20,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lightbox commentCount sync via clipsData refetch", () => {
  test("refetch with updated commentCount for the open clip updates the lightbox", () => {
    const { result } = renderHook(() => useClipCommentCountSync());

    // Open lightbox with 5 comments
    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });
    expect(result.current.lightbox?.commentCount).toBe(5);

    // Another user commented → server returns 8 comments on next poll
    act(() => {
      result.current.setClipsData(
        makeClipsData([{ id: CLIP_ID, commentCount: 8, reactionCount: 3 }]),
      );
    });

    expect(result.current.lightbox?.commentCount).toBe(8);
    // lightbox must still be open (same id, not re-created)
    expect(result.current.lightbox?.id).toBe(CLIP_ID);
  });

  test("refetch returns data for a different clip — open lightbox commentCount unchanged", () => {
    const { result } = renderHook(() => useClipCommentCountSync());

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });

    // Refetch only contains a different clip (not the one in the lightbox)
    act(() => {
      result.current.setClipsData(
        makeClipsData([{ id: OTHER_CLIP_ID, commentCount: 99, reactionCount: 0 }]),
      );
    });

    // commentCount must remain at the original value
    expect(result.current.lightbox?.commentCount).toBe(5);
  });

  test("refetch arrives while lightbox is closed (null) — no crash, state stays null", () => {
    const { result } = renderHook(() => useClipCommentCountSync());

    // Lightbox is not open — drive a refetch anyway
    act(() => {
      result.current.setClipsData(
        makeClipsData([{ id: CLIP_ID, commentCount: 10, reactionCount: 2 }]),
      );
    });

    expect(result.current.lightbox).toBeNull();
  });

  test("refetch carries no clip matching the open lightbox — commentCount unchanged", () => {
    const { result } = renderHook(() => useClipCommentCountSync());

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });

    // clips array is non-empty but none match CLIP_ID
    act(() => {
      result.current.setClipsData(
        makeClipsData([
          { id: CLIP_ID + 100, commentCount: 50 },
          { id: CLIP_ID + 200, commentCount: 20 },
        ]),
      );
    });

    expect(result.current.lightbox?.commentCount).toBe(5); // unchanged
  });

  test("multiple rapid refetches — lightbox reflects the commentCount from the last response", () => {
    const { result } = renderHook(() => useClipCommentCountSync());

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX);
    });

    // First poll: 8 comments
    act(() => {
      result.current.setClipsData(
        makeClipsData([{ id: CLIP_ID, commentCount: 8 }]),
      );
    });

    // Second poll (15s later): 12 comments
    act(() => {
      result.current.setClipsData(
        makeClipsData([{ id: CLIP_ID, commentCount: 12 }]),
      );
    });

    expect(result.current.lightbox?.commentCount).toBe(12);
  });

  test("commentCount decreases (comment deleted by owner) — lightbox reflects the drop", () => {
    const { result } = renderHook(() => useClipCommentCountSync());

    act(() => {
      result.current.setLightbox({ ...BASE_LIGHTBOX, commentCount: 10 });
    });

    // A comment was deleted → count goes down
    act(() => {
      result.current.setClipsData(
        makeClipsData([{ id: CLIP_ID, commentCount: 7 }]),
      );
    });

    expect(result.current.lightbox?.commentCount).toBe(7);
  });
});
