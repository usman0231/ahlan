import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { AppConfig } from '../config/configuration';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Transactional email. Locally this points at Mailpit (http://localhost:8025),
 * so nothing is ever sent to a real address during development.
 *
 * A send failure is logged, never thrown: an admin approving an access request
 * must not fail because the mail server is down.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const mail = this.config.get('mail', { infer: true });
    this.from = mail.from;
    this.appUrl = this.config.get('publicAppUrl', { infer: true });
    this.transporter = createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text ?? stripHtml(message.html),
      });
      return true;
    } catch (error) {
      this.logger.warn(`Could not email ${message.to}: ${(error as Error).message}`);
      return false;
    }
  }

  async sendAccessRequestApproved(to: string, fullName: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Your Ahlan HSE access has been approved',
      html: layout(
        'Access approved',
        `<p>Hello ${escapeHtml(fullName)},</p>
         <p>An HSE Administrator has approved your access request. You can now sign in to
         the Ahlan HSE app with the email and password you registered with.</p>`,
      ),
    });
  }

  async sendAccessRequestRejected(to: string, fullName: string, note: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Your Ahlan HSE access request',
      html: layout(
        'Access request not approved',
        `<p>Hello ${escapeHtml(fullName)},</p>
         <p>Your access request has not been approved.</p>
         <p><strong>Reason:</strong> ${escapeHtml(note)}</p>
         <p>If you believe this is a mistake, contact your HSE Administrator.</p>`,
      ),
    });
  }

  async sendPasswordReset(to: string, fullName: string, token: string): Promise<boolean> {
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.send({
      to,
      subject: 'Reset your Ahlan HSE password',
      html: layout(
        'Reset your password',
        `<p>Hello ${escapeHtml(fullName)},</p>
         <p>Use the link below to choose a new password. It expires in one hour.</p>
         <p><a href="${link}">Reset password</a></p>
         <p>If you did not ask for this, you can ignore this email.</p>`,
      ),
    });
  }

  async sendReportReady(to: string, reportName: string, downloadUrl: string): Promise<boolean> {
    return this.send({
      to,
      subject: `${reportName} is ready`,
      html: layout(
        'Your report is ready',
        `<p>${escapeHtml(reportName)} has finished generating.</p>
         <p><a href="${downloadUrl}">Download the PDF</a></p>
         <p>The link expires shortly; you can always re-download it from the app.</p>`,
      ),
    });
  }
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#111827;background:#f9fafb;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#6b7280;margin:0">Ahlan HSE &middot; automated message, please do not reply.</p>
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
