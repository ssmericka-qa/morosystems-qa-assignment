# Test plan

## Scope

| In scope | Out of scope |
| --- | --- |
| Assignment GUI scenario (Google → MoroSystems → Kariéra → filter) | Google search itself (third party) |
| Kariéra city filter, responsive layout, visual stability | Content correctness of job descriptions |
| Todo API: CRUD, status changes, validation, error handling, performance | Security testing of the backend (would be next, see below) |

## Approach

- **Risk first.** The highest risks are data correctness of the API and the city filter showing
  wrong or no positions, so those get the most assertions. Google is an external dependency and
  is treated as such (CAPTCHA handling, not a hard failure).
- **Contract from the spec.** API tests assert the Swagger contract. Where the backend differs,
  a characterization test (`KNOWN BUG …`) pins today's behaviour and the finding is listed in
  FINDINGS.md.
- **Independent, parallel tests.** Each test creates and removes its own data.
- **Automate the repeatable, explore the rest.** Regression-worthy checks are automated; one-off
  questions were answered by exploratory testing and are listed below.

## Automated

| Level | Checks |
| --- | --- |
| API | status codes, content type, response schema (runtime check mirroring the OpenAPI schema; TypeScript types generated from it), persistence of every change (read back after create / update / delete), timestamps, completion toggle incl. the completed list, repeated delete, unknown ids, negative inputs, malformed JSON, unicode / long text, server-owned fields (`id`, `completed`, dates) cannot be set by the client, retried POST (idempotency), known bugs as characterization tests (response times are measured in k6, not in parallel functional runs) |
| GUI | assignment scenario as two tests (Google steps 1–5 skipped with a reason on CAPTCHA, steps 6–7 always), result link present, Kariéra reachable on desktop (dropdown) and mobile (burger), exact filter result for every city computed from the cards, reset to "Všechna města" |
| Cross-browser | Chromium, Firefox, WebKit |
| Responsive | Pixel 7, iPad – no horizontal overflow, positions not cut off |
| Visual | intro block of the homepage and Kariéra vs. baseline (demonstration against the live site) |
| Performance | k6 with assumed thresholds (no SLOs were given): write lifecycle p95 < 200 ms, list p95 < 3.5 s, error rate < 1 %; data checks under load (update returns the right task and text) and a reconciliation at the end – no task of the run may be lost or left behind |

## Exploratory (manual) testing performed

- API: PUT vs. POST update, unknown ids, whitespace / numeric text, response bodies of errors,
  CORS headers, ordering of the task list (code review).
- Web: filter behaviour for a city without positions, navigation to Kariéra on desktop (dropdown)
  and mobile (burger menu), cookie consent timing, page load behaviour.

## GUI ideas for exploratory testing (deliberately not automated)

The GUI runs against a live third-party website where inputs and backend states cannot be
controlled, so negative and boundary cases are automated on the API level instead. On the GUI
I would explore manually:

- the "Pozice vhodná pro absolventy" checkbox combined with the city filter,
- whether the filter survives a reload or the browser Back button (state in the URL),
- operating the custom select box with the keyboard only (accessibility),
- very narrow viewports (320 px) and zoom 200 %.

## Next steps (not implemented, would be proposed to the team)

- Security tests of the API: oversized payloads, injection-like strings in `text`, missing
  `Content-Type`, rate limiting (malformed JSON and server-owned fields are already covered).
- Contract test in CI that fails when `/v3/api-docs` changes without the client being regenerated.
- Accessibility checks (axe-core) on the Kariéra page.
- Visual baselines generated in the Playwright Docker image, so local and CI screenshots match.
