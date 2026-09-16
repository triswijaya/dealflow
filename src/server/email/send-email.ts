import { env } from "@/server/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Dev-safe email adapter (SEC-01: "Development menggunakan email sink/
 * transport aman; secret email produksi tidak diperlukan untuk menjalankan
 * unit tests"). Logs the message instead of sending it; there is no real
 * email account service wired up yet. A production provider is explicitly
 * out of scope until closer to public launch (§18.2).
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  console.log("[email:dev-sink]", {
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}
