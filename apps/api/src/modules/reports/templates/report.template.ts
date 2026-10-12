import type { ReportData } from '../report-data.service';

/**
 * The report PDF, as a self-contained HTML document.
 *
 * Plain HTML and CSS on purpose: a print stylesheet is far easier to reason
 * about across page breaks than a layout engine, and the one chart is inline
 * SVG so there is nothing to load at render time.
 *
 * `ar` reports render right-to-left; no string here is hard-coded twice, the
 * labels come from one table below.
 */

type Labels = Record<string, string>;

const EN: Labels = {
  tournament: 'Tournament',
  period: 'Period',
  stadium: 'Stadium',
  allStadiums: 'All stadiums',
  generated: 'Generated',
  compliance: 'Compliance',
  noScore: 'No score',
  inspections: 'Inspections',
  observations: 'Observations',
  findings: 'Findings',
  open: 'Open',
  closed: 'Closed',
  overdue: 'Overdue',
  closureRate: 'Closure rate',
  avgDaysToClose: 'Avg. days to close',
  riskIndex: 'Risk index',
  manHours: 'Man-hours',
  headcount: 'Workforce',
  incidents: 'Recordable incidents',
  nearMisses: 'Near misses',
  incidentRate: 'Incident rate / 200k hrs',
  eodCompliance: 'EOD submissions',
  eodStats: 'Daily HSE statistics (EOD reports)',
  spectators: 'Spectators',
  workRelatedMedical: 'Work-related medical cases',
  nonWorkRelatedMedical: 'Non-work-related medical cases',
  firstAidCases: 'First aid cases',
  fireIncidents: 'Fire incidents',
  otherIncidents: 'Other incidents',
  hseObservationsReported: 'HSE observations reported',
  summary: 'Executive summary',
  trend: 'Compliance trend',
  byStadium: 'By stadium',
  byDiscipline: 'By discipline',
  byInspector: 'By inspector',
  repeatFailures: 'Most frequent non-compliances',
  openCritical: 'Open high and critical findings',
  recentlyClosed: 'Recently closed findings',
  aiInsights: 'AI intelligence',
  aiDisclaimer:
    'AI-generated from aggregated figures in this report, reviewed and approved by an HSE Administrator.',
  reference: 'Ref',
  title: 'Title',
  severity: 'Severity',
  status: 'Status',
  raised: 'Raised',
  due: 'Due',
  assignee: 'Assignee',
  item: 'Item',
  question: 'Question',
  count: 'Count',
  name: 'Name',
  yes: 'Yes',
  no: 'No',
  na: 'N/A',
  nothingToShow: 'Nothing recorded in this period.',
  confidential: 'Confidential - HSE internal',
};

const AR: Labels = {
  ...EN,
  tournament: 'البطولة',
  period: 'الفترة',
  stadium: 'الملعب',
  allStadiums: 'جميع الملاعب',
  generated: 'تاريخ الإنشاء',
  compliance: 'نسبة الالتزام',
  noScore: 'لا يوجد تقييم',
  inspections: 'التفتيشات',
  observations: 'الملاحظات',
  findings: 'المخالفات',
  open: 'مفتوحة',
  closed: 'مغلقة',
  overdue: 'متأخرة',
  summary: 'الملخص التنفيذي',
  trend: 'اتجاه الالتزام',
  byStadium: 'حسب الملعب',
  byDiscipline: 'حسب التخصص',
  byInspector: 'حسب المفتش',
  aiInsights: 'تحليلات الذكاء الاصطناعي',
  confidential: 'سري - داخلي',
  eodStats: 'إحصاءات الصحة والسلامة اليومية (تقارير نهاية اليوم)',
  spectators: 'المتفرجون',
  workRelatedMedical: 'حالات طبية مرتبطة بالعمل',
  nonWorkRelatedMedical: 'حالات طبية غير مرتبطة بالعمل',
  firstAidCases: 'حالات الإسعافات الأولية',
  fireIncidents: 'حوادث الحريق',
  otherIncidents: 'حوادث أخرى',
  hseObservationsReported: 'ملاحظات الصحة والسلامة المبلغ عنها',
};

export function renderReportHtml(data: ReportData): string {
  const rtl = data.meta.locale === 'ar';
  const t = rtl ? AR : EN;

  return `<!doctype html>
<html lang="${data.meta.locale}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${esc(data.meta.title)}</title>
<style>${css(rtl)}</style>
</head>
<body>
${coverPage(data, t)}
${summaryPage(data, t)}
${breakdownPages(data, t)}
${findingPages(data, t)}
${aiPage(data, t)}
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

function coverPage(data: ReportData, t: Labels): string {
  const band = data.summary.complianceBand;
  return `
<section class="page cover">
  <div class="cover-top">
    <div class="brand">Ahlan HSE</div>
    <div class="confidential">${esc(t.confidential)}</div>
  </div>
  <h1>${esc(data.meta.title)}</h1>
  <dl class="cover-meta">
    <dt>${esc(t.tournament)}</dt><dd>${esc(data.meta.tournamentName)}</dd>
    <dt>${esc(t.stadium)}</dt><dd>${esc(data.meta.stadiumName ?? t.allStadiums)}</dd>
    <dt>${esc(t.period)}</dt><dd>${esc(data.meta.periodStart)} &rarr; ${esc(data.meta.periodEnd)}</dd>
    <dt>${esc(t.generated)}</dt><dd>${esc(formatDateTime(data.meta.generatedAt))}</dd>
  </dl>
  <div class="cover-score band-${band ?? 'NONE'}">
    <div class="cover-score-value">${percent(data.summary.compliancePercent, t)}</div>
    <div class="cover-score-label">${esc(t.compliance)}${band ? ` &middot; ${esc(band)}` : ''}</div>
  </div>
  ${data.meta.note ? `<p class="cover-note">${esc(data.meta.note)}</p>` : ''}
</section>`;
}

function summaryPage(data: ReportData, t: Labels): string {
  const s = data.summary;
  const delta =
    s.complianceDelta === null
      ? ''
      : `<span class="delta ${s.complianceDelta >= 0 ? 'up' : 'down'}">${
          s.complianceDelta >= 0 ? '+' : ''
        }${s.complianceDelta} pts</span>`;

  return `
<section class="page">
  <h2>${esc(t.summary)}</h2>
  <div class="kpi-grid">
    ${kpi(t.compliance, `${percent(s.compliancePercent, t)} ${delta}`, `${s.yesCount} ${t.yes} / ${s.noCount} ${t.no} / ${s.naCount} ${t.na}`)}
    ${kpi(t.inspections, String(s.inspections))}
    ${kpi(t.observations, String(s.observations))}
    ${kpi(t.findings, String(s.findingsTotal), `${s.findingsOpen} ${t.open} &middot; ${s.findingsClosed} ${t.closed} &middot; ${s.findingsOverdue} ${t.overdue}`)}
    ${kpi(t.closureRate, percent(s.closureRate, t))}
    ${kpi(t.avgDaysToClose, s.averageDaysToClose === null ? '&mdash;' : String(s.averageDaysToClose))}
    ${kpi(t.riskIndex, String(s.riskIndex))}
    ${kpi(t.headcount, String(s.totalHeadcount))}
    ${kpi(t.manHours, s.totalManHours)}
    ${kpi(t.incidents, String(s.recordableIncidents))}
    ${kpi(t.nearMisses, String(s.nearMisses))}
    ${kpi(t.incidentRate, s.incidentRate === null ? '&mdash;' : String(s.incidentRate))}
    ${kpi(t.eodCompliance, `${s.eodSubmitted} / ${s.eodExpected}`)}
  </div>
${eodStatsBlock(data, t)}

  <h3>${esc(t.trend)}</h3>
  ${trendChart(data.trend, t)}
</section>`;
}

function eodStatsBlock(data: ReportData, t: Labels): string {
  const e = data.eodStats;
  if (!e || e.reports === 0) return '';
  return `
  <h3>${esc(t.eodStats)}</h3>
  <div class="kpi-grid">
    ${kpi(t.spectators, String(e.totalSpectators))}
    ${kpi(t.workRelatedMedical, String(e.workRelatedMedical))}
    ${kpi(t.nonWorkRelatedMedical, String(e.nonWorkRelatedMedical))}
    ${kpi(t.firstAidCases, String(e.firstAidCases))}
    ${kpi(t.fireIncidents, String(e.fireIncidents))}
    ${kpi(t.otherIncidents, String(e.otherIncidents))}
    ${kpi(t.hseObservationsReported, String(e.hseObservationsReported))}
  </div>`;
}

function breakdownPages(data: ReportData, t: Labels): string {
  const stadiumTable =
    data.byStadium.length === 0
      ? ''
      : `
  <h2>${esc(t.byStadium)}</h2>
  ${table(
    [t.stadium, t.compliance, t.inspections, t.observations, t.findings, t.overdue, t.manHours],
    data.byStadium.map((row) => [
      `${esc(row.stadiumName)} <span class="muted">${esc(row.stadiumCode)}</span>`,
      percent(row.compliancePercent, t),
      String(row.inspections),
      String(row.observations),
      String(row.findingsTotal),
      row.findingsOverdue > 0 ? `<strong class="bad">${row.findingsOverdue}</strong>` : '0',
      row.totalManHours,
    ]),
    t,
  )}`;

  const disciplineRows = data.byDiscipline.filter(
    (row) => row.observations > 0 || row.findings > 0 || row.compliancePercent !== null,
  );

  return `
<section class="page">
  ${stadiumTable}
  <h2>${esc(t.byDiscipline)}</h2>
  ${table(
    [t.name, t.compliance, t.observations, t.findings, 'CRITICAL', 'HIGH'],
    disciplineRows.map((row) => [
      esc(row.disciplineName),
      percent(row.compliancePercent, t),
      String(row.observations),
      String(row.findings),
      String(row.severity.CRITICAL),
      String(row.severity.HIGH),
    ]),
    t,
  )}

  <h2>${esc(t.byInspector)}</h2>
  ${table(
    [t.name, t.inspections, t.observations, t.eodCompliance, t.compliance],
    data.byInspector
      .filter((row) => row.inspections > 0 || row.observations > 0 || row.eodSubmitted > 0)
      .map((row) => [
        esc(row.inspectorName),
        String(row.inspections),
        String(row.observations),
        `${row.eodSubmitted} / ${row.eodExpected}`,
        percent(row.compliancePercent, t),
      ]),
    t,
  )}
</section>`;
}

function findingPages(data: ReportData, t: Labels): string {
  return `
<section class="page">
  <h2>${esc(t.repeatFailures)}</h2>
  ${table(
    [t.item, t.question, t.count, t.severity],
    data.topRepeatFindings.map((row) => [
      `<code>${esc(row.itemCode)}</code>`,
      esc(row.question),
      String(row.noCount),
      severityPill(row.severity),
    ]),
    t,
  )}

  <h2>${esc(t.openCritical)}</h2>
  ${table(
    [t.reference, t.stadium, t.title, t.severity, t.status, t.due, t.assignee],
    data.openCriticalFindings.map((row) => [
      `<code>${esc(row.reference)}</code>`,
      esc(row.stadiumName),
      esc(row.title),
      severityPill(row.severity),
      esc(row.status),
      row.dueDate
        ? row.isOverdue
          ? `<strong class="bad">${esc(row.dueDate)}</strong>`
          : esc(row.dueDate)
        : '&mdash;',
      esc(row.assignee ?? '—'),
    ]),
    t,
  )}

  <h2>${esc(t.recentlyClosed)}</h2>
  ${table(
    [t.reference, t.stadium, t.title, t.severity, t.raised],
    data.closedFindings.map((row) => [
      `<code>${esc(row.reference)}</code>`,
      esc(row.stadiumName),
      esc(row.title),
      severityPill(row.severity),
      esc(row.raisedOn),
    ]),
    t,
  )}
</section>`;
}

function aiPage(data: ReportData, t: Labels): string {
  if (data.aiInsights.length === 0) return '';
  return `
<section class="page">
  <h2>${esc(t.aiInsights)}</h2>
  <p class="ai-disclaimer">${esc(t.aiDisclaimer)}</p>
  ${data.aiInsights
    .map(
      (insight) => `
  <article class="ai-card">
    <div class="ai-badge">AI-generated &middot; ${esc(insight.kind)}</div>
    <h3>${esc(insight.title)}</h3>
    <p>${esc(insight.body)}</p>
    ${
      insight.bullets.length > 0
        ? `<ul>${insight.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}</ul>`
        : ''
    }
  </article>`,
    )
    .join('')}
</section>`;
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

function kpi(label: string, value: string, hint?: string): string {
  return `
  <div class="kpi">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${value}</div>
    ${hint ? `<div class="kpi-hint">${hint}</div>` : ''}
  </div>`;
}

function table(headers: string[], rows: string[][], t: Labels): string {
  if (rows.length === 0) {
    return `<p class="empty">${esc(t.nothingToShow)}</p>`;
  }
  return `
  <table>
    <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>`;
}

/** Inline SVG bar chart: nothing to fetch, nothing to fail at render time. */
function trendChart(points: ReportData['trend'], t: Labels): string {
  const scored = points.filter((point) => point.compliancePercent !== null);
  if (scored.length === 0) return `<p class="empty">${esc(t.nothingToShow)}</p>`;

  const width = 720;
  const height = 180;
  const padding = { top: 8, bottom: 26, left: 34, right: 8 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const barWidth = Math.max(2, Math.min(28, plotWidth / scored.length - 4));

  const bars = scored
    .map((point, index) => {
      const value = point.compliancePercent ?? 0;
      const barHeight = (value / 100) * plotHeight;
      const x = padding.left + (index + 0.5) * (plotWidth / scored.length) - barWidth / 2;
      const y = padding.top + plotHeight - barHeight;
      const colour = value >= 95 ? '#15803d' : value >= 85 ? '#65a30d' : value >= 70 ? '#ca8a04' : '#b91c1c';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${colour}" rx="2"/>`;
    })
    .join('');

  const gridLines = [0, 25, 50, 75, 100]
    .map((value) => {
      const y = padding.top + plotHeight - (value / 100) * plotHeight;
      return `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>
        <text x="${padding.left - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#6b7280">${value}</text>`;
    })
    .join('');

  // Only the ends are labelled: a 90-day axis would otherwise be unreadable.
  const first = scored[0];
  const last = scored[scored.length - 1];
  const axis = `
    <text x="${padding.left}" y="${height - 8}" font-size="9" fill="#6b7280">${esc(first?.date ?? '')}</text>
    <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" font-size="9" fill="#6b7280">${esc(last?.date ?? '')}</text>`;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(t.trend)}">
    ${gridLines}${bars}${axis}
  </svg>`;
}

function severityPill(severity: string): string {
  return `<span class="pill sev-${esc(severity)}">${esc(severity)}</span>`;
}

function percent(value: number | null, t: Labels): string {
  return value === null ? `<span class="muted">${esc(t.noScore)}</span>` : `${value.toFixed(2)}%`;
}

function formatDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

/** Everything interpolated into the document goes through here. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function css(rtl: boolean): string {
  return `
  :root {
    --ink: #111827;
    --muted: #6b7280;
    --line: #e5e7eb;
    --accent: #0f766e;
    --bad: #b91c1c;
    --good: #15803d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, "Noto Sans Arabic", sans-serif;
    color: var(--ink);
    font-size: 10.5pt;
    line-height: 1.45;
    direction: ${rtl ? 'rtl' : 'ltr'};
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  h1 { font-size: 26pt; margin: 24pt 0 12pt; letter-spacing: -0.4pt; }
  h2 { font-size: 15pt; margin: 18pt 0 8pt; padding-bottom: 4pt; border-bottom: 2px solid var(--accent); }
  h3 { font-size: 12pt; margin: 14pt 0 6pt; }

  .cover { padding-top: 40pt; }
  .cover-top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--line); padding-bottom: 8pt; }
  .brand { font-weight: 700; font-size: 13pt; color: var(--accent); letter-spacing: 0.5pt; }
  .confidential { font-size: 8.5pt; color: var(--muted); text-transform: uppercase; letter-spacing: 1pt; }
  .cover-meta { display: grid; grid-template-columns: max-content 1fr; gap: 4pt 16pt; margin: 20pt 0 28pt; }
  .cover-meta dt { color: var(--muted); font-size: 9.5pt; }
  .cover-meta dd { margin: 0; font-weight: 600; }
  .cover-score { border: 1px solid var(--line); border-radius: 8pt; padding: 20pt; text-align: center; background: #f9fafb; }
  .cover-score-value { font-size: 40pt; font-weight: 700; line-height: 1; }
  .cover-score-label { color: var(--muted); margin-top: 6pt; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.8pt; }
  .cover-score.band-EXCELLENT .cover-score-value, .cover-score.band-GOOD .cover-score-value { color: var(--good); }
  .cover-score.band-FAIR .cover-score-value { color: #ca8a04; }
  .cover-score.band-POOR .cover-score-value, .cover-score.band-CRITICAL .cover-score-value { color: var(--bad); }
  .cover-note { margin-top: 18pt; padding: 10pt 12pt; background: #f3f4f6; border-radius: 6pt; font-size: 9.5pt; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; }
  .kpi { border: 1px solid var(--line); border-radius: 6pt; padding: 8pt 10pt; }
  .kpi-label { font-size: 8pt; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5pt; }
  .kpi-value { font-size: 16pt; font-weight: 700; margin-top: 2pt; }
  .kpi-hint { font-size: 8pt; color: var(--muted); margin-top: 2pt; }
  .delta { font-size: 9pt; font-weight: 600; }
  .delta.up { color: var(--good); }
  .delta.down { color: var(--bad); }

  table { width: 100%; border-collapse: collapse; margin: 6pt 0 14pt; font-size: 9pt; }
  th, td { text-align: ${rtl ? 'right' : 'left'}; padding: 5pt 6pt; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: #f3f4f6; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #374151; }
  tbody tr:nth-child(even) { background: #fafafa; }
  code { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 8.5pt; }

  .pill { display: inline-block; padding: 1pt 5pt; border-radius: 8pt; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.3pt; }
  .sev-LOW { background: #e0f2fe; color: #075985; }
  .sev-MEDIUM { background: #fef3c7; color: #92400e; }
  .sev-HIGH { background: #ffedd5; color: #9a3412; }
  .sev-CRITICAL { background: #fee2e2; color: #991b1b; }

  .muted { color: var(--muted); }
  .bad { color: var(--bad); }
  .empty { color: var(--muted); font-style: italic; margin: 6pt 0 14pt; }
  .chart { margin: 8pt 0 4pt; }

  .ai-disclaimer { font-size: 8.5pt; color: var(--muted); background: #f3f4f6; padding: 8pt 10pt; border-radius: 6pt; }
  .ai-card { border: 1px solid var(--line); border-${rtl ? 'right' : 'left'}: 3px solid #7c3aed; border-radius: 6pt; padding: 10pt 12pt; margin: 10pt 0; page-break-inside: avoid; }
  .ai-badge { font-size: 7.5pt; font-weight: 700; color: #6d28d9; text-transform: uppercase; letter-spacing: 0.6pt; }
  .ai-card h3 { margin: 4pt 0 6pt; }
  .ai-card ul { margin: 6pt 0 0; padding-${rtl ? 'right' : 'left'}: 16pt; }

  tr, .kpi, article { page-break-inside: avoid; }
  `;
}
