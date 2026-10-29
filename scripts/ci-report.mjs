// Turns the merged Playwright JSON report into a GitHub job summary and a Microsoft Teams
// message (Adaptive Card). Used by the "report" job in .github/workflows/tests.yml.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const {
  RESULTS_JSON = 'results.json',
  TEAMS_CARD = 'teams-card.json',
  REPORT_URL = '',
  RUN_URL = '',
  PERF_OUTCOME = '',
  GITHUB_STEP_SUMMARY,
  GITHUB_REPOSITORY = 'local',
  GITHUB_REF_NAME = 'local',
  GITHUB_SHA = '',
} = process.env;

const STATUS = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' };
const projects = new Map();
const failures = [];

function collect(suite, path) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const counts = projects.get(test.projectName) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      counts[STATUS[test.status]]++;
      projects.set(test.projectName, counts);
      if (test.status === 'unexpected') failures.push(`${test.projectName} › ${[...path, spec.title].join(' › ')}`);
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

const PERF = {
  success: '✅ thresholds met',
  failure: '⚠️ thresholds exceeded – informative only, see FINDINGS.md (B7)',
};
const perf = PERF[PERF_OUTCOME] ?? '– not run';
const ok = total.failed === 0;
const headline = projects.size
  ? `${ok ? '✅' : '❌'} Playwright: ${total.passed} passed, ${total.failed} failed, ${total.flaky} flaky, ${total.skipped} skipped`
  : 'Playwright: not run';

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
  REPORT_URL
    ? `📊 [Playwright report](${REPORT_URL}playwright/) · [Allure report](${REPORT_URL}allure/)`
    : '📊 Reports: artifact `playwright-report` below (Playwright and Allure)',
  ...(failures.length ? ['', '### Failed tests', ...failures.map((f) => `- ${f}`)] : []),
].join('\n');

if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${summary}\n`);
else console.log(summary);

// Teams message – the Adaptive Card format accepted by Teams incoming webhooks and Workflows
const MAX_FAILURES = 10;
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
    ...(failures.length
      ? [
          { type: 'TextBlock', weight: 'Bolder', text: 'Failed tests', spacing: 'Medium' },
          {
            type: 'TextBlock',
            wrap: true,
            text: failures.slice(0, MAX_FAILURES).map((f) => `- ${f}`).join('\n') +
              (failures.length > MAX_FAILURES ? `\n- … and ${failures.length - MAX_FAILURES} more` : ''),
          },
        ]
      : []),
  ],
  actions: [
    ...(REPORT_URL
      ? [
          { type: 'Action.OpenUrl', title: 'Playwright report', url: `${REPORT_URL}playwright/` },
          { type: 'Action.OpenUrl', title: 'Allure report', url: `${REPORT_URL}allure/` },
        ]
      : []),
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
