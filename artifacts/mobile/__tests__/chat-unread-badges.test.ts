/**
 * Unread-message badge logic — chat.tsx
 *
 * The ChatScreen keeps a `unread: Record<string, number>` state that tracks
 * how many WS messages have arrived on each inactive channel since the user
 * last visited it.  These tests exercise that logic with the same harness
 * pattern used in chat-channel-switching.test.ts.
 *
 * Covered scenarios:
 *  1. WS frame on active channel → unread count unchanged
 *  2. WS frame on inactive channel → unread count increments
 *  3. Multiple frames on same inactive channel → count accumulates
 *  4. Switching to a channel clears its unread count
 *  5. Switching to a channel leaves other channels' counts intact
 *  6. Active-channel badge is never shown (count always 0 for active channel)
 *  7. Switching back to a channel after accumulating ≥100 messages → count reset
 *  8. Switching to a channel with zero unread is a no-op for the unread map
 *  9. Frames with missing message payload do not affect unread counts
 * 10. Badge count is capped at display level but raw count keeps accumulating
 */

// ── Types (mirrors chat.tsx) ──────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  content: string;
  channel: string;
  createdAt: string;
  author: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: null;
  };
}

// ── Fixture builder ───────────────────────────────────────────────────────────

let _msgId = 1;
function makeMsg(channel: string): ChatMessage {
  const id = _msgId++;
  return {
    id,
    content: `msg-${id}`,
    channel,
    createdAt: new Date().toISOString(),
    author: { id: 1, username: 'u', displayName: 'U', avatarUrl: null },
  };
}

beforeEach(() => { _msgId = 1; });

// ── UnreadHarness ─────────────────────────────────────────────────────────────
//
// Mirrors the unread-badge state machine embedded in ChatScreen:
//  • handleSelectChannel  → clears unread[id], updates channelRef
//  • handleGlobalChatFrame → increments unread[channel] for inactive channels
//  • badgeDisplay(id)     → mirrors the badge render logic (capped at 99+)

class UnreadHarness {
  /** Maps channel id → accumulated unread count */
  unread: Record<string, number> = {};

  /** The currently active channel (mirrors channelRef) */
  private activeChannel = 'general';

  // ── Exact logic from ChatScreen.handleSelectChannel ───────────────────────
  selectChannel(id: string): void {
    if (id === this.activeChannel) return;
    this.activeChannel = id;
    // Clear unread for the channel we switched TO
    if (this.unread[id]) {
      const next = { ...this.unread };
      delete next[id];
      this.unread = next;
    }
  }

  // ── Exact logic from the global_chat WS handler ───────────────────────────
  handleGlobalChatFrame(frame: { message?: ChatMessage }): void {
    if (!frame.message) return;
    if (frame.message.channel !== this.activeChannel) {
      const ch = frame.message.channel;
      this.unread = { ...this.unread, [ch]: (this.unread[ch] ?? 0) + 1 };
    }
    // (active-channel message handling is tested in chat-channel-switching.test.ts)
  }

  // ── Mirrors the badge render expression in ChannelTabs ────────────────────
  badgeDisplay(id: string): string | null {
    const count = this.unread[id] ?? 0;
    if (id === this.activeChannel) return null; // never shown for active tab
    if (count === 0) return null;
    return count > 99 ? '99+' : String(count);
  }

  get activeChannelId(): string { return this.activeChannel; }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatScreen — unread badge state', () => {
  let h: UnreadHarness;

  beforeEach(() => { h = new UnreadHarness(); });

  // ── 1. Active channel frames do not touch unread ───────────────────────────

  it('does not increment unread when a WS frame arrives on the active channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg('general') });

    expect(h.unread['general']).toBeUndefined();
    expect(Object.keys(h.unread)).toHaveLength(0);
  });

  // ── 2. Inactive channel frame increments the count ────────────────────────

  it('increments the unread count for an inactive channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });

    expect(h.unread['lfg']).toBe(1);
  });

  // ── 3. Multiple frames accumulate ─────────────────────────────────────────

  it('accumulates unread counts across multiple frames on the same inactive channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });

    expect(h.unread['lfg']).toBe(3);
  });

  // ── 4. Switching to a channel clears its unread count ─────────────────────

  it('clears the unread count when the user switches to that channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    expect(h.unread['lfg']).toBe(2);

    h.selectChannel('lfg');

    expect(h.unread['lfg']).toBeUndefined();
    expect(h.badgeDisplay('lfg')).toBeNull(); // active tab — no badge
  });

  // ── 5. Switching leaves other channels' counts intact ─────────────────────

  it('leaves other channels unread counts unchanged when switching to a different channel', () => {
    // While on 'general', accumulate on both lfg and trading
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.handleGlobalChatFrame({ message: makeMsg('trading') });

    // Switch to lfg — only lfg should clear
    h.selectChannel('lfg');

    expect(h.unread['lfg']).toBeUndefined();   // cleared
    expect(h.unread['trading']).toBe(1);        // untouched
  });

  // ── 6. Active-channel badge is never rendered ─────────────────────────────

  it('returns null from badgeDisplay for the active channel regardless of state', () => {
    // Manually plant a value (shouldn't happen via normal flow, but guards the render)
    h.unread['general'] = 5;

    expect(h.badgeDisplay('general')).toBeNull();
  });

  // ── 7. Count resets to zero when switching back after heavy traffic ────────

  it('resets the badge after 100+ messages when the user finally visits the channel', () => {
    for (let i = 0; i < 120; i++) {
      h.handleGlobalChatFrame({ message: makeMsg('trading') });
    }
    expect(h.unread['trading']).toBe(120);
    expect(h.badgeDisplay('trading')).toBe('99+'); // capped display

    h.selectChannel('trading');

    expect(h.unread['trading']).toBeUndefined();
    expect(h.badgeDisplay('trading')).toBeNull(); // active — no badge shown
  });

  // ── 8. Switching to a zero-unread channel is a no-op for the map ──────────

  it('does not mutate the unread map when switching to a channel with zero unread', () => {
    h.handleGlobalChatFrame({ message: makeMsg('lfg') }); // lfg=1
    const before = { ...h.unread };

    h.selectChannel('trading'); // trading has 0 unread — switching should be a no-op for the map

    expect(h.unread).toEqual(before); // lfg=1 still there, nothing else changed
  });

  // ── 9. Malformed frame (no message) does not affect unread ────────────────

  it('ignores a global_chat frame with no message payload', () => {
    h.handleGlobalChatFrame({});

    expect(Object.keys(h.unread)).toHaveLength(0);
  });

  // ── 10. Badge display format: ≤99 shows number, >99 shows "99+" ───────────

  it('shows the raw number when count is ≤ 99', () => {
    for (let i = 0; i < 42; i++) {
      h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    }
    expect(h.badgeDisplay('lfg')).toBe('42');
  });

  it('shows "99+" when count exceeds 99', () => {
    for (let i = 0; i < 100; i++) {
      h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    }
    expect(h.badgeDisplay('lfg')).toBe('99+');
  });

  // ── 11. Cross-channel independence ────────────────────────────────────────

  it('tracks unread counts independently for each inactive channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.handleGlobalChatFrame({ message: makeMsg('trading') });
    h.handleGlobalChatFrame({ message: makeMsg('trading') });
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });

    expect(h.unread['lfg']).toBe(2);
    expect(h.unread['trading']).toBe(2);
    expect(h.badgeDisplay('lfg')).toBe('2');
    expect(h.badgeDisplay('trading')).toBe('2');
  });

  // ── 12. Re-accumulates after clear ────────────────────────────────────────

  it('re-accumulates unread count if new frames arrive after the user switched away again', () => {
    // Accumulate on lfg → switch to lfg (clears) → switch back to general → new frames on lfg
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });
    h.selectChannel('lfg');     // clears lfg badge
    expect(h.unread['lfg']).toBeUndefined();

    h.selectChannel('general'); // move back to general

    h.handleGlobalChatFrame({ message: makeMsg('lfg') }); // new activity on lfg
    h.handleGlobalChatFrame({ message: makeMsg('lfg') });

    expect(h.unread['lfg']).toBe(2);
    expect(h.badgeDisplay('lfg')).toBe('2');
  });
});
