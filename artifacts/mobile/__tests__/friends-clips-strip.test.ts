/**
 * Friends clips strip — live-update logic harness
 *
 * Tests the WS frame handlers that keep the mobile clip strip in sync
 * with server-push events (clip-uploaded, clip-deleted).  No React
 * component tree is needed: the observable contract is pure state
 * mutation, which is what callers of setClips() see.
 *
 * Covered scenarios:
 *   clip-deleted handler
 *     1. Removes the matching clip from the list
 *     2. Unknown clipId leaves the list unchanged
 *     3. Removes the correct clip when multiple clips are present
 *     4. Handles an empty list safely (no crash)
 *   clip-uploaded handler
 *     5. Sets a refetch-needed flag (simulates cache invalidation)
 *     6. Multiple clip-uploaded events each trigger a refetch
 *   Ordering / interaction
 *     7. Delete then upload: deleted clip stays gone, refetch is triggered
 *     8. Upload then delete: refetch is triggered, then clip disappears
 */

// ── Types (mirrors useFriendsClips / FriendsClip in index.tsx) ───────────────

interface FriendsClip {
  id: number;
  ownerId: number;
  title: string;
  reactionCount: number;
  commentCount: number;
}

// ── Harness ───────────────────────────────────────────────────────────────────
//
// Pure replica of the two WS frame handlers in useFriendsClips.
// `clips` mirrors the React Query cache; `refetchCount` counts how many
// times invalidateQueries would have been called (one per clip-uploaded).

class ClipsStripHarness {
  clips: FriendsClip[] = [];
  refetchCount = 0;

  /** Mirrors the clip-uploaded handler: invalidate (trigger refetch). */
  handleClipUploaded(_frame: { clipId: number; ownerId: number }): void {
    this.refetchCount += 1;
  }

  /** Mirrors the clip-deleted handler: remove clip from cache immediately. */
  handleClipDeleted(frame: { clipId: number; ownerId: number }): void {
    this.clips = this.clips.filter((c) => c.id !== frame.clipId);
  }
}

// ── Fixture builder ───────────────────────────────────────────────────────────

function makeClip(id: number, ownerId = 99): FriendsClip {
  return { id, ownerId, title: `Clip ${id}`, reactionCount: 0, commentCount: 0 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FriendsClipsStrip — clip-deleted WS frame handler', () => {
  let h: ClipsStripHarness;

  beforeEach(() => {
    h = new ClipsStripHarness();
  });

  it('removes the matching clip from the list', () => {
    h.clips = [makeClip(1), makeClip(2), makeClip(3)];

    h.handleClipDeleted({ clipId: 2, ownerId: 99 });

    expect(h.clips).toHaveLength(2);
    expect(h.clips.map((c) => c.id)).toEqual([1, 3]);
  });

  it('leaves the list unchanged when the clipId is not present', () => {
    h.clips = [makeClip(10), makeClip(20)];

    h.handleClipDeleted({ clipId: 999, ownerId: 99 });

    expect(h.clips).toHaveLength(2);
    expect(h.clips.map((c) => c.id)).toEqual([10, 20]);
  });

  it('removes the correct clip when multiple clips are present', () => {
    h.clips = [makeClip(5), makeClip(6), makeClip(7), makeClip(8)];

    h.handleClipDeleted({ clipId: 6, ownerId: 99 });
    h.handleClipDeleted({ clipId: 8, ownerId: 99 });

    expect(h.clips.map((c) => c.id)).toEqual([5, 7]);
  });

  it('handles an empty clip list without throwing', () => {
    h.clips = [];

    expect(() => h.handleClipDeleted({ clipId: 1, ownerId: 99 })).not.toThrow();
    expect(h.clips).toHaveLength(0);
  });
});

describe('FriendsClipsStrip — clip-uploaded WS frame handler', () => {
  let h: ClipsStripHarness;

  beforeEach(() => {
    h = new ClipsStripHarness();
  });

  it('triggers a refetch when a clip-uploaded event arrives', () => {
    h.handleClipUploaded({ clipId: 42, ownerId: 7 });

    expect(h.refetchCount).toBe(1);
  });

  it('triggers a refetch for each clip-uploaded event', () => {
    h.handleClipUploaded({ clipId: 1, ownerId: 7 });
    h.handleClipUploaded({ clipId: 2, ownerId: 8 });
    h.handleClipUploaded({ clipId: 3, ownerId: 9 });

    expect(h.refetchCount).toBe(3);
  });
});

describe('FriendsClipsStrip — handler interaction ordering', () => {
  let h: ClipsStripHarness;

  beforeEach(() => {
    h = new ClipsStripHarness();
  });

  it('delete then upload: deleted clip stays gone, refetch is triggered', () => {
    h.clips = [makeClip(1), makeClip(2)];

    h.handleClipDeleted({ clipId: 1, ownerId: 99 });
    // Simulated refetch would return clips [makeClip(2)] from server;
    // here we just verify the refetch was requested and clip 1 is gone.
    h.handleClipUploaded({ clipId: 3, ownerId: 50 });

    expect(h.clips.map((c) => c.id)).toEqual([2]);
    expect(h.refetchCount).toBe(1);
  });

  it('upload then delete: refetch is triggered, then clip disappears', () => {
    h.clips = [makeClip(10), makeClip(11)];

    h.handleClipUploaded({ clipId: 12, ownerId: 50 });
    // Simulated refetch would append clip 12; here we verify refetch was triggered.
    h.clips.push(makeClip(12)); // simulate what the refetch would bring in

    h.handleClipDeleted({ clipId: 12, ownerId: 50 });

    expect(h.clips.map((c) => c.id)).toEqual([10, 11]);
    expect(h.refetchCount).toBe(1);
  });
});
