// Load test of the todo API with k6 (https://k6.io). The assignment gives no SLOs – the
// thresholds below are assumptions that make regressions visible.
// Stress variant without think time: k6 run -e THINK_TIME=0 perf/tasks-load.k6.js
// Run: npm run perf   (backend must be running on API_URL, default http://localhost:8080)
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:8080';
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

// Data errors get their own metric and a zero-tolerance threshold: in the overall `checks` rate a
// single lost task would disappear among ~1,400 passing checks.
const dataErrors = new Counter('data_errors');

export const options = {
  scenarios: {
    // Typical write traffic: every iteration creates, updates and deletes its own task.
    task_lifecycle: {
      executor: 'ramping-vus',
      exec: 'taskLifecycle',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 10 },
        { duration: '5s', target: 0 },
      ],
    },
    // GET /tasks is documented as slow (~3 s), so it gets its own scenario and threshold.
    list_tasks: {
      executor: 'constant-vus',
      exec: 'listTasks',
      vus: 2,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:create}': ['p(95)<200'],
    'http_req_duration{endpoint:update}': ['p(95)<200'],
    'http_req_duration{endpoint:delete}': ['p(95)<200'],
    'http_req_duration{endpoint:list}': ['p(95)<3500'],
    checks: ['rate>0.99'],
    data_errors: ['count==0'],
  },
};

/** A run id in every task text, so the final check sees only this run's data. */
export function setup() {
  return { prefix: `[k6 ${Date.now().toString(36)}]` };
}

export function taskLifecycle({ prefix }) {
  group('task lifecycle', () => {
    const created = http.post(
      `${API_URL}/tasks`,
      JSON.stringify({ text: `${prefix} ${__VU}-${__ITER}` }),
      { ...JSON_HEADERS, tags: { endpoint: 'create' } },
    );
    const ok = check(created, {
      'create: status 200': (r) => r.status === 200,
      'create: has id': (r) => !!r.json('id'),
    });
    if (!ok) return;
    const id = created.json('id');

    const newText = `${prefix} updated ${__VU}-${__ITER}`;
    const updated = http.post(
      `${API_URL}/tasks/${id}`,
      JSON.stringify({ text: newText }),
      { ...JSON_HEADERS, tags: { endpoint: 'update', name: 'POST /tasks/{id}' } },
    );
    // Under load the data must stay correct, not only fast.
    check(updated, { 'update: status 200': (r) => r.status === 200 });
    const dataOk = check(updated, {
      'update: the same task with the new text': (r) => r.json('id') === id && r.json('text') === newText,
    });
    dataErrors.add(dataOk ? 0 : 1);

    // `name` groups the per-id URLs into one metric instead of one per task.
    const deleted = http.del(`${API_URL}/tasks/${id}`, null, { tags: { endpoint: 'delete', name: 'DELETE /tasks/{id}' } });
    check(deleted, { 'delete: status 200': (r) => r.status === 200 });
  });
  sleep(Number(__ENV.THINK_TIME ?? 1)); // think time – realistic user pacing instead of flooding the server
}

export function listTasks() {
  const res = http.get(`${API_URL}/tasks`, { tags: { endpoint: 'list' }, timeout: '10s' });
  check(res, { 'list: status 200': (r) => r.status === 200 });
}

/**
 * Reconciliation after the load: every task this run created was also deleted, so none of them
 * may remain – a leftover means a lost update or delete under concurrent writes.
 */
export function teardown({ prefix }) {
  const res = http.get(`${API_URL}/tasks`, { tags: { endpoint: 'reconcile' }, timeout: '15s' });
  const leftovers = (res.json() ?? []).filter((task) => String(task.text).startsWith(prefix));
  check(leftovers, { 'reconcile: no task of this run left behind': (l) => l.length === 0 });
  dataErrors.add(leftovers.length);
}
