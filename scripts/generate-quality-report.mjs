import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { relative, resolve, sep } from 'node:path'

const projectRoot = process.cwd()
const reportsDirectory = resolve(projectRoot, 'reports')
const reportsRelativePath = relative(projectRoot, reportsDirectory)

if (
  reportsRelativePath === '' ||
  reportsRelativePath === '..' ||
  reportsRelativePath.startsWith(`..${sep}`) ||
  resolve(projectRoot, reportsRelativePath) !== reportsDirectory
) {
  throw new Error('Reports directory must stay inside the project root')
}

rmSync(reportsDirectory, { recursive: true, force: true })
mkdirSync(reportsDirectory, { recursive: true })

const binaries = {
  eslint: resolve(projectRoot, 'node_modules/eslint/bin/eslint.js'),
  jscpd: resolve(projectRoot, 'node_modules/jscpd/run-jscpd.js'),
  knip: resolve(projectRoot, 'node_modules/knip/bin/knip.js'),
  vitest: resolve(projectRoot, 'node_modules/vitest/vitest.mjs'),
}
const results = []

function run(name, binary, args, options = {}) {
  console.log(`\n== ${name} ==`)

  const captureOutput = options.outputFile !== undefined
  const result = spawnSync(process.execPath, [binaries[binary], ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })

  if (captureOutput) {
    writeFileSync(
      resolve(reportsDirectory, options.outputFile),
      result.stdout ?? '',
      'utf8',
    )

    if (result.stderr) {
      writeFileSync(
        resolve(reportsDirectory, `${options.outputFile}.log`),
        result.stderr,
        'utf8',
      )
    }
  }

  const status = result.status ?? 1
  results.push({ name, status, report: options.report })

  if (result.error) {
    console.warn(`[report-only] ${name}: ${result.error.message}`)
  }

  if (status !== 0) {
    console.warn(
      `[report-only] ${name} завершился с кодом ${status}; CI остаётся зелёным.`,
    )
  }
}

run(
  'Type-aware ESLint and SonarJS',
  'eslint',
  [
    'apps',
    '--config',
    'eslint.quality.config.js',
    '--format',
    'json',
    '--output-file',
    'reports/eslint.json',
  ],
  { report: 'eslint.json' },
)

run(
  'Knip unused code and dependencies',
  'knip',
  ['--reporter', 'json', '--no-exit-code', '--no-progress'],
  { outputFile: 'knip.json', report: 'knip.json' },
)

run(
  'jscpd duplication',
  'jscpd',
  [
    'apps',
    '--pattern',
    '**/*.{ts,tsx}',
    '--ignore',
    '**/*.test.ts,**/*.test.tsx,**/dist/**,api/src/generated/**,web/src/api/generated/**',
    '--min-lines',
    '5',
    '--min-tokens',
    '50',
    '--reporters',
    'console,json,html,markdown',
    '--output',
    'reports/jscpd',
    '--no-colors',
    '--no-tips',
  ],
  { report: 'jscpd/jscpd-report.html' },
)

run('Vitest coverage', 'vitest', ['run', '--coverage'], {
  report: 'coverage/index.html',
})

function readJson(path) {
  if (!existsSync(path)) {
    return undefined
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function countNestedIssues(value) {
  if (Array.isArray(value)) {
    return value.length
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).reduce(
      (count, nestedValue) => count + countNestedIssues(nestedValue),
      0,
    )
  }

  return 0
}

const eslintReport = readJson(resolve(reportsDirectory, 'eslint.json')) ?? []
const eslintFindings = eslintReport.flatMap((file) =>
  file.messages.map((message) => ({
    ...message,
    filePath: relative(projectRoot, file.filePath).replaceAll('\\', '/'),
  })),
)
const knipReport = readJson(resolve(reportsDirectory, 'knip.json'))
const knipIssueCount = countNestedIssues(knipReport?.issues ?? {})
const duplicationReport = readJson(
  resolve(reportsDirectory, 'jscpd/jscpd-report.json'),
)
const duplication = duplicationReport?.statistics?.total
const coverageReport = readJson(
  resolve(reportsDirectory, 'coverage/coverage-summary.json'),
)
const coverage = coverageReport?.total

const eslintDetails =
  eslintFindings.length === 0
    ? ['No findings.']
    : eslintFindings.map(
        (finding) =>
          `- \`${finding.filePath}:${finding.line}:${finding.column}\` ` +
          `**${finding.ruleId ?? 'unknown-rule'}** — ${finding.message}`,
      )

const summary = [
  '# Quality reports',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Tool | Result | Report |',
  '| --- | --- | --- |',
  `| Type-aware ESLint and SonarJS | ${eslintFindings.length} finding(s) | [JSON](./eslint.json) |`,
  `| Knip | ${knipIssueCount} issue(s) | [JSON](./knip.json) |`,
  `| jscpd | ${duplication ? `${duplication.clones} clone(s), ${duplication.percentage}% duplicated lines` : 'Report unavailable'} | [HTML](./jscpd/jscpd-report.html) |`,
  `| Vitest coverage | ${coverage ? `${coverage.lines.pct}% lines, ${coverage.branches.pct}% branches` : 'Report unavailable'} | [HTML](./coverage/index.html) |`,
  '',
  'These reports are advisory. Their findings do not fail CI yet.',
  '',
  '## ESLint and SonarJS findings',
  '',
  ...eslintDetails,
  '',
  '## Tool execution',
  '',
  ...results.map(({ name, status }) => `- ${name}: exit code ${status}`),
  '',
].join('\n')

writeFileSync(resolve(reportsDirectory, 'README.md'), summary, 'utf8')

console.log('\nQuality reports are available in reports/README.md')
console.log('Report-only mode: findings do not change the command exit code.')
