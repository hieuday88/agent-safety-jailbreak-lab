// Runs every verification suite and reports one overall result.
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const suites = ['behaviour.js', 'consistency.js', 'ui.js'];

let failed = 0;
for (const suite of suites) {
  console.log('\n=== ' + suite + ' ===');
  const result = spawnSync(process.execPath, [path.join(__dirname, suite), root], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

console.log('\n' + (failed === 0 ? 'ALL SUITES PASSED' : failed + ' SUITE(S) FAILED'));
process.exit(failed === 0 ? 0 : 1);
