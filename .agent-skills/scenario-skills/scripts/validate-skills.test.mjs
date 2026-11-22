import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const SKILLS = [
  "skills/scenario",
  "skills/scenario-a",
  "skills/dcc/blender/scenario-blender-x",
];
// Every tool the script calls: a PATH holding only these hides the real uv.
const TOOLS = ["bash", "dirname", "env", "git", "node"];

// Under a git hook, GIT_DIR and friends would point every call at this repo.
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("GIT_") && key !== "SPEC_STAGED_ONLY",
  ),
);
const which = (tool) =>
  execFileSync("sh", ["-c", `command -v ${tool}`], {
    env: baseEnv,
    encoding: "utf8",
  }).trim();

// A committed repository with three skills. The uv stub prints its arguments,
// so a test reads which skill folders the validator would receive.
function repo(t, { uv = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "skills-spec-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts/lib"), { recursive: true });
  for (const file of ["validate-skills.sh", "lib/skills.mjs"]) {
    copyFileSync(join(scripts, file), join(root, "scripts", file));
  }
  for (const dir of SKILLS) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "SKILL.md"), "v1\n");
  }
  writeFileSync(join(root, "README.md"), "v1\n");
  const bin = join(root, ".bin");
  mkdirSync(bin);
  for (const tool of TOOLS) symlinkSync(which(tool), join(bin, tool));
  if (uv) {
    writeFileSync(join(bin, "uv"), "#!/bin/sh\nprintf 'uv-arg %s\\n' \"$@\"\n");
    chmodSync(join(bin, "uv"), 0o755);
  }
  const env = { ...baseEnv, PATH: bin };
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
      { cwd: root, env, encoding: "utf8" },
    );
  git("-c", "init.defaultBranch=main", "init", "-q");
  git("add", "-A", "--", ".", ":!.bin");
  git("commit", "-qm", "init");
  const edit = (file) => writeFileSync(join(root, file), "v2\n");
  const spec = (extra = {}) =>
    spawnSync(join(root, "scripts/validate-skills.sh"), [], {
      cwd: root,
      env: { ...env, ...extra },
      encoding: "utf8",
    });
  // The skill folders the uv stub received, in order; null when uv never ran.
  const validated = (result) => {
    assert.equal(result.status, 0, result.stderr);
    const args = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("uv-arg "))
      .map((line) => line.slice("uv-arg ".length));
    return args.length ? args.filter((a) => a.startsWith("skills/")) : null;
  };
  return { git, edit, spec, validated };
}

test("validates every skill in one uv call", (t) => {
  const { spec, validated } = repo(t);
  assert.deepEqual(validated(spec()), [
    `${SKILLS[2]}/`,
    `${SKILLS[0]}/`,
    `${SKILLS[1]}/`,
  ]);
});

test("staged-only validates just the skills with staged changes", (t) => {
  const { git, edit, spec, validated } = repo(t);
  edit(`${SKILLS[0]}/SKILL.md`);
  edit(`${SKILLS[2]}/SKILL.md`);
  edit(`${SKILLS[1]}/SKILL.md`);
  git("add", `${SKILLS[0]}/SKILL.md`, `${SKILLS[2]}/SKILL.md`);
  assert.deepEqual(validated(spec({ SPEC_STAGED_ONLY: "1" })), [
    `${SKILLS[2]}/`,
    `${SKILLS[0]}/`,
  ]);
});

test("a skill name that prefixes another does not select it", (t) => {
  const { git, edit, spec, validated } = repo(t);
  edit(`${SKILLS[1]}/SKILL.md`);
  git("add", "-A", "--", "skills");
  assert.deepEqual(validated(spec({ SPEC_STAGED_ONLY: "1" })), [
    `${SKILLS[1]}/`,
  ]);
});

test("staged-only skips uv when no skill is staged", (t) => {
  const { git, edit, spec, validated } = repo(t);
  edit("README.md");
  edit(`${SKILLS[0]}/SKILL.md`);
  git("add", "README.md");
  const result = spec({ SPEC_STAGED_ONLY: "1" });
  assert.equal(validated(result), null);
  assert.match(result.stdout, /no staged skill changes/);
});

test("a missing uv fails with an install hint", (t) => {
  const { spec } = repo(t, { uv: false });
  const result = spec();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /uv not found; install uv/);
});

// skills-ref needs Python 3.11 or later, and a machine's default python can be older.
test("pins the validator to Python 3.11 or later", (t) => {
  const { spec } = repo(t);
  const result = spec();
  assert.equal(result.status, 0, result.stderr);
  const args = result.stdout
    .match(/^uv-arg .*$/gm)
    .map((line) => line.slice("uv-arg ".length));
  assert.ok(args.includes("--python"), args.join(" "));
  const pinned = args[args.indexOf("--python") + 1];
  const [major, minor] = pinned.split(".").map(Number);
  assert.ok(major === 3 && minor >= 11, `pinned ${pinned}`);
});
