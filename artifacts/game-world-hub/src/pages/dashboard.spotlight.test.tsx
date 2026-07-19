import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpotlightCarousel } from "./dashboard";

/**
 * Verifies that the "You're featured" pill in SpotlightCarousel:
 *
 *  1. Appears when a Pro user (spotlightOptOut = false) has their id in the
 *     spotlight list returned by /api/users/spotlight.
 *  2. Disappears the moment the me-cache entry is updated to spotlightOptOut = true
 *     — without any page reload.
 *  3. Re-appears when the user opts back in (spotlightOptOut = false).
 *  4. Is absent when the user's id is not in the spotlight list at all.
 *
 * The spotlight ["spotlight"] query and the ["me"] query are both seeded via
 * QueryClient.setQueryData so the component reads them synchronously.
 *
 * All external module boundaries are mocked; only the carousel's own rendering
 * logic is under test.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/voice/voice-context", () => ({
  useVoice: () => ({
    joinVipLounge: vi.fn(),
    callUser: vi.fn(),
    currentChannelId: null,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
  useGetMe: () => ({ data: undefined }),
  useGetOnlineFriendsSummary: () => ({ data: undefined }),
  useGetPartyActivityFeed: () => ({ data: undefined }),
  useListPartyInvites: () => ({ data: undefined }),
  useBlockUser: () => ({ mutate: vi.fn() }),
  useAcceptPartyInvite: () => ({ mutate: vi.fn() }),
  useDeclinePartyInvite: () => ({ mutate: vi.fn() }),
  getGetMeQueryKey: () => ["me"],
  getGetOnlineFriendsSummaryQueryKey: () => ["online-friends"],
  getGetPartyActivityFeedQueryKey: () => ["party-activity"],
  getListPartyInvitesQueryKey: () => ["party-invites"],
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRO_USER = {
  id: 42,
  username: "proplayer",
  displayName: "Pro Player",
  isPro: true,
  spotlightOptOut: false,
};

const SPOTLIGHT_WITH_USER = [
  { id: 42, displayName: "Pro Player", username: "proplayer", avatarUrl: null },
  { id: 99, displayName: "Other Pro",  username: "otherpro",  avatarUrl: null },
];

const SPOTLIGHT_WITHOUT_USER = [
  { id: 99, displayName: "Other Pro", username: "otherpro", avatarUrl: null },
];

/** Seed both relevant queries and return the client for further manipulation. */
function makeClient(meData: typeof PRO_USER, spotlightData: typeof SPOTLIGHT_WITH_USER) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(["me"], meData);
  qc.setQueryData(["spotlight"], spotlightData);
  return qc;
}

function renderCarousel(qc: QueryClient, meData: typeof PRO_USER) {
  return render(
    <QueryClientProvider client={qc}>
      <SpotlightCarousel me={meData} />
    </QueryClientProvider>,
  );
}

const PILL_TEXT = /you're featured/i;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SpotlightCarousel — 'You're featured' pill", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeClient(PRO_USER, SPOTLIGHT_WITH_USER);
  });

  test("pill is visible when Pro user is in the spotlight list and has not opted out", () => {
    renderCarousel(qc, PRO_USER);
    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();
  });

  test("pill disappears immediately when me cache updates to spotlightOptOut = true (opt-out)", async () => {
    const { rerender } = renderCarousel(qc, PRO_USER);
    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();

    // Simulate what settings.tsx does: updateProfile succeeds → refreshMe()
    // invalidates the me query, and the component re-renders with new me data.
    const optedOut = { ...PRO_USER, spotlightOptOut: true };

    await act(async () => {
      qc.setQueryData(["me"], optedOut);
    });

    // Re-render with the updated me prop (mirrors React Query re-render)
    rerender(
      <QueryClientProvider client={qc}>
        <SpotlightCarousel me={optedOut} />
      </QueryClientProvider>,
    );

    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();
  });

  test("pill re-appears when user opts back in (spotlightOptOut = false)", async () => {
    const optedOut = { ...PRO_USER, spotlightOptOut: true };
    qc = makeClient(optedOut, SPOTLIGHT_WITH_USER);

    const { rerender } = renderCarousel(qc, optedOut);
    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();

    // Simulate opt-back-in
    const optedIn = { ...PRO_USER, spotlightOptOut: false };

    await act(async () => {
      qc.setQueryData(["me"], optedIn);
    });

    rerender(
      <QueryClientProvider client={qc}>
        <SpotlightCarousel me={optedIn} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();
  });

  test("pill is absent when user's id is not in the spotlight list", () => {
    qc = makeClient(PRO_USER, SPOTLIGHT_WITHOUT_USER);
    renderCarousel(qc, PRO_USER);
    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();
  });

  test("pill is absent when me is undefined (unauthenticated render)", () => {
    renderCarousel(qc, undefined as any);
    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();
  });
});
