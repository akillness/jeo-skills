// An exemption for a kind the component now has fails too, so the file only
// shrinks as coverage is added.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const at = (...parts) => path.join(root, ...parts)

const specs = new Set(readdirSync(at("tests/specs")))
const docsSpecs = new Set(readdirSync(at("tests/docs")))
const unitTests = readdirSync(at("packages/core/test"))
const leakFixture = readFileSync(
  at("apps/playground/src/fixtures/leaks/react.tsx"),
  "utf8"
)
const docsFrameworks = ["react", "vue", "svelte", "solid", "web-components"]
const fixtureFrameworks = ["react", "vue", "web", "solid", "svelte"]

const hasSpec = (name, kind) =>
  specs.has(kind ? `${name}.${kind}.spec.ts` : `${name}.spec.ts`)

const kinds = {
  spec: (name) => hasSpec(name),
  a11y: (name) => hasSpec(name, "a11y"),
  rtl: (name) => hasSpec(name, "rtl"),
  ssr: (name) => hasSpec(name, "ssr"),
  fixtures: (name) => {
    const folder = at("apps/playground/src/fixtures", name)
    if (!existsSync(folder)) {
      return false
    }
    const files = readdirSync(folder).map((file) => file.replace(/\.\w+$/, ""))
    return fixtureFrameworks.every((framework) => files.includes(framework))
  },
  leak: (name) =>
    new RegExp(`^\\s+"?${name}"?: \\(\\) =>`, "m").test(leakFixture),
  unit: (name) =>
    unitTests.some((file) =>
      new RegExp(`^${name}(-.+)?\\.test\\.ts$`).test(file)
    ),
  docs: (name) =>
    docsFrameworks.every((framework) =>
      existsSync(
        at("apps/docs/content/docs", framework, "components", `${name}.mdx`)
      )
    ),
  "docs-spec": (name) => docsSpecs.has(`${name}.spec.ts`),
}

const components = readdirSync(at("packages/core/src/components"))
const exemptions = JSON.parse(
  readFileSync(at("tests/coverage-exemptions.json"), "utf8")
)

if (process.argv.includes("--list")) {
  for (const name of components) {
    const missing = Object.keys(kinds).filter((kind) => !kinds[kind](name))
    if (missing.length) {
      console.log(`${name}: ${missing.join(", ")}`)
    }
  }
  process.exit(0)
}

const problems = []
for (const name of components) {
  const exempt = exemptions[name] ?? {}
  for (const [kind, has] of Object.entries(kinds)) {
    if (!has(name) && !exempt[kind]) {
      problems.push(
        `${name} has no ${kind}. Add it, or a reason to tests/coverage-exemptions.json.`
      )
    }
    if (has(name) && exempt[kind]) {
      problems.push(
        `${name} has ${kind} now. Remove its exemption from tests/coverage-exemptions.json.`
      )
    }
  }
}
for (const [name, exempt] of Object.entries(exemptions)) {
  if (!components.includes(name)) {
    problems.push(
      `tests/coverage-exemptions.json lists ${name}, which isn't a component.`
    )
  }
  for (const kind of Object.keys(exempt)) {
    if (!(kind in kinds)) {
      problems.push(
        `tests/coverage-exemptions.json lists ${kind} for ${name}, which isn't a kind: ${Object.keys(kinds).join(", ")}.`
      )
    }
  }
}

for (const problem of problems) {
  console.log(problem)
}
process.exit(problems.length ? 1 : 0)
