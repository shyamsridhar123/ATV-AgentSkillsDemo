#!/usr/bin/env node

/**
 * Quality Gate Script
 *
 * Runs all test suites, collects results, generates a markdown report
 * in docs/test-reports/, and exits non-zero if anything fails.
 *
 * Usage: npm run test:gate
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPORT_DIR = join(process.cwd(), 'docs', 'test-reports');

function getGitInfo() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
      return 'unknown';
    }
  };
  return {
    branch: run('git branch --show-current'),
    commit: run('git rev-parse HEAD'),
    commitShort: run('git rev-parse --short HEAD'),
  };
}

function runTests(label, command) {
  const start = Date.now();
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const elapsed = Date.now() - start;
    return { label, passed: true, output, elapsed, error: null };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      label,
      passed: false,
      output: err.stdout || '',
      elapsed,
      error: err.stderr || err.message,
    };
  }
}

function parseVitestOutput(output) {
  // Parse vitest summary line: "Tests  X passed | Y failed | Z skipped (W)"
  // or: "Tests  X passed (Y)"
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };

  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const skippedMatch = output.match(/(\d+)\s+skipped/);
  const totalMatch = output.match(/Tests\s+.*\((\d+)\)/);

  if (passedMatch) counts.passed = parseInt(passedMatch[1], 10);
  if (failedMatch) counts.failed = parseInt(failedMatch[1], 10);
  if (skippedMatch) counts.skipped = parseInt(skippedMatch[1], 10);
  if (totalMatch) {
    counts.total = parseInt(totalMatch[1], 10);
  } else {
    counts.total = counts.passed + counts.failed + counts.skipped;
  }

  return counts;
}

function generateReport(results, gitInfo) {
  const date = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();
  const nodeVersion = process.version;
  const os = `${process.platform} ${process.arch}`;

  let allPassed = true;
  const rows = [];

  for (const r of results) {
    const counts = parseVitestOutput(r.output + (r.error || ''));
    if (!r.passed) allPassed = false;
    rows.push({ label: r.label, ...counts, elapsed: r.elapsed });
  }

  let report = `# Test Report — ${date}\n\n`;
  report += `## Commit: ${gitInfo.commit} (${gitInfo.branch})\n`;
  report += `## Result: ${allPassed ? '✅ ALL PASSED' : '❌ FAILURES DETECTED'}\n\n`;

  report += `## Summary\n\n`;
  report += `| Suite | Total | Passed | Failed | Skipped | Time |\n`;
  report += `|-------|-------|--------|--------|---------|------|\n`;

  let grandTotal = 0,
    grandPassed = 0,
    grandFailed = 0,
    grandSkipped = 0;
  for (const r of rows) {
    const time = `${(r.elapsed / 1000).toFixed(1)}s`;
    report += `| ${r.label} | ${r.total} | ${r.passed} | ${r.failed} | ${r.skipped} | ${time} |\n`;
    grandTotal += r.total;
    grandPassed += r.passed;
    grandFailed += r.failed;
    grandSkipped += r.skipped;
  }
  report += `| **Total** | **${grandTotal}** | **${grandPassed}** | **${grandFailed}** | **${grandSkipped}** | |\n`;

  if (!allPassed) {
    report += `\n## Failures\n\n`;
    for (const r of results) {
      if (!r.passed) {
        report += `### ${r.label}\n\n`;
        report += '```\n';
        report += (r.error || r.output || 'No output captured').slice(0, 2000);
        report += '\n```\n\n';
      }
    }
  }

  report += `\n## Environment\n\n`;
  report += `- Node: ${nodeVersion}\n`;
  report += `- OS: ${os}\n`;
  report += `- Branch: ${gitInfo.branch}\n`;
  report += `- Commit: ${gitInfo.commit}\n`;
  report += `- Date: ${timestamp}\n`;

  return { report, allPassed, filename: `test-report-${date}-${gitInfo.commitShort}.md` };
}

// Main
const gitInfo = getGitInfo();

console.log('🔍 Quality Gate — Running all test suites...\n');

const results = [];

// Unit + integration tests
console.log('  Running unit + integration tests...');
results.push(runTests('Unit/Integration', 'npx vitest run --reporter=verbose 2>&1'));

// Legacy tests (Node.js native test runner)
console.log('  Running legacy tests...');
results.push(runTests('Legacy (bin/)', 'node --test bin/lib/*.test.js 2>&1'));

console.log('');

// Generate report
const { report, allPassed, filename } = generateReport(results, gitInfo);

// Write report
if (!existsSync(REPORT_DIR)) {
  mkdirSync(REPORT_DIR, { recursive: true });
}
const reportPath = join(REPORT_DIR, filename);
writeFileSync(reportPath, report, 'utf-8');
console.log(`📄 Test report written to: docs/test-reports/${filename}`);

// Summary
const totalResults = results.length;
const passedSuites = results.filter((r) => r.passed).length;
console.log(`\n${allPassed ? '✅' : '❌'} Quality Gate: ${passedSuites}/${totalResults} suites passed`);

if (!allPassed) {
  console.log('\n❌ QUALITY GATE FAILED — Fix test failures before landing.');
  process.exit(1);
} else {
  console.log('\n✅ QUALITY GATE PASSED — Safe to land.');
}
