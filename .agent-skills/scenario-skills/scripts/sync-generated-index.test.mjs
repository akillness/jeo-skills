import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const COPY = ".cursor/BUGBOT.md";

// Under a git hook, GIT_DIR and friends would point every call at this repo.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

// A repo whose pre-commit hook regenerates the Bugbot copy, as husky does.
function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "skills-index-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  for (const script of ["generate-bugbot.mjs", "sync-generated-index.mjs"]) {
    copyFileSync(join(scripts, script), join(root, "scripts", script));
  }
  const run = (file, args) =>
    execFileSync(file, args, { cwd: root, env, encoding: "utf8" });
  const git = (...args) =>
    run("git", [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      ...args,
    ]);
  const write = (file, text) => writeFileSync(join(root, file), text);
  const sync = () =>
    run(process.execPath, [join(root, "scripts/sync-generated-index.mjs")]);
  git("-c", "init.defaultBranch=main", "init", "-q");
  mkdirSync(join(root, ".cursor"));
  write("REVIEW.md", "v1\n");
  write(COPY, "v1\n");
  git("add", "-A");
  git("commit", "-qm", "init");
  mkdirSync(join(root, "hooks"));
  write("hooks/pre-commit", "#!/bin/sh\nnode scripts/generate-bugbot.mjs\n");
  chmodSync(join(root, "hooks/pre-commit"), 0o755);
  git("config", "core.hooksPath", "hooks");
  const status = () => git("status", "--short", "--", COPY).trimEnd();
  return { root, git, write, sync, status };
}

// The commit takes the regenerated copy, the real index keeps the old one.
function pathLimitedCommit({ git, write }) {
  write("REVIEW.md", "v2\n");
  git("commit", "-qm", "change", "--", "REVIEW.md");
  assert.equal(git("show", `HEAD:${COPY}`), "v2\n");
  assert.equal(git("show", `:${COPY}`), "v1\n");
}

test("a path-limited commit leaves the copy MM until the sync runs", (t) => {
  const r = repo(t);
  pathLimitedCommit(r);
  assert.equal(r.status(), `MM ${COPY}`);
  assert.match(r.sync(), /Re-synced the index with the commit: \.cursor/);
  assert.equal(r.status(), "");
});

test("the sync runs as a post-commit hook", (t) => {
  const r = repo(t);
  r.write(
    "hooks/post-commit",
    "#!/bin/sh\nnode scripts/sync-generated-index.mjs\n",
  );
  chmodSync(join(r.root, "hooks/post-commit"), 0o755);
  r.write("REVIEW.md", "v2\n");
  r.git("commit", "-qm", "change", "--", "REVIEW.md");
  assert.equal(r.status(), "");
});

test("a worktree copy that differs from the commit is kept", (t) => {
  const r = repo(t);
  pathLimitedCommit(r);
  // The manifest's case: an unstaged input changed the worktree copy too.
  r.write(COPY, "worktree edit\n");
  assert.match(r.sync(), /Re-synced/);
  assert.equal(r.git("show", `:${COPY}`), "v2\n");
  assert.equal(r.status(), ` M ${COPY}`);
});

test("a staged edit to the copy is left alone", (t) => {
  const r = repo(t);
  r.write("REVIEW.md", "v2\n");
  r.git("commit", "-qam", "change");
  r.write(COPY, "staged edit\n");
  r.git("add", COPY);
  assert.equal(r.sync(), "");
  assert.equal(r.status(), `M  ${COPY}`);
});

test("a regular commit and a repo without commits are no-ops", (t) => {
  const r = repo(t);
  r.write("REVIEW.md", "v2\n");
  r.git("add", "REVIEW.md");
  r.git("commit", "-qm", "change");
  assert.equal(r.status(), "");
  assert.equal(r.sync(), "");
  r.git("update-ref", "-d", "HEAD");
  assert.equal(r.sync(), "");
});
