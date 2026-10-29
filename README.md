# MoroSystems QA assignment – Playwright + TypeScript

![tests](https://github.com/ssmericka-qa/morosystems-qa-assignment/actions/workflows/tests.yml/badge.svg)

📊 **Test reports of the latest CI run:** [Playwright](https://ssmericka-qa.github.io/morosystems-qa-assignment/playwright/) · [k6](https://ssmericka-qa.github.io/morosystems-qa-assignment/k6/)

Automated GUI and API tests for the MoroSystems QA assignment, plus a k6 load test,
visual regression, cross-browser / responsive runs and a GitHub Actions pipeline.

| Area | What is covered | Where |
| --- | --- | --- |
| **GUI** | Assignment scenario: steps 1–5 (Google → MoroSystems, result link validation) and steps 6–7 (Kariéra → city filter) | `tests/gui/google-to-career.spec.ts` |
| **GUI** | City filter checked for every city against the page's own data | `tests/gui/career-filter.spec.ts` |
| **API** | Steps 2–5: GET, POST, update (the assignment requires PUT, the API offers only `POST /tasks/{id}` – defect B1), DELETE; complete / incomplete; status, data and persistence checks | `tests/api/tasks-crud.spec.ts` |
| **API** | Validation, error handling, server-owned fields, retried POST, known bugs pinned by characterization tests | `tests/api/tasks-validation.spec.ts` |
| **Cross-browser** | Chromium, Firefox, WebKit (Safari); branded Chrome / Edge via `PW_CHANNEL` | `playwright.config.ts` |
| **Responsive** | Pixel 7 and iPad: no horizontal overflow, navigation via burger menu, filter usable | `tests/responsive/` |
| **Visual** | Baseline screenshots of the intro block (header + hero) of the homepage and Kariéra | `tests/visual/` |
| **Performance** | k6 load test: thresholds per endpoint (assumed – no SLOs were given) and a data reconciliation after the load | `perf/tasks-load.k6.js` |
| **OpenAPI codegen** | TypeScript types generated from the backend's `/v3/api-docs`, used by a thin hand-written connector | `src/api/` |
| **CI/CD** | GitHub Actions: parallel jobs, merged Playwright report and k6 report on GitHub Pages, run summary | [CI pipeline](#ci-pipeline) |

Found issues are listed in **[FINDINGS.md](FINDINGS.md)**, the test approach in **[TEST_PLAN.md](TEST_PLAN.md)**.

## Setup

Prerequisites: Node.js ≥ 22.6 (required by the backend), Git, and
[k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) for the performance test.

```bash
# 1. Backend – clone it into ./todo-be (git-ignored, the default location)
git clone https://github.com/morosystems/todo-be.git todo-be
npm ci --prefix todo-be

# 2. Tests
npm ci
npx playwright install --with-deps
```

When `./todo-be` exists, Playwright starts the backend automatically (`webServer` in
`playwright.config.ts`) and reuses it if it already runs on `http://localhost:8080`.
Use `TODO_BE_DIR` / `API_URL` for other locations.

## Running the tests

```bash
npm test                    # everything (all projects in parallel)
npm run test:api            # API tests only
npm run test:gui            # GUI tests in Chromium, Firefox and WebKit
npm run test:responsive     # mobile + tablet
npm run test:visual         # visual regression
npm run report              # Playwright HTML report (steps, screenshots, traces)
npm run report:allure       # optional: Allure report of the last local run

npx playwright test --project=chromium --headed             # watch a run
SLOWMO=500 npx playwright test --project=chromium --headed  # watch it slowed down
PW_CHANNEL=chrome npx playwright test --project=chromium    # branded Google Chrome (or msedge)

npm run perf                # k6 load test (backend must be running: npm start --prefix todo-be)
k6 run -e THINK_TIME=0 perf/tasks-load.k6.js   # stress variant without think time

npm run api:spec:refresh    # download the current OpenAPI spec and regenerate types
npm run test:visual:update  # accept new visual baselines (intentional UI change only)
npm run typecheck
```

On failure Playwright keeps a **screenshot, video and trace**; findings are attached to tests as
**annotations** and visible in the report.

## CI pipeline

`.github/workflows/tests.yml` runs on every push and pull request, or manually
(**Actions → tests → Run workflow**: `all`, `api`, `gui` or `performance`).

- **api**, **gui** (6 parallel jobs: chromium, firefox, webkit, mobile, tablet, visual) and
  **performance** (k6) run in parallel; the backend is checked out at a pinned commit.
- **report** merges the results of all jobs into one Playwright report and `junit.xml`, and writes the **run summary** (per project, k6 result, failed and skipped tests,
  projects whose job crashed before reporting). Failing tests are also shown directly at the line
  of code.
- **publish-report** publishes the reports from `main` to
  [GitHub Pages](https://ssmericka-qa.github.io/morosystems-qa-assignment/).
- A k6 threshold breach is reported, not blocking – the thresholds are assumptions, not agreed SLOs.

Publishing to GitHub Pages is optional (Settings → Pages → Source: **GitHub Actions**, then
repository variable `PUBLISH_REPORT=true`); without it the reports are run artifacts.

In a real project I would add a nightly run and send a Microsoft Teams message on failure – here
the tests hit a production website, so the pipeline runs only on push and on demand.

## Design decisions

- **Page Object Model** (`src/pages/`) – tests describe the user flow, page objects own selectors.
  Roles and labels are used where the site offers them; morosystems.cz has no test ids, so the
  rest relies on its JavaScript hooks and component classes, kept in one place per page.
- **Fixtures** (`src/fixtures.ts`) – page objects and the API client are injected; the `task`
  fixture creates a fresh task per test and deletes it afterwards.
- **Test data isolation** – the backend stores data in a shared JSON file. Every test works only
  with tasks it created (unique `[autotest]` text) and cleans up, so tests run in parallel and
  never depend on the number of existing tasks.
- **Data-driven filter test** – the expected positions are computed from the location printed on
  each card (what the user sees, not the attribute the filter itself uses), so the test keeps
  working when MoroSystems publishes or closes a position.
- **Google CAPTCHA** – Google answers automated browsers with an "unusual traffic" page, locally as
  well as in CI (it depends on the IP reputation). This is bot protection, not a defect of the
  tested flow, and bypassing it would be wrong. The scenario is therefore split into two tests:
  steps 1–5 run until Google blocks and are then reported as **skipped** with the reason (listed in
  the run summary); steps 6–7 start on the MoroSystems homepage and always run. The report never
  shows a green test that did not verify anything.
- **Waiting for the real state** – the cookie dialog is dismissed by `page.addLocatorHandler`
  whenever it appears; navigation waits for the DOM, not for the `load` event (third-party
  trackers delay it by tens of seconds); visual tests explicitly load the page's web fonts before
  the screenshot. No fixed waits.
- **Generated types + thin connector** – `src/api/TodoApi.ts` is typed by types generated from the
  OpenAPI spec but written by hand: it returns raw responses, so the tests own every assertion.
- **Known bugs are pinned by characterization tests** – tests named `KNOWN BUG …` assert today's
  (wrong) behaviour precisely and link the finding. The suite stays green, a crash or a 500 still
  fails them, and once the backend is fixed they fail too, so the expectation gets flipped.
  (`test.fail` was considered and rejected: it passes on *any* failure, including a crashed server.)
- **Every change is verified twice** – in the response and by reading the task back
  (`TodoApi.findTask`), so "the API said OK" never replaces "the data was really stored".
- **Polite to production** – GUI tests run against the live morosystems.cz, so parallelism is
  capped (4 workers locally, 2 in CI) and CI retries once for network hiccups of the live site.
  A test that passes only on retry is reported as **flaky**, not hidden – the one flaky test seen
  in CI (visual test rendered with a fallback font) was fixed at the root cause.
- **Visual tests are a demonstration** against the live site: only the intro block, one engine,
  0.5 % tolerance, overlays hidden. Baselines are platform-specific (`-linux`, CI runs on a pinned
  Ubuntu image) and must be updated after a redesign.

## How this was built

I built this assignment together with an AI coding agent (Claude Code), the same way I work day to
day as a QA lead. I defined the scope and test strategy, made the design decisions, reviewed every
change and verified the findings against the running backend and the live website (except B5,
which comes from code review – see FINDINGS). The agent wrote most of the code and documentation
under my direction.

What I kept under human control:

- **Scope and priorities** – what to automate, what to test exploratively, which extras are worth it.
- **Verification** – every finding was reproduced before it went into FINDINGS.md, and findings
  are split into defects and observations, not inflated.
- **Guardrails** – assertions are not loosened to make tests pass; known defects stay visible as
  `KNOWN BUG` tests; flaky failures are investigated to the root cause instead of retried away.
- **Independent review** – the solution was reviewed from a technical and a reviewer perspective;
  I decided which remarks were valid and fixed them.

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
scripts/        CI run summary, landing page of the published reports
openapi/        Backend OpenAPI spec used for codegen
```
