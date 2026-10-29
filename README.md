# MoroSystems QA assignment – Playwright + TypeScript

![tests](https://github.com/ssmericka-qa/morosystems-qa-assignment/actions/workflows/tests.yml/badge.svg)

Automated GUI and API tests for the MoroSystems QA assignment, plus a k6 load test,
visual regression, cross-browser / responsive runs and a GitHub Actions pipeline.

| Area | What is covered | Where |
| --- | --- | --- |
| **GUI** | Assignment scenario: steps 1–5 (Google → MoroSystems, result link validation) and steps 6–7 (Kariéra → city filter) | `tests/gui/google-to-career.spec.ts` |
| **GUI** | City filter checked for every city against the page's own data | `tests/gui/career-filter.spec.ts` |
| **API** | Steps 2–5: GET, POST, update (the API has no PUT – it updates via `POST /tasks/{id}`, see FINDINGS B1), DELETE; complete / incomplete; status, data and persistence checks | `tests/api/tasks-crud.spec.ts` |
| **API** | Validation, error handling, known bugs pinned by characterization tests | `tests/api/tasks-validation.spec.ts` |
| **Cross-browser** | Chromium, Firefox, WebKit (Safari); branded Chrome / Edge via `PW_CHANNEL` | `playwright.config.ts` |
| **Responsive** | Pixel 7 and iPad: no horizontal overflow, navigation via burger menu, filter usable | `tests/responsive/` |
| **Visual** | Baseline screenshots of the intro block (header + hero) of the homepage and Kariéra | `tests/visual/` |
| **Performance** | k6 load test with thresholds per endpoint (assumed – the assignment gives no SLOs) | `perf/tasks-load.k6.js` |
| **OpenAPI codegen** | TypeScript types generated from the backend's `/v3/api-docs`, used by a thin hand-written connector | `src/api/` |
| **CI/CD** | GitHub Actions: parallel matrix per project, one merged Playwright report + Allure report (optionally on GitHub Pages), run summary, optional Microsoft Teams notification | `.github/workflows/tests.yml`, [CI pipeline](#ci-pipeline) |

Found issues are listed in **[FINDINGS.md](FINDINGS.md)**, the test approach in **[TEST_PLAN.md](TEST_PLAN.md)**.

## Prerequisites

- Node.js ≥ 22.6 (the backend requires it)
- Git
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) – only for the performance test

## Setup

```bash
# 1. Backend – clone it into ./todo-be (git-ignored, the default location)
git clone https://github.com/morosystems/todo-be.git todo-be
npm ci --prefix todo-be

# 2. Tests
npm ci
npx playwright install --with-deps
```

For API tests Playwright starts the backend automatically (`webServer` in `playwright.config.ts`)
and reuses it if it is already running on `http://localhost:8080`. GUI runs do not need it.
Use `TODO_BE_DIR` / `API_URL` for other locations.

## Running the tests

```bash
npm test                    # everything (all projects in parallel)
npm run test:api            # API tests only
npm run test:gui            # GUI tests in Chromium, Firefox and WebKit
npm run test:responsive     # mobile + tablet
npm run test:visual         # visual regression
npm run report              # open the HTML report (pass/fail, steps, screenshots, traces)

npx playwright test --project=chromium --headed     # watch a run
SLOWMO=500 npx playwright test --project=chromium --headed   # watch it slowed down
PW_CHANNEL=chrome npx playwright test --project=chromium   # branded Google Chrome
PW_CHANNEL=msedge npx playwright test --project=chromium   # Microsoft Edge (if installed)

npm run perf                # k6 load test (backend must be running: npm start --prefix todo-be)
k6 run -e THINK_TIME=0 perf/tasks-load.k6.js   # stress variant without think time

npm run api:spec:refresh    # download the current OpenAPI spec and regenerate types
npm run test:visual:update  # accept new visual baselines (intentional UI change only)
npm run typecheck
```

## Reporting

Every local run produces an HTML report (`playwright-report/`) with per-step results, plus a
JUnit XML (`test-results/junit.xml`); in CI the reports are merged across jobs (see [CI pipeline](#ci-pipeline)). On failure, Playwright keeps a **screenshot, video and
trace** (`npx playwright show-trace <trace.zip>` shows DOM snapshots, network and console logs).
Findings and warnings are attached to tests as **annotations** and visible in the report.
Every run also writes Allure results (`allure-results/`); `npm run report:allure` builds and opens
the **Allure report** – both reports come from the same run, the native one for debugging
(trace viewer), Allure for an overview.

## CI pipeline

`.github/workflows/tests.yml` runs on every push and pull request, or manually
(**Actions → tests → Run workflow**, with a choice of `all`, `api`, `gui` or `performance`).

| Job | What it does |
| --- | --- |
| **api** | Checks out `morosystems/todo-be`, Playwright starts it and runs the API tests |
| **gui** | Matrix of 6 parallel jobs – chromium, firefox, webkit, mobile, tablet, visual; each installs only its browser |
| **performance** | Starts the backend and runs k6. A threshold breach is reported, not blocking (FINDINGS B7) |
| **report** | Merges the reports of all Playwright jobs into **one Playwright report** and **one Allure report**, writes the run summary and notifies Teams |
| **publish-report** | Publishes both reports to GitHub Pages (optional) – landing page, `/playwright/`, `/allure/` |

What you get from one run:

- **Run summary** on the run page – passed / failed / flaky / skipped per project, k6 result,
  list of failed tests.
- **Annotations** – a failing test is shown directly at the line of code (`github` reporter).
- **Merged Playwright report** with screenshots, videos and traces, and an **Allure report**
  (overview with charts, suites, timeline of the parallel run) – artifact `playwright-report`
  (also contains `junit.xml`).
- **Microsoft Teams message** (Adaptive Card) with the same summary and links to the report and run.

Optional features stay off until configured, so the pipeline also works in a fresh fork:

| Feature | How to enable |
| --- | --- |
| Teams notification | Secret `TEAMS_WEBHOOK_URL` – the URL of a Teams incoming webhook / Workflows "When a Teams webhook request is received". Without it the step is skipped; the generated message is still in the artifact (`teams-card.json`, previewable in the [Adaptive Cards Designer](https://adaptivecards.io/designer/)). |
| Reports on GitHub Pages | Settings → Pages → Source: **GitHub Actions**, then repository variable `PUBLISH_REPORT=true`. Published from `main` only. |

In a real project I would add a nightly scheduled run and send Teams messages only on failure –
here the tests run against a production website, so the pipeline runs only on demand and on push.

## Design decisions

- **Page Object Model** (`src/pages/`) – tests describe the user flow, page objects own selectors.
  Roles and labels are used where the site offers them; morosystems.cz has no test ids, so the
  rest relies on its JavaScript hooks and component classes (`js-filter__*`, `inp-custom-select`),
  kept in one place per page.
- **Fixtures** (`src/fixtures.ts`) – page objects and the API client are injected; the `task`
  fixture creates a fresh task per test and deletes it afterwards.
- **Test data isolation** – the backend stores data in a shared JSON file. Every test works only
  with tasks it created (unique `[autotest]` text) and cleans up, so tests run in parallel and
  never depend on the number of existing tasks.
- **Data-driven filter test** – the expected positions are computed from the location printed on
  each card (what the user sees, not the attribute the filter itself uses), so the test keeps
  working when MoroSystems publishes or closes a position. Visibility is checked as real
  visibility, not as a CSS class.
- **Google CAPTCHA** – Google answers automated browsers with an "unusual traffic" page. This is
  bot protection, not a defect of the tested flow, and bypassing it would be wrong. The scenario
  is therefore split into two tests: steps 1–5 are reported as **skipped** with the reason when
  Google blocks (in CI that is common), steps 6–7 start on the MoroSystems homepage and always run.
  The report never shows a green test that did not verify anything.
- **Cookie consent** – morosystems.cz shows its consent dialog with a delay; a
  `page.addLocatorHandler` dismisses it whenever it appears, instead of fragile fixed waits.
- **Navigation waits for the DOM**, not for the `load` event (`src/pages/navigation.ts`): the
  live site loads third-party trackers that occasionally delay `load` by tens of seconds.
  Assertions wait for the actual elements instead.
- **Generated types + thin connector** – the connector (`src/api/TodoApi.ts`) is typed by types
  generated from the backend's OpenAPI spec, but written by hand: it returns raw responses so the
  tests own every assertion, and it keeps Playwright's request tracing in the report. A generated
  runtime client would add code without adding test value.
- **Known bugs are pinned by characterization tests** – tests named `KNOWN BUG …` assert today's
  (wrong) behaviour precisely and link the finding. The suite stays green, a crash or a 500 still
  fails them, and once the backend is fixed they fail too, so the expectation gets flipped.
  (`test.fail` was considered and rejected: it passes on *any* failure, including a crashed server.)
- **Every change is verified twice** – in the response and by reading the task back
  (`TodoApi.findTask`), so "the API said OK" never replaces "the data was really stored".
- **Polite to production** – GUI tests run against the live morosystems.cz, so parallelism is
  capped (4 workers locally, 2 in CI). Running the suite repeatedly against the site triggers
  server-side time-outs; CI therefore retries once – for network hiccups of the live site, not to
  hide flaky tests (those were fixed at the root cause).
- **Visual tests are a demonstration** against the live site: they compare only the intro block
  (header + hero) in one engine with a 0.5 % tolerance, overlays (cookie dialog, side pin) are
  hidden. Baselines are platform-specific (`-linux`) and must be updated after a redesign.

## How this was built

I built this assignment together with an AI coding agent (Claude Code), the same way I work day to
day as a QA lead. I defined the scope and test strategy, made the design decisions, reviewed every
change and verified the findings against the running backend and the live website (except B5,
which comes from code review – see FINDINGS). The agent wrote
most of the code and documentation under my direction.

What I kept under human control:

- **Scope and priorities** – what to automate, what to test exploratively, which extras are worth
  it (k6, visual tests, test plan).
- **Verification** – every finding was reproduced manually (curl, browser) before it went into
  FINDINGS.md, and findings are split into defects and observations, not inflated.
- **Guardrails** – assertions are not loosened to make tests pass; known defects stay visible as
  `KNOWN BUG` tests; flaky failures were investigated to the root cause (cookie dialog timing, slow
  `load` event, server-side throttling) instead of being retried away.
- **Independent review** – I had the GUI and API parts reviewed by two separate AI review agents
  (a technical view and a grader's view), decided which findings were valid and fixed them before
  submission – e.g. weak step-7 validation and a test that could pass for the wrong reason.

## Project structure

```
src/
  api/          TodoApi connector, schema assertions, test data, generated OpenAPI types
  pages/        Google, MoroSystems home, Kariéra page objects
  fixtures.ts   Playwright fixtures (pages, API client, task with cleanup, cookie handler)
tests/
  api/          CRUD + validation tests
  gui/          Assignment scenario + city filter
  responsive/   Mobile / tablet checks
  visual/       Visual regression + baselines
perf/           k6 load test
openapi/        Backend OpenAPI spec used for codegen
```
