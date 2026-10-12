/* eslint-env node */
/**
 * Renders the brand mark to the PNGs Expo needs: app icon, Android adaptive
 * foreground, splash and favicon.
 *
 *   pnpm --filter mobile brand:render
 *
 * Uses playwright-core (already in the workspace for PDF rendering) driving an
 * installed Chrome, so no extra browser download is needed. Point CHROME_PATH
 * at another Chromium if Chrome lives elsewhere.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'assets', 'brand');
const mark = fs.readFileSync(path.join(out, 'mark.svg'), 'utf8');

// On the navy tile the mark inverts: a white shield, royal check, gold roofline.
// A blue shield on a blue tile disappears at home-screen size.
const markOnNavy = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4EAFF"/>
    </linearGradient>
  </defs>
  <path d="M32 4 L54 12 V30 C54 44.5 44.4 55 32 60 C19.6 55 10 44.5 10 30 V12 Z" fill="url(#w)"/>
  <path d="M18 23.5 Q32 14.5 46 23.5" fill="none" stroke="#F2A900" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M21.5 35 L28.8 42.3 L42.5 28.6" fill="none" stroke="#2447D6" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const tile = (size, radius, inset) => `
<div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;position:relative;
  background:radial-gradient(circle at 18% 10%, rgba(140,160,255,.35), rgba(140,160,255,0) 55%),
             linear-gradient(145deg,#0B1736 0%,#16297A 50%,#2447D6 100%);">
  <div style="position:absolute;inset:${inset}px;">${markOnNavy.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
</div>`;

const bare = (size, inset) => `
<div style="width:${size}px;height:${size}px;position:relative;">
  <div style="position:absolute;inset:${inset}px;">${mark.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
</div>`;

const splash = (size) => `
<div style="width:${size}px;height:${size}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${size*0.05}px;font-family:'Segoe UI',Inter,Arial,sans-serif;">
  <div style="width:${size*0.42}px;height:${size*0.42}px;">${markOnNavy.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  <div style="display:flex;align-items:center;gap:${size*0.02}px;">
    <span style="color:#fff;font-weight:800;font-size:${size*0.11}px;letter-spacing:-${size*0.004}px;">Ahlan</span>
    <span style="background:#F2A900;color:#0B1530;font-weight:800;font-size:${size*0.045}px;letter-spacing:${size*0.004}px;padding:${size*0.008}px ${size*0.016}px;border-radius:${size*0.012}px;">HSE</span>
  </div>
</div>`;

const jobs = [
  { file: 'icon.png', size: 1024, html: tile(1024, 0, 168) },                 // stores round it themselves
  { file: 'adaptive-icon.png', size: 1024, html: bare(1024, 300) },           // Android safe zone
  { file: 'splash-icon.png', size: 1024, html: splash(1024) },
  { file: 'favicon.png', size: 192, html: tile(192, 44, 30) },
];

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      (process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : '/usr/bin/google-chrome'),
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const job of jobs) {
    await page.setViewportSize({ width: job.size, height: job.size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${job.html}</body></html>`);
    await page.screenshot({
      path: path.join(out, job.file),
      omitBackground: true,
      clip: { x: 0, y: 0, width: job.size, height: job.size },
    });
    console.log('wrote', job.file);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
