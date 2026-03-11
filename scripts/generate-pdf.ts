/**
 * Generate professional PDFs from markdown docs with embedded screenshots.
 * Uses Pandoc for markdown→HTML, injects screenshots + professional CSS,
 * then Chrome headless for HTML→PDF.
 *
 * Run: npx tsx scripts/generate-pdf.ts
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DOCS = path.resolve(__dirname, '../docs');
const SCREENSHOTS = path.resolve(DOCS, 'screenshots');
const DIAGRAMS = path.resolve(DOCS, 'diagrams');

// ── CSS ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --brand: #1a56db;
  --brand-dark: #1e3a5f;
  --brand-accent: #4f46e5;
  --text: #1f2937;
  --text-light: #6b7280;
  --bg: #ffffff;
  --bg-alt: #f9fafb;
  --border: #e5e7eb;
  --code-bg: #f3f4f6;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--text);
  line-height: 1.7;
  font-size: 11pt;
  background: var(--bg);
}

/* Cover page */
.cover {
  page-break-after: always;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  text-align: center;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: white;
  padding: 60px;
}
.cover .logo {
  font-size: 48pt;
  font-weight: 700;
  letter-spacing: -1px;
  margin-bottom: 8px;
}
.cover .logo .accent { color: #60a5fa; }
.cover .subtitle {
  font-size: 20pt;
  font-weight: 300;
  color: #94a3b8;
  margin-bottom: 40px;
}
.cover .meta {
  font-size: 11pt;
  color: #64748b;
  line-height: 2;
}
.cover .meta strong { color: #94a3b8; }
.cover .divider {
  width: 80px;
  height: 3px;
  background: #3b82f6;
  margin: 30px auto;
  border-radius: 2px;
}

/* Table of contents */
.toc {
  page-break-after: always;
  padding: 60px;
}
.toc h2 {
  font-size: 18pt;
  color: var(--brand-dark);
  margin-bottom: 20px;
  border-bottom: 2px solid var(--brand);
  padding-bottom: 8px;
}
.toc ul { list-style: none; }
.toc li {
  padding: 6px 0;
  border-bottom: 1px dotted var(--border);
  font-size: 11pt;
}
.toc li a { color: var(--brand); text-decoration: none; }

/* Main content */
.content { padding: 40px 60px; }

h1 {
  font-size: 22pt;
  font-weight: 700;
  color: var(--brand-dark);
  margin: 40px 0 16px;
  page-break-after: avoid;
}
h2 {
  font-size: 16pt;
  font-weight: 600;
  color: var(--brand-dark);
  margin: 32px 0 12px;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--brand);
  page-break-after: avoid;
}
h3 {
  font-size: 13pt;
  font-weight: 600;
  color: var(--brand-accent);
  margin: 24px 0 8px;
  page-break-after: avoid;
}
h4 {
  font-size: 11pt;
  font-weight: 600;
  color: var(--text);
  margin: 16px 0 6px;
}

p { margin: 8px 0; }

/* Screenshots */
.screenshot-container {
  margin: 20px 0;
  page-break-inside: avoid;
}
.screenshot-container img {
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.screenshot-caption {
  text-align: center;
  font-size: 9pt;
  color: var(--text-light);
  font-style: italic;
  margin-top: 8px;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 10pt;
  page-break-inside: avoid;
}
th {
  background: var(--brand-dark);
  color: white;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
}
td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
tr:nth-child(even) td { background: var(--bg-alt); }

/* Code */
pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 9pt;
  line-height: 1.5;
  margin: 12px 0;
  page-break-inside: avoid;
}
code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 9pt;
}
p code, li code, td code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  color: #dc2626;
}

/* Lists */
ul, ol { margin: 8px 0 8px 24px; }
li { margin: 4px 0; }

/* Blockquote */
blockquote {
  border-left: 4px solid var(--brand);
  padding: 12px 16px;
  margin: 16px 0;
  background: #eff6ff;
  border-radius: 0 8px 8px 0;
  color: var(--brand-dark);
  font-size: 10pt;
}

/* Horizontal rule */
hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 32px 0;
}

/* Page breaks */
.page-break { page-break-before: always; }

/* Info box */
.info-box {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-left: 4px solid #0284c7;
  border-radius: 0 8px 8px 0;
  padding: 12px 16px;
  margin: 16px 0;
  font-size: 10pt;
  page-break-inside: avoid;
}

/* Footer */
@page {
  size: A4;
  margin: 20mm 18mm 25mm 18mm;
  @bottom-center {
    content: "SignalRisk — Confidential";
    font-size: 8pt;
    color: #9ca3af;
  }
  @bottom-right {
    content: counter(page);
    font-size: 8pt;
    color: #9ca3af;
  }
}

/* Print-specific */
@media print {
  body { font-size: 10pt; }
  .cover { min-height: auto; padding: 120px 60px; }
  a { color: var(--brand); text-decoration: none; }
  a[href]:after { content: none; }
}
`;

// ── Screenshot mapping ──────────────────────────────────────────────────

function screenshotTag(name: string, caption: string): string {
  const filePath = path.join(SCREENSHOTS, `${name}.png`);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Screenshot not found: ${name}.png`);
    return '';
  }
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `
<div class="screenshot-container">
  <img src="data:image/png;base64,${base64}" alt="${caption}" />
  <div class="screenshot-caption">${caption}</div>
</div>`;
}

function diagramTag(name: string, caption: string): string {
  const filePath = path.join(DIAGRAMS, `${name}.png`);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Diagram not found: ${name}.png`);
    return '';
  }
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `
<div class="screenshot-container" style="background:#fafbfc;padding:16px;border-radius:12px;">
  <img src="data:image/png;base64,${base64}" alt="${caption}" style="border:none;box-shadow:none;" />
  <div class="screenshot-caption">${caption}</div>
</div>`;
}

// ── User Guide HTML ─────────────────────────────────────────────────────

function generateUserGuideHTML(): string {
  // Convert MD to HTML body using pandoc
  const mdPath = path.join(DOCS, 'USER-GUIDE.md');
  let htmlBody = execSync(`pandoc "${mdPath}" --from=markdown --to=html5 --syntax-highlighting=none`, { encoding: 'utf-8' });

  // Inject screenshots after section headers
  const screenshotInjections: Array<{ after: string; screenshot: string; caption: string }> = [
    { after: '<h2 id="getting-started"', screenshot: '00-login', caption: 'Figure 1 — Login Page' },
    { after: '<h2 id="overview-page"', screenshot: '01-overview', caption: 'Figure 2 — Overview Dashboard' },
    { after: '<h2 id="cases-page"', screenshot: '02-cases', caption: 'Figure 3 — Cases Queue' },
    { after: '<h2 id="rules-page"', screenshot: '03-rules', caption: 'Figure 4 — Rules Management' },
    { after: '<h2 id="fraud-ops-page"', screenshot: '04-fraud-ops', caption: 'Figure 5 — Fraud Ops Labeling' },
    { after: '<h2 id="analytics-page"', screenshot: '05-analytics-risk-trends', caption: 'Figure 6 — Analytics: Risk Trends' },
    { after: '<h2 id="graph-intelligence-page"', screenshot: '06-graph-intel', caption: 'Figure 7 — Graph Intelligence' },
    { after: '<h2 id="live-feed-page"', screenshot: '07-live-feed', caption: 'Figure 8 — Live Feed' },
    { after: '<h2 id="settings-page"', screenshot: '08-settings', caption: 'Figure 9 — Settings' },
    { after: '<h2 id="admin-page"', screenshot: '09-admin', caption: 'Figure 10 — Admin Panel' },
    { after: '<h2 id="fraudtester-battle-arena"', screenshot: '10-battle-arena', caption: 'Figure 11 — FraudTester Battle Arena' },
    { after: '<h2 id="fraudtester-scenario-library"', screenshot: '11-scenarios', caption: 'Figure 12 — Scenario Library' },
    { after: '<h2 id="fraudtester-detection-reports"', screenshot: '12-reports', caption: 'Figure 13 — Detection Reports' },
    { after: '<h2 id="fraudtester-agent-configuration"', screenshot: '13-agent-config', caption: 'Figure 14 — Agent Configuration' },
  ];

  // Also inject analytics sub-tabs and admin sub-tab
  const analyticsSubScreenshots = `
${screenshotTag('05b-analytics-velocity', 'Figure 6b — Analytics: Velocity Tab')}
${screenshotTag('05c-analytics-merchant-stats', 'Figure 6c — Analytics: Merchant Stats Tab')}`;

  const adminSubScreenshot = screenshotTag('09b-admin-system-health', 'Figure 10b — Admin: System Health Tab');

  // Inject after each section heading - find the heading, then inject after the next paragraph
  for (const inj of screenshotInjections) {
    const idx = htmlBody.indexOf(inj.after);
    if (idx === -1) {
      // Try alternate ID patterns from pandoc
      console.warn(`  ⚠ Section not found for: ${inj.after}`);
      continue;
    }
    // Find the end of the heading tag
    const headingEnd = htmlBody.indexOf('</h2>', idx);
    if (headingEnd === -1) continue;
    const insertPoint = headingEnd + '</h2>'.length;
    // Find the next paragraph after heading for better placement
    const nextP = htmlBody.indexOf('<p>', insertPoint);
    const nextH = htmlBody.indexOf('<h', insertPoint + 1);
    // Insert screenshot after first paragraph if it comes before next heading
    let insertAt = insertPoint;
    if (nextP !== -1 && (nextH === -1 || nextP < nextH)) {
      const pEnd = htmlBody.indexOf('</p>', nextP);
      if (pEnd !== -1) insertAt = pEnd + '</p>'.length;
    }
    const tag = screenshotTag(inj.screenshot, inj.caption);
    htmlBody = htmlBody.slice(0, insertAt) + '\n' + tag + '\n' + htmlBody.slice(insertAt);
  }

  // Inject analytics sub-screenshots after Velocity Tab heading
  const velocityIdx = htmlBody.indexOf('Velocity Tab');
  if (velocityIdx !== -1) {
    const nextH3 = htmlBody.indexOf('<h3', velocityIdx + 50);
    if (nextH3 !== -1) {
      htmlBody = htmlBody.slice(0, nextH3) + analyticsSubScreenshots + '\n' + htmlBody.slice(nextH3);
    }
  }

  // Inject admin system health after System Health heading
  const sysHealthIdx = htmlBody.indexOf('System Health Tab');
  if (sysHealthIdx !== -1) {
    const nextSection = htmlBody.indexOf('<h', sysHealthIdx + 50);
    if (nextSection !== -1) {
      htmlBody = htmlBody.slice(0, nextSection) + adminSubScreenshot + '\n' + htmlBody.slice(nextSection);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SignalRisk — User Guide</title>
  <style>${CSS}</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <div class="logo">Signal<span class="accent">Risk</span></div>
  <div class="subtitle">User Guide</div>
  <div class="divider"></div>
  <div class="meta">
    <strong>Version 2.1.0</strong><br>
    March 2026<br><br>
    For fraud analysts and operations teams<br>
    <strong>Confidential</strong>
  </div>
</div>

<!-- Content -->
<div class="content">
${htmlBody}
</div>

</body>
</html>`;
}

// ── Technical Documentation HTML ────────────────────────────────────────

function generateTechnicalHTML(): string {
  const mdPath = path.join(DOCS, 'TECHNICAL.md');
  let htmlBody = execSync(`pandoc "${mdPath}" --from=markdown --to=html5 --syntax-highlighting=none`, { encoding: 'utf-8' });

  // Replace ASCII architecture diagrams with rendered Mermaid PNGs
  // The ASCII diagrams are inside <pre><code> blocks — find and replace them
  const asciiReplacements: Array<{ marker: string; diagram: string; caption: string }> = [
    { marker: 'Clients', diagram: 'architecture-main', caption: 'Figure 1 — System Architecture (15 microservices)' },
    { marker: 'Dashboard (Battle Arena)', diagram: 'fraudtester-architecture', caption: 'Figure 5 — FraudTester Architecture' },
  ];

  for (const rep of asciiReplacements) {
    // Find <pre> blocks containing the marker text
    const markerIdx = htmlBody.indexOf(rep.marker);
    if (markerIdx === -1) continue;
    // Walk backwards to find the <pre> or <code> start
    let preStart = htmlBody.lastIndexOf('<pre', markerIdx);
    if (preStart === -1) continue;
    // Walk forward to find </pre> end
    let preEnd = htmlBody.indexOf('</pre>', markerIdx);
    if (preEnd === -1) continue;
    preEnd += '</pre>'.length;
    // Also check if there's a wrapping <pre><code>...</code></pre>
    const codeEnd = htmlBody.indexOf('</code>', markerIdx);
    if (codeEnd !== -1 && codeEnd < preEnd) {
      preEnd = htmlBody.indexOf('</pre>', codeEnd) + '</pre>'.length;
    }
    const tag = diagramTag(rep.diagram, rep.caption);
    if (tag) {
      htmlBody = htmlBody.slice(0, preStart) + tag + htmlBody.slice(preEnd);
    }
  }

  // Insert additional diagrams at strategic positions
  const diagramInsertions: Array<{ after: string; diagram: string; caption: string }> = [
    { after: '<h3 id="request-lifecycle"', diagram: 'request-lifecycle', caption: 'Figure 2 — Request Lifecycle (sequence diagram)' },
    { after: '<h2 id="data-stores"', diagram: 'data-stores', caption: 'Figure 3 — Data Store Architecture' },
    { after: '<h2 id="e2e-testing"', diagram: 'e2e-test-pipeline', caption: 'Figure 6 — E2E Test Pipeline (3 sequential projects)' },
  ];

  for (const inj of diagramInsertions) {
    const idx = htmlBody.indexOf(inj.after);
    if (idx === -1) continue;
    const headingEnd = htmlBody.indexOf('>', idx) + 1;
    const closeTag = htmlBody.indexOf('</', headingEnd);
    const afterClose = htmlBody.indexOf('>', closeTag) + 1;
    const tag = diagramTag(inj.diagram, inj.caption);
    if (tag) {
      htmlBody = htmlBody.slice(0, afterClose) + '\n' + tag + '\n' + htmlBody.slice(afterClose);
    }
  }

  // Also inject key screenshots
  const techScreenshots: Array<{ after: string; screenshot: string; caption: string }> = [
    { after: '<h2 id="decision-engine"', screenshot: '05-analytics-risk-trends', caption: 'Figure 4 — Analytics: Decision Trends, Outcomes, and Risk Score Distribution' },
    { after: '<h2 id="fraudtester-framework"', screenshot: '10-battle-arena', caption: 'Figure 5b — FraudTester Battle Arena (dashboard view)' },
  ];

  for (const inj of techScreenshots) {
    const idx = htmlBody.indexOf(inj.after);
    if (idx === -1) continue;
    const headingEnd = htmlBody.indexOf('</h2>', idx);
    if (headingEnd === -1) continue;
    const insertPoint = headingEnd + '</h2>'.length;
    const nextP = htmlBody.indexOf('<p>', insertPoint);
    const nextH = htmlBody.indexOf('<h', insertPoint + 1);
    let insertAt = insertPoint;
    if (nextP !== -1 && (nextH === -1 || nextP < nextH)) {
      const pEnd = htmlBody.indexOf('</p>', nextP);
      if (pEnd !== -1) insertAt = pEnd + '</p>'.length;
    }
    const tag = screenshotTag(inj.screenshot, inj.caption);
    htmlBody = htmlBody.slice(0, insertAt) + '\n' + tag + '\n' + htmlBody.slice(insertAt);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SignalRisk — Technical Documentation</title>
  <style>${CSS}</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <div class="logo">Signal<span class="accent">Risk</span></div>
  <div class="subtitle">Technical Documentation</div>
  <div class="divider"></div>
  <div class="meta">
    <strong>Version 2.1.0</strong> — Sprint 35<br>
    11 March 2026<br><br>
    Real-Time Fraud Decision Engine<br>
    15 Microservices · 19 Docker Containers · 1,010+ Tests<br><br>
    <strong>Confidential</strong>
  </div>
</div>

<!-- Content -->
<div class="content">
${htmlBody}
</div>

</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating professional PDFs with embedded screenshots...\n');

  // 1. Generate User Guide
  console.log('1. Building User Guide HTML...');
  const userGuideHTML = generateUserGuideHTML();
  const userGuideHTMLPath = '/tmp/signalrisk-user-guide.html';
  fs.writeFileSync(userGuideHTMLPath, userGuideHTML);
  console.log('   HTML written to', userGuideHTMLPath);

  console.log('   Converting to PDF...');
  const userGuidePDF = path.join(DOCS, 'SignalRisk-User-Guide.pdf');
  execSync(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${userGuidePDF}" "${userGuideHTMLPath}"`,
    { stdio: 'pipe' },
  );
  const ugSize = fs.statSync(userGuidePDF).size;
  console.log(`   ✓ User Guide PDF: ${(ugSize / 1024).toFixed(0)} KB\n`);

  // 2. Generate Technical Documentation
  console.log('2. Building Technical Documentation HTML...');
  const techHTML = generateTechnicalHTML();
  const techHTMLPath = '/tmp/signalrisk-technical.html';
  fs.writeFileSync(techHTMLPath, techHTML);
  console.log('   HTML written to', techHTMLPath);

  console.log('   Converting to PDF...');
  const techPDF = path.join(DOCS, 'SignalRisk-Technical-Documentation.pdf');
  execSync(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${techPDF}" "${techHTMLPath}"`,
    { stdio: 'pipe' },
  );
  const techSize = fs.statSync(techPDF).size;
  console.log(`   ✓ Technical Documentation PDF: ${(techSize / 1024).toFixed(0)} KB\n`);

  console.log('Done! Both PDFs generated with embedded screenshots.');
}

main().catch(console.error);
