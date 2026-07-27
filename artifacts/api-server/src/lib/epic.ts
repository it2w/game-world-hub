// Epic Games OAuth 2.0 helpers
// Docs: https://dev.epicgames.com/docs/epic-account-services/auth/auth-interface

const EPIC_AUTHORIZE_URL = "https://www.epicgames.com/id/authorize";
const EPIC_TOKEN_URL    = "https://api.epicgames.com/epic/oauth/v2/token";
const EPIC_ACCOUNTS_URL = "https://api.epicgames.com/epic/id/v2/accounts";

export class EpicConfigError extends Error {}

/**
 * Build the Epic Games OAuth authorization URL.
 * The redirect_uri must be registered in the Epic developer portal.
 */
export function buildEpicOAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.EPIC_CLIENT_ID;
  if (!clientId) throw new EpicConfigError("EPIC_CLIENT_ID is not set");

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "basic_profile openid",
    state,
  });
  return `${EPIC_AUTHORIZE_URL}?${params.toString()}`;
}

interface EpicTokenResponse {
  access_token:  string;
  account_id:    string;
  /** Included in most Epic OAuth responses */
  displayName?:  string;
  /** Older endpoint field name */
  display_name?: string;
}

/**
 * Exchange an authorization code for an Epic account identity.
 * Returns the verified accountId and display name.
 */
export async function exchangeEpicCode(
  code:        string,
  redirectUri: string,
): Promise<{ accountId: string; displayName: string }> {
  const clientId     = process.env.EPIC_CLIENT_ID;
  const clientSecret = process.env.EPIC_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new EpicConfigError("EPIC_CLIENT_ID / EPIC_CLIENT_SECRET not set");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  // Step 1: exchange the code for an access token
  const tokenResp = await fetch(EPIC_TOKEN_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text().catch(() => "");
    throw new Error(`Epic token exchange failed (${tokenResp.status}): ${text}`);
  }

  const data      = (await tokenResp.json()) as EpicTokenResponse;
  const accountId = data.account_id;

  // Some Epic OAuth v2 responses include displayName directly in the token payload
  let displayName: string = data.displayName ?? data.display_name ?? "";

  // Step 2: if not present, fetch it from the accounts endpoint (best practice)
  if (!displayName && data.access_token) {
    try {
      const acctResp = await fetch(
        `${EPIC_ACCOUNTS_URL}?accountId=${encodeURIComponent(accountId)}`,
        { headers: { Authorization: `Bearer ${data.access_token}` } },
      );
      if (acctResp.ok) {
        const accts = (await acctResp.json()) as { displayName?: string }[];
        displayName = accts[0]?.displayName ?? "";
      }
    } catch {
      // Non-fatal — fall through to accountId fallback
    }
  }

  return { accountId, displayName: displayName || accountId };
}
