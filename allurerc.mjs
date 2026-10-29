// Allure 3 report configuration – used by `npm run report:allure` and the CI "report" job.
import { defineConfig } from 'allure';

export default defineConfig({
  name: 'MoroSystems QA assignment',
  output: 'allure-report',
  plugins: {
    awesome: {
      // Group the tree like the Playwright projects: project → spec file → describe block.
      options: { groupBy: ['parentSuite', 'suite', 'subSuite'] },
    },
  },
});
