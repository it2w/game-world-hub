/**
 * End-to-end tests for the LFG (Looking For Group) flow.
 *
 * Covered scenarios:
 *   1. Author creates a post → responder sees it and responds → author closes it
 *      → "CLOSED" badge appears on the post card for the author.
 *   2. When a responder clicks Respond on a post that was closed between page
 *      load and click, the UI shows a "Signal closed" toast (surfaces the 409).
 *
 * Each run uses unique usernames + game titles to avoid clashing with existing
 * development-database data.
 */

import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface TestUser {
  username: string;
  displayName: string;
  email: string;
  password: string;
}

function makeUser(role: string): TestUser {
  const id = uid();
  return {
    username: `${role}${id}`.slice(0, 30),
    displayName: `${role} ${id}`.slice(0, 50),
    email: `${role}${id}@lfgtest.invalid`,
    password: "testpass1",
  };
}

/**
 * Register a new account via the /register page using data-testid selectors
 * that are already present in the register form component.
 */
async function registerUser(page: Page, user: TestUser): Promise<void> {
  await page.goto("/register");
  await page.getByTestId("input-username").fill(user.username);
  // display-name field label is "Display Name"; use the data-testid
  await page.getByTestId("input-display-name").fill(user.displayName);
  await page.getByTestId("input-email").fill(user.email);
  // Password field has no data-testid, locate by type
  await page.locator('input[type="password"]').fill(user.password);
  // Submit button: data-testid="button-submit", text "ESTABLISH IDENTITY"
  await page.getByTestId("button-submit").click();
  // Successful register redirects away from /register
  await expect(page).not.toHaveURL(/\/register/, { timeout: 12_000 });
}

/** Navigate to /lfg and wait until the loading indicator is gone. */
async function goToLfg(page: Page): Promise<void> {
  await page.goto("/lfg");
  // "SCANNING FREQUENCIES..." text disappears once posts (or empty state) load
  await expect(page.getByText(/scanning frequencies/i)).not.toBeVisible({ timeout: 12_000 });
}

/**
 * Open the "POST SIGNAL" dialog, fill the form, and submit.
 * Waits for the dialog to close before returning.
 */
async function createPost(page: Page, gameTitle: string): Promise<void> {
  await page.getByRole("button", { name: /post signal/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Game field — label "Game", placeholder "e.g. Valorant"
  await dialog.getByPlaceholder(/e\.g\. valorant/i).fill(gameTitle);

  // Expiry: clear hours to 0, minutes to 30 (≥ 15 min rule)
  const hoursInput = dialog.getByLabel(/^hours$/i);
  await hoursInput.fill("");
  await hoursInput.fill("0");
  const minutesInput = dialog.getByLabel(/^minutes$/i);
  await minutesInput.fill("");
  await minutesInput.fill("30");

  // Briefing / description
  await dialog.getByPlaceholder(/what are you playing/i).fill("E2E test signal — please ignore");

  // Submit — button text is "BROADCAST" (CSS uppercased, DOM text is "BROADCAST")
  await dialog.getByRole("button", { name: /^broadcast$/i }).click();

  // Dialog closes after successful submission
  await expect(dialog).not.toBeVisible({ timeout: 12_000 });
}

/**
 * Click the author's CLOSE button on a post card and confirm in the dialog.
 * `gameTitle` is used to scope the locator to the right card.
 */
async function closePost(page: Page, gameTitle: string): Promise<void> {
  const card = page.locator("div.border", { hasText: gameTitle }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByRole("button", { name: /^close$/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /close signal/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("LFG post lifecycle", () => {
  /**
   * Happy path: author creates a post, responder responds, author closes it,
   * and the CLOSED badge appears on the author's card.
   */
  test("create → respond → close → CLOSED badge visible to author", async ({ browser }) => {
    const gameTitle = `E2E Game ${uid()}`;
    const author = makeUser("aut");
    const responder = makeUser("rsp");

    // ── Author: register and create post ──────────────────────────────────────
    const authorCtx = await browser.newContext();
    const authorPage = await authorCtx.newPage();
    await registerUser(authorPage, author);
    await goToLfg(authorPage);
    await createPost(authorPage, gameTitle);

    // Post card must appear on the author's page
    const authorCard = authorPage.locator("div.border", { hasText: gameTitle }).first();
    await expect(authorCard).toBeVisible({ timeout: 10_000 });

    // ── Responder: register and respond to the post ───────────────────────────
    const responderCtx = await browser.newContext();
    const responderPage = await responderCtx.newPage();
    await registerUser(responderPage, responder);
    await goToLfg(responderPage);

    const responderCard = responderPage.locator("div.border", { hasText: gameTitle }).first();
    await expect(responderCard).toBeVisible({ timeout: 14_000 });
    await responderCard.getByRole("button", { name: /^respond$/i }).click();

    // "SIGNAL SENT" badge replaces the Respond button
    await expect(responderCard.getByText(/signal sent/i)).toBeVisible({ timeout: 10_000 });

    // ── Author: reload and close the post ─────────────────────────────────────
    await goToLfg(authorPage);
    await closePost(authorPage, gameTitle);

    // CLOSED badge must appear on the author's post card
    const closedCard = authorPage.locator("div.border", { hasText: gameTitle }).first();
    await expect(closedCard.getByText(/\bclosed\b/i)).toBeVisible({ timeout: 10_000 });

    await authorCtx.close();
    await responderCtx.close();
  });

  /**
   * Stale-view toast: the responder loads the page while the post is open, the
   * author closes it in another context, and then the responder clicks Respond.
   * The 409 from the API must surface as the "Signal closed" destructive toast.
   */
  test("respond to a post closed after page load → 'Signal closed' toast", async ({ browser }) => {
    const gameTitle = `E2E Closed ${uid()}`;
    const author = makeUser("aut");
    const responder = makeUser("rsp");

    // ── Author: register and create post ──────────────────────────────────────
    const authorCtx = await browser.newContext();
    const authorPage = await authorCtx.newPage();
    await registerUser(authorPage, author);
    await goToLfg(authorPage);
    await createPost(authorPage, gameTitle);

    // ── Responder: register, navigate to /lfg while the post is still open ───
    const responderCtx = await browser.newContext();
    const responderPage = await responderCtx.newPage();
    await registerUser(responderPage, responder);
    await goToLfg(responderPage);

    const responderCard = responderPage.locator("div.border", { hasText: gameTitle }).first();
    await expect(responderCard).toBeVisible({ timeout: 14_000 });

    // Confirm the Respond button is present (post still open at this moment)
    const respondBtn = responderCard.getByRole("button", { name: /^respond$/i });
    await expect(respondBtn).toBeVisible();

    // ── Author: close the post while the responder's page stays loaded ────────
    await goToLfg(authorPage);
    await closePost(authorPage, gameTitle);

    // ── Responder: disable the background refetch so the stale card persists,
    //    then click Respond — the API returns 409 and the toast fires ──────────
    await responderPage.evaluate(() => {
      const orig = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        // Block only GET /lfg list polls so the stale open card stays visible
        if (url.includes("/api/lfg") && (!init?.method || init.method === "GET")) {
          return new Promise(() => {}); // stall indefinitely for this test step
        }
        return orig(input, init);
      };
    });

    await respondBtn.click();

    // The destructive toast title must contain "Signal closed".
    // Use .first() to avoid the strict-mode violation caused by the aria-live
    // notification span that also echoes the same text.
    await expect(
      responderPage.getByText(/signal closed/i).first(),
    ).toBeVisible({ timeout: 12_000 });

    await authorCtx.close();
    await responderCtx.close();
  });
});

// ─── Filter tests ─────────────────────────────────────────────────────────────

test.describe("LFG client-side filter", () => {
  /**
   * Create two posts with distinct game titles, type one title into the filter,
   * confirm only the matching card is visible, then clear and confirm both return.
   */
  test("filter hides non-matching posts and restores all when cleared", async ({ browser }) => {
    const gameA = `FilterGameA_${uid()}`;
    const gameB = `FilterGameB_${uid()}`;
    const author = makeUser("flt");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await registerUser(page, author);
    await goToLfg(page);

    // Create post A
    await createPost(page, gameA);
    // Wait for card A to appear before creating the second post
    await expect(page.locator("div.border", { hasText: gameA }).first()).toBeVisible({ timeout: 10_000 });

    // Create post B
    await createPost(page, gameB);
    await expect(page.locator("div.border", { hasText: gameB }).first()).toBeVisible({ timeout: 10_000 });

    // Both cards should be visible before any filter is applied
    await expect(page.locator("div.border", { hasText: gameA }).first()).toBeVisible();
    await expect(page.locator("div.border", { hasText: gameB }).first()).toBeVisible();

    // Type game title A into the filter — only card A should remain
    const filterInput = page.getByPlaceholder(/filter by game/i);
    await filterInput.fill(gameA);

    await expect(page.locator("div.border", { hasText: gameA }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("div.border", { hasText: gameB })).not.toBeVisible({ timeout: 5_000 });

    // Clear the filter — both cards should reappear
    await filterInput.clear();

    await expect(page.locator("div.border", { hasText: gameA }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("div.border", { hasText: gameB }).first()).toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });
});
