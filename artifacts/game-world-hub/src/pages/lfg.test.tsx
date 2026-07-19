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
 * When the author has no party, "Create & Invite" opens a popover with a
 * party-name input; submitting creates the party then immediately invites the
 * selected responder.
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
  const createPartyMutate = vi.fn();
  const inviteToPartyMutate = vi.fn();
  const invalidateQueries = vi.fn();
  const toast = vi.fn();

  // Mutable slot: individual tests set this before rendering.
  let currentPosts: unknown[] = [];

  // Mutable slot: controls mutation pending states.
  let closeIsPending = false;
  let respondIsPending = false;
  let deleteIsPending = false;
  let createIsPending = false;
  let createPartyIsPending = false;
  let inviteIsPending = false;

  return {
    closeMutate,
    respondMutate,
    deleteMutate,
    createMutate,
    createPartyMutate,
    inviteToPartyMutate,
    invalidateQueries,
    toast,
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
    getCreatePartyIsPending: () => createPartyIsPending,
    setCreatePartyIsPending: (v: boolean) => { createPartyIsPending = v; },
    getInviteIsPending: () => inviteIsPending,
    setInviteIsPending: (v: boolean) => { inviteIsPending = v; },
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
  useInviteToParty: () => ({ mutate: h.inviteToPartyMutate, isPending: h.getInviteIsPending() }),
  useCreateParty: () => ({ mutate: h.createPartyMutate, isPending: h.getCreatePartyIsPending() }),
  useListParties: () => ({ data: [] }),
  getListLfgPostsQueryKey: () => ["lfg-posts"],
  getGetMeQueryKey: () => ["me"],
  getListPartiesQueryKey: () => ["parties"],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
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

/** Click the "Create & Invite" button for the first responder. */
function clickCreateAndInvite() {
  const btn = screen.getAllByRole("button", { name: /create & invite/i })[0];
  fireEvent.click(btn);
}

/** Type a party name into the popover input. */
function typePartyName(name: string) {
  const input = screen.getByPlaceholderText(/squad alpha/i);
  fireEvent.change(input, { target: { value: name } });
  return input;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: post with responders.
  h.setPosts([POST_WITH_RESPONDERS]);

  h.closeMutate.mockReset();
  h.respondMutate.mockReset();
  h.deleteMutate.mockReset();
  h.createMutate.mockReset();
  h.createPartyMutate.mockReset();
  h.inviteToPartyMutate.mockReset();
  h.invalidateQueries.mockReset();
  h.toast.mockReset();

  // Default: mutations are not pending.
  h.setCloseIsPending(false);
  h.setRespondIsPending(false);
  h.setDeleteIsPending(false);
  h.setCreateIsPending(false);
  h.setCreatePartyIsPending(false);
  h.setInviteIsPending(false);

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

describe("LFG close-signal dialog — create party & invite (no party)", () => {
  test("shows Create & Invite button when author has no party", () => {
    render(<Lfg />);
    openCloseDialog();

    // Both responders get a "Create & Invite" button.
    const btns = screen.getAllByRole("button", { name: /create & invite/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  test("clicking Create & Invite opens a popover with a party name input", () => {
    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();

    expect(screen.getByPlaceholderText(/squad alpha/i)).toBeInTheDocument();
  });

  test("CREATE & INVITE confirm button is disabled when party name is empty", () => {
    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();

    // The confirm button inside the popover — name empty, must be disabled.
    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    // The popover's submit button is after the trigger; pick the last one.
    const popoverConfirm = confirmBtns[confirmBtns.length - 1];
    expect(popoverConfirm).toBeDisabled();
  });

  test("typing a name enables the CREATE & INVITE confirm button", () => {
    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("Squad Alpha");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    const popoverConfirm = confirmBtns[confirmBtns.length - 1];
    expect(popoverConfirm).not.toBeDisabled();
  });

  test("submitting calls createParty with the typed name", () => {
    h.createPartyMutate.mockImplementation(() => {
      // Do not call onSuccess — we just want to verify the call.
    });

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("My Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    expect(h.createPartyMutate).toHaveBeenCalledOnce();
    expect(h.createPartyMutate).toHaveBeenCalledWith(
      { data: expect.objectContaining({ name: "My Squad" }) },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("keyboard Enter on the name input triggers the create+invite flow", () => {
    h.createPartyMutate.mockImplementation(() => {});

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    const input = typePartyName("Enter Squad");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(h.createPartyMutate).toHaveBeenCalledOnce();
    expect(h.createPartyMutate).toHaveBeenCalledWith(
      { data: expect.objectContaining({ name: "Enter Squad" }) },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("on createParty success, inviteToParty is called with the new party id and responder id", () => {
    const NEW_PARTY = { id: 99, name: "My Squad", members: [] };

    h.createPartyMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: (party: typeof NEW_PARTY) => void }) => {
        opts?.onSuccess?.(NEW_PARTY);
      },
    );
    h.inviteToPartyMutate.mockImplementation(() => {});

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("My Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    expect(h.inviteToPartyMutate).toHaveBeenCalledOnce();
    expect(h.inviteToPartyMutate).toHaveBeenCalledWith(
      { partyId: 99, data: { userId: 10 } }, // responder id=10 (Player One)
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("on full success, toast is shown and responder is marked Invited", async () => {
    const NEW_PARTY = { id: 99, name: "My Squad", members: [] };

    h.createPartyMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: (party: typeof NEW_PARTY) => void }) => {
        opts?.onSuccess?.(NEW_PARTY);
      },
    );
    h.inviteToPartyMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("My Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    // Toast fired.
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Player One") }),
    );

    // Responder row now shows "Invited" badge.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /invited/i })).toBeInTheDocument();
    });
  });

  test("on createParty failure, shows error toast and does not call inviteToParty", () => {
    h.createPartyMutate.mockImplementation(
      (_args: unknown, opts?: { onError?: () => void }) => {
        opts?.onError?.();
      },
    );

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("Bad Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    expect(h.inviteToPartyMutate).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  test("on invite failure after party creation, shows error toast", () => {
    const NEW_PARTY = { id: 99, name: "My Squad", members: [] };

    h.createPartyMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: (party: typeof NEW_PARTY) => void }) => {
        opts?.onSuccess?.(NEW_PARTY);
      },
    );
    h.inviteToPartyMutate.mockImplementation(
      (_args: unknown, opts?: { onError?: () => void }) => {
        opts?.onError?.();
      },
    );

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("My Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  test("CREATE & INVITE confirm button is disabled while createParty is pending", () => {
    h.setCreatePartyIsPending(true);

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("My Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /creating/i });
    expect(confirmBtns[0]).toBeDisabled();
  });
});

// ─── Party size seeding from neededPlayers ────────────────────────────────────

describe("LFG create-party popover — party size defaults from post neededPlayers", () => {
  /**
   * After clicking Create & Invite the popover renders exactly one
   * <input type="number"> (the size field). We locate it via the
   * spinbutton ARIA role — that is the only numeric input visible
   * while both the close dialog and the popover are open.
   */
  function getSizeInput() {
    const spinbuttons = screen.getAllByRole("spinbutton");
    return spinbuttons[0] as HTMLInputElement;
  }

  test("size input defaults to neededPlayers when value is in range (neededPlayers=5 → 5)", () => {
    h.setPosts([{ ...POST_WITH_RESPONDERS, neededPlayers: 5 }]);

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();

    expect(getSizeInput().value).toBe("5");
  });

  test("size input is clamped to 2 when neededPlayers is below minimum (neededPlayers=1 → 2)", () => {
    h.setPosts([{ ...POST_WITH_RESPONDERS, neededPlayers: 1 }]);

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();

    expect(getSizeInput().value).toBe("2");
  });

  test("size input is clamped to 100 when neededPlayers is above maximum (neededPlayers=150 → 100)", () => {
    h.setPosts([{ ...POST_WITH_RESPONDERS, neededPlayers: 150 }]);

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();

    expect(getSizeInput().value).toBe("100");
  });

  test("createParty is called with a maxSize matching the seeded size input value", () => {
    h.setPosts([{ ...POST_WITH_RESPONDERS, neededPlayers: 5 }]);
    h.createPartyMutate.mockImplementation(() => {
      // Do not call onSuccess — we only inspect the call arguments.
    });

    render(<Lfg />);
    openCloseDialog();
    clickCreateAndInvite();
    typePartyName("My Squad");

    const confirmBtns = screen.getAllByRole("button", { name: /create & invite/i });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    expect(h.createPartyMutate).toHaveBeenCalledOnce();
    expect(h.createPartyMutate).toHaveBeenCalledWith(
      { data: expect.objectContaining({ name: "My Squad", maxSize: 5 }) },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
