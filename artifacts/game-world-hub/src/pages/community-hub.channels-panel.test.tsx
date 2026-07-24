/**
 * Tests confirming that ChannelsSettingsPanel hides owner-only controls
 * (channel-create and channel-delete) from moderators and regular members.
 *
 * The "channels" tab is visible to all members with settings access, but
 * the create-channel button and the per-channel delete (trash) button must
 * only render when isOwner=true. This prevents a mod from force-rendering
 * those controls by manipulating client state (e.g. typing the tab ID into
 * a React DevTools state setter) — and the API returns 403 for any request
 * that makes it through anyway.
 *
 * Covered scenarios:
 *  1. Owner sees the "Add" (create-channel) button
 *  2. Mod (isOwner=false, isMod=true) does NOT see the "Add" button
 *  3. Regular member does NOT see the "Add" button
 *  4. Owner sees the delete (trash) button next to each channel
 *  5. Mod does NOT see the delete button next to channels
 */

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChannelsSettingsPanel } from "./community-hub";

// Minimal channel shape expected by ChannelsSettingsPanel
interface TestChannel {
  id: number;
  name: string;
  type: "text" | "voice" | "announcement" | "stage";
  position: number;
  isPrivate: boolean;
  slowmodeSeconds: number;
  communityId: number;
}

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
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChannel(id: number, name: string): TestChannel {
  return {
    id,
    name,
    type: "text",
    position: id,
    isPrivate: false,
    slowmodeSeconds: 0,
    communityId: 1,
  };
}

const CHANNELS = [makeChannel(1, "general"), makeChannel(2, "off-topic")];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChannelsSettingsPanel owner-only controls", () => {
  test("owner sees the Add (create-channel) button", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={CHANNELS} isOwner={true} />
    );
    // The add button renders when isOwner=true
    expect(screen.getByRole("button", { name: /add/i })).toBeDefined();
  });

  test("mod (isOwner=false) does NOT see the Add button", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={CHANNELS} isOwner={false} />
    );
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  test("regular member (isOwner=false) does NOT see the Add button", () => {
    render(
      <ChannelsSettingsPanel communityId={1} channels={[]} isOwner={false} />
    );
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  test("owner sees the delete buttons for each channel", () => {
    const { container } = render(
      <ChannelsSettingsPanel communityId={1} channels={CHANNELS} isOwner={true} />
    );
    // Each channel row has a trash-icon delete button (opacity-0, revealed on hover)
    // We check the buttons exist in the DOM even when not visually visible
    const trashButtons = container.querySelectorAll("button svg.lucide-trash-2");
    expect(trashButtons.length).toBe(CHANNELS.length);
  });

  test("mod (isOwner=false) does NOT see any delete buttons", () => {
    const { container } = render(
      <ChannelsSettingsPanel communityId={1} channels={CHANNELS} isOwner={false} />
    );
    const trashButtons = container.querySelectorAll("button svg.lucide-trash-2");
    expect(trashButtons.length).toBe(0);
  });
});
