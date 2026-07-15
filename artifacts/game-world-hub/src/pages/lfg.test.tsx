import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Lfg from "./lfg";

/**
 * Coverage for the close-signal confirmation dialog in lfg.tsx.
 *
 * The dialog surfaces when a post author clicks CLOSE on their own open post.
 * It lists every responder so the author can visit profiles before finalising,
 * then either fires the close mutation (CLOSE SIGNAL) or does nothing (CANCEL).
 * When there are no responders it shows a placeholder message instead.
 *
 * The API / React-Query / router layers are all stubbed — only the dialog's own
 * interaction logic is under test.
 */

// ─── Hoisted fakes ────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const closeMutate = vi.fn();
  const invalidateQueries = vi.fn();

  // Mutable slot: individual tests set this before rendering.
  let currentPosts: unknown[] = [];

  // Mutable slot: controls close mutation pending state.
  let closeIsPending = false;

  return {
    closeMutate,
    invalidateQueries,
    getPosts: () => currentPosts,
    setPosts: (p: unknown[]) => { currentPosts = p; },
    getCloseIsPending: () => closeIsPending,
    setCloseIsPending: (v: boolean) => { closeIsPending = v; },
  };
});

// ─── Shared test data ─────────────────────────────────────────────────────────

const ME = { id: 1, username: "author", displayName: "Author", avatarUrl: null };

const POST_WITH_RESPONDERS = {
  id: "post-1",
  game: "Valorant",
  platform: "PC",
  rank: "Diamond",
  neededPlayers: 2,
  micRequired: true,
  description: "Need 2 more for ranked",
  status: "open",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  responseCount: 2,
  viewerHasResponded: false,
  author: ME,
  responders: [
    { id: 10, username: "player1", displayName: "Player One", avatarUrl: null },
    { id: 11, username: "player2", displayName: "Player Two", avatarUrl: "https://example.com/p2.jpg" },
  ],
};

const POST_NO_RESPONDERS = {
  ...POST_WITH_RESPONDERS,
  id: "post-empty",
  game: "Apex Legends",
  responseCount: 0,
  responders: [],
};

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: () => ({ data: ME }),
  // Reads from h.getPosts() at render-time so each test can control the data.
  useListLfgPosts: () => ({ data: h.getPosts(), isLoading: false }),
  useCreateLfgPost: () => ({ mutate: vi.fn(), isPending: false }),
  useRespondToLfgPost: () => ({ mutate: vi.fn(), isPending: false }),
  useCloseLfgPost: () => ({ mutate: h.closeMutate, isPending: h.getCloseIsPending() }),
  useDeleteLfgPost: () => ({ mutate: vi.fn(), isPending: false }),
  useListParties: () => ({ data: [] }),
  useInviteToParty: () => ({ mutate: vi.fn(), isPending: false }),
  getListLfgPostsQueryKey: () => ["lfg-posts"],
  getGetMeQueryKey: () => ["me"],
  getListPartiesQueryKey: () => ["parties"],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Click the first CLOSE button to open the confirmation dialog. */
function openCloseDialog() {
  // The post list has one "CLOSE" button (the card-level action, not the dialog action).
  const closeBtns = screen.getAllByRole("button", { name: /close/i });
  // The card CLOSE button is the first one; the dialog's buttons don't exist yet.
  fireEvent.click(closeBtns[0]);
}

function getConfirmButton() {
  return screen.getByRole("button", { name: /close signal/i });
}

function getCancelButton() {
  return screen.getByRole("button", { name: /^cancel$/i });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: post with responders.
  h.setPosts([POST_WITH_RESPONDERS]);

  h.closeMutate.mockReset();
  h.invalidateQueries.mockReset();

  // Default: close mutation is not pending.
  h.setCloseIsPending(false);

  // Simulate a successful close so onSuccess callbacks fire.
  h.closeMutate.mockImplementation(
    (_args: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    },
  );
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LFG close-signal dialog — with responders", () => {
  test("clicking CLOSE opens the dialog and lists all responders", () => {
    render(<Lfg />);

    openCloseDialog();

    // Dialog heading is visible.
    expect(
      screen.getByRole("heading", { name: /close signal/i }),
    ).toBeInTheDocument();

    // Both responders are shown by display name …
    expect(screen.getByText("Player One")).toBeInTheDocument();
    expect(screen.getByText("Player Two")).toBeInTheDocument();

    // … and by username handle.
    expect(screen.getByText("@player1")).toBeInTheDocument();
    expect(screen.getByText("@player2")).toBeInTheDocument();

    // No empty-state placeholder.
    expect(
      screen.queryByText(/no one has responded yet/i),
    ).not.toBeInTheDocument();
  });

  test("clicking CLOSE SIGNAL calls the close mutation and dismisses the dialog", async () => {
    render(<Lfg />);

    openCloseDialog();
    expect(
      screen.getByRole("heading", { name: /close signal/i }),
    ).toBeInTheDocument();

    fireEvent.click(getConfirmButton());

    // Mutation fired with the correct post id.
    expect(h.closeMutate).toHaveBeenCalledOnce();
    expect(h.closeMutate).toHaveBeenCalledWith(
      { postId: "post-1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    // onSuccess fires synchronously in our mock → dialog should be gone.
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /close signal/i }),
      ).not.toBeInTheDocument();
    });

    // Cache was invalidated.
    expect(h.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lfg-posts"] }),
    );
  });

  test("clicking CANCEL dismisses the dialog without calling the close mutation", async () => {
    render(<Lfg />);

    openCloseDialog();
    expect(
      screen.getByRole("heading", { name: /close signal/i }),
    ).toBeInTheDocument();

    fireEvent.click(getCancelButton());

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /close signal/i }),
      ).not.toBeInTheDocument();
    });

    expect(h.closeMutate).not.toHaveBeenCalled();
  });
});

describe("LFG close-signal dialog — no responders", () => {
  beforeEach(() => {
    // Switch to a post with zero responders for every test in this block.
    h.setPosts([POST_NO_RESPONDERS]);
  });

  test("shows the no-responders placeholder when the post has zero responses", () => {
    render(<Lfg />);

    openCloseDialog();

    // Dialog is open.
    expect(
      screen.getByRole("heading", { name: /close signal/i }),
    ).toBeInTheDocument();

    // Empty-state placeholder is visible.
    expect(
      screen.getByText(/no one has responded yet/i),
    ).toBeInTheDocument();

    // No responder rows rendered.
    expect(screen.queryByText("@player1")).not.toBeInTheDocument();
    expect(screen.queryByText("@player2")).not.toBeInTheDocument();
  });
});

describe("LFG close-signal dialog — close mutation pending", () => {
  beforeEach(() => {
    // Simulate a slow network: the close mutation is already in-flight.
    h.setCloseIsPending(true);
  });

  /** When isPending=true the button label changes to "CLOSING..." */
  function getPendingConfirmButton() {
    return screen.getByRole("button", { name: /closing/i });
  }

  test("CLOSE SIGNAL button is disabled while the mutation is pending", () => {
    render(<Lfg />);

    openCloseDialog();

    expect(
      screen.getByRole("heading", { name: /close signal/i }),
    ).toBeInTheDocument();

    expect(getPendingConfirmButton()).toBeDisabled();
  });

  test("clicking the disabled CLOSE SIGNAL button does not call the mutate function", () => {
    render(<Lfg />);

    openCloseDialog();

    fireEvent.click(getPendingConfirmButton());

    expect(h.closeMutate).not.toHaveBeenCalled();
  });
});
