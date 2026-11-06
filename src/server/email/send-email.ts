import { env } from "@/server/env";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional rich body; the text twin is always required. */
  html?: string;
  attachments?: EmailAttachment[];
}

/** Why a send failed, without anything that could leak: no address, no body, no key. */
export type EmailFailureCategory = "NOT_CONFIGURED" | "NETWORK" | "RATE_LIMITED" | "REJECTED" | "PROVIDER_ERROR";

export class EmailDeliveryError extends Error {
  constructor(
    readonly category: EmailFailureCategory,
    /** A retry may succeed (a network error, a rate limit, a provider outage). */
    readonly retryable: boolean,
  ) {
    super(`Email delivery failed: ${category}`);
    this.name = "EmailDeliveryError";
  }
}

const PROVIDER_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

// Real mail leaves only from a deployed environment that has a key. Local and test
// runs always use the sink (SEC-01), even if a key happens to be in the shell.
const sendsForReal = () => Boolean(env.EMAIL_PROVIDER_API_KEY) && env.APP_ENV !== "local" && env.APP_ENV !== "test";

/**
 * ADR-0004: one transactional provider over HTTP, called only from the outbox
 * handlers (and the account mails Better Auth asks for). A failure throws an
 * EmailDeliveryError with a category and whether a retry makes sense, so the
 * outbox can back off or give up without ever storing the recipient or the text.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!sendsForReal()) {
    // The sink prints the whole text, links with tokens included, so it never runs on a hosted environment.
    if (env.APP_ENV !== "local" && env.APP_ENV !== "test") throw new EmailDeliveryError("NOT_CONFIGURED", false);
    console.log("[email:dev-sink]", {
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments?.map((attachment) => attachment.filename),
    });
    return;
  }

  let response: Response;
  try {
    response = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.attachments?.length
          ? { attachments: message.attachments.map((attachment) => ({ filename: attachment.filename, content: attachment.content.toString("base64") })) }
          : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    throw new EmailDeliveryError("NETWORK", true);
  }

  if (response.ok) return;
  if (response.status === 429) throw new EmailDeliveryError("RATE_LIMITED", true);
  if (response.status >= 500) throw new EmailDeliveryError("PROVIDER_ERROR", true);
  throw new EmailDeliveryError("REJECTED", false);
}
