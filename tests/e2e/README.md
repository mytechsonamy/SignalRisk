# SignalRisk E2E Test Suite

Playwright E2E tests for the SignalRisk dashboard, plus Jest-based unit tests for MSW handlers and test utilities that can run in CI without a browser.

## Structure

```
tests/e2e/
├── specs/              # Playwright test specs (require running browser + server)
│   ├── auth.spec.ts
│   ├── cases.spec.ts
│   ├── fraud-ops.spec.ts
│   ├── live-feed.spec.ts
│   └── analytics.spec.ts
├── mocks/              # MSW v2 API handlers
│   ├── handlers.ts
│   └── handlers.spec.ts  # Jest tests (CI-safe, no browser)
├── utils/              # Test helper functions
│   ├── test-helpers.ts
│   └── test-helpers.spec.ts  # Jest tests (CI-safe, no browser)
├── playwright.config.ts
├── jest.config.js
├── tsconfig.json
└── package.json
```

## Running Jest tests (CI-safe, no browser required)

```bash
cd tests/e2e
npm install
npx jest --no-coverage
```

This runs only `mocks/**/*.spec.ts` and `utils/**/*.spec.ts`.

## Running Playwright E2E tests

Prerequisites:
1. Install Playwright browsers: `npx playwright install`
2. Start the dashboard dev server: `cd apps/dashboard && npm run dev`
3. (Optional) Set `BASE_URL` env var if dev server uses a non-default port

```bash
cd tests/e2e
npm install
npx playwright install
BASE_URL=http://localhost:5173 npx playwright test
```

### Headed mode (visible browser)

```bash
npx playwright test --headed
```

### Run a single spec file

```bash
npx playwright test specs/auth.spec.ts
```

## Environment Variables

| Variable   | Default                 | Description                        |
|------------|-------------------------|------------------------------------|
| `BASE_URL` | `http://localhost:5173` | Dashboard dev server base URL      |

## CI Integration

In CI environments, only run the Jest tests:

```bash
cd tests/e2e && npm install && npx jest --no-coverage
```

Playwright tests require a running browser and dashboard server, so they should be run in a dedicated E2E CI step with services started first.
