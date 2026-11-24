// Runs the browser specs a branch's changes can affect.
//
//   pnpm test:pr             Runs the specs against origin/main.
//   pnpm test:pr --dry       Prints the plan and the commands without running them.
//   pnpm test:pr --engines   Adds WebKit and Firefox (web) for the touched specs.
//   pnpm test:pr --base <ref>
//   pnpm test:pr --workers 3 Passes a worker count to Playwright. Three quarters of the cores by default.
//   pnpm test:pr --dev       Serves the playground from Vite's dev server instead of a build.
//   pnpm test:pr --shards    Prints the plan and how many CI runners it needs, as `shards=<n>`.
//   pnpm test:pr --shard 2/3 Runs the second third of every command, like one of those runners.
//   pnpm test:sweep          Runs every spec on every project: Chromium and web on
//                            WebKit and Firefox. It replaces CI's main and nightly tiers.
//
// The plan has three steps:
// 1. The specs of every component the changes touch, on the Chromium projects
//    of every framework the changes reach (each adapter, plus its data, SSR,
//    portal and sheet runs). Core and the specs reach every framework; an
//    adapter or a framework's fixture reaches its own.
// 2. The leak tests of the touched components, on whichever of React, Vue and
//    web the changes reach, or the whole leak spec when shared code changed.
//    Each takes 10 to 30 seconds, so `pnpm test:sweep` runs them all.
// 3. The whole base project of each framework a change to shared code
//    reaches: a module that more than `sharedThreshold` components import, or a
//    file outside any component, like an adapter's `use-primitive` or the spec
//    fixtures. Shared code every framework runs is checked on `react`.
//
// A TypeScript file whose change is only comments or formatting is left out,
// since no spec can see it, like a JSDoc edit in core.
//
// A changed module touches its own component and every component that imports
// it, directly or through other modules, across core and the adapters.
//
// The playground is built once and served by `vite preview`, like CI: a page
// loads about 20 files instead of the dev server's hundreds of modules, which
// makes a test 1.5 to 4.5 times faster (Svelte the most).
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { createServer } from "node:net"
import path from "node:path"
import { parseArgs } from "node:util"
import ts from "typescript"

const root = path.resolve(import.meta.dirname, "..")
const specRoot = path.join(root, "tests/specs")
const fixtureRoot = path.join(root, "apps/playground/src/fixtures")

// More importers than this and a change runs the whole base project, since
// running each importer's specs on every project would cost more than that.
const sharedThreshold = 4

// What a test takes on a 2-worker CI runner, in seconds, from the affected
// runs' durations: the react project's 2,551 tests took 21 to 25 minutes.
// A leak test, at 10 to 30 seconds, counts as 16, and WebKit and Firefox
// take about twice as long as Chromium.
const testSeconds = 0.4
const leakWeight = 16
const engineWeight = 2
// CI splits the plan into runners of about this many minutes of tests, so a
// pull request's specs finish in about that long, well inside the config's
// 25-minute globalTimeout.
const shardMinutes = 6
const maxShards = 12

const frameworks = ["react", "vue", "web", "solid", "svelte"]
// `BROWSERS` drops an engine's projects from the Playwright config, so it does here too.
const engineProjects = ["webkit", "firefox"]
  .filter(
    (engine) =>
      !process.env.BROWSERS || process.env.BROWSERS.split(",").includes(engine)
  )
  .map((engine) => `web-${engine}`)

/** A framework's Chromium projects, as tests/playwright.config.ts names them. */
function chromiumProjects(framework) {
  const projects = [framework, `${framework}-data`, `${framework}-sheet`]
  if (framework !== "web") {
    projects.push(`${framework}-ssr`)
  }
  if (framework === "react") {
    projects.push("react-portal")
  }
  return projects
}

// Changes here can move any spec.
const sharedPaths = [
  "tests/fixtures.ts",
  "tests/fixture-files.ts",
  "tests/playwright.config.ts",
  "apps/playground/src/",
  "apps/playground/vite.config.ts",
  "apps/playground/ssr-plugin.ts",
  "apps/playground/solid-ssr.ts",
]

const { values: flags } = parseArgs({
  options: {
    base: { type: "string", default: "origin/main" },
    dry: { type: "boolean", default: false },
    engines: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
    workers: { type: "string" },
    shards: { type: "boolean", default: false },
    shard: { type: "string" },
  },
})

// Components are the spec prefixes: `menu` for menu.spec.ts and menu.a11y.spec.ts.
const specFiles = readdirSync(specRoot).filter((file) =>
  file.endsWith(".spec.ts")
)
const components = [
  ...new Set(specFiles.map((file) => file.split(".")[0])),
].sort((a, b) => b.length - a.length)

/** The component a file name belongs to: the longest prefix, so `menubar-context` is `menubar`, not `menu`. */
function componentOf(name) {
  return components.find(
    (component) => name === component || name.startsWith(`${component}-`)
  )
}

/**
 * The frameworks a changed file can reach: its adapter's, or its fixture's,
 * like `react-ssr.tsx` or `MenuFixture.vue`. Core, the specs and shared
 * fixture data reach all of them.
 */
function frameworksOf(file) {
  const parts = file.split("/")
  if (parts[0] === "packages" && frameworks.includes(parts[1])) {
    return [parts[1]]
  }
  if (file.startsWith("apps/playground/src/fixtures/")) {
    const name = parts[5] ?? ""
    const own = frameworks.find(
      (framework) => name === framework || name.startsWith(`${framework}-`)
    )
    if (own) {
      return [own]
    }
    if (name.endsWith(".vue")) {
      return ["vue"]
    }
    if (name.endsWith(".svelte")) {
      return ["svelte"]
    }
  }
  if (file === "apps/playground/solid-ssr.ts") {
    return ["solid"]
  }
  return frameworks
}

function changedFiles() {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
  const base = git("merge-base", flags.base, "HEAD")[0]
  const files = [
    ...git("diff", "--name-only", base),
    ...git("ls-files", "--others", "--exclude-standard"),
  ]
  const skipped = [...new Set(files)].filter((file) => commentsOnly(file, base))
  if (skipped.length > 0) {
    console.log(`Comments only, so left out:\n  ${skipped.join("\n  ")}`)
  }
  return [...new Set(files)].filter((file) => !skipped.includes(file))
}

const printer = ts.createPrinter({ removeComments: true })

/** Whether a TypeScript file reads the same as at `base` once its comments and formatting are gone. */
function commentsOnly(file, base) {
  if (
    !/\.(ts|tsx|mts|js|mjs)$/.test(file) ||
    !existsSync(path.join(root, file))
  ) {
    return false
  }
  const print = (text) =>
    printer.printFile(
      ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        false,
        file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      )
    )
  try {
    const before = execFileSync("git", ["show", `${base}:${file}`], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    })
    return print(before) === print(readFileSync(path.join(root, file), "utf8"))
  } catch {
    return false
  }
}

// The import graph of every package's source, reversed: file → files importing it.
function packageImporters() {
  const sourcePattern = /\.(ts|tsx|vue|svelte)$/
  const files = readdirSync(path.join(root, "packages"), { recursive: true })
    .map((file) => path.join("packages", file))
    .filter(
      (file) =>
        file.split(path.sep)[2] === "src" &&
        sourcePattern.test(file) &&
        !file.includes("node_modules")
    )
  const coreExports = JSON.parse(
    readFileSync(path.join(root, "packages/core/package.json"), "utf8")
  ).exports
  const importers = new Map()
  for (const file of files) {
    // Type-only imports are gone at runtime, so they reach no spec. Web's
    // `events.ts` imports every component's types.
    const text = readFileSync(path.join(root, file), "utf8").replace(
      /^\s*(?:import|export) type [^;]*?from\s*"[^"]+"/gm,
      ""
    )
    for (const [, specifier] of text.matchAll(
      /(?:from|import)\s*\(?\s*"([^"]+)"/g
    )) {
      const target = resolve(file, specifier, coreExports)
      if (!target) {
        continue
      }
      if (!importers.has(target)) {
        importers.set(target, new Set())
      }
      importers.get(target).add(file)
    }
  }
  return importers
}

function resolve(file, specifier, coreExports) {
  let base
  if (specifier.startsWith(".")) {
    base = path.join(path.dirname(file), specifier)
  } else if (specifier.startsWith("@ui-sdk/core")) {
    const key = `.${specifier.slice("@ui-sdk/core".length)}`
    const target =
      coreExports[key] ??
      (key.startsWith("./internal/") &&
        `./src/${key.slice("./internal/".length)}.ts`)
    return target && path.join("packages/core", target)
  } else {
    return
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    base.replace(/\.js$/, ".ts"),
    path.join(base, "index.ts"),
  ]
  return candidates.find(
    (candidate) =>
      existsSync(path.join(root, candidate)) &&
      statSync(path.join(root, candidate)).isFile()
  )
}

/** Components a package file belongs to: by its name, or by its folder for Svelte's per-component folders. */
function packageComponents(file) {
  const name = path
    .basename(file)
    .replace(/\.(svelte\.ts|ts|tsx|vue|svelte)$/, "")
  const folder = path.basename(path.dirname(file))
  return [componentOf(name), componentOf(folder)].filter(Boolean)
}

/** Every component that imports `file`, directly or through other modules. */
function importingComponents(file, importers) {
  const seen = new Set([file])
  const queue = [file]
  while (queue.length > 0) {
    for (const importer of importers.get(queue.pop()) ?? []) {
      if (seen.has(importer)) {
        continue
      }
      seen.add(importer)
      queue.push(importer)
    }
  }
  return new Set([...seen].flatMap(packageComponents))
}

/**
 * Spec prefixes by the components their fixtures render, like `forms` and
 * `field` by Checkbox: a component's change runs them too.
 */
function sharedSpecsByComponent() {
  const byComponent = new Map()
  const folders = readdirSync(fixtureRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  for (const folder of folders) {
    const users = fixtureComponents(folder).filter((user) => user !== "leaks")
    if (users.length === 0) {
      continue
    }
    const files = readdirSync(path.join(fixtureRoot, folder), {
      recursive: true,
    }).filter((file) => /\.(ts|tsx|vue|svelte)$/.test(file))
    for (const file of files) {
      const text = readFileSync(path.join(fixtureRoot, folder, file), "utf8")
      for (const [, entry] of text.matchAll(/"@ui-sdk\/\w+\/([\w-]+)"/g)) {
        const component = componentOf(entry)
        if (!component) {
          continue
        }
        if (!byComponent.has(component)) {
          byComponent.set(component, new Set())
        }
        users.forEach((user) => byComponent.get(component).add(user))
      }
    }
  }
  return byComponent
}

/**
 * Components whose specs open a fixture folder, like `menu-cases` for
 * menu.cases.spec.ts, or list it, like presentation.spec.ts's `fixture: "menu"`.
 */
function fixtureComponents(folder) {
  const opens = new RegExp(
    `open\\(\\s*"${folder}"|fixture=${folder}\\b|fixture: "${folder}"`
  )
  const owners = specFiles.filter((file) =>
    opens.test(readFileSync(path.join(specRoot, file), "utf8"))
  )
  return owners.length > 0
    ? owners.map((file) => file.split(".")[0])
    : [componentOf(folder)].filter(Boolean)
}

const isComponent = (name) =>
  existsSync(path.join(root, "packages/core/src/components", name))

const isSpec = (file) => file.endsWith(".spec.ts")

/**
 * The spec files that import a test helper, like `forms.helpers.ts` or
 * `perf/budgets.ts`, directly or through another, like `perf/leaks.ts`.
 */
function importingSpecs(file) {
  const testFiles = ["tests/specs", "tests/perf"].flatMap((folder) =>
    readdirSync(path.join(root, folder))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => path.join(folder, name))
  )
  const importsOf = new Map(
    testFiles.map((from) => [
      from,
      [
        ...readFileSync(path.join(root, from), "utf8").matchAll(
          /from\s*"(\.[^"]+)"/g
        ),
      ].map(([, specifier]) =>
        path.join(path.dirname(from), specifier).replace(/\.ts$/, "")
      ),
    ])
  )
  const seen = new Set([file])
  const queue = [file]
  while (queue.length > 0) {
    const target = queue.pop().replace(/\.ts$/, "")
    for (const [from, imports] of importsOf) {
      if (!seen.has(from) && imports.includes(target)) {
        seen.add(from)
        queue.push(from)
      }
    }
  }
  return [...seen].filter(isSpec).map((spec) => path.basename(spec))
}

/** Each touched component with the frameworks it runs on, each framework shared code reaches, and the changed spec files. */
function plan(files) {
  const touched = new Map()
  const shared = new Map()
  const specs = files
    .filter(
      (file) =>
        file.startsWith("tests/specs/") &&
        isSpec(file) &&
        existsSync(path.join(root, file))
    )
    .map((file) => path.basename(file))
  const touch = (component, reach) => {
    if (!touched.has(component)) {
      touched.set(component, new Set())
    }
    for (const framework of reach) {
      touched.get(component).add(framework)
    }
  }
  const share = (file, reach) => shared.set(file, reach)
  let importers
  let sharedSpecs
  for (const file of files) {
    const parts = file.split("/")
    const reach = frameworksOf(file)
    if (/^tests\/(specs|perf)\/.*\.ts$/.test(file) && !isSpec(file)) {
      // A helper or a perf budget runs with every spec that imports it.
      for (const spec of importingSpecs(file)) {
        touch(componentOf(spec.split(".")[0]), reach)
      }
    } else if (file.startsWith("tests/specs/")) {
      const component = componentOf(parts[2].split(".")[0])
      if (component) {
        touch(component, reach)
      } else {
        share(file, reach)
      }
    } else if (
      file === "pnpm-lock.yaml" ||
      /^packages\/[\w-]+\/package\.json$/.test(file)
    ) {
      // A dependency change can move any spec of the frameworks it reaches.
      share(file, reach)
    } else if (file.startsWith("apps/playground/src/fixtures/")) {
      for (const component of fixtureComponents(parts[4])) {
        touch(component, reach)
      }
    } else if (file.startsWith("tests/fixtures/")) {
      // The shared fixture data every framework's fixture for a component imports.
      const component = componentOf(path.basename(file).replace(/\.\w+$/, ""))
      if (component) {
        touch(component, reach)
      } else {
        share(file, reach)
      }
    } else if (sharedPaths.some((prefix) => file.startsWith(prefix))) {
      share(file, reach)
    } else if (
      parts[0] === "packages" &&
      parts[2] === "src" &&
      /\.(ts|tsx|vue|svelte)$/.test(file)
    ) {
      importers ??= packageImporters()
      const own = packageComponents(file)
      const reached = importingComponents(file, importers)
      if (own.length > 0 && reached.size <= sharedThreshold) {
        sharedSpecs ??= sharedSpecsByComponent()
        for (const component of reached) {
          touch(component, reach)
          for (const spec of sharedSpecs.get(component) ?? []) {
            // Another component's specs, like Field's for Checkbox, run on
            // `react` like shared code, since every framework's would cost more.
            touch(
              spec,
              isComponent(spec)
                ? sharedFrameworks(new Map([[file, reach]]))
                : reach
            )
          }
        }
      } else {
        share(file, reach)
        for (const component of own) {
          touch(component, reach)
        }
      }
    }
  }
  return { touched, shared, specs }
}

/** The frameworks shared code runs whole: `react` for code every framework runs, else the adapters it's in. */
function sharedFrameworks(shared) {
  const reach = new Set([...shared.values()].flat())
  if (frameworks.every((framework) => reach.has(framework))) {
    return ["react"]
  }
  return frameworks.filter((framework) => reach.has(framework))
}

function commands({ touched, shared, specs }) {
  const projectArgs = (projects) =>
    projects.flatMap((project) => ["--project", project])
  const runs = []
  // Base projects that run whole, which the touched specs needn't repeat.
  const whole = shared.size > 0 ? sharedFrameworks(shared) : []
  // One run per set of frameworks, so components touched on the same ones share a run.
  const groups = new Map()
  for (const [component, reach] of touched) {
    const key = frameworks.filter((framework) => reach.has(framework)).join(",")
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(component)
  }
  for (const [key, group] of groups) {
    const reach = key.split(",")
    const projects = reach
      .flatMap(chromiumProjects)
      .filter((project) => !whole.includes(project))
    if (flags.engines && reach.includes("web")) {
      projects.push(...engineProjects)
    }
    // A spec can run on none of them, like web-lifecycle's while the web project runs whole.
    if (projects.length > 0) {
      runs.push([
        `specs/(${group.sort().join("|")})\\.`,
        ...projectArgs(projects),
        "--pass-with-no-tests",
      ])
    }
  }
  // A changed spec file runs on WebKit and Firefox too, so one written against
  // Chromium fails on its pull request, not in the nightly run. With the flag,
  // its component runs on both above.
  if (!flags.engines && specs.length > 0 && engineProjects.length > 0) {
    runs.push([
      ...specs.map((spec) => `specs/${spec.replaceAll(".", "\\.")}`),
      ...projectArgs(engineProjects),
      "--pass-with-no-tests",
    ])
  }
  const reached = new Set(
    [...touched.values(), ...shared.values()].flatMap((reach) => [...reach])
  )
  const leaks = frameworks.filter(
    (framework) => reached.has(framework) && !whole.includes(framework)
  )
  // Leak tests are named by component in words: "a scroll area" for scroll-area.
  const named = [...touched.keys()].map((component) =>
    component.replaceAll("-", " ")
  )
  const grep =
    shared.size > 0
      ? []
      : ["--grep", `\\b(${named.join("|")})\\b`, "--pass-with-no-tests"]
  if (
    leaks.length > 0 &&
    !touched.has("leaks") &&
    (shared.size > 0 || named.length > 0)
  ) {
    runs.push(["specs/leaks.spec.ts", ...projectArgs(leaks), ...grep])
  }
  if (whole.length > 0) {
    runs.push(projectArgs(whole))
  }
  return runs
}

/** The CI runners `runs` need: their listed tests' estimated minutes over `shardMinutes`. */
function shardCount(runs) {
  let seconds = 0
  for (const args of runs) {
    // Every Chromium project lists about 3 MB, past the default 1 MB buffer.
    const list = spawnSync("npx", ["playwright", "test", "--list", ...args], {
      cwd: path.join(root, "tests"),
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
      maxBuffer: 64 * 1024 * 1024,
    })
    if (list.status !== 0) {
      console.error(list.error ?? "", list.stdout, list.stderr)
      process.exit(1)
    }
    for (const [, project, file] of list.stdout.matchAll(
      /^\s+\[(.+?)\] › (\S+?):\d+:\d+ › /gm
    )) {
      const weight =
        (file === "leaks.spec.ts" ? leakWeight : 1) *
        (/-(webkit|firefox)$/.test(project) ? engineWeight : 1)
      seconds += testSeconds * weight
    }
  }
  const minutes = seconds / 60
  console.log(
    `Estimated time on one runner: ${Math.max(1, Math.round(minutes))} min.`
  )
  return Math.min(maxShards, Math.ceil(minutes / shardMinutes))
}

// A port of its own, so the gate never reuses another session's playground.
function freePort() {
  return new Promise((done) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address()
      server.close(() => done(String(port)))
    })
  })
}

/** Builds the playground and serves it with `vite preview` on `port`, resolving once it answers. */
async function servePlayground(port) {
  const env = { ...process.env, PLAYGROUND_PORT: port }
  const build = spawnSync("pnpm", ["--filter", "playground", "build"], {
    cwd: root,
    stdio: "inherit",
    env,
  })
  if (build.status !== 0) {
    process.exit(1)
  }
  // Its own process group, so stopping it stops the Vite process pnpm starts too.
  const server = spawn("pnpm", ["--filter", "playground", "preview"], {
    cwd: root,
    stdio: "ignore",
    env,
    detached: true,
  })
  const stop = () => process.kill(-server.pid)
  for (let i = 0; i < 100; i++) {
    const up = await fetch(`http://localhost:${port}/`).then(
      (response) => response.ok,
      () => false
    )
    if (up) {
      return { stop }
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  stop()
  console.error(`The playground preview never answered on port ${port}.`)
  process.exit(1)
}

let runs = [[]]
if (!flags.all) {
  const changes = plan(changedFiles())
  runs = commands(changes)
  const touched = [...changes.touched].map(
    ([component, reach]) =>
      `${component}${reach.size < frameworks.length ? ` (${[...reach].join(", ")})` : ""}`
  )
  console.log(`Touched components: ${touched.sort().join(", ") || "none"}`)
  if (changes.shared.size > 0) {
    console.log(
      `Shared code changed, so the whole ${sharedFrameworks(changes.shared).join(", ")} project runs:\n  ${[...changes.shared.keys()].join("\n  ")}`
    )
  }
}
for (const args of runs) {
  console.log(
    `  npx playwright test ${args.map((arg) => (/[*|()\\]/.test(arg) ? `'${arg}'` : arg)).join(" ")}`
  )
}
if (flags.shards) {
  console.log(`shards=${runs.length > 0 ? shardCount(runs) : 0}`)
  // Whether the runners need WebKit and Firefox installed.
  const engines = runs.some((args) =>
    engineProjects.some((project) => args.includes(project))
  )
  console.log(`engines=${engines}`)
}
if (flags.dry || flags.shards || runs.length === 0) {
  process.exit(0)
}

const port = process.env.PLAYGROUND_PORT ?? (await freePort())
const server = flags.dev ? undefined : await servePlayground(port)
let failed = false
for (const args of runs) {
  // Three quarters of the cores: on 4, going from 2 workers to 3 took the same
  // 260 specs from 124 to 93 seconds. CI keeps the config's 2.
  const count = flags.workers ?? (process.env.CI ? undefined : "75%")
  const workers = count ? ["--workers", count] : []
  const shard = flags.shard ? ["--shard", flags.shard] : []
  const { status } = spawnSync(
    "npx",
    ["playwright", "test", ...args, ...workers, ...shard],
    {
      cwd: path.join(root, "tests"),
      stdio: "inherit",
      env: {
        ...process.env,
        PLAYGROUND_PORT: port,
        ...(server && { PLAYGROUND_SERVED: "1" }),
      },
    }
  )
  if (status !== 0) {
    failed = true
  }
}
server?.stop()
process.exit(failed ? 1 : 0)
