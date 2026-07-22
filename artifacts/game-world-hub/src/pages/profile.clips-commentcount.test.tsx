/**
 * Unit tests for commentCount sync in the clip lightbox. Two distinct paths
 * are exercised:
 *
 * PATH A — clipsData-refetch effect (lines 131-141 in profile.tsx)
 *   Keeps the lightbox commentCount accurate when *other* users comment or
 *   delete comments during a live session. The effect fires whenever the
 *   15-second poll returns fresh data.
 *
 * PATH B — optimistic update on self-delete
 *   When the viewer deletes their own clip comment the UI must decrement
 *   commentCount immediately (before the mutation resolves), mirroring the
 *   same pattern used for reaction toggling. If the mutation fails the
 *   previous count is restored.
 *
 * Both hooks use the same minimal wrapper pattern from
 * profile.clips-reaction.test.tsx so the full Profile render tree (and all
 * its TanStack Query context) is avoided.
 *
 * Scenarios covered:
 *  PATH A
 *  1. Refetch returns updated commentCount for the open clip → lightbox updates.
 *  2. Refetch returns data for a different clip → lightbox commentCount unchanged.
 *  3. Refetch arrives while lightbox is closed (null) → no crash, state stays null.
 *  4. Refetch carries no matching clip at all → lightbox commentCount unchanged.
 *  5. Multiple rapid refetches → final commentCount reflects the last response.
 *  6. commentCount decreases (e.g. comment deleted) → lightbox reflects the drop.
 *
 *  PATH B
 *  7.  Viewer deletes their own comment → commentCount decrements immediately.
 *  8.  Deleting the last comment (count was 1) → count reaches 0, never below.
 *  9.  Delete called for a different clip → open lightbox commentCount unchanged.
 *  10. Delete called while lightbox is closed → no crash, state stays null.
 *  11. Rollback on mutation error → previous commentCount is restored.
 *  12. Two sequential deletes → count decrements twice.
 */

import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, useEffect, useRef } from "react";

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

// ─── PATH B: Optimistic self-delete hook ──────────────────────────────────────
//
// Extracts the optimistic update logic that the production code applies when
// the viewer deletes their own clip comment.  The pattern mirrors the reaction-
// toggle handler in profile.tsx: decrement immediately, then reconcile with
// the server response (or roll back on error).
//
// Production equivalent (profile.tsx handleDeleteClipComment):
//
//   // 1. Capture previous count for rollback
//   const previous = clipLightbox.commentCount;
//   // 2. Optimistic decrement
//   setClipLightbox(prev =>
//     prev && prev.id === clipId
//       ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) }
//       : prev
//   );
//   try {
//     await customFetch(`/api/clips/${clipId}/comments/${commentId}`, { method: "DELETE" });
//   } catch {
//     // 3. Roll back on error
//     setClipLightbox(prev =>
//       prev && prev.id === clipId
//         ? { ...prev, commentCount: previous }
//         : prev
//     );
//   }

function useClipCommentDeleteOptimistic() {
  const [lightbox, setLightbox] = useState<ClipLightbox | null>(null);

  // Keep a ref in sync so optimisticDelete can read the current count
  // synchronously — the state updater runs asynchronously, so reading
  // `prev.commentCount` inside setLightbox and returning it would always
  // yield 0 before React flushes the update.
  const lightboxRef = useRef(lightbox);
  lightboxRef.current = lightbox;

  /**
   * Apply optimistic decrement for a comment deletion on `clipId`.
   * Returns the count that was in place before the decrement so the caller
   * can pass it to `rollback` if the mutation fails.
   */
  const optimisticDelete = (clipId: number): number => {
    const current = lightboxRef.current;
    const previous = current?.id === clipId ? current.commentCount : 0;
    setLightbox((prev) => {
      if (!prev || prev.id !== clipId) return prev;
      return { ...prev, commentCount: Math.max(0, prev.commentCount - 1) };
    });
    return previous;
  };

  /**
   * Restore the count that was captured before the optimistic decrement.
   * Called when the deletion mutation rejects.
   */
  const rollback = (clipId: number, previousCount: number) => {
    setLightbox((prev) => {
      if (!prev || prev.id !== clipId) return prev;
      return { ...prev, commentCount: previousCount };
    });
  };

  return { lightbox, setLightbox, optimisticDelete, rollback };
}

// ─── Path B tests ─────────────────────────────────────────────────────────────

describe("lightbox commentCount optimistic update on self-delete", () => {
  test("viewer deletes their own comment — commentCount decrements immediately", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    // Open lightbox with 5 comments
    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX); // commentCount: 5
    });
    expect(result.current.lightbox?.commentCount).toBe(5);

    // Viewer deletes one comment — optimistic update fires before the API call
    act(() => {
      result.current.optimisticDelete(CLIP_ID);
    });

    expect(result.current.lightbox?.commentCount).toBe(4);
    // Lightbox must still be open — same object, not re-created
    expect(result.current.lightbox?.id).toBe(CLIP_ID);
  });

  test("deleting the last comment (count was 1) brings commentCount to 0, not below", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    act(() => {
      result.current.setLightbox({ ...BASE_LIGHTBOX, commentCount: 1 });
    });

    act(() => {
      result.current.optimisticDelete(CLIP_ID);
    });

    expect(result.current.lightbox?.commentCount).toBe(0);
  });

  test("count was already 0 — optimistic delete does not go negative", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    act(() => {
      result.current.setLightbox({ ...BASE_LIGHTBOX, commentCount: 0 });
    });

    act(() => {
      result.current.optimisticDelete(CLIP_ID);
    });

    expect(result.current.lightbox?.commentCount).toBe(0);
  });

  test("delete called for a different clip — open lightbox commentCount unchanged", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    act(() => {
      result.current.setLightbox(BASE_LIGHTBOX); // commentCount: 5, id: CLIP_ID
    });

    act(() => {
      result.current.optimisticDelete(OTHER_CLIP_ID); // different clip
    });

    expect(result.current.lightbox?.commentCount).toBe(5); // unchanged
    expect(result.current.lightbox?.id).toBe(CLIP_ID);
  });

  test("delete called while lightbox is closed (null) — no crash, state stays null", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    // Lightbox is not open
    act(() => {
      result.current.optimisticDelete(CLIP_ID);
    });

    expect(result.current.lightbox).toBeNull();
  });

  test("rollback on mutation error — previous commentCount is restored", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    act(() => {
      result.current.setLightbox({ ...BASE_LIGHTBOX, commentCount: 4 });
    });

    let savedPrevious = 0;

    // Apply optimistic decrement and capture the previous count
    act(() => {
      savedPrevious = result.current.optimisticDelete(CLIP_ID);
    });

    // Count should have dropped to 3 optimistically
    expect(result.current.lightbox?.commentCount).toBe(3);
    expect(savedPrevious).toBe(4);

    // Simulate mutation failure — roll back
    act(() => {
      result.current.rollback(CLIP_ID, savedPrevious);
    });

    expect(result.current.lightbox?.commentCount).toBe(4);
  });

  test("two sequential self-deletes — commentCount decrements twice", () => {
    const { result } = renderHook(() => useClipCommentDeleteOptimistic());

    act(() => {
      result.current.setLightbox({ ...BASE_LIGHTBOX, commentCount: 5 });
    });

    act(() => {
      result.current.optimisticDelete(CLIP_ID);
    });
    act(() => {
      result.current.optimisticDelete(CLIP_ID);
    });

    expect(result.current.lightbox?.commentCount).toBe(3);
  });
});
