import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const MANIFEST = ".claude-plugin/marketplace.json";
const EXPERT = "scenario-zbrush-automation";
const CORE = "scenario-other";
const MOVED = `./skills/dcc/zbrush-tools/${EXPERT}`;

// Under a git hook, GIT_DIR and friends would point every call at this repo.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "skills-manifest-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["generate-plugin-manifest.mjs", "lib/skills.mjs"]) {
    mkdirSync(dirname(join(root, "scripts", file)), { recursive: true });
    copyFileSync(join(scripts, file), join(root, "scripts", file));
  }
  for (const dir of [`skills/dcc/zbrush/${EXPERT}`, `skills/${CORE}`]) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "SKILL.md"), "");
  }
  const groupings = (title) =>
    writeFileSync(
      join(root, "skills.sh.json"),
      JSON.stringify({ groupings: [{ title, skills: [EXPERT, CORE] }] }),
    );
  groupings("Expert tools: ZBrush");
  const run = (file, args) =>
    execFileSync(file, args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: "pipe",
    });
  const git = (...args) =>
    run("git", [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      ...args,
    ]);
  const manifest = () =>
    run(process.execPath, [join(root, "scripts/generate-plugin-manifest.mjs")]);
  const staged = () =>
    git("diff", "--cached", "--name-only").trim().split("\n");
  const stagedManifest = () => JSON.parse(git("show", `:${MANIFEST}`));
  git("-c", "init.defaultBranch=main", "init", "-q");
  manifest();
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  mkdirSync(join(root, "skills/dcc/zbrush-tools"));
  return { root, git, groupings, manifest, staged, stagedManifest };
}

test("a staged skill move re-stages the manifest it changes", (t) => {
  const { git, manifest, staged, stagedManifest } = repo(t);
  git("mv", `skills/dcc/zbrush/${EXPERT}`, `skills/dcc/zbrush-tools/${EXPERT}`);
  manifest();
  assert.ok(staged().includes(MANIFEST));
  assert.ok(stagedManifest().plugins[0].skills.includes(MOVED));
  assert.equal(git("diff", "--name-only", "--", MANIFEST), "");
});

test("an unstaged skill move stays out of the staged manifest", (t) => {
  const { root, git, manifest, staged } = repo(t);
  renameSync(
    join(root, `skills/dcc/zbrush/${EXPERT}`),
    join(root, `skills/dcc/zbrush-tools/${EXPERT}`),
  );
  appendFileSync(join(root, `skills/${CORE}/SKILL.md`), "edit\n");
  git("add", `skills/${CORE}/SKILL.md`);
  manifest();
  assert.deepEqual(staged(), [`skills/${CORE}/SKILL.md`]);
  assert.match(git("diff", "--name-only", "--", MANIFEST), /marketplace/);
});

test("an unstaged skills.sh.json edit stays out of the staged manifest", (t) => {
  const { git, groupings, manifest, stagedManifest } = repo(t);
  git("mv", `skills/dcc/zbrush/${EXPERT}`, `skills/dcc/zbrush-tools/${EXPERT}`);
  groupings("Expert tools: ZBrush 2");
  manifest();
  const [plugin] = stagedManifest().plugins;
  assert.equal(plugin.name, "01.-expert-tools-zbrush");
  assert.ok(plugin.skills.includes(MOVED));
});
