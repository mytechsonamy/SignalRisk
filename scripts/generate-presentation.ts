/**
 * Generate SignalRisk PowerPoint presentation.
 * Run: npx tsx scripts/generate-presentation.ts
 */
import PptxGenJS from 'pptxgenjs';
import * as fs from 'fs';
import * as path from 'path';

const DOCS = path.resolve(__dirname, '../docs');
const SCREENSHOTS = path.resolve(DOCS, 'screenshots');
const OUTPUT = path.resolve(DOCS, 'SignalRisk-Presentation.pptx');

// Brand colors (without # prefix — pptxgenjs expects raw hex)
const COLORS = {
  primary: '1a56db',
  dark: '1e3a5f',
  accent: '4f46e5',
  text: '1f2937',
  light: '6b7280',
  white: 'FFFFFF',
  bgAlt: 'f9fafb',
  green: '059669',
  red: 'dc2626',
  amber: 'd97706',
};

const FONT = 'Calibri';
const SLIDE_W = 13.33; // 16:9 default width in inches
const SLIDE_H = 7.5;   // 16:9 default height in inches
const MARGIN_X = 0.7;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;

// ── Screenshot reader ───────────────────────────────────────────────────

function readScreenshot(filename: string): string | null {
  const filepath = path.join(SCREENSHOTS, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`  Warning: Screenshot not found: ${filename}`);
    return null;
  }
  const data = fs.readFileSync(filepath);
  return `image/png;base64,${data.toString('base64')}`;
}

// ── Slide helpers ───────────────────────────────────────────────────────

function addTitleSlide(
  pptx: PptxGenJS,
  title: string,
  subtitle: string,
  date?: string,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.dark };

  // Title
  slide.addText(title, {
    x: 0.5,
    y: 2.0,
    w: SLIDE_W - 1,
    h: 1.5,
    fontSize: 32,
    fontFace: FONT,
    color: COLORS.white,
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // Divider line
  slide.addShape(pptx.ShapeType.rect, {
    x: SLIDE_W / 2 - 1.5,
    y: 3.7,
    w: 3,
    h: 0.04,
    fill: { color: COLORS.primary },
  });

  // Subtitle
  slide.addText(subtitle, {
    x: 0.5,
    y: 4.0,
    w: SLIDE_W - 1,
    h: 0.8,
    fontSize: 18,
    fontFace: FONT,
    color: '94a3b8',
    align: 'center',
    valign: 'middle',
  });

  // Date
  if (date) {
    slide.addText(date, {
      x: 0.5,
      y: 5.0,
      w: SLIDE_W - 1,
      h: 0.5,
      fontSize: 14,
      fontFace: FONT,
      color: '64748b',
      align: 'center',
      valign: 'middle',
    });
  }
}

function addContentSlide(
  pptx: PptxGenJS,
  title: string,
  bullets: string[],
): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.1,
    fill: { color: COLORS.dark },
  });

  slide.addText(title, {
    x: MARGIN_X,
    y: 0.15,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 24,
    fontFace: FONT,
    color: COLORS.white,
    bold: true,
    valign: 'middle',
  });

  // Bullet list
  const textRows = bullets.map((b) => ({
    text: b,
    options: {
      fontSize: 15,
      fontFace: FONT,
      color: COLORS.text,
      bullet: { code: '2022' } as any, // bullet character
      paraSpaceAfter: 8,
      lineSpacingMultiple: 1.3,
    },
  }));

  slide.addText(textRows, {
    x: MARGIN_X + 0.2,
    y: 1.5,
    w: CONTENT_W - 0.4,
    h: 5.5,
    valign: 'top',
  });
}

function addDiagramSlide(
  pptx: PptxGenJS,
  title: string,
  asciiArt: string,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.1,
    fill: { color: COLORS.dark },
  });

  slide.addText(title, {
    x: MARGIN_X,
    y: 0.15,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 24,
    fontFace: FONT,
    color: COLORS.white,
    bold: true,
    valign: 'middle',
  });

  // Diagram box
  slide.addShape(pptx.ShapeType.rect, {
    x: MARGIN_X,
    y: 1.3,
    w: CONTENT_W,
    h: 5.7,
    fill: { color: COLORS.bgAlt },
    rectRadius: 0.1,
    line: { color: 'e5e7eb', width: 1 },
  });

  slide.addText(asciiArt, {
    x: MARGIN_X + 0.3,
    y: 1.5,
    w: CONTENT_W - 0.6,
    h: 5.3,
    fontSize: 10,
    fontFace: 'Courier New',
    color: COLORS.text,
    valign: 'top',
    lineSpacingMultiple: 1.15,
  });
}

function addTableSlide(
  pptx: PptxGenJS,
  title: string,
  headers: string[],
  rows: string[][],
): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.1,
    fill: { color: COLORS.dark },
  });

  slide.addText(title, {
    x: MARGIN_X,
    y: 0.15,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 24,
    fontFace: FONT,
    color: COLORS.white,
    bold: true,
    valign: 'middle',
  });

  // Build table data
  const headerRow = headers.map((h) => ({
    text: h,
    options: {
      fontSize: 13,
      fontFace: FONT,
      color: COLORS.white,
      bold: true,
      fill: { color: COLORS.primary },
      align: 'left' as const,
      valign: 'middle' as const,
    },
  }));

  const dataRows = rows.map((row, rowIdx) =>
    row.map((cell) => ({
      text: cell,
      options: {
        fontSize: 12,
        fontFace: FONT,
        color: COLORS.text,
        fill: { color: rowIdx % 2 === 0 ? COLORS.white : COLORS.bgAlt },
        align: 'left' as const,
        valign: 'middle' as const,
      },
    })),
  );

  const colW = CONTENT_W / headers.length;

  slide.addTable([headerRow, ...dataRows], {
    x: MARGIN_X,
    y: 1.5,
    w: CONTENT_W,
    colW: Array(headers.length).fill(colW),
    rowH: 0.5,
    border: { type: 'solid', pt: 0.5, color: 'e5e7eb' },
  });
}

function addTwoColumnSlide(
  pptx: PptxGenJS,
  title: string,
  leftBullets: string[],
  rightBullets: string[],
  leftTitle?: string,
  rightTitle?: string,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.1,
    fill: { color: COLORS.dark },
  });

  slide.addText(title, {
    x: MARGIN_X,
    y: 0.15,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 24,
    fontFace: FONT,
    color: COLORS.white,
    bold: true,
    valign: 'middle',
  });

  const colW = (CONTENT_W - 0.5) / 2;
  const leftX = MARGIN_X;
  const rightX = MARGIN_X + colW + 0.5;

  // Column titles
  if (leftTitle) {
    slide.addText(leftTitle, {
      x: leftX,
      y: 1.3,
      w: colW,
      h: 0.5,
      fontSize: 16,
      fontFace: FONT,
      color: COLORS.primary,
      bold: true,
    });
  }
  if (rightTitle) {
    slide.addText(rightTitle, {
      x: rightX,
      y: 1.3,
      w: colW,
      h: 0.5,
      fontSize: 16,
      fontFace: FONT,
      color: COLORS.primary,
      bold: true,
    });
  }

  const bulletY = leftTitle || rightTitle ? 1.9 : 1.5;
  const bulletH = 7.5 - bulletY - 0.5;

  // Left column bullets
  const leftRows = leftBullets.map((b) => ({
    text: b,
    options: {
      fontSize: 14,
      fontFace: FONT,
      color: COLORS.text,
      bullet: { code: '2022' } as any,
      paraSpaceAfter: 6,
      lineSpacingMultiple: 1.2,
    },
  }));

  slide.addText(leftRows, {
    x: leftX + 0.1,
    y: bulletY,
    w: colW - 0.2,
    h: bulletH,
    valign: 'top',
  });

  // Right column bullets
  const rightRows = rightBullets.map((b) => ({
    text: b,
    options: {
      fontSize: 14,
      fontFace: FONT,
      color: COLORS.text,
      bullet: { code: '2022' } as any,
      paraSpaceAfter: 6,
      lineSpacingMultiple: 1.2,
    },
  }));

  slide.addText(rightRows, {
    x: rightX + 0.1,
    y: bulletY,
    w: colW - 0.2,
    h: bulletH,
    valign: 'top',
  });

  // Divider line between columns
  slide.addShape(pptx.ShapeType.line, {
    x: MARGIN_X + colW + 0.2,
    y: 1.3,
    w: 0,
    h: bulletH + 0.5,
    line: { color: 'e5e7eb', width: 1 },
  });
}

function addImageSlide(
  pptx: PptxGenJS,
  title: string,
  imagePath: string,
  caption?: string,
): void {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.1,
    fill: { color: COLORS.dark },
  });

  slide.addText(title, {
    x: MARGIN_X,
    y: 0.15,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 24,
    fontFace: FONT,
    color: COLORS.white,
    bold: true,
    valign: 'middle',
  });

  const imageData = readScreenshot(imagePath);
  if (imageData) {
    // Image with border
    slide.addImage({
      data: imageData,
      x: MARGIN_X + 0.5,
      y: 1.4,
      w: CONTENT_W - 1,
      h: 5.0,
      rounding: true,
    });
  } else {
    // Placeholder if image missing
    slide.addShape(pptx.ShapeType.rect, {
      x: MARGIN_X + 0.5,
      y: 1.4,
      w: CONTENT_W - 1,
      h: 5.0,
      fill: { color: COLORS.bgAlt },
      rectRadius: 0.1,
      line: { color: 'e5e7eb', width: 1 },
    });
    slide.addText(`[Screenshot: ${imagePath}]`, {
      x: MARGIN_X + 0.5,
      y: 3.5,
      w: CONTENT_W - 1,
      h: 0.8,
      fontSize: 16,
      fontFace: FONT,
      color: COLORS.light,
      align: 'center',
      valign: 'middle',
      italic: true,
    });
  }

  // Caption
  if (caption) {
    slide.addText(caption, {
      x: MARGIN_X,
      y: 6.6,
      w: CONTENT_W,
      h: 0.5,
      fontSize: 11,
      fontFace: FONT,
      color: COLORS.light,
      italic: true,
      align: 'center',
    });
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating SignalRisk PowerPoint presentation...\n');

  const pptx = new PptxGenJS();
  pptx.author = 'SignalRisk';
  pptx.title = 'SignalRisk - Real-time Fraud Decision Engine';
  pptx.subject = 'Technical & Product Overview';
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 (16:9)

  // ── Slide 1: Title ──────────────────────────────────────────────────
  addTitleSlide(
    pptx,
    'SignalRisk\nReal-time Fraud Decision Engine',
    'Technical & Product Overview',
    'March 2026',
  );

  // ── Slide 2: Product Vision ─────────────────────────────────────────
  addContentSlide(pptx, 'Product Vision', [
    'Real-time fraud intelligence for emerging markets',
    'Combined telco + device + behavioral signals in a single API',
    '<200ms p99 decision latency',
    'Purpose-built for wallet & carrier billing fraud',
  ]);

  // ── Slide 3: Problem Statement ──────────────────────────────────────
  addContentSlide(pptx, 'Problem Statement', [
    '$32B+ annual fraud in emerging market digital payments',
    'Mobile wallet fraud growing 45% YoY',
    'No dedicated carrier billing fraud solution exists',
    'Western solutions lack telco signals & local patterns',
  ]);

  // ── Slide 4: Solution Overview ──────────────────────────────────────
  addTwoColumnSlide(
    pptx,
    'Solution Overview',
    [
      'REST API + SDKs',
      'Single API call for risk decisions',
      '<100KB web SDK footprint',
      'Webhook callbacks for async results',
    ],
    [
      '16-page analyst dashboard',
      'Case management with SLA tracking',
      'Rule editor with custom DSL',
      'Real-time WebSocket live feed',
    ],
    'For Developers',
    'For Analysts',
  );

  // ── Slide 5: System Architecture ────────────────────────────────────
  addDiagramSlide(
    pptx,
    'System Architecture',
    [
      '                              SignalRisk — 15 Microservices',
      '',
      '    Clients (Web SDK / Mobile SDK / REST API)',
      '        |',
      '        v',
      '    +-------------------+      +--------------------+',
      '    |   auth-service    |----->|  event-collector   |',
      '    |   (RS256 JWT)     |      |  (API key auth)    |',
      '    +-------------------+      +--------------------+',
      '                                       |',
      '                                  Kafka KRaft',
      '                                       |',
      '                                       v',
      '    +----------------------------------------------------------+',
      '    |                    decision-service                       |',
      '    |  +-----------+ +-----------+ +-----------+ +-----------+ |',
      '    |  | device    | | velocity  | | behavioral| | network   | |',
      '    |  | intel     | | service   | | analytics | | intel     | |',
      '    |  +-----------+ +-----------+ +-----------+ +-----------+ |',
      '    |  +-----------+ +-----------+                              |',
      '    |  | telco     | | graph     |   21 DSL Rules Evaluated    |',
      '    |  | intel     | | intel     |   Score: 0-100              |',
      '    |  +-----------+ +-----------+                              |',
      '    +----------------------------------------------------------+',
      '              |                             |',
      '              v                             v',
      '    +-------------------+      +--------------------+',
      '    |   case-service    |      |  webhook-service   |',
      '    |   (SLA tracking)  |      |  (HMAC callbacks)  |',
      '    +-------------------+      +--------------------+',
    ].join('\n'),
  );

  // ── Slide 6: Decision Engine Pipeline ───────────────────────────────
  addContentSlide(pptx, 'Decision Engine Pipeline', [
    '6 parallel signal fetches (device, velocity, behavioral, network, telco, graph)',
    '21 DSL rules evaluated per decision (10 base + 5 stateful + 3 sequence + 3 graph)',
    'Score thresholds: >=70 BLOCK  |  40-69 REVIEW  |  <40 ALLOW',
    'Circuit breaker pattern: 3 failures -> 30s OPEN state',
    'Graceful degradation: signal timeout = null, decision continues',
    'Decision cache: Redis-backed with 5-second TTL',
  ]);

  // ── Slide 7: Stateful Fraud Detection ───────────────────────────────
  addContentSlide(pptx, 'Stateful Fraud Detection', [
    'Typed entity model: customer, device, and IP as first-class entities',
    'Prior-decision memory with 30-day lookback (50ms timeout + circuit breaker)',
    'Entity profiles with durable state (auto-updated on each decision)',
    'Sequence detection: 3 patterns (login->payment, failed*3->success, device_change->payment)',
    'Graph enrichment: fraud ring scoring via Neo4j traversals',
    'Feature snapshots for ML-ready data export',
  ]);

  // ── Slide 8: Closed-Loop Fraud Cycle ────────────────────────────────
  addDiagramSlide(
    pptx,
    'Closed-Loop Fraud Cycle',
    [
      '',
      '',
      '        +------------------+',
      '        |  Payment Event   |',
      '        +--------+---------+',
      '                 |',
      '                 v',
      '        +------------------+        +---------------------+',
      '        | Decision Engine  |------->|  Webhook Callback   |',
      '        | (21 DSL Rules)   |        |  (HMAC-SHA256)      |',
      '        +--------+---------+        +---------------------+',
      '                 |',
      '                 v',
      '        +------------------+',
      '        |  Case Created    |',
      '        |  (BLOCK/REVIEW)  |',
      '        +--------+---------+',
      '                 |',
      '                 v',
      '        +------------------+        +---------------------+',
      '        | Analyst Labels   |------->|  Kafka STATE_LABELS |',
      '        | (fraud / legit)  |        |  (feedback topic)   |',
      '        +--------+---------+        +---------------------+',
      '                 |',
      '                 v',
      '        +------------------+',
      '        | Watchlist Update |',
      '        | (deny/allow/watch)|',
      '        +--------+---------+',
      '                 |',
      '                 v',
      '        +------------------+',
      '        | Next Decision    |<--- Entity checked against watchlist',
      '        | BLOCK if denied  |     at decision time (closed loop)',
      '        +------------------+',
    ].join('\n'),
  );

  // ── Slide 9: Multi-Tenancy & Security ───────────────────────────────
  addTwoColumnSlide(
    pptx,
    'Multi-Tenancy & Security',
    [
      'JWT tenant context (RS256 asymmetric)',
      'PostgreSQL Row-Level Security (RLS)',
      'Redis key namespace isolation',
      'Kafka partition-based tenancy',
      'WebSocket room-based isolation',
    ],
    [
      'RS256 JWT with JWKS endpoint',
      'DB-backed operator login (bcrypt)',
      'HMAC-SHA256 webhook signatures',
      'JWT denylist (fail-closed on Redis down)',
      'Rate limiting (Redis Lua script)',
    ],
    '5-Layer Tenant Isolation',
    'Security Controls',
  );

  // ── Slide 10: Dashboard & UX ────────────────────────────────────────
  addImageSlide(
    pptx,
    'Dashboard & UX',
    '01-overview.png',
    'Real-time fraud monitoring dashboard with KPI cards, decision trends, and live event stream',
  );

  // ── Slide 11: Integration Model ─────────────────────────────────────
  addContentSlide(pptx, 'Integration Model', [
    'Step 1: Install SDK (5 minutes)',
    'Step 2: Evaluate Risk (1 API call)',
    'Step 3: Act on Decision (ALLOW / REVIEW / BLOCK)',
    'Time to value: 24 hours from signup to production',
    'Available channels: Web SDK + Mobile SDK + REST API + Webhooks',
  ]);

  // ── Slide 12: Quality & Testing ─────────────────────────────────────
  addTableSlide(
    pptx,
    'Quality & Testing',
    ['Category', 'Count', 'Status'],
    [
      ['Unit Tests', '934+', 'All passing (71 suites)'],
      ['E2E Tests', '78', '3 Playwright projects'],
      ['Quality Gates', 'G1-G8', 'All defined & enforced'],
      ['FraudTester Scenarios', '9+', '5 AI agents'],
      ['DSL Rules', '21', '10 base + 5 stateful + 3 seq + 3 graph'],
    ],
  );

  // ── Slide 13: Production Readiness ──────────────────────────────────
  addContentSlide(pptx, 'Production Readiness', [
    '9-step execution plan — all 8 core steps complete',
    'Production maturity Level 4/5 (8.2/10 readiness score)',
    '39+ sprints delivered from scratch (single developer)',
    '15 database migrations + 16 Architecture Decision Records',
    'All P0 critical fixes applied and verified',
    'Full closed-loop fraud cycle operational end-to-end',
  ]);

  // ── Slide 14: Key Metrics & KPIs ────────────────────────────────────
  addTableSlide(
    pptx,
    'Key Metrics & KPIs',
    ['Metric', 'Target', 'Current'],
    [
      ['Decision p99 latency', '<500ms', '~82ms'],
      ['Throughput', '5,000 req/s', '5,200 req/s'],
      ['Availability', '99.9%', '-- (staging)'],
      ['True Positive Rate', '>85%', '~91%'],
      ['False Positive Rate', '<5%', '~2%'],
      ['E2E Suite Duration', '<60s', '~38s'],
    ],
  );

  // ── Slide 15: Competitive Advantages ────────────────────────────────
  addTableSlide(
    pptx,
    'Competitive Advantages',
    ['Capability', 'SignalRisk', 'Evina', 'Sift', 'Sardine'],
    [
      ['Telco Signals', 'Yes', 'Yes', 'No', 'No'],
      ['Device Intel', 'Yes', 'No', 'Partial', 'Yes'],
      ['Behavioral', 'Yes', 'No', 'Yes', 'Yes'],
      ['Emerging Market Focus', 'Yes', 'Partial', 'No', 'No'],
      ['Single API', 'Yes', 'No', 'No', 'No'],
    ],
  );

  // ── Slide 16: Technology Stack ──────────────────────────────────────
  addTwoColumnSlide(
    pptx,
    'Technology Stack',
    [
      'NestJS (Node.js 20)',
      'PostgreSQL 16 + Row-Level Security',
      'Redis 7 (cache + state)',
      'Kafka KRaft (event streaming)',
      'Neo4j 5 (graph database)',
    ],
    [
      'React 18 + Vite + Zustand',
      'TailwindCSS',
      'Docker Compose (19 containers)',
      'Kubernetes + Helm ready',
      'GitHub Actions CI/CD',
    ],
    'Backend',
    'Frontend & Infra',
  );

  // ── Slide 17: Deployment Architecture ───────────────────────────────
  addContentSlide(pptx, 'Deployment Architecture', [
    'Docker Compose: 4 infra + 15 app containers',
    '4-stage Dockerfile with ~28s build time',
    'Kubernetes Helm chart with Horizontal Pod Autoscaler',
    'Scalability path: 5M -> 50M -> 500M+ events/month',
    'Multi-AZ deployment ready',
    'ArgoCD GitOps pipeline for production deployments',
  ]);

  // ── Slide 18: Roadmap & Next Steps ──────────────────────────────────
  addContentSlide(pptx, 'Roadmap & Next Steps', [
    'Level 5 closure: staging validation + evidence refresh',
    'ML scoring service integration (gRPC sidecar)',
    'Neo4j causal clustering for production graph workloads',
    'Kubernetes production deployment with autoscaling',
    'Advanced analytics + ML-based scoring models',
    'Mobile SDK enhancements for React Native & Flutter',
  ]);

  // ── Slide 19: Team & Governance ─────────────────────────────────────
  addContentSlide(pptx, 'Team & Governance', [
    '7 workstreams (Alpha through Golf) — cross-functional ownership',
    '10 automated skills for development workflows',
    'Quality gates G1-G8 enforced per sprint exit',
    'Evidence-based sprint exit process with artifact generation',
    'Architecture Decision Records (ADR-001 through ADR-016)',
    'Definition of Done checklist enforced per pull request',
  ]);

  // ── Slide 20: Q&A ──────────────────────────────────────────────────
  addTitleSlide(
    pptx,
    'Questions?',
    'github.com/mytechsonamy/SignalRisk',
  );

  // ── Write file ──────────────────────────────────────────────────────
  await pptx.writeFile({ fileName: OUTPUT });
  const size = fs.statSync(OUTPUT).size;
  console.log(`Presentation generated: ${OUTPUT}`);
  console.log(`File size: ${(size / 1024).toFixed(0)} KB`);
  console.log('Slides: 20');
}

main().catch(console.error);
