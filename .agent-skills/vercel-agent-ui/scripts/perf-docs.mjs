// Regenerates the perf catalog in tests/perf/README.md, between its
// catalog markers, from tests/perf/budgets.ts and the tests that read each
// budget.
//
//   pnpm docs:perf           Writes the catalog.
//   pnpm docs:perf --check   Writes nothing. Fails when the catalog is stale,
//                            a budget has no test that reads it, or a budget's
//                            `measures` or `why` is empty.
//
// Node strips budgets.ts's types itself, so this needs no dependency beyond
// prettier, which formats the catalog like the rest of the repo.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { format, resolveConfig } from "prettier"

const root = path.resolve(import.meta.dirname, "..")
const budgetsFile = path.join(root, "tests/perf/budgets.ts")
const readmeFile = path.join(root, "tests/perf/README.md")
const start = "<!-- catalog:start -->"
const end = "<!-- catalog:end -->"
// The example port in run commands. Every server command sets its own.
const port = 5310

const { values: flags } = parseArgs({
  options: { check: { type: "boolean", default: false } },
})

const budgets = await load(budgetsFile, "budgets")
const budgetSource = readFileSync(budgetsFile, "utf8")
const testFiles = findTestFiles()
const problems = []

const entries = Object.entries(budgets).map(([key, budget]) => ({
  key,
  budget,
  anchor: anchorOf(key),
  readers: readersOf(key),
}))

for (const { key, budget, readers } of entries) {
  for (const field of ["measures", "why"]) {
    if (typeof budget[field] !== "string" || !budget[field].trim()) {
      problems.push(
        `budgets["${key}"] has no \`${field}\`. Add one to tests/perf/budgets.ts.`
      )
    }
  }
  if (!readers.length) {
    problems.push(
      `No test reads budgets["${key}"]. Read it in a count gate in tests/specs/<name>.counts.spec.ts or a unit test in packages/*/test, or remove it from tests/perf/budgets.ts.`
    )
  }
}

const anchors = new Map()
for (const { key, anchor } of entries) {
  if (anchors.has(anchor)) {
    problems.push(
      `budgets["${key}"] and budgets["${anchors.get(anchor)}"] share the anchor #${anchor}. Rename one.`
    )
  }
  anchors.set(anchor, key)
}

// Assertion messages link to catalog entries, so each link must name one.
for (const file of testFiles) {
  for (const [, anchor] of file.source.matchAll(
    /tests\/perf\/README\.md#([\w-]+?)\.?["'`\s]/g
  )) {
    if (!anchors.has(anchor)) {
      problems.push(
        `${file.relative} links to tests/perf/README.md#${anchor}, which no budget has. Link to the budget's key with its dots as dashes.`
      )
    }
  }
}

const catalog = await formatMarkdown(renderCatalog())
const readme = existsSync(readmeFile) ? readFileSync(readmeFile, "utf8") : ""
const startIndex = readme.indexOf(start)
const endIndex = readme.indexOf(end)
const hasMarkers = startIndex !== -1 && endIndex > startIndex
const next = hasMarkers
  ? `${readme.slice(0, startIndex)}${start}\n\n${catalog}\n${readme.slice(endIndex)}`
  : `${readme.trimEnd()}\n\n## Catalog\n\n${start}\n\n${catalog}\n${end}\n`

if (flags.check) {
  if (!hasMarkers) {
    problems.unshift(
      `tests/perf/README.md has no ${start} and ${end} markers. Add them where the catalog goes, then run \`pnpm docs:perf\`.`
    )
  } else if (next !== readme) {
    problems.unshift(
      "The catalog in tests/perf/README.md is stale. Run `pnpm docs:perf` and commit tests/perf/README.md."
    )
  }
} else if (next !== readme) {
  writeFileSync(readmeFile, next)
  console.log(
    `Wrote the catalog in tests/perf/README.md: ${entries.length} budgets.`
  )
} else {
  console.log("The catalog in tests/perf/README.md is up to date.")
}

if (problems.length) {
  console.error(problems.join("\n"))
  process.exitCode = 1
} else if (flags.check) {
  console.log(
    `The perf catalog matches tests/perf/budgets.ts: ${entries.length} budgets, each read by a test.`
  )
}

// Imports a module, budgets.ts included, and returns one export or all of them.
async function load(file, name) {
  try {
    const module = await import(pathToFileURL(file).href)
    if (name && !module[name]) {
      fail(`${path.relative(root, file)} has no \`${name}\` export.`)
    }
    return name ? module[name] : module
  } catch (error) {
    fail(`Couldn't load ${path.relative(root, file)}: ${error.message}`)
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

// Failure messages link to "#menu-arrow-key" for "menu.arrow-key".
function anchorOf(key) {
  return key.toLowerCase().replace(/[^\w-]+/g, "-")
}

// The Playwright specs and the unit tests, any of which can read a budget.
function findTestFiles() {
  const specs = readdirSync(path.join(root, "tests/specs"))
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => path.join(root, "tests/specs", name))
  const units = readdirSync(path.join(root, "packages")).flatMap((name) => {
    const dir = path.join(root, "packages", name, "test")
    if (!existsSync(dir)) {
      return []
    }
    return readdirSync(dir, { recursive: true })
      .filter(
        (file) => /\.test\.tsx?$/.test(file) && !file.includes("node_modules")
      )
      .map((file) => path.join(dir, file))
  })
  return [...specs, ...units].sort().map((file) => {
    const source = readFileSync(file, "utf8")
    return {
      file,
      relative: path.relative(root, file),
      source,
      tests: findTests(source),
    }
  })
}

// Each test's title and where its code starts, in source order. A test runs
// to where the next one starts, which is close enough to say who reads what.
function findTests(source) {
  const pattern =
    /\b(?:test|it)(?:\.(?:only|fail|skip|fixme))?\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  const tests = [...source.matchAll(pattern)].map((match) => ({
    title: titleOf(match[1]),
    start: match.index,
  }))
  return tests.map((test, index) => ({
    ...test,
    body: source.slice(test.start, tests[index + 1]?.start ?? source.length),
  }))
}

// Titles without the size every gate repeats them at.
function titleOf(literal) {
  return literal
    .slice(1, -1)
    .replace(/\s*\(n=\$\{[^}]+\}\)/g, "")
    .replace(/\$\{([^}]+)\}/g, "<$1>")
}

// The tests that read `budgets[key]`, or name the key, grouped by file.
function readersOf(key) {
  const quoted = new RegExp(`(["'\`])${escapeRegExp(key)}\\1`, "g")
  return testFiles.flatMap((file) => {
    const titles = new Set()
    for (const match of file.source.matchAll(quoted)) {
      const test = file.tests.findLast(({ start }) => start <= match.index)
      if (test) {
        titles.add(test.title)
        continue
      }
      // Read before any test, like `const budget = budgets["menu.open"]`:
      // the tests that use that name read it.
      const before = file.source.slice(0, match.index)
      const name = before.match(
        /(?:const|let)\s+(\w+)\s*=\s*budgets\s*\[\s*$/
      )?.[1]
      const users = name
        ? file.tests.filter(({ body }) =>
            new RegExp(`\\b${name}\\b`).test(body)
          )
        : []
      for (const user of users.length ? users : file.tests) {
        titles.add(user.title)
      }
    }
    if (!titles.size) {
      return []
    }
    const failing = file.tests.filter(
      ({ title, body }) => titles.has(title) && /\btest\.fail\b/.test(body)
    )
    return [
      {
        file,
        titles: [...titles],
        failing: new Set(failing.map(({ title }) => title)),
      },
    ]
  })
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function renderCatalog() {
  const lines = [
    "Generated by `pnpm docs:perf` from `tests/perf/budgets.ts` and the tests that read each budget. Edit those, not this part.",
    "",
    "## Budgets",
    "",
  ]
  for (const entry of entries) {
    lines.push(...renderBudget(entry), "")
  }
  return lines.join("\n")
}

function renderBudget({ key, budget, anchor, readers }) {
  const lines = [`<a id="${anchor}"></a>`, "", `### ${key}`, ""]
  const field = (label, text) => lines.push(`**${label}:** ${text}`, "")
  field("Measures", sentence(budget.measures) || "_Missing._")
  field("Why", sentence(budget.why) || "_Missing._")
  if (budget.hypothesis) {
    field("Hypothesis", sentence(String(budget.hypothesis)))
  }
  const numbers = describeNumbers(budget)
  if (numbers.length) {
    lines.push("**Budget:**", "", ...numbers.map((line) => `- ${line}`), "")
  }
  const notes = notesOf(key)
  if (notes) {
    field("Notes", notes)
  }
  if (!readers.length) {
    field(
      "Tests",
      "_None. `pnpm docs:perf --check` fails until a test reads this budget._"
    )
    return lines
  }
  lines.push("**Tests:**", "")
  for (const { file, titles, failing } of readers) {
    for (const title of titles) {
      const known = failing.has(title) ? " (expected to fail, `test.fail`)" : ""
      lines.push(`- \`${path.basename(file.file)}\` › ${title}${known}`)
    }
  }
  lines.push("", "**Run:**", "", "```bash", ...readers.map(runCommand), "```")
  return lines
}

function sentence(text) {
  const trimmed = typeof text === "string" ? text.trim() : ""
  return trimmed && !/[.!?]$/.test(trimmed) ? `${trimmed}.` : trimmed
}

// What each budget field allows, in words. Fields this doesn't know are
// shown by name, so a new kind of budget still shows up.
function describeNumbers(budget) {
  const nouns = {
    inserts: [
      "item placed by binary search, about log₂ n comparisons",
      "items placed by binary search, about log₂ n comparisons each",
    ],
    notified: ["part notified", "parts notified"],
    restyledPerRecalc: [
      "element restyled per style recalculation",
      "elements restyled per style recalculation",
    ],
    sorts: [
      "sort of the items in document order",
      "sorts of the items in document order",
    ],
    subscriptions: ["new subscription", "new subscriptions"],
    writes: ["attribute or style write", "attribute and style writes"],
  }
  // Counts in a budget that checks periodically are per check.
  const per = budget.checkEvery ? " per check" : ""
  const groups = {
    counts: (name) => [`\`${name}\` call${per}`, `\`${name}\` calls${per}`],
    renders: (name) =>
      name === "perItem"
        ? ["render per item", "renders per item"]
        : [`\`${name}\` render`, `\`${name}\` renders`],
  }
  return Object.entries(budget)
    .filter(([name]) => !["measures", "why", "hypothesis"].includes(name))
    .flatMap(([name, value]) => {
      if (name === "checkEvery" && typeof value === "number") {
        return [
          `Positioning checks for unreported moves every ${number(value)} ms.`,
        ]
      }
      if (typeof value === "number" && nouns[name]) {
        return [`${atMost(value, nouns[name])}.`]
      }
      if (value && typeof value === "object" && groups[name]) {
        return Object.entries(value).map(
          ([part, most]) => `${atMost(most, groups[name](part))}.`
        )
      }
      if (value && typeof value === "object") {
        const fields = Object.entries(value).map(
          ([part, setting]) => `\`${part}\` ${plain(setting)}`
        )
        return [`\`${name}\`: ${fields.join(", ")}.`]
      }
      return [`\`${name}\`: ${plain(value)}.`]
    })
}

function atMost(value, [one, many]) {
  if (value === 0) {
    return `No ${many}`
  }
  return `At most ${number(value)} ${value === 1 ? one : many}`
}

function number(value) {
  return typeof value === "number"
    ? value.toLocaleString("en-US")
    : String(value)
}

function plain(value) {
  return typeof value === "object"
    ? `\`${JSON.stringify(value)}\``
    : number(value)
}

// The comments inside a budget's entry in budgets.ts, which say how its
// numbers were chosen.
function notesOf(key) {
  const match = new RegExp(`(["'])${escapeRegExp(key)}\\1\\s*:\\s*\\{`).exec(
    budgetSource
  )
  if (!match) {
    return ""
  }
  let depth = 0
  let quote = ""
  let index = match.index + match[0].length - 1
  for (; index < budgetSource.length; index++) {
    const char = budgetSource[index]
    if (quote) {
      if (char === "\\") {
        index++
      } else if (char === quote) {
        quote = ""
      }
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char
    } else if (char === "/" && budgetSource[index + 1] === "/") {
      index = budgetSource.indexOf("\n", index)
    } else if (char === "{") {
      depth++
    } else if (char === "}" && --depth === 0) {
      break
    }
  }
  return budgetSource
    .slice(match.index, index)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("//"))
    .map((line) => line.replace(/^\/\/\s?/, ""))
    .join(" ")
}

function runCommand({ file, titles }) {
  // Single quotes keep the shell out of the title. A quote in it matches any character.
  const grep = (flag) =>
    titles.length === 1
      ? ` ${flag} '${escapeRegExp(titles[0]).replace(/'/g, ".")}'`
      : ""
  if (file.relative.startsWith("tests/specs/")) {
    const spec = file.relative
      .replace(/^tests\//, "")
      .replace(/\.spec\.ts$/, "")
    return `cd tests && PLAYGROUND_PORT=${port} ../scripts/test-slot.sh npx playwright test ${spec} --project react${grep("-g")}`
  }
  const [, pkg, rest] = file.relative.match(/^(packages\/[^/]+)\/(.+)$/)
  return `cd ${pkg} && ../../scripts/test-slot.sh npx vitest run ${rest}${grep("-t")}`
}

async function formatMarkdown(markdown) {
  const options = (await resolveConfig(readmeFile)) ?? {}
  return format(markdown, { ...options, parser: "markdown" })
}
