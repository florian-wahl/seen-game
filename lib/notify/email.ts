import "server-only";
import { render } from "@react-email/components";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import NotifyEmail from "@/emails/NotifyEmail";
import { plainText, type Message } from "./messages";

/**
 * Send one notification email. Uses Resend when RESEND_API_KEY is set,
 * otherwise SMTP (Mailpit via the local Supabase stack, port 54325 by default).
 * Throws on failure so the caller can return 500 and let the sweep retry.
 */
export async function sendEmail(to: string, m: Message): Promise<"resend" | "smtp"> {
  const from = process.env.EMAIL_FROM || "Seen! <noreply@localhost>";
  const html = await render(
    NotifyEmail({ preheader: m.preheader, heading: m.heading, body: m.body, ctaLabel: m.ctaLabel, url: m.url }),
  );
  const text = plainText(m);

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from, to, subject: m.subject, html, text });
    if (error) throw new Error(`resend: ${error.name}: ${error.message}`);
    return "resend";
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "127.0.0.1",
    port: Number(process.env.SMTP_PORT || 54325),
    secure: false,
    ignoreTLS: true,
  });
  await transporter.sendMail({ from, to, subject: m.subject, html, text });
  return "smtp";
}
