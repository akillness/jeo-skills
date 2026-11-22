import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const NAME = "scenario-demo";
const SUITE = `tests/${NAME}/`;
const REQUIREMENTS = `${SUITE}requirements.txt`;
// Every tool the runner calls: a PATH holding only these hides the real uv.
const TOOLS = [
  "basename",
  "cat",
  "dirname",
  "find",
  "getconf",
  "git",
  "grep",
  "mkdir",
  "mktemp",
  "node",
  "python3",
  "rm",
  "xargs",
];

// Under a git hook, GIT_DIR and friends would point every call at this repo.
// COVERAGE comes from the caller's `pnpm test`; each test sets its own.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith("GIT_") &&
      key !== "COVERAGE" &&
      key !== "SKILLS_TEST_USE_SYSTEM_PYTHON",
  ),
);
const which = (tool) =>
  execFileSync("sh", ["-c", `command -v ${tool}`], {
    env,
    encoding: "utf8",
  }).trim();

const executable = (file, body) => {
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
};

// A repository with one skill and one passing Python suite, run on a PATH of
// the runner's tools. A numeric `uv` or `pnpm` adds a stub that records each
// call's arguments and exits with that code. The uv stub also leaves coverage
// data behind a unittest call when `coverageData` is set, as coverage.py
// would. `files` adds files to the repository before the run, and `track`
// stages them, since the runner finds shipped scripts with git ls-files.
function run(
  t,
  {
    requirements,
    uv,
    pnpm,
    python,
    coverage,
    coverageData,
    systemPython,
    track,
    pythonFound,
    pythonInstall = 0,
    jobs,
    files = {},
  },
) {
  const root = mkdtempSync(join(tmpdir(), "skills-script-tests-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["test-skill-scripts.sh", "lib/skills.mjs"]) {
    mkdirSync(dirname(join(root, "scripts", file)), { recursive: true });
    copyFileSync(join(scripts, file), join(root, "scripts", file));
  }
  mkdirSync(join(root, "skills", NAME), { recursive: true });
  writeFileSync(join(root, "skills", NAME, "SKILL.md"), "");
  mkdirSync(join(root, SUITE), { recursive: true });
  writeFileSync(
    join(root, SUITE, "test_demo.py"),
    "import unittest\n\n\nclass Demo(unittest.TestCase):\n    def test_demo(self):\n        pass\n",
  );
  if (requirements) writeFileSync(join(root, REQUIREMENTS), requirements);
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: root, env });
  if (track) execFileSync("git", ["add", "-A"], { cwd: root, env });
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const tool of TOOLS) {
    executable(join(bin, tool), `exec "${which(tool)}" "$@"`);
  }
  const stub = (tool, code, extra = "") => {
    if (code === undefined) return;
    const log = join(root, `${tool}.log`);
    executable(
      join(bin, tool),
      `${extra}printf '%s\\n' "$@" --- >> "${log}"\nexit ${code}`,
    );
  };
  // `uv python find` and `uv python install` log to uv-find.log and
  // uv-install.log, so uv.log holds only the runs. Find prints bin/python3,
  // unless `pythonFound` is false and no install has succeeded yet; install
  // exits with `pythonInstall`.
  const installed = join(root, "uv-installed");
  const found = pythonFound === false ? `[ -e "${installed}" ]` : "true";
  const find = [
    `if [ "$1 $2" = "python find" ]; then printf '%s\\n' "$@" --- >> "${join(root, "uv-find.log")}"; ${found} || exit 2; echo "${join(bin, "python3")}"; exit 0; fi`,
    `if [ "$1 $2" = "python install" ]; then printf '%s\\n' "$@" --- >> "${join(root, "uv-install.log")}"; [ ${pythonInstall} -ne 0 ] || : > "${installed}"; exit ${pythonInstall}; fi`,
    "",
  ].join("\n");
  stub(
    "uv",
    uv,
    find +
      (coverageData
        ? `case "$*" in *unittest*) "${which("mkdir")}" -p coverage && : > coverage/.coverage.stub ;; esac\n`
        : ""),
  );
  stub("pnpm", pnpm);
  stub(
    "python3",
    python,
    coverageData
      ? `case "$*" in *unittest*) "${which("mkdir")}" -p coverage && : > coverage/.coverage.stub ;; esac\n`
      : "",
  );
  const result = spawnSync(which("bash"), ["scripts/test-skill-scripts.sh"], {
    cwd: root,
    env: {
      ...env,
      PATH: bin,
      ...(coverage ? { COVERAGE: "1" } : {}),
      ...(systemPython ? { SKILLS_TEST_USE_SYSTEM_PYTHON: "1" } : {}),
      ...(jobs ? { SKILLS_TEST_JOBS: String(jobs) } : {}),
    },
    encoding: "utf8",
  });
  const calls = (tool) => {
    const log = join(root, `${tool}.log`);
    if (!existsSync(log)) return [];
    return readFileSync(log, "utf8")
      .split("---\n")
      .slice(0, -1)
      .map((call) => call.trimEnd().split("\n"));
  };
  const uvCalls = calls("uv");
  return {
    root,
    bin,
    result,
    uvArgs: uvCalls[0] ?? null,
    uvCalls,
    findCalls: calls("uv-find"),
    installCalls: calls("uv-install"),
    pnpmCalls: calls("pnpm"),
    pythonCalls: calls("python3"),
    output: result.stdout + result.stderr,
  };
}

test("a suite with a requirements.txt runs under uv on the Python uv finds", (t) => {
  const { bin, result, uvArgs, output } = run(t, {
    requirements: "numpy\n",
    uv: 0,
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(uvArgs, [
    "run",
    "--quiet",
    "--no-project",
    "--python",
    join(bin, "python3"),
    "--with-requirements",
    REQUIREMENTS,
    "python",
    "-B",
    "-m",
    "unittest",
    "discover",
    "-s",
    SUITE,
    "-p",
    "test_demo.py",
  ]);
});

test("uv looks for Python 3.12 outside any virtual environment", (t) => {
  const { result, findCalls, installCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 0,
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(findCalls, [["python", "find", "--system", "3.12"]]);
  assert.deepEqual(installCalls, []);
});

// A bare version would let uv reuse an active 3.12 virtual environment.
test("with no Python 3.12 found, uv installs it and runs on its path", (t) => {
  const { bin, result, uvArgs, findCalls, installCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 0,
    pythonFound: false,
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(installCalls, [["python", "install", "--quiet", "3.12"]]);
  assert.equal(findCalls.length, 2);
  assert.deepEqual(uvArgs.slice(0, 5), [
    "run",
    "--quiet",
    "--no-project",
    "--python",
    join(bin, "python3"),
  ]);
});

test("when uv cannot install Python 3.12, the suite fails without running", (t) => {
  const { result, uvCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 0,
    pythonFound: false,
    pythonInstall: 1,
  });
  assert.equal(result.status, 1, output);
  assert.deepEqual(uvCalls, []);
  assert.match(output, /uv could not provide Python 3\.12/);
});

test("a failing uv run fails the runner", (t) => {
  const { result } = run(t, { requirements: "numpy\n", uv: 1 });
  assert.equal(result.status, 1);
});

test("a suite without a requirements.txt runs on python3, not uv", (t) => {
  const { result, uvArgs, output } = run(t, { uv: 0 });
  assert.equal(result.status, 0, output);
  assert.equal(uvArgs, null);
  assert.match(output, /Ran 1 test/);
});

test("without uv, a suite with a requirements.txt runs on python3", (t) => {
  const { result, output } = run(t, { requirements: "numpy\n" });
  assert.equal(result.status, 0, output);
  assert.match(output, /Ran 1 test/);
});

test("CI uses the installed Python environment even when uv is available", (t) => {
  const { result, uvCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 1,
    systemPython: true,
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(uvCalls, []);
  assert.match(output, /Ran 1 test/);
});

test("CI uses the installed coverage package for suites and reports", (t) => {
  const { result, uvCalls, pythonCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 1,
    python: 0,
    systemPython: true,
    coverage: true,
    coverageData: true,
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(uvCalls, []);
  assert.equal(pythonCalls.length, 5);
  assert.deepEqual(pythonCalls[0], ["-B", ...COVERAGE_RUN, ...UNITTEST]);
  assert.ok(pythonCalls.slice(1).every((call) => call[1] === "coverage"));
});

// The uv arguments up to the interpreter, then the interpreter's own.
const UV_RUN = (bin) => [
  "run",
  "--quiet",
  "--no-project",
  "--python",
  join(bin, "python3"),
];
const COVERAGE_RUN = ["-m", "coverage", "run", "--rcfile=.coveragerc"];
const UNITTEST = [
  "-m",
  "unittest",
  "discover",
  "-s",
  SUITE,
  "-p",
  "test_demo.py",
];

test("COVERAGE=1 runs a suite under coverage with its requirements", (t) => {
  const { bin, result, uvCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 0,
    coverage: true,
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(uvCalls, [
    [
      ...UV_RUN(bin),
      "--with-requirements",
      REQUIREMENTS,
      "--with",
      "coverage>=7.10",
      "python",
      "-B",
      ...COVERAGE_RUN,
      ...UNITTEST,
    ],
  ]);
});

test("COVERAGE=1 runs a suite without a requirements.txt under uv too", (t) => {
  const { bin, result, uvCalls, output } = run(t, { uv: 0, coverage: true });
  assert.equal(result.status, 0, output);
  assert.deepEqual(uvCalls, [
    [
      ...UV_RUN(bin),
      "--with",
      "coverage>=7.10",
      "python",
      "-B",
      ...COVERAGE_RUN,
      ...UNITTEST,
    ],
  ]);
});

test("COVERAGE=1 combines the Python data and writes the report", (t) => {
  const { root, result, uvCalls, output } = run(t, {
    uv: 0,
    coverage: true,
    coverageData: true,
  });
  assert.equal(result.status, 0, output);
  const reports = uvCalls
    .slice(1)
    .map((call) => call.slice(call.indexOf("python") + 1));
  assert.deepEqual(reports, [
    ["-m", "coverage", "combine", "--rcfile=.coveragerc", "-q"],
    ["-m", "coverage", "report", "--rcfile=.coveragerc"],
    ["-m", "coverage", "report", "--rcfile=.coveragerc", "--format=markdown"],
    [
      "-m",
      "coverage",
      "xml",
      "--rcfile=.coveragerc",
      "-q",
      "-o",
      "coverage/python.xml",
    ],
  ]);
  assert.ok(existsSync(join(root, "coverage/report.md")));
});

test("COVERAGE=1 never combines data left by an earlier run", (t) => {
  const { result, uvCalls, output } = run(t, {
    uv: 0,
    coverage: true,
    files: { "coverage/.coverage.stale": "" },
  });
  assert.equal(result.status, 0, output);
  assert.equal(uvCalls.length, 1);
});

test("a failing coverage report fails the runner", (t) => {
  const { result } = run(t, { uv: 1, coverage: true, coverageData: true });
  assert.equal(result.status, 1);
});

// The one vitest call COVERAGE=1 makes for the given suites and skills.
const VITEST_COVERAGE = (suites, skills) => [
  "exec",
  "vitest",
  "run",
  ...suites,
  "--coverage",
  ...skills.map(
    (skill) => `--coverage.include=skills/${skill}/**/*.{js,mjs,cjs,ts}`,
  ),
  "--coverage.reporter=text",
  "--coverage.reporter=cobertura",
  "--coverage.reportsDirectory=coverage/vitest",
];

test("COVERAGE=1 measures a core skill's TypeScript with vitest", (t) => {
  const { result, pnpmCalls, output } = run(t, {
    uv: 0,
    pnpm: 0,
    coverage: true,
    files: { [`${SUITE}demo.test.ts`]: "" },
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(pnpmCalls, [VITEST_COVERAGE([SUITE], [NAME])]);
});

test("COVERAGE=1 runs every core TypeScript suite in one vitest call", (t) => {
  const OTHER = "scenario-other";
  const { result, pnpmCalls, output } = run(t, {
    uv: 0,
    pnpm: 0,
    coverage: true,
    files: {
      [`${SUITE}demo.test.ts`]: "",
      [`skills/${OTHER}/SKILL.md`]: "",
      [`tests/${OTHER}/other.test.ts`]: "",
    },
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(pnpmCalls, [
    VITEST_COVERAGE([SUITE, `tests/${OTHER}/`], [NAME, OTHER]),
  ]);
});

test("COVERAGE=1 also measures a core skill shipping JavaScript without a suite", (t) => {
  const JS = "scenario-js";
  const { result, pnpmCalls, output } = run(t, {
    uv: 0,
    pnpm: 0,
    coverage: true,
    track: true,
    files: {
      [`${SUITE}demo.test.ts`]: "",
      [`skills/${JS}/SKILL.md`]: "",
      [`skills/${JS}/assets/app.js`]: "",
    },
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(pnpmCalls, [VITEST_COVERAGE([SUITE], [NAME, JS])]);
});

test("a failing vitest coverage run fails the runner", (t) => {
  const { result } = run(t, {
    uv: 0,
    pnpm: 1,
    coverage: true,
    files: { [`${SUITE}demo.test.ts`]: "" },
  });
  assert.equal(result.status, 1);
});

test("without COVERAGE, vitest runs without coverage", (t) => {
  const { result, pnpmCalls, output } = run(t, {
    pnpm: 0,
    files: { [`${SUITE}demo.test.ts`]: "" },
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(pnpmCalls, [["exec", "vitest", "run", SUITE]]);
});

const PASSING =
  "import unittest\n\n\nclass Other(unittest.TestCase):\n    def test_other(self):\n        pass\n";
const FAILING =
  "import unittest\n\n\nclass Broken(unittest.TestCase):\n    def test_broken(self):\n        self.fail('boom')\n";

// The stubs log one line per write, so a test that reads their calls runs one
// job at a time.
test("each Python test module runs as a job of its own", (t) => {
  const { bin, result, uvCalls, output } = run(t, {
    requirements: "numpy\n",
    uv: 0,
    jobs: 1,
    files: { [`${SUITE}test_other.py`]: PASSING },
  });
  assert.equal(result.status, 0, output);
  const modules = uvCalls.map((call) => call.at(-1));
  assert.deepEqual(modules, ["test_demo.py", "test_other.py"]);
  assert.ok(uvCalls.every((call) => call[4] === join(bin, "python3")));
});

test("a failing module fails the runner, and the other modules still run", (t) => {
  const { result, output } = run(t, {
    jobs: 2,
    files: { [`${SUITE}test_broken.py`]: FAILING },
  });
  assert.equal(result.status, 1, output);
  assert.match(output, new RegExp(`ok ${SUITE}test_demo\\.py`));
  assert.match(output, new RegExp(`FAIL ${SUITE}test_broken\\.py`));
  // The failing log comes last, after every passing one.
  const passing = output.indexOf(`== ${SUITE}test_demo.py ==`);
  const failing = output.indexOf(`== FAILED: ${SUITE}test_broken.py ==`);
  assert.ok(passing !== -1 && passing < failing, output);
  assert.ok(output.indexOf("AssertionError: boom") > failing, output);
});

test("a nested Python test module fails the runner instead of being skipped", (t) => {
  const { result, output } = run(t, {
    files: {
      [`${SUITE}unit/__init__.py`]: "",
      [`${SUITE}unit/test_x.py`]: PASSING,
    },
  });
  assert.equal(result.status, 1, output);
  assert.match(
    output,
    new RegExp(
      `${SUITE}unit/test_x\\.py: test modules sit at the top of ${SUITE}`,
    ),
  );
  assert.match(output, new RegExp(`ok ${SUITE}test_demo\\.py`));
});

test("a vitest suite runs as a job beside the Python modules", (t) => {
  const { result, pnpmCalls, output } = run(t, {
    pnpm: 0,
    jobs: 2,
    files: { [`${SUITE}demo.test.ts`]: "" },
  });
  assert.equal(result.status, 0, output);
  assert.deepEqual(pnpmCalls, [["exec", "vitest", "run", SUITE]]);
  assert.match(output, /Ran 1 test/);
});
