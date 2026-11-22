import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const COPY = ".cursor/BUGBOT.md";
const REVIEW = "# Review instructions\n\nReport crashes.\n";

// Under a git hook, GIT_DIR and friends would point every call at this repo.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "skills-bugbot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  copyFileSync(
    join(scripts, "generate-bugbot.mjs"),
    join(root, "scripts/generate-bugbot.mjs"),
  );
  mkdirSync(join(root, ".cursor"));
  writeFileSync(join(root, "REVIEW.md"), REVIEW);
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
  const bugbot = (...args) =>
    run(process.execPath, [join(root, "scripts/generate-bugbot.mjs"), ...args]);
  const failure = (...args) => {
    try {
      bugbot(...args);
    } catch (error) {
      return error.stderr;
    }
    assert.fail("expected the check to fail");
  };
  git("-c", "init.defaultBranch=main", "init", "-q");
  return { root, git, bugbot, failure };
}

test("the check rejects a symlink to REVIEW.md", (t) => {
  const { root, failure } = repo(t);
  symlinkSync("../REVIEW.md", join(root, COPY));
  const stderr = failure("--check");
  assert.match(stderr, /must be a regular file/);
  assert.match(stderr, /run pnpm bugbot/);
});

test("the check rejects a copy that differs from REVIEW.md", (t) => {
  const { root, failure } = repo(t);
  writeFileSync(join(root, COPY), `${REVIEW}Hand edit.\n`);
  assert.match(failure("--check"), /differs from REVIEW\.md.*run pnpm bugbot/);
});

test("the check rejects a missing copy or a missing REVIEW.md", (t) => {
  const { root, bugbot, failure } = repo(t);
  assert.match(failure("--check"), /BUGBOT\.md is missing/);
  bugbot();
  rmSync(join(root, "REVIEW.md"));
  assert.match(failure("--check"), /REVIEW\.md is missing/);
  assert.match(failure(), /REVIEW\.md is missing/);
});

test("generating replaces a symlink with a staged regular copy", (t) => {
  const { root, git, bugbot } = repo(t);
  symlinkSync("../REVIEW.md", join(root, COPY));
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  bugbot();
  assert.ok(lstatSync(join(root, COPY)).isFile());
  assert.equal(readFileSync(join(root, COPY), "utf8"), REVIEW);
  assert.equal(readFileSync(join(root, "REVIEW.md"), "utf8"), REVIEW);
  assert.match(git("ls-files", "--stage", "--", COPY), /^100644 /);
  assert.equal(git("show", `:${COPY}`), REVIEW);
  // A staged type change (symlink to file) and nothing left unstaged.
  assert.equal(git("status", "--porcelain", "--", COPY), `T  ${COPY}\n`);
  bugbot("--check");
});

test("the staged copy follows the staged REVIEW.md, not an unstaged edit", (t) => {
  const { root, git, bugbot } = repo(t);
  bugbot();
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  const staged = `${REVIEW}Report leaks.\n`;
  writeFileSync(join(root, "REVIEW.md"), staged);
  git("add", "REVIEW.md");
  writeFileSync(join(root, "REVIEW.md"), `${staged}Unstaged.\n`);
  bugbot();
  assert.equal(git("show", `:${COPY}`), staged);
  assert.equal(readFileSync(join(root, COPY), "utf8"), `${staged}Unstaged.\n`);
});
