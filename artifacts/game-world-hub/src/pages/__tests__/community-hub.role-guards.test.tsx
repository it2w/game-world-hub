/**
 * Unit tests for the role-based access guards in the community settings dialog.
 *
 * Covered scenarios:
 *
 * resolveTabForRole
 *  1. Unknown / null tab → falls back to "overview"
 *  2. ownerOnly tab ("danger") requested by a mod → falls back to "overview"
 *  3. ownerOrModOnly tab ("insights") requested by a plain member → falls back to "overview"
 *  4. ownerOnly tab ("danger") requested by owner → returns "danger"
 *  5. ownerOrModOnly tab ("insights") requested by mod → returns "insights"
 *  6. ownerOrModOnly tab ("insights") requested by owner → returns "insights"
 *  7. Unrestricted tab requested by any role → returned as-is
 *
 * setActiveTab wrapper (delegates to resolveTabForRole)
 *  8. Mod cannot transition to "danger" — resolveTabForRole returns "overview"
 *  9. Plain member cannot transition to "insights" — resolveTabForRole returns "overview"
 *
 * InsightsDashboard panel-level guard
 * 10. Renders access-denied UI when isOwnerOrMod=false
 * 11. Does NOT render access-denied UI when isOwnerOrMod=true (renders data area)
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { resolveTabForRole, InsightsDashboard, InviteSettingsPanel, ChannelsSettingsPanel } from "../community-hub";

// ── Module stubs ──────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// recharts uses ResizeObserver which jsdom doesn't provide
vi.mock("recharts", () => ({
  LineChart: () => null,
  Line: () => null,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CartesianGrid: () => null,
}));

// ── resolveTabForRole ─────────────────────────────────────────────────────────

describe("resolveTabForRole", () => {
  test("null tab falls back to 'overview'", () => {
    expect(resolveTabForRole(null, false, false)).toBe("overview");
  });

  test("unknown string falls back to 'overview'", () => {
    expect(resolveTabForRole("nonexistent-tab", false, false)).toBe("overview");
  });

  test("ownerOnly tab ('danger') requested by mod falls back to 'overview'", () => {
    expect(resolveTabForRole("danger", false, true)).toBe("overview");
  });

  test("ownerOrModOnly tab ('insights') requested by plain member falls back to 'overview'", () => {
    expect(resolveTabForRole("insights", false, false)).toBe("overview");
  });

  test("ownerOnly tab ('danger') requested by owner returns 'danger'", () => {
    expect(resolveTabForRole("danger", true, false)).toBe("danger");
  });

  test("ownerOrModOnly tab ('insights') requested by mod returns 'insights'", () => {
    expect(resolveTabForRole("insights", false, true)).toBe("insights");
  });

  test("ownerOrModOnly tab ('insights') requested by owner returns 'insights'", () => {
    expect(resolveTabForRole("insights", true, false)).toBe("insights");
  });

  test("unrestricted tab ('overview') returned as-is for plain member", () => {
    expect(resolveTabForRole("overview", false, false)).toBe("overview");
  });

  test("unrestricted tab ('automod') returned as-is for mod", () => {
    expect(resolveTabForRole("automod", false, true)).toBe("automod");
  });
});

// ── setActiveTab wrapper (delegates to resolveTabForRole) ─────────────────────
//
// setActiveTab is defined inside ServerSettingsDialog as:
//   const setActiveTab = useCallback(
//     (tab) => setActiveTabRaw(resolveTabForRole(tab, community.isOwner, community.isMod)),
//     [community.isOwner, community.isMod],
//   );
//
// Since the wrapper is a thin pass-through to resolveTabForRole, testing
// resolveTabForRole with the same inputs provides equivalent coverage without
// mounting the full dialog.

describe("setActiveTab wrapper — via resolveTabForRole", () => {
  test("mod cannot transition to 'danger' (resolves to 'overview')", () => {
    const resolved = resolveTabForRole("danger", false, true);
    expect(resolved).toBe("overview");
  });

  test("plain member cannot transition to 'insights' (resolves to 'overview')", () => {
    const resolved = resolveTabForRole("insights", false, false);
    expect(resolved).toBe("overview");
  });
});

// ── InviteSettingsPanel prop guard ────────────────────────────────────────────

const MOCK_INVITE = {
  code: "TESTCODE",
  uses: 1,
  max_uses: 10,
  expires_at: null,
  created_at: new Date().toISOString(),
};

describe("InviteSettingsPanel prop guard", () => {
  beforeEach(() => {
    // Provide a working clipboard stub for every test in this suite.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });
  test("hides 'Create Invite' button when isOwnerOrMod=false", () => {
    render(<InviteSettingsPanel communityId={1} isOwnerOrMod={false} />);
    expect(screen.queryByText("generateInvite")).toBeNull();
  });

  test("shows 'Create Invite' button when isOwnerOrMod=true", () => {
    render(<InviteSettingsPanel communityId={1} isOwnerOrMod={true} />);
    expect(screen.getByText("generateInvite")).toBeDefined();
  });

  test("hides revoke button for plain members even when invites are present", () => {
    // Override useQuery to return a non-empty invite list for this test only
    vi.mocked(useQuery).mockReturnValueOnce({
      data: [MOCK_INVITE],
      isLoading: false,
    } as any);

    render(<InviteSettingsPanel communityId={1} isOwnerOrMod={false} />);

    // The invite row should be visible (copy button present)
    expect(screen.getByTitle("Copy link")).toBeDefined();
    // But the revoke button must be absent
    expect(screen.queryByTitle("Revoke")).toBeNull();
  });

  test("shows revoke button for owners/mods when invites are present", () => {
    vi.mocked(useQuery).mockReturnValueOnce({
      data: [MOCK_INVITE],
      isLoading: false,
    } as any);

    render(<InviteSettingsPanel communityId={1} isOwnerOrMod={true} />);

    expect(screen.getByTitle("Revoke")).toBeDefined();
  });

  test("clicking 'Copy link' as a plain member calls clipboard.writeText with the correct invite URL", async () => {
    vi.mocked(useQuery).mockReturnValueOnce({
      data: [MOCK_INVITE],
      isLoading: false,
    } as any);

    render(<InviteSettingsPanel communityId={1} isOwnerOrMod={false} />);

    const copyBtn = screen.getByTitle("Copy link");
    fireEvent.click(copyBtn);

    // navigator.clipboard.writeText should have been called once with the join URL
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/join/TESTCODE`,
    );
  });
});

// ── InviteSettingsPanel fetch suppression guard ───────────────────────────────
//
// The query that loads invite codes carries `enabled: isOwnerOrMod`.
// When a plain member reaches the panel the request must be suppressed entirely —
// customFetch must never be called and useQuery must receive enabled=false.

describe("InviteSettingsPanel fetch suppression guard", () => {
  test("customFetch is never called when isOwnerOrMod=false", () => {
    vi.mocked(customFetch).mockClear();
    vi.mocked(useQuery).mockClear();

    render(<InviteSettingsPanel communityId={42} isOwnerOrMod={false} />);

    // The network helper must remain silent for plain members.
    expect(vi.mocked(customFetch)).not.toHaveBeenCalled();
  });

  test("useQuery is called with enabled=false when isOwnerOrMod=false", () => {
    vi.mocked(useQuery).mockClear();

    render(<InviteSettingsPanel communityId={42} isOwnerOrMod={false} />);

    // Find the call that is for the community-invites query key.
    const inviteCall = vi.mocked(useQuery).mock.calls.find(([opts]) => {
      const key = (opts as any).queryKey;
      return Array.isArray(key) && key[0] === "community-invites";
    });

    expect(inviteCall).toBeDefined();
    // The guard must disable the query so the network request is suppressed.
    expect((inviteCall![0] as any).enabled).toBe(false);
  });

  test("useQuery is called with enabled=true when isOwnerOrMod=true", () => {
    vi.mocked(useQuery).mockClear();

    render(<InviteSettingsPanel communityId={42} isOwnerOrMod={true} />);

    const inviteCall = vi.mocked(useQuery).mock.calls.find(([opts]) => {
      const key = (opts as any).queryKey;
      return Array.isArray(key) && key[0] === "community-invites";
    });

    expect(inviteCall).toBeDefined();
    expect((inviteCall![0] as any).enabled).toBe(true);
  });
});

// ── ChannelsSettingsPanel prop guard ─────────────────────────────────────────
//
// Owner-only controls:
//  - "Add" channel button (header)          → guarded by {isOwner && ...}
//  - Delete button (Trash2 icon, per row)   → guarded by {isOwner && ...}
//
// With one channel in the list the button count is deterministic:
//   isOwner=false  → 1 button  (edit/Settings icon only)
//   isOwner=true   → 3 buttons (Add header + edit icon + delete icon)

describe("ChannelsSettingsPanel prop guard", () => {
  // Channel interface is not exported; cast to satisfy the prop type.
  const mockChannels = [
    { id: 1, name: "general", type: "text", isPrivate: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];

  test("hides owner-only controls (add button + delete button) when isOwner=false", () => {
    const { container } = render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={false} />,
    );
    // Add-channel button must not appear
    expect(screen.queryByText("add")).toBeNull();
    // Only the edit (Settings) icon button should be present — no delete button
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(1);
  });

  test("shows owner-only controls (add button + delete button) when isOwner=true", () => {
    const { container } = render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={true} />,
    );
    // Add-channel button must appear
    expect(screen.getByText("add")).toBeDefined();
    // Three buttons: Add (header), edit icon, delete icon
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(3);
  });

  test("add-channel form never appears when isOwner=false, even after keyboard and programmatic interactions", () => {
    const { container } = render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={false} />,
    );

    // The Add button is not rendered at all (not merely hidden), so there is no
    // DOM element a keyboard or programmatic click could target to open the form.
    // Firing keyboard events on the panel root confirms no stray handler exposes
    // the form state.
    const panel = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(panel, { key: "Enter", code: "Enter" });
    fireEvent.keyDown(panel, { key: " ", code: "Space" });
    fireEvent.keyPress(panel, { key: "Enter", code: "Enter" });

    // The add-form's channel-name input must never be present in the DOM
    expect(screen.queryByPlaceholderText("channelName")).toBeNull();
    // Button count must remain exactly 1 (the edit icon for the channel row)
    expect(container.querySelectorAll("button").length).toBe(1);
  });

  test("Save button is disabled when a mod clears the channel name in the edit form", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={false} />,
    );

    // Open the edit form by clicking the settings icon button
    const editBtn = screen.getByTitle("Edit channel");
    fireEvent.click(editBtn);

    // The name input should now be visible and pre-filled with "general"
    const nameInput = screen.getByPlaceholderText("channel-name");
    expect((nameInput as HTMLInputElement).value).toBe("general");

    // Clear the name field
    fireEvent.change(nameInput, { target: { value: "" } });

    // Save button must be disabled when trimmed name is empty
    const saveBtn = screen.getByText("Save");
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("Create button is disabled when an owner opens the Add form and leaves the name blank", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={true} />,
    );

    // Open the add-channel form by clicking the Add button
    const addBtn = screen.getByText("add");
    fireEvent.click(addBtn);

    // The channel-name input should now be visible and empty by default
    const nameInput = screen.getByPlaceholderText("channelName");
    expect((nameInput as HTMLInputElement).value).toBe("");

    // Create button must be disabled when the name is blank
    const createBtn = screen.getByText("createBtn");
    expect((createBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("Create button is disabled when the channel name is whitespace-only in the add-channel form", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={true} />,
    );

    // Open the add-channel form
    const addBtn = screen.getByText("add");
    fireEvent.click(addBtn);

    // Type whitespace-only into the name field — trim() reduces it to ""
    const nameInput = screen.getByPlaceholderText("channelName");
    fireEvent.change(nameInput, { target: { value: "   " } });

    // Create button must remain disabled because the trimmed name is still empty
    const createBtn = screen.getByText("createBtn");
    expect((createBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("Save button is disabled when the channel name is whitespace-only in the edit form", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={mockChannels} isOwner={false} />,
    );

    // Open the edit form by clicking the settings icon button
    const editBtn = screen.getByTitle("Edit channel");
    fireEvent.click(editBtn);

    // The name input should now be visible and pre-filled with "general"
    const nameInput = screen.getByPlaceholderText("channel-name");
    expect((nameInput as HTMLInputElement).value).toBe("general");

    // Set the name to spaces only — trim() reduces it to an empty string
    fireEvent.change(nameInput, { target: { value: "   " } });

    // Save button must be disabled because the trimmed name is still empty
    const saveBtn = screen.getByText("Save");
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ── InsightsDashboard panel-level guard ───────────────────────────────────────

describe("InsightsDashboard panel-level guard", () => {
  test("renders access-denied UI when isOwnerOrMod=false", () => {
    render(<InsightsDashboard communityId={1} isOwnerOrMod={false} />);
    // The panel guard renders an "Owner-only settings" message
    expect(screen.getByText("Owner-only settings")).toBeDefined();
    // No chart or data content should be present
    expect(screen.queryByText(/member growth/i)).toBeNull();
  });

  test("does NOT render access-denied UI when isOwnerOrMod=true", () => {
    render(<InsightsDashboard communityId={1} isOwnerOrMod={true} />);
    // Access-denied message must be absent for authorised viewers
    expect(screen.queryByText("Owner-only settings")).toBeNull();
  });
});
