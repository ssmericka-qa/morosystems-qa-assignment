// Turns the merged Playwright JSON report, the job results and the k6 exit code into a GitHub
// job summary and a Microsoft Teams message (Adaptive Card). Used by the "report" job in
// .github/workflows/tests.yml.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const {
  RESULTS_JSON = 'results.json',
  TEAMS_CARD = 'teams-card.json',
  SITE_DIR = 'site',
  SITE_URL = '',
  RUN_URL = '',
  JOB_RESULTS = '{}',
  K6_EXIT = '',
  GITHUB_STEP_SUMMARY,
  GITHUB_REPOSITORY = 'local',
  GITHUB_REF_NAME = 'local',
  GITHUB_SHA = '',
} = process.env;

const STATUS = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' };
const projects = new Map();
const failures = [];
const skipped = [];

function collect(suite, path) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const counts = projects.get(test.projectName) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      counts[STATUS[test.status]]++;
      projects.set(test.projectName, counts);
      const title = `${test.projectName} › ${[...path, spec.title].join(' › ')}`;
      if (test.status === 'unexpected') failures.push(title);
      if (test.status === 'skipped') {
        const reason = test.annotations?.find((a) => a.type === 'skip')?.description;
        skipped.push(reason ? `${title} – ${reason}` : title);
      }
    }
  }
  for (const child of suite.suites ?? []) collect(child, [...path, child.title]);
}

// No results when the run was limited to the performance test.
if (existsSync(RESULTS_JSON)) {
  for (const file of JSON.parse(readFileSync(RESULTS_JSON, 'utf8')).suites) collect(file, [file.title]);
}

const total = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
for (const counts of projects.values()) for (const key in total) total[key] += counts[key];

// A job that crashed before uploading its results (browser install, timeout, lost runner) has no
// tests in the report – without this check the summary would look green. Projects of a failed
// job that are missing from the results are therefore reported explicitly.
const PROJECTS_BY_JOB = { api: ['api'], gui: ['chromium', 'firefox', 'webkit', 'mobile', 'tablet', 'visual'] };
const brokenJobs = Object.entries(JSON.parse(JOB_RESULTS))
  .filter(([name, job]) => PROJECTS_BY_JOB[name] && ['failure', 'cancelled'].includes(job.result))
  .flatMap(([name, job]) =>
    PROJECTS_BY_JOB[name].filter((project) => !projects.has(project)).map((project) => `${project} (${job.result})`),
  );

// k6 exits with 99 when a threshold is breached; any other non-zero code means it could not run.
const K6 = { '0': '✅ thresholds met', '99': '⚠️ thresholds exceeded – informative only' };
const perf = K6_EXIT === '' ? '– not run' : (K6[K6_EXIT] ?? `❌ k6 could not run (exit code ${K6_EXIT})`);

const ok = total.failed === 0 && brokenJobs.length === 0;
const headline = projects.size || brokenJobs.length
  ? `${ok ? '✅' : '❌'} Playwright: ${total.passed} passed, ${total.failed} failed, ${total.flaky} flaky, ${total.skipped} skipped`
  : 'Playwright: not run';

// Links only to reports this run actually published.
const REPORTS = [
  ['Playwright report', 'playwright'],
  ['Allure report', 'allure'],
  ['k6 report', 'k6'],
];
const links = SITE_URL
  ? REPORTS.filter(([, dir]) => existsSync(`${SITE_DIR}/${dir}`)).map(([title, dir]) => ({ title, url: `${SITE_URL}${dir}/` }))
  : [];

// GitHub job summary (Markdown on the run page)
const summary = [
  `## ${headline}`,
  '',
  '| Project | Passed | Failed | Flaky | Skipped |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...[...projects].map(([name, c]) => `| ${name} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} |`),
  '',
  `**k6 load test:** ${perf}`,
  '',
  links.length
    ? `📊 ${links.map(({ title, url }) => `[${title}](${url})`).join(' · ')}`
    : '📊 Reports: artifact `playwright-report` below (Playwright and Allure)',
  ...(brokenJobs.length ? ['', '### Projects without results (their job failed before reporting)', ...brokenJobs.map((j) => `- ${j}`)] : []),
  ...(failures.length ? ['', '### Failed tests', ...failures.map((f) => `- ${f}`)] : []),
  ...(skipped.length ? ['', '### Skipped tests', ...skipped.map((s) => `- ${s}`)] : []),
].join('\n');

if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${summary}\n`);
else console.log(summary);

// Teams message – the Adaptive Card format accepted by Teams incoming webhooks and Workflows
const MAX_ITEMS = 10;
const list = (items) =>
  items.slice(0, MAX_ITEMS).map((i) => `- ${i}`).join('\n') +
  (items.length > MAX_ITEMS ? `\n- … and ${items.length - MAX_ITEMS} more` : '');
const problems = [...brokenJobs.map((j) => `no results: ${j}`), ...failures];

const card = {
  type: 'AdaptiveCard',
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  version: '1.4',
  body: [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, color: ok ? 'Good' : 'Attention', text: headline },
    { type: 'TextBlock', isSubtle: true, spacing: 'None', wrap: true, text: `${GITHUB_REPOSITORY} · ${GITHUB_REF_NAME} · ${GITHUB_SHA.slice(0, 7)}` },
    {
      type: 'FactSet',
      facts: [
        ...[...projects].map(([name, c]) => ({
          title: name,
          value: `${c.passed} ✅  ${c.failed} ❌  ${c.flaky} 🔁  ${c.skipped} ⏭`,
        })),
        { title: 'k6', value: perf },
      ],
    },
    ...(problems.length
      ? [
          { type: 'TextBlock', weight: 'Bolder', text: 'Failed', spacing: 'Medium' },
          { type: 'TextBlock', wrap: true, text: list(problems) },
        ]
      : []),
  ],
  actions: [
    ...links.map(({ title, url }) => ({ type: 'Action.OpenUrl', title, url })),
    ...(RUN_URL ? [{ type: 'Action.OpenUrl', title: 'Open pipeline run', url: RUN_URL }] : []),
  ],
};

writeFileSync(
  TEAMS_CARD,
  JSON.stringify(
    { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }] },
    null,
    2,
  ),
);
