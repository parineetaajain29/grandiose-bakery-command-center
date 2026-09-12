// Report emailing — same Gmail-SMTP shape as Streamlit's send_report_email
// (app.py lines 996-1036: smtplib, starttls, login, an attached workbook),
// ported to nodemailer. Degrades to a clear "not configured" outcome rather
// than throwing when no credentials have been entered in Settings.
import nodemailer from 'nodemailer';
import { getEmailCredentials } from './settings.ts';

export type SendEmailOutcome = { ok: true } | { ok: false; reason: 'not_configured'; message: string } | { ok: false; reason: 'error'; message: string };

export function isEmailConfigured(): boolean {
  return getEmailCredentials() !== null;
}

export async function sendReportEmail(input: {
  to: string;
  subject: string;
  bodyText: string;
  attachment: { filename: string; content: Buffer; contentType: string };
}): Promise<SendEmailOutcome> {
  const credentials = getEmailCredentials();
  if (!credentials) {
    return { ok: false, reason: 'not_configured', message: "Email delivery isn't configured yet. Add a Gmail address and app password in Settings." };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: credentials.smtpServer,
      port: credentials.smtpPort,
      secure: false, // 587 + STARTTLS, same as the source (smtplib's starttls(), not implicit TLS on 465)
      auth: { user: credentials.emailAddress, pass: credentials.appPassword },
    });

    await transporter.sendMail({
      from: credentials.emailAddress,
      to: input.to,
      subject: input.subject,
      text: input.bodyText,
      attachments: [{ filename: input.attachment.filename, content: input.attachment.content, contentType: input.attachment.contentType }],
    });

    return { ok: true };
  } catch (err) {
    // Never return err.message to the caller (and never log it unredacted) —
    // nodemailer's own error objects can carry connection/auth config on
    // failure, and the app password must not reach an HTTP response, a log
    // line, or anywhere outside this function. Same write-only guarantee as
    // settings.ts, applied to the one place a raw exception could violate it.
    const raw = err instanceof Error ? err.message : String(err);
    const redacted = raw.split(credentials.appPassword).join('[redacted]');
    console.error('sendReportEmail failed:', redacted);
    return { ok: false, reason: 'error', message: 'Could not send email — check the SMTP credentials in Settings and try again.' };
  }
}
