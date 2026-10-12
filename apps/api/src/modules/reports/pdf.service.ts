import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, type Browser } from 'playwright-core';

import type { AppConfig } from '../../config/configuration';

export interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
}

/**
 * HTML to PDF with headless Chromium.
 *
 * The browser is started once and kept: launching Chromium per report would
 * dominate the generation time. It only ever runs inside the worker.
 *
 * Needs a Chromium binary: `pnpm --filter api browsers:install`.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async render(html: string, options: { landscape?: boolean } = {}): Promise<PdfResult> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      // Keeps rendered dates and charts identical whatever the host zone is.
      timezoneId: 'UTC',
      locale: 'en-GB',
    });

    try {
      const page = await context.newPage();
      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: this.config.get('pdf', { infer: true }).timeoutMs,
      });
      // Let webfonts settle so the first page is not rendered in a fallback face.
      // Passed as an expression string: `document` is browser-side, not Node.
      await page.evaluate('document.fonts.ready');

      const buffer = await page.pdf({
        format: 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width:100%;font-size:9px;color:#6b7280;padding:0 14mm;display:flex;justify-content:space-between">
            <span>Ahlan HSE</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>`,
      });

      return { buffer, sizeBytes: buffer.byteLength };
    } finally {
      await context.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    // Concurrent jobs must not each launch their own browser.
    this.launching ??= this.launch();
    try {
      this.browser = await this.launching;
      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  private async launch(): Promise<Browser> {
    const executablePath = this.config.get('pdf', { infer: true }).chromiumPath;
    this.logger.log(`Launching Chromium${executablePath ? ` from ${executablePath}` : ''}`);
    try {
      return await chromium.launch({
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      });
    } catch (error) {
      throw new Error(
        `Could not start Chromium for PDF rendering. Run "pnpm --filter api browsers:install", ` +
          `or set PDF_CHROMIUM_PATH. Cause: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
