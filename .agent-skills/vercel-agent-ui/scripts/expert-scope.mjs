// Prints which framework experts a change needs and the files each should read,
// for the ui-sdk-expert-review skill.
//
//   node scripts/expert-scope.mjs              Each expert from its own "Last reviewed" commit.
//   node scripts/expert-scope.mjs --base main  Everyone from one base, like a branch before merging.
//   node scripts/expert-scope.mjs --json       The same plan as JSON, for the skill.
//
// A framework's own package, docs, examples and fixtures reach its expert.
// Core, the specs and the playground reach every expert, since every adapter
// renders them.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

const root = path.resolve(import.meta.dirname, "..")
const frameworks = ["react", "vue", "svelte", "solid", "web"]

const { values: flags } = parseArgs({
  options: {
    base: { type: "string" },
    json: { type: "boolean", default: false },
  },
})

// The docs folder for web components isn't named after the package.
const docsName = (framework) =>
  framework === "web" ? "web-components" : framework

function owns(framework, file) {
  return (
    file.startsWith(`packages/${framework}/`) ||
    file.startsWith(`apps/docs/content/docs/${docsName(framework)}/`) ||
    new RegExp(`^examples/(components/)?[^/]+/${framework}/`).test(file) ||
    new RegExp(`^apps/playground/src/fixtures/[^/]+/${framework}[.-]`).test(
      file
    ) ||
    (framework === "vue" &&
      /^apps\/playground\/src\/fixtures\/.+\.vue$/.test(file)) ||
    (framework === "svelte" &&
      /^apps\/playground\/src\/fixtures\/.+\.svelte$/.test(file))
  )
}

const shared = (file) =>
  file.startsWith("packages/core/") ||
  file.startsWith("tests/specs/") ||
  file === "tests/fixtures.ts"

function lastReviewed(framework) {
  const file = path.join(root, ".agents/experts", framework, "decisions.md")
  if (!existsSync(file)) {
    return undefined
  }
  return readFileSync(file, "utf8").match(
    /^Last reviewed: `([0-9a-f]{7,40})`/m
  )?.[1]
}

function changed(base) {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return out.split("\n").filter(Boolean)
  } catch {
    // Like a shallow clone that doesn't have the commit.
    console.error(
      `Can't diff ${base}...HEAD. Fetch the history it needs, or pass another --base.`
    )
    process.exit(1)
  }
}

const plan = []
for (const framework of frameworks) {
  const base = flags.base ?? lastReviewed(framework)
  if (!base) {
    plan.push({
      framework,
      base: null,
      own: [],
      shared: [],
      note: "no Last reviewed commit; pass --base",
    })
    continue
  }
  const files = changed(base)
  const own = files.filter((file) => owns(framework, file))
  const core = files.filter(shared)
  if (own.length || core.length) {
    plan.push({ framework, base, own, shared: core })
  }
}

if (flags.json) {
  console.log(JSON.stringify(plan, null, 2))
} else if (!plan.length) {
  console.log("No expert needed: nothing a framework sees changed.")
} else {
  for (const entry of plan) {
    if (entry.note) {
      console.log(`${entry.framework}: ${entry.note}`)
      continue
    }
    console.log(`${entry.framework}-expert, ${entry.base.slice(0, 8)}...HEAD`)
    console.log(
      `  own (${entry.own.length}): ${entry.own.slice(0, 8).join(", ")}${entry.own.length > 8 ? ", ..." : ""}`
    )
    console.log(
      `  shared (${entry.shared.length}): ${entry.shared.slice(0, 5).join(", ")}${entry.shared.length > 5 ? ", ..." : ""}`
    )
  }
}
