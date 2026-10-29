# Findings

Issues found while automating the assignment. Severity is my assessment from a user / API
consumer point of view.

## Summary

| Type | Count | Items |
| --- | --- | --- |
| **Defect** – the system behaves incorrectly or its documentation is wrong | 4 | B2, B3, B4, B9 |
| **UX issue** – works, but the user experience should be improved | 1 | W1 |
| **Observation** – not a defect; intentional behaviour, spec mismatch, risk or note for the team | 7 | B1, B5, B6, B7, B8, W2, W3 |

B2–B4, B8 and B9 are covered by API tests (`tests/api/tasks-validation.spec.ts`), B6 and B7 by
the k6 load test.
All findings were reproduced against the running backend or the live website, except B5, which
comes from a code review of the backend source done as the last step (behaviour first, code second).

## Todo backend (`morosystems/todo-be`)

| # | Type | Finding | Severity | Evidence |
| --- | --- | --- | --- | --- |
| B1 | Observation | **No PUT endpoint.** The assignment asks for a PUT update, the API updates via `POST /tasks/{id}`. `PUT` returns `404 Cannot PUT`; CORS also allows only `GET, POST, DELETE`. A mismatch between the assignment and the API, not a defect of the application. | Info | `tasks-crud.spec.ts` → "step 4: PUT …" |
| B2 | Defect (docs) | **Swagger vs. implementation – unknown id.** Swagger documents `400` for an unknown task id on delete, complete and incomplete, and no not-found response on update; the backend returns `404` for all four. `404` is the better choice – the documentation should be fixed. | Low | `tasks-validation.spec.ts` → "unknown id returns 404 …" |
| B3 | Defect | **Whitespace-only text is accepted.** `{"text":"   "}` creates a task; validation only checks truthiness. | Medium | `tasks-validation.spec.ts` → "KNOWN BUG … B3" |
| B4 | Defect | **No type validation.** `{"text": 12345}` is stored as a task text (number instead of string). | Medium | `tasks-validation.spec.ts` → "KNOWN BUG … B4" |
| B5 | Observation (code review) | **Ineffective sort.** `tasks.sort((item) => item.createdDate)` uses a one-argument comparator, so it does not sort by creation date. No impact was observed because tasks are appended in creation order; note that `sort` also mutates the stored data. | Info | `todo-be/src/controller.ts` – not verified by a test, the API defines no ordering |
| B6 | Observation | **GET /tasks is deliberately slow (~3 s)** – documented in Swagger, measured at 3.0 s median. | Info | k6 (`npm run perf`) |
| B7 | Observation (performance risk) | **Latency under concurrent writes.** On a local machine, with 10 virtual users writing, one `GET /tasks` call per run took ~5.7 s instead of 3 s (4 runs); in a stress run without think time single write requests took up to **1 min 51 s**. Likely cause: synchronous file I/O (`lowdb` JSONFileSync on every write) blocking the Node.js event loop. On the faster CI runner the regular load stays within the thresholds (list p95 ≈ 3.0 s) and the list scenario has only ~20 samples – so this is a scalability risk confirmed under stress, not a defect at the tested load. | Info (risk) | `k6 run -e THINK_TIME=0 perf/tasks-load.k6.js` |
| B8 | Observation | **No idempotency.** Sending the same `POST /tasks` twice (e.g. a client retry after a timeout) creates two tasks. Acceptable for a todo app, but in a payment API the same behaviour would mean a double charge – there it needs an idempotency key. | Info | `tasks-validation.spec.ts` → "a repeated identical POST …" |
| B9 | Defect (security) | **Stack trace in the error response.** A malformed JSON body is correctly rejected with `400`, but the response is an HTML page with the full stack trace, including server file paths and library names (`body-parser`). Information disclosure; Express shows it when `NODE_ENV` is not `production`, which is how the backend is started. | Low (Medium in production) | `tasks-validation.spec.ts` → "KNOWN BUG … B9" |

## morosystems.cz – Kariéra

| # | Type | Finding | Severity | Evidence |
| --- | --- | --- | --- | --- |
| W1 | UX issue | **No empty state for cities without openings.** "Bratislava" is offered in the city filter but had no open positions when tested (29 Oct 2026); the list just disappears without a message such as "Pro toto město teď nemáme otevřenou pozici". | Low | `career-filter.spec.ts` → annotation on the Bratislava test |
| W2 | Observation | **Consent dialog appears late / after interaction** and can cover the mobile menu – a user who taps quickly can hit the overlay instead of the menu link. | Info | handled in `src/fixtures.ts`; seen on Pixel 7 |
| W3 | Observation | **Slow `load` event.** Navigation occasionally exceeded 60 s waiting for `load` (third-party resources) although the content was usable much earlier. | Info | reason for `gotoDom` in `src/pages/navigation.ts` |

## Google

Google shows a CAPTCHA ("unusual traffic") to automated browsers, including branded Chrome
started by Playwright. This is expected bot protection, not a finding – the GUI scenario handles
it explicitly, see README → Design decisions.
