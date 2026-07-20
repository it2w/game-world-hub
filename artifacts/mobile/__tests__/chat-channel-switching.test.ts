/**
 * Channel-switching race-condition guard — chat.tsx load() logic
 *
 * The ChatScreen uses a monotonically-increasing token (loadTokenRef) so that
 * a stale fetch response from a previous channel cannot overwrite the messages
 * for the newly-selected channel.
 *
 * These tests exercise that guard directly, using a harness that mirrors the
 * exact load() / loadTokenRef pattern from artifacts/mobile/app/(tabs)/chat.tsx.
 * No React component tree is needed: the observable contract is pure state
 * mutation, which is what callers of setMessages() / setError() see.
 *
 * Covered scenarios:
 *  1. Single fetch completes normally — messages are applied
 *  2. Fast switch (old resolves last) — stale response is silently discarded
 *  3. Triple-switch — only the third channel's messages survive
 *  4. Stale error after fast switch — error is discarded, new channel loads fine
 *  5. Switching back to the same channel does not restart the load
 *  6. WS global_chat frame for the wrong channel is ignored
 *  7. WS global_chat frame for the correct channel is accepted
 *  8. WS global_chat_delete removes a message regardless of channel
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

// ── Deferred helper ───────────────────────────────────────────────────────────

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeMsg(id: number, channel: string): ChatMessage {
  return {
    id,
    content: `msg-${id}`,
    channel,
    createdAt: new Date().toISOString(),
    author: { id: 1, username: 'u', displayName: 'U', avatarUrl: null },
  };
}

// ── ChatLogicHarness ─────────────────────────────────────────────────────────
//
// Exact replica of the load() / loadTokenRef pattern in chat.tsx.
// State mutations replace the React setState calls so we can assert
// on them synchronously after awaiting.

class ChatLogicHarness {
  // Public state — corresponds to React state in ChatScreen
  messages: ChatMessage[]  = [];
  loading: boolean         = false;
  error:   string | null   = null;
  channel: string          = 'general';

  // Refs — corresponds to loadTokenRef and channelRef in ChatScreen
  private tokenRef:   { current: number } = { current: 0 };
  private channelRef: { current: string } = { current: 'general' };

  /**
   * Inject a controlled fetch implementation.
   * In production code this is `fetchMessages(ch)` → `customFetch(...)`.
   */
  fetchImpl: jest.Mock<Promise<ChatMessage[]>, [string]> = jest.fn();

  // ── load() — exact copy of ChatScreen.load ──────────────────────────────
  async load(ch: string): Promise<void> {
    const token = ++this.tokenRef.current;
    this.loading = true;
    this.error   = null;
    try {
      const msgs = await this.fetchImpl(ch);
      // Only apply results if no newer request superseded this one
      if (token !== this.tokenRef.current) return;
      this.messages = msgs;
    } catch {
      if (token !== this.tokenRef.current) return;
      this.error = 'Failed to load messages.';
    } finally {
      if (token === this.tokenRef.current) this.loading = false;
    }
  }

  // ── handleSelectChannel() — exact copy of ChatScreen.handleSelectChannel ─
  selectChannel(id: string): boolean {
    if (id === this.channelRef.current) return false; // no-op, same channel
    this.messages        = [];
    this.channel         = id;
    this.channelRef.current = id;
    return true; // switched
  }

  // ── WS frame handlers (exact copies from ChatScreen) ─────────────────────

  handleGlobalChatFrame(frame: { message?: ChatMessage }): void {
    if (!frame.message) return;
    if (frame.message.channel !== this.channelRef.current) return;
    if (this.messages.some((m) => m.id === frame.message!.id)) return;
    this.messages = [...this.messages, frame.message];
  }

  handleGlobalChatDeleteFrame(frame: { messageId: number }): void {
    this.messages = this.messages.filter((m) => m.id !== frame.messageId);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatScreen — load() race-condition guard (loadTokenRef)', () => {

  let h: ChatLogicHarness;

  beforeEach(() => {
    h = new ChatLogicHarness();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────

  it('applies messages when a single fetch completes normally', async () => {
    const msgs = [makeMsg(1, 'general'), makeMsg(2, 'general')];
    h.fetchImpl.mockResolvedValueOnce(msgs);

    await h.load('general');

    expect(h.messages).toEqual(msgs);
    expect(h.loading).toBe(false);
    expect(h.error).toBeNull();
  });

  // ── 2. Fast switch — old fetch resolves after new one started ─────────────

  it('discards a stale response when the user switches channels before it resolves', async () => {
    // Set up two deferred promises so we control when each resolves
    const generalDefer  = deferred<ChatMessage[]>();
    const lfgDefer      = deferred<ChatMessage[]>();

    const generalMsgs   = [makeMsg(10, 'general')];
    const lfgMsgs       = [makeMsg(20, 'lfg')];

    // fetchImpl returns different deferreds for each channel
    h.fetchImpl
      .mockReturnValueOnce(generalDefer.promise)   // first call: general
      .mockReturnValueOnce(lfgDefer.promise);      // second call: lfg

    // Start loading 'general' — does NOT await yet (fetch is still in-flight)
    const generalLoad = h.load('general');

    // User switches to 'lfg' before the first fetch resolves — start second load
    h.selectChannel('lfg');
    const lfgLoad = h.load('lfg');

    // Now resolve the lfg fetch first, then the older general fetch
    lfgDefer.resolve(lfgMsgs);
    await lfgLoad;

    generalDefer.resolve(generalMsgs);    // stale response resolves AFTER new one
    await generalLoad;

    // Only lfg messages must survive — the general response must be discarded
    expect(h.messages).toEqual(lfgMsgs);
    expect(h.messages.every((m) => m.channel === 'lfg')).toBe(true);
    expect(h.messages.some((m) => m.channel === 'general')).toBe(false);
  });

  // ── 3. Triple switch — only the last channel survives ─────────────────────

  it('discards two stale responses when the user switches channels three times rapidly', async () => {
    const d1 = deferred<ChatMessage[]>(); // general
    const d2 = deferred<ChatMessage[]>(); // lfg
    const d3 = deferred<ChatMessage[]>(); // trading

    h.fetchImpl
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise)
      .mockReturnValueOnce(d3.promise);

    // Fire three loads in rapid succession
    const p1 = h.load('general');
    h.selectChannel('lfg');
    const p2 = h.load('lfg');
    h.selectChannel('trading');
    const p3 = h.load('trading');

    // Resolve in reverse order (worst-case: oldest resolves last)
    d3.resolve([makeMsg(300, 'trading')]);
    await p3;

    d2.resolve([makeMsg(200, 'lfg')]);
    await p2;

    d1.resolve([makeMsg(100, 'general')]);
    await p1;

    // Only trading (the last switch) must survive
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0].channel).toBe('trading');
    expect(h.messages[0].id).toBe(300);
  });

  // ── 4. Stale error is discarded ───────────────────────────────────────────

  it('discards a stale fetch error when the user switches channels mid-flight', async () => {
    const d1 = deferred<ChatMessage[]>(); // general (will error)
    const d2 = deferred<ChatMessage[]>(); // lfg (will succeed)

    h.fetchImpl
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);

    const p1 = h.load('general');

    h.selectChannel('lfg');
    const p2 = h.load('lfg');

    // lfg resolves successfully first
    d2.resolve([makeMsg(500, 'lfg')]);
    await p2;

    // general rejects (network error) after lfg already finished
    d1.reject(new Error('network error'));
    await p1;

    // Error from the stale general load must NOT surface
    expect(h.error).toBeNull();
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0].channel).toBe('lfg');
  });

  // ── 5. Same-channel switch is a no-op ─────────────────────────────────────

  it('does not restart the load when selecting the already-active channel', async () => {
    h.fetchImpl.mockResolvedValue([makeMsg(1, 'general')]);
    await h.load('general');

    const switched = h.selectChannel('general'); // same channel — no-op
    expect(switched).toBe(false);

    // fetchImpl must not have been called a second time
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });

  // ── 6. Concurrent loads — loading flag clears only for winner ─────────────

  it('clears loading=false only once the winning (latest) fetch resolves', async () => {
    const d1 = deferred<ChatMessage[]>();
    const d2 = deferred<ChatMessage[]>();

    h.fetchImpl
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);

    const p1 = h.load('general');
    expect(h.loading).toBe(true);

    h.selectChannel('lfg');
    const p2 = h.load('lfg');
    expect(h.loading).toBe(true); // still loading

    // Stale general fetch resolves — loading must remain true (lfg still in-flight)
    d1.resolve([makeMsg(1, 'general')]);
    await p1;
    expect(h.loading).toBe(true); // stale load must NOT flip loading off

    // Winning lfg fetch resolves
    d2.resolve([makeMsg(2, 'lfg')]);
    await p2;
    expect(h.loading).toBe(false); // now it's off
  });
});

// ── WS frame filtering tests ──────────────────────────────────────────────────

describe('ChatScreen — WS channel filtering (channelRef)', () => {

  let h: ChatLogicHarness;

  beforeEach(() => {
    h = new ChatLogicHarness();
    // Start on 'general'
    h.messages = [makeMsg(1, 'general')];
  });

  // ── 6. Wrong-channel WS frame is ignored ─────────────────────────────────

  it('ignores a global_chat WS frame belonging to a different channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg(99, 'lfg') });

    expect(h.messages).toHaveLength(1);
    expect(h.messages[0].id).toBe(1); // original message untouched
  });

  // ── 7. Correct-channel WS frame is accepted ───────────────────────────────

  it('appends a global_chat WS frame that matches the active channel', () => {
    h.handleGlobalChatFrame({ message: makeMsg(2, 'general') });

    expect(h.messages).toHaveLength(2);
    expect(h.messages[1].id).toBe(2);
  });

  // ── 8. Duplicate WS frame is deduplicated ─────────────────────────────────

  it('does not duplicate a message if the WS frame arrives twice', () => {
    const msg = makeMsg(1, 'general');
    h.handleGlobalChatFrame({ message: msg });
    h.handleGlobalChatFrame({ message: msg });

    expect(h.messages).toHaveLength(1);
  });

  // ── 9. Delete frame removes message regardless of active channel ──────────

  it('removes a message via global_chat_delete regardless of the active channel', () => {
    // Switch channel — the message id=1 is from 'general' but delete must still work
    h.selectChannel('lfg');
    h.handleGlobalChatDeleteFrame({ messageId: 1 });

    expect(h.messages).toHaveLength(0);
  });

  // ── 10. Frame with no message property is ignored ─────────────────────────

  it('ignores a global_chat frame with no message payload', () => {
    h.handleGlobalChatFrame({}); // malformed frame

    expect(h.messages).toHaveLength(1); // unchanged
  });

  // ── 11. After channel switch WS frame for old channel is blocked ──────────

  it('blocks WS frames for the previous channel after switching away', () => {
    // User is on 'general', then switches to 'lfg'
    h.selectChannel('lfg');

    // A WS frame arrives for 'general' (old channel) — must be discarded
    h.handleGlobalChatFrame({ message: makeMsg(50, 'general') });

    // Only the pre-existing message from general remains (from before switch)
    // BUT selectChannel clears messages[], so messages should be empty now
    // except the WS frame was rejected — so still 0 messages
    expect(h.messages).toHaveLength(0);
  });
});
