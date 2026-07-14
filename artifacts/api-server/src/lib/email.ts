import { appendFileSync } from "node:fs";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

/** Dev-only mailbox file so codes can be read without trawling console logs. */
const DEV_MAILBOX_PATH = "/tmp/gwh-dev-emails.jsonl";

/**
 * Sender shown to recipients. Resend's sandbox sender works out of the box but
 * only delivers to the Resend account owner's own inbox; verify a domain in
 * Resend and set EMAIL_FROM (e.g. "Game World Hub <no-reply@yourdomain.com>")
 * to reach real users.
 */
const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Game World Hub <onboarding@resend.dev>";

let connectors: ReplitConnectors | undefined;

/** Minimal structural view of a fetch-style response (avoids DOM lib types). */
type FetchishResponse = {
  status: number;
  text?: () => Promise<string>;
};

async function deliverViaResend(msg: EmailMessage): Promise<void> {
  connectors ??= new ReplitConnectors();
  const res: unknown = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    }),
  });

  // fetch-style response
  if (res && typeof res === "object" && typeof (res as FetchishResponse).status === "number") {
    const r = res as FetchishResponse;
    if (r.status < 200 || r.status >= 300) {
      const detail =
        typeof r.text === "function" ? await r.text().catch(() => "") : "";
      throw new Error(
        `Resend rejected the email (HTTP ${r.status}): ${detail.slice(0, 300)}`,
      );
    }
    return;
  }

  // parsed-object response — Resend returns { id } on success
  const obj = res as Record<string, unknown> | null;
  if (obj && typeof obj.id === "string") return;
  throw new Error(
    `Unexpected Resend response: ${JSON.stringify(obj ?? null).slice(0, 300)}`,
  );
}

/**
 * Sends a transactional email (verification codes, password resets, 2FA).
 *
 * Delivery: production sends through the Resend connector and fails loudly if
 * it can't. Development keeps writing to the dev mailbox so all flows and
 * tests work offline; set EMAIL_DELIVERY=resend to also send real mail from
 * development.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const forceReal = process.env.EMAIL_DELIVERY === "resend";

  if (!isProd) {
    logger.info({ to: msg.to, subject: msg.subject }, "[DEV EMAIL] captured to mailbox");
    try {
      appendFileSync(
        DEV_MAILBOX_PATH,
        JSON.stringify({ at: new Date().toISOString(), ...msg }) + "\n",
      );
    } catch {
      // best-effort dev convenience only
    }
  }

  if (isProd || forceReal) {
    await deliverViaResend(msg);
  }
}
