# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lfg.spec.ts >> LFG client-side filter >> filter hides non-matching posts and restores all when cleared
- Location: e2e/lfg.spec.ts:271:3

# Error details

```
Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost/register
Call log:
  - navigating to "http://localhost/register", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This page isn’t working" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: localhost
      - text: is currently unable to handle this request.
    - generic [ref=e10]: HTTP ERROR 502
  - button "Reload" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * End-to-end tests for the LFG (Looking For Group) flow.
  3   |  *
  4   |  * Covered scenarios:
  5   |  *   1. Author creates a post → responder sees it and responds → author closes it
  6   |  *      → "CLOSED" badge appears on the post card for the author.
  7   |  *   2. When a responder clicks Respond on a post that was closed between page
  8   |  *      load and click, the UI shows a "Signal closed" toast (surfaces the 409).
  9   |  *
  10  |  * Each run uses unique usernames + game titles to avoid clashing with existing
  11  |  * development-database data.
  12  |  */
  13  | 
  14  | import { test, expect, type Page } from "@playwright/test";
  15  | 
  16  | // ─── Helpers ─────────────────────────────────────────────────────────────────
  17  | 
  18  | function uid(): string {
  19  |   return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  20  | }
  21  | 
  22  | interface TestUser {
  23  |   username: string;
  24  |   displayName: string;
  25  |   email: string;
  26  |   password: string;
  27  | }
  28  | 
  29  | function makeUser(role: string): TestUser {
  30  |   const id = uid();
  31  |   return {
  32  |     username: `${role}${id}`.slice(0, 30),
  33  |     displayName: `${role} ${id}`.slice(0, 50),
  34  |     email: `${role}${id}@lfgtest.invalid`,
  35  |     password: "testpass1",
  36  |   };
  37  | }
  38  | 
  39  | /**
  40  |  * Register a new account via the /register page using data-testid selectors
  41  |  * that are already present in the register form component.
  42  |  */
  43  | async function registerUser(page: Page, user: TestUser): Promise<void> {
> 44  |   await page.goto("/register");
      |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost/register
  45  |   await page.getByTestId("input-username").fill(user.username);
  46  |   // display-name field label is "Display Name"; use the data-testid
  47  |   await page.getByTestId("input-display-name").fill(user.displayName);
  48  |   await page.getByTestId("input-email").fill(user.email);
  49  |   // Password field has no data-testid, locate by type
  50  |   await page.locator('input[type="password"]').fill(user.password);
  51  |   // Submit button: data-testid="button-submit", text "ESTABLISH IDENTITY"
  52  |   await page.getByTestId("button-submit").click();
  53  |   // Successful register redirects away from /register
  54  |   await expect(page).not.toHaveURL(/\/register/, { timeout: 12_000 });
  55  | }
  56  | 
  57  | /** Navigate to /lfg and wait until the loading indicator is gone. */
  58  | async function goToLfg(page: Page): Promise<void> {
  59  |   await page.goto("/lfg");
  60  |   // "SCANNING FREQUENCIES..." text disappears once posts (or empty state) load
  61  |   await expect(page.getByText(/scanning frequencies/i)).not.toBeVisible({ timeout: 12_000 });
  62  | }
  63  | 
  64  | /**
  65  |  * Open the "POST SIGNAL" dialog, fill the form, and submit.
  66  |  * Waits for the dialog to close before returning.
  67  |  */
  68  | async function createPost(page: Page, gameTitle: string): Promise<void> {
  69  |   await page.getByRole("button", { name: /post signal/i }).click();
  70  |   const dialog = page.getByRole("dialog");
  71  |   await expect(dialog).toBeVisible();
  72  | 
  73  |   // Game field — label "Game", placeholder "e.g. Valorant"
  74  |   await dialog.getByPlaceholder(/e\.g\. valorant/i).fill(gameTitle);
  75  | 
  76  |   // Expiry: clear hours to 0, minutes to 30 (≥ 15 min rule)
  77  |   const hoursInput = dialog.getByLabel(/^hours$/i);
  78  |   await hoursInput.fill("");
  79  |   await hoursInput.fill("0");
  80  |   const minutesInput = dialog.getByLabel(/^minutes$/i);
  81  |   await minutesInput.fill("");
  82  |   await minutesInput.fill("30");
  83  | 
  84  |   // Briefing / description
  85  |   await dialog.getByPlaceholder(/what are you playing/i).fill("E2E test signal — please ignore");
  86  | 
  87  |   // Submit — button text is "BROADCAST" (CSS uppercased, DOM text is "BROADCAST")
  88  |   await dialog.getByRole("button", { name: /^broadcast$/i }).click();
  89  | 
  90  |   // Dialog closes after successful submission
  91  |   await expect(dialog).not.toBeVisible({ timeout: 12_000 });
  92  | }
  93  | 
  94  | /**
  95  |  * Click the author's CLOSE button on a post card and confirm in the dialog.
  96  |  * `gameTitle` is used to scope the locator to the right card.
  97  |  */
  98  | async function closePost(page: Page, gameTitle: string): Promise<void> {
  99  |   const card = page.locator("div.border", { hasText: gameTitle }).first();
  100 |   await expect(card).toBeVisible({ timeout: 10_000 });
  101 |   await card.getByRole("button", { name: /^close$/i }).click();
  102 | 
  103 |   const dialog = page.getByRole("dialog");
  104 |   await expect(dialog).toBeVisible();
  105 |   await dialog.getByRole("button", { name: /close signal/i }).click();
  106 |   await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  107 | }
  108 | 
  109 | // ─── Tests ───────────────────────────────────────────────────────────────────
  110 | 
  111 | test.describe("LFG post lifecycle", () => {
  112 |   /**
  113 |    * Happy path: author creates a post, responder responds, author closes it,
  114 |    * and the CLOSED badge appears on the author's card.
  115 |    */
  116 |   test("create → respond → close → CLOSED badge visible to author", async ({ browser }) => {
  117 |     const gameTitle = `E2E Game ${uid()}`;
  118 |     const author = makeUser("aut");
  119 |     const responder = makeUser("rsp");
  120 | 
  121 |     // ── Author: register and create post ──────────────────────────────────────
  122 |     const authorCtx = await browser.newContext();
  123 |     const authorPage = await authorCtx.newPage();
  124 |     await registerUser(authorPage, author);
  125 |     await goToLfg(authorPage);
  126 |     await createPost(authorPage, gameTitle);
  127 | 
  128 |     // Post card must appear on the author's page
  129 |     const authorCard = authorPage.locator("div.border", { hasText: gameTitle }).first();
  130 |     await expect(authorCard).toBeVisible({ timeout: 10_000 });
  131 | 
  132 |     // ── Responder: register and respond to the post ───────────────────────────
  133 |     const responderCtx = await browser.newContext();
  134 |     const responderPage = await responderCtx.newPage();
  135 |     await registerUser(responderPage, responder);
  136 |     await goToLfg(responderPage);
  137 | 
  138 |     const responderCard = responderPage.locator("div.border", { hasText: gameTitle }).first();
  139 |     await expect(responderCard).toBeVisible({ timeout: 14_000 });
  140 |     await responderCard.getByRole("button", { name: /^respond$/i }).click();
  141 | 
  142 |     // "SIGNAL SENT" badge replaces the Respond button
  143 |     await expect(responderCard.getByText(/signal sent/i)).toBeVisible({ timeout: 10_000 });
  144 | 
```