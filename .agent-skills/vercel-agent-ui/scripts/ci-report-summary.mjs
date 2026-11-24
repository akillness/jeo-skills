// Writes the failed and flaky tests of a Playwright JSON report to the GitHub job
// summary, and a warning annotation on the spec line of each flaky test, so both
// show on the run page without downloading the HTML report.
// Usage: node scripts/ci-report-summary.mjs <results.json>.
import { appendFileSync, readFileSync } from "node:fs"

const reportFile = process.argv[2]
if (!reportFile) {
  console.error("Usage: node scripts/ci-report-summary.mjs <results.json>")
  process.exit(1)
}

const report = JSON.parse(readFileSync(reportFile, "utf8"))
const maxListed = 100

// Top-level suites are spec files, and nested suites are describe blocks.
function* testsIn(suite, describes = []) {
  for (const spec of suite.specs ?? []) {
    const title = [...describes, spec.title].join(" › ")
    for (const test of spec.tests) {
      yield {
        ...test,
        file: spec.file,
        line: spec.line,
        name: `[${test.projectName}] ${spec.file}:${spec.line} › ${title}`,
      }
    }
  }
  for (const child of suite.suites ?? []) {
    yield* testsIn(child, [...describes, child.title])
  }
}

const tests = report.suites.flatMap((suite) => [...testsIn(suite)])
const failed = tests.filter((test) => test.status === "unexpected")
const flaky = tests.filter((test) => test.status === "flaky")

function section(title, tests) {
  if (!tests.length) {
    return []
  }
  const listed = tests.slice(0, maxListed).map((test) => `- \`${test.name}\``)
  const more =
    tests.length > maxListed
      ? [`…and ${tests.length - maxListed} more in the HTML report.`, ""]
      : []
  return [`### ${title} (${tests.length})`, "", ...listed, "", ...more]
}

// Test time per spec file, summed over workers and retries, so what a spec
// costs every run shows without downloading the report.
function slowest(tests, count = 5) {
  const byFile = new Map()
  for (const test of tests) {
    const time = test.results.reduce((sum, result) => sum + result.duration, 0)
    byFile.set(test.file, (byFile.get(test.file) ?? 0) + time)
  }
  const total = [...byFile.values()].reduce((sum, time) => sum + time, 0)
  const minutes = (time) => `${(time / 60_000).toFixed(1)} min`
  const rows = [...byFile]
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(
      ([file, time]) =>
        `| \`${file}\` | ${minutes(time)} | ${Math.round((time / total) * 100)}% |`
    )
  return [
    `### Slowest spec files (${minutes(total)} of tests in all)`,
    "",
    "| Spec | Test time | Share |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ]
}

const { expected, unexpected, flaky: flakyCount, skipped } = report.stats
const summary = [
  "## Playwright",
  "",
  `${expected} passed, ${unexpected} failed, ${flakyCount} flaky, ${skipped} skipped.`,
  "",
  ...section("Failed", failed),
  ...section("Flaky (passed on retry)", flaky),
  ...slowest(tests),
].join("\n")

for (const test of flaky) {
  console.log(
    `::warning file=tests/specs/${test.file},line=${test.line},title=Flaky test::${test.name}`
  )
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n")
} else {
  console.log(summary)
}
