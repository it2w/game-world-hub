/**
 * Frontend unit tests — Task #230
 *
 * Confirms that when a `gwh:message-edit` CustomEvent fires on window,
 * the GlobalChat component applies the updated content and `editedAt`
 * to the matching message, causing the "(edited)" label to appear in
 * the DOM without any page reload.
 *
 * All external dependencies (API fetch, toast, i18n, router, WS) are
 * stubbed.  Messages are seeded by firing a `gwh:global-chat` event
 * (the same path the production WS bridge uses).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { GlobalChat } from "./global-chat";

// jsdom does not implement scrollIntoView — patch it globally for all tests.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/pro-badge", () => ({
  ProBadge: () => <span data-testid="pro-badge" />,
}));

// customFetch is called on mount (loadMessages, loadPinned, active-count).
// Return sensible empty/null defaults so the component does not crash.
vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(async (url: string) => {
    if (url.includes("active-count")) return { count: 0 };
    if (url.includes("pinned"))       return null;
    return [];                         // messages list
  }),
}));

// react-i18next — return the key so we can match on predictable strings.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && Object.keys(opts).length > 0) {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// ── Shared test data ──────────────────────────────────────────────────────────

const ME = {
  id: 1,
  username: "testuser",
  displayName: "Test User",
  isPro: true,
  isAdmin: false,
};

const OTHER_AUTHOR = {
  id: 99,
  username: "other",
  displayName: "Other User",
  avatarUrl: null,
  isPro: false,
};

function makeMessage(overrides: Partial<{
  id: number;
  content: string;
  editedAt: string | undefined;
  userId: number;
  author: typeof OTHER_AUTHOR;
}> = {}) {
  return {
    id: 42,
    userId: OTHER_AUTHOR.id,
    content: "original message content",
    channel: "general",
    messageType: "text" as const,
    metadata: {},
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    editedAt: undefined,
    author: OTHER_AUTHOR,
    reactions: [],
    replyTo: null,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fire a gwh:global-chat event to seed a message into GlobalChat state. */
function fireNewMessage(msg: ReturnType<typeof makeMessage>) {
  window.dispatchEvent(
    new CustomEvent("gwh:global-chat", { detail: msg }),
  );
}

/** Fire a gwh:message-edit event as the WS bridge does. */
function fireMessageEdit(payload: {
  messageId: number;
  content: string;
  editedAt: string;
  channel: string;
}) {
  window.dispatchEvent(
    new CustomEvent("gwh:message-edit", { detail: payload }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GlobalChat — gwh:message-edit event handling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "shows the (edited) label after receiving a gwh:message-edit event for a message authored by another user",
    async () => {
      render(<GlobalChat me={ME} />);

      const msg = makeMessage({ id: 42 });

      // Seed the message via the same WS event path that production uses.
      act(() => {
        fireNewMessage(msg);
      });

      // The original message text should be visible; the edited label must not exist yet.
      expect(screen.getByText("original message content")).toBeInTheDocument();
      expect(screen.queryByText("chat.edited")).not.toBeInTheDocument();

      // Simulate the WS broadcast that arrives after another client edits the message.
      const editedAt = new Date().toISOString();
      act(() => {
        fireMessageEdit({
          messageId: 42,
          content: "edited message content",
          editedAt,
          channel: "general",
        });
      });

      // The "(edited)" label (rendered as the i18n key "chat.edited") must now appear.
      expect(screen.getByText("chat.edited")).toBeInTheDocument();

      // Content must be updated to the new text.
      expect(screen.getByText("edited message content")).toBeInTheDocument();
      expect(screen.queryByText("original message content")).not.toBeInTheDocument();
    },
  );

  test(
    "edit events for a different channel are ignored",
    async () => {
      render(<GlobalChat me={ME} />);

      const msg = makeMessage({ id: 77 });

      act(() => {
        fireNewMessage(msg);
      });

      expect(screen.getByText("original message content")).toBeInTheDocument();

      // Fire an edit event for a *different* channel.
      act(() => {
        fireMessageEdit({
          messageId: 77,
          content: "cross-channel edit (should be ignored)",
          editedAt: new Date().toISOString(),
          channel: "lfg",    // component is on "general"
        });
      });

      // Content must remain unchanged; no edited label.
      expect(screen.getByText("original message content")).toBeInTheDocument();
      expect(screen.queryByText("chat.edited")).not.toBeInTheDocument();
      expect(screen.queryByText("cross-channel edit (should be ignored)")).not.toBeInTheDocument();
    },
  );

  test(
    "edit events for an unknown message id are silently ignored",
    async () => {
      render(<GlobalChat me={ME} />);

      const msg = makeMessage({ id: 55 });

      act(() => {
        fireNewMessage(msg);
      });

      // Fire an edit for a non-existent message id.
      act(() => {
        fireMessageEdit({
          messageId: 9999,
          content: "edit for ghost message",
          editedAt: new Date().toISOString(),
          channel: "general",
        });
      });

      // The original message must still be shown unmodified.
      expect(screen.getByText("original message content")).toBeInTheDocument();
      expect(screen.queryByText("chat.edited")).not.toBeInTheDocument();
    },
  );

  test(
    "a message that arrives already edited shows the (edited) label immediately",
    async () => {
      render(<GlobalChat me={ME} />);

      // This can happen when the client loads history after an edit was made.
      const alreadyEdited = makeMessage({
        id: 11,
        content: "pre-edited content",
        editedAt: new Date(Date.now() - 30_000).toISOString(),
      });

      act(() => {
        fireNewMessage(alreadyEdited);
      });

      expect(screen.getByText("pre-edited content")).toBeInTheDocument();
      expect(screen.getByText("chat.edited")).toBeInTheDocument();
    },
  );
});
