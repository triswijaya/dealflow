import { describe, expect, it } from "vitest";
import { invitationEmail, resetPasswordEmail, verificationEmail } from "./account-emails";

describe("account emails", () => {
  it("carries the action link in both the html and the text body", () => {
    const url = "https://app.example/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";
    const message = verificationEmail({ to: "a@b.test", name: "Aditya", url });
    expect(message.subject).toBe("Verifikasi email Anda");
    expect(message.text).toContain(url);
    expect(message.html).toContain("token=abc&amp;callbackURL");
    expect(message.text).toContain("Link berlaku 24 jam.");
  });

  it("escapes user-controlled names in the html body", () => {
    const message = resetPasswordEmail({ to: "a@b.test", name: `<script>alert("x")</script>`, url: "https://app.example/r" });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("states the organization, the role and when the invitation ends", () => {
    const message = invitationEmail({
      to: "rina@b.test",
      organizationName: "NusaTech Solutions",
      inviterName: "Aditya Pratama",
      role: "SALES",
      url: "https://app.example/accept-invitation/xyz",
      expiresAt: new Date("2026-10-04T03:00:00Z"),
      timezone: "Asia/Jakarta",
    });
    expect(message.subject).toContain("NusaTech Solutions");
    expect(message.text).toContain("Aditya Pratama mengundang Anda bergabung ke NusaTech Solutions sebagai Sales.");
    expect(message.text).toContain("Undangan berlaku sampai 4 Okt 2026.");
  });
});
