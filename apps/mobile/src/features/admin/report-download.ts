import { Linking, Platform } from 'react-native';
import type { Report } from '@ahlan/shared';

import { api } from '../../api/client';

/**
 * Opens a finished report's PDF.
 *
 * The list endpoint does not sign download URLs (they expire after a few
 * minutes), so a fresh one is fetched from `GET /reports/:id` at tap time.
 * On the web the tab is opened synchronously inside the click and pointed at
 * the PDF once the URL arrives; opening it after the request would be treated
 * as a popup and blocked by the browser.
 */
export async function openReportPdf(reportId: string): Promise<void> {
  const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
  try {
    const report = await api.get<Report>(`/reports/${reportId}`);
    if (!report.downloadUrl) throw new Error('Report has no file yet');
    if (tab) {
      tab.location.href = report.downloadUrl;
    } else {
      await Linking.openURL(report.downloadUrl);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
