import "server-only";
import nodemailer from "nodemailer";

// Separate from Supabase Auth's own SMTP config (used for signup/recovery
// emails) -- those credentials live inside Supabase and aren't reachable
// from app code. This is only for app-originated notifications (currently:
// the 24h pending-approval escalation email), reusing the same Gmail
// account's App Password but as its own env vars.
export async function sendNotificationEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const user = process.env.GMAIL_SMTP_USER;
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !appPassword) {
    throw new Error(
      "Missing GMAIL_SMTP_USER / GMAIL_SMTP_APP_PASSWORD environment variables (see .env.example)."
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });

  await transporter.sendMail({ from: user, to, subject, text });
}
