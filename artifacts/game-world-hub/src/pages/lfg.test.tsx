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
  const respondMutate = vi.fn();
  const deleteMutate = vi.fn();
  const createMutate = vi.fn();
  const invalidateQueries = vi.fn();

  // Mutable slot: individual tests set this before rendering.
  let currentPosts: unknown[] = [];

  // Mutable slot: controls close mutation pending state.
  let closeIsPending = false;

  // Mutable slot: controls respond mutation pending state.
  let respondIsPending = false;

  // Mutable slot: controls delete mutation pending state.
  let deleteIsPending = false;

  // Mutable slot: controls create mutation pending state.
  let createIsPending = false;

  return {
    closeMutate,
    respondMutate,
    deleteMutate,
    createMutate,
    invalidateQueries,
    getPosts: () => currentPosts,
    setPosts: (p: unknown[]) => { currentPosts = p; },
    getCloseIsPending: () => closeIsPending,
    setCloseIsPending: (v: boolean) => { closeIsPending = v; },
    getRespondIsPending: () => respondIsPending,
    setRespondIsPending: (v: boolean) => { respondIsPending = v; },
    getDeleteIsPending: () => deleteIsPending,
    setDeleteIsPending: (v: boolean) => { deleteIsPending = v; },
    getCreateIsPending: () => createIsPending,
    setCreateIsPending: (v: boolean) => { createIsPending = v; },
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

// A post authored by someone else — viewer is not the author, hasn't responded yet.
const OTHER_AUTHOR = { id: 99, username: "other", displayName: "Other", avatarUrl: null };
const POST_BY_OTHER = {
  ...POST_WITH_RESPONDERS,
  id: "post-other",
  author: OTHER_AUTHOR,
  viewerHasResponded: false,
  status: "open",
};

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: () => ({ data: ME }),
  // Reads from h.getPosts() at render-time so each test can control the data.
  useListLfgPosts: () => ({ data: h.getPosts(), isLoading: false }),
  useCreateLfgPost: () => ({ mutate: h.createMutate, isPending: h.getCreateIsPending() }),
  useRespondToLfgPost: () => ({ mutate: h.respondMutate, isPending: h.getRespondIsPending() }),
  useCloseLfgPost: () => ({ mutate: h.closeMutate, isPending: h.getCloseIsPending() }),
  useDeleteLfgPost: () => ({ mutate: h.deleteMutate, isPending: h.getDeleteIsPending() }),
  useInviteToParty: () => ({ mutate: vi.fn(), isPending: false }),
  useListParties: () => ({ data: [] }),
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
  h.respondMutate.mockReset();
  h.deleteMutate.mockReset();
  h.createMutate.mockReset();
  h.invalidateQueries.mockReset();

  // Default: mutations are not pending.
  h.setCloseIsPending(false);
  h.setRespondIsPending(false);
  h.setDeleteIsPending(false);
  h.setCreateIsPending(false);

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

describe("LFG respond button — isPending guard", () => {
  beforeEach(() => {
    // Use a post authored by someone else so the RESPOND button is visible.
    h.setPosts([POST_BY_OTHER]);
    // Simulate a slow network: the respond mutation is already in-flight.
    h.setRespondIsPending(true);
  });

  test("RESPOND button is disabled while the mutation is pending", () => {
    render(<Lfg />);

    const respondBtn = screen.getByRole("button", { name: /respond/i });
    expect(respondBtn).toBeDisabled();
  });

  test("clicking the disabled RESPOND button does not call the mutate function", () => {
    render(<Lfg />);

    const respondBtn = screen.getByRole("button", { name: /respond/i });
    fireEvent.click(respondBtn);

    expect(h.respondMutate).not.toHaveBeenCalled();
  });
});

describe("LFG delete button — isPending guard", () => {
  beforeEach(() => {
    // Use a post authored by the viewer so the trash-can delete button is visible.
    h.setPosts([POST_WITH_RESPONDERS]);
    // Simulate a slow network: the delete mutation is already in-flight.
    h.setDeleteIsPending(true);
  });

  test("delete button is disabled while the mutation is pending", () => {
    render(<Lfg />);

    // The delete button renders only a Trash2 icon with no text label, so we
    // locate it by its position inside the author-action group via aria role.
    // All buttons with role="button" are queried; the trash button is the one
    // that is currently disabled (CLOSE is not disabled when only delete is pending).
    const allButtons = screen.getAllByRole("button");
    const deleteBtn = allButtons.find((btn) => btn.hasAttribute("disabled") && btn.querySelector("svg"));
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn).toBeDisabled();
  });

  test("clicking the disabled delete button does not call the mutate function", () => {
    render(<Lfg />);

    const allButtons = screen.getAllByRole("button");
    const deleteBtn = allButtons.find((btn) => btn.hasAttribute("disabled") && btn.querySelector("svg"));
    expect(deleteBtn).toBeDefined();

    fireEvent.click(deleteBtn!);

    expect(h.deleteMutate).not.toHaveBeenCalled();
  });
});

describe("LFG create dialog — isPending guard on submit", () => {
  beforeEach(() => {
    // No posts needed — we only exercise the create dialog.
    h.setPosts([]);
    // Simulate a slow network: the create mutation is already in-flight.
    h.setCreateIsPending(true);
  });

  /** Open the create-LFG dialog by clicking the POST SIGNAL trigger button. */
  function openCreateDialog() {
    fireEvent.click(screen.getByRole("button", { name: /post signal/i }));
  }

  /** The submit button label switches to BROADCASTING… while pending. */
  function getBroadcastButton() {
    return screen.getByRole("button", { name: /broadcasting/i });
  }

  test("BROADCAST button is disabled while the create mutation is pending", () => {
    render(<Lfg />);

    openCreateDialog();

    expect(getBroadcastButton()).toBeDisabled();
  });

  test("clicking the disabled BROADCAST button does not call the mutate function", () => {
    render(<Lfg />);

    openCreateDialog();

    fireEvent.click(getBroadcastButton());

    expect(h.createMutate).not.toHaveBeenCalled();
  });
});
