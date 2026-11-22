import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "./guard-commit.mjs";

const hook = join(dirname(fileURLToPath(import.meta.url)), "guard-commit.sh");

// Under a git hook, GIT_DIR and friends would point every call at this repo.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

// A throwaway repository whose global config is a file of its own, so no
// test reads or changes the developer's git config. run.config(file, ...args)
// writes "local" or "global" config.
function project(t, hooksPath) {
  const root = mkdtempSync(join(tmpdir(), "guard-commit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitEnv = {
    ...env,
    GIT_CONFIG_GLOBAL: join(root, ".git", "global-config"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const config = (scope, ...args) =>
    execFileSync(
      "git",
      ["config", ...(scope === "global" ? ["--global"] : []), ...args],
      { cwd: root, env: gitEnv },
    );
  execFileSync("git", ["init", "-q"], { cwd: root, env: gitEnv });
  if (hooksPath) config("local", "core.hooksPath", hooksPath);
  const run = (command, extra = {}) =>
    spawnSync(hook, {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
      env: { ...gitEnv, CLAUDE_PROJECT_DIR: root, ...extra },
      encoding: "utf8",
    });
  run.config = config;
  return run;
}

// A PATH holding only the given tools, found on the current PATH.
function pathWith(t, tools) {
  const bin = mkdtempSync(join(tmpdir(), "guard-commit-bin-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  for (const tool of tools) {
    const found =
      tool === "node"
        ? process.execPath
        : execFileSync("/bin/sh", ["-c", `command -v ${tool}`], {
            encoding: "utf8",
          }).trim();
    symlinkSync(found, join(bin, tool));
  }
  return bin;
}

test("allows a commit when the husky hooks are installed", (t) => {
  const run = project(t, ".husky/_");
  const result = run('git add -A && git commit -m "fix(ci): pin it"');
  assert.equal(result.status, 0, result.stderr);
});

test("refuses a commit when the hooks are not installed", (t) => {
  const run = project(t, null);
  const result = run('git commit -m "fix(ci): pin it"');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /core\.hooksPath is unset or unreadable/);
  assert.match(result.stderr, /Run `pnpm install`/);
});

test("refuses a commit when core.hooksPath points elsewhere", (t) => {
  const run = project(t, ".git/hooks");
  const result = run("git commit -m x");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /core\.hooksPath is "\.git\/hooks"/);
});

test("refuses a commit when the project is not a repository", (t) => {
  const result = spawnSync(hook, {
    input: JSON.stringify({ tool_input: { command: "git commit -m x" } }),
    env: { ...env, CLAUDE_PROJECT_DIR: tmpdir() },
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unset or unreadable/);
});

test("refuses --no-verify even with the hooks installed", (t) => {
  const run = project(t, ".husky/_");
  const result = run('git commit --no-verify -m "fix(ci): pin it"');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--no-verify skips the husky hooks/);
  assert.match(result.stderr, /`pnpm install`/);
});

test("refuses --no-verify behind a wrapper's options", (t) => {
  const run = project(t, ".husky/_");
  const result = run("env -i git commit --no-verify -m x");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--no-verify skips the husky hooks/);
});

test("refuses a commit behind a wrapper it cannot read", (t) => {
  const run = project(t, ".husky/_");
  const result = run("git ls-files | xargs git commit -m x");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read past xargs/);
});

test("allows a message that only mentions --no-verify", (t) => {
  const run = project(t, ".husky/_");
  const result = run('git commit -m "refuse --no-verify"');
  assert.equal(result.status, 0, result.stderr);
});

test("allows commands that are not commits, hooks or not", (t) => {
  const run = project(t, null);
  for (const command of ["git status", "git log --oneline -3", "ls"]) {
    assert.equal(run(command).status, 0, command);
  }
});

test("refuses when the check cannot run", (t) => {
  const run = project(t, ".husky/_");
  // A PATH with the shell tools the hook needs, but no node.
  const bin = pathWith(t, ["bash", "cat", "dirname"]);
  const result = run("git commit -m x", { PATH: bin });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /the check could not run/);
});

test("refuses a commit spelled with quotes", (t) => {
  const run = project(t, ".husky/_");
  const result = run('git com"mit" --no-verify -m x');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--no-verify skips the husky hooks/);
});

test("refuses a git alias that skips the hooks", (t) => {
  for (const [scope, alias, command, flag] of [
    ["local", "commit", "git ci -n -m x", "-n"],
    ["global", "commit -n", "git ci -m x", "-n"],
    ["local", "commit", "git ci --no-verify -m x", "--no-verify"],
  ]) {
    const run = project(t, ".husky/_");
    run.config(scope, "alias.ci", alias);
    const result = run(command);
    assert.equal(result.status, 2, `${scope} ${alias}: ${command}`);
    assert.match(result.stderr, new RegExp(`${flag} skips the husky hooks`));
  }
});

test("refuses a shell alias that mentions commit", (t) => {
  const run = project(t, ".husky/_");
  run.config("local", "alias.ci", "!git commit -n");
  const result = run("git ci -m x");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read past the git alias ci/);
});

test("allows a git alias for a commit that keeps the hooks", (t) => {
  const run = project(t, ".husky/_");
  run.config("local", "alias.ci", "commit");
  run.config("local", "alias.st", "status");
  for (const command of ["git ci -m x", "git st", "git lg"]) {
    assert.equal(run(command).status, 0, command);
  }
});

test("refuses an unknown git command when the aliases cannot be read", (t) => {
  const run = project(t, ".husky/_");
  // node but no git: a git command the guard knows needs no alias lookup.
  const bin = pathWith(t, ["bash", "cat", "dirname", "node"]);
  assert.equal(run("git status", { PATH: bin }).status, 0);
  const result = run("git ci -n", { PATH: bin });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /git config could not be read/);
});

test("refuses malformed hook input that mentions a commit", (t) => {
  const result = spawnSync(hook, {
    input: "git commit -m x",
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
});

const bypasses = (command) => inspect(command).bypasses;

test("finds a commit wherever it sits in the command", () => {
  for (const command of [
    "git commit -m x",
    "cd repo && git commit -am x",
    "git -C repo -c user.name=me commit -m x",
    "/usr/bin/git commit",
    "FOO=1 git commit",
    'echo "$(git commit -m x)"',
    "(git commit -m x)",
  ]) {
    assert.ok(inspect(command).commit, command);
  }
  for (const command of [
    "git log --grep commit",
    "echo git commit",
    "git commit-tree HEAD^{tree}",
  ]) {
    assert.ok(!inspect(command).commit, command);
  }
});

test("finds every way to skip the hooks", () => {
  assert.deepEqual(bypasses("git commit --no-verify -m x"), ["--no-verify"]);
  assert.deepEqual(bypasses("git commit --no-verif -m x"), ["--no-verif"]);
  assert.deepEqual(bypasses("git commit -n -m x"), ["-n"]);
  assert.deepEqual(bypasses("git commit -anm x"), ["-n"]);
  assert.deepEqual(bypasses("HUSKY=0 git commit -m x"), ["HUSKY=0"]);
  assert.deepEqual(bypasses("git -c core.hooksPath=/dev/null commit"), [
    "-c core.hooksPath=/dev/null",
  ]);
  assert.deepEqual(bypasses("git -c core.hookspath= commit"), [
    "-c core.hookspath=",
  ]);
});

test("carries a HUSKY=0 set earlier in the command", () => {
  for (const [command, found] of [
    ["export HUSKY=0 && git commit -m x", ["export HUSKY=0"]],
    ["export FOO=1 HUSKY=0; git commit -m x", ["export HUSKY=0"]],
    ["declare -x HUSKY=0\ngit commit -m x", ["declare HUSKY=0"]],
    ["HUSKY=0; export HUSKY; git commit -m x", ["HUSKY=0"]],
    ["export HUSKY=0; sh -c 'git commit -m x'", ["export HUSKY=0"]],
    ["git commit -m x; export HUSKY=0", []],
    ["export HUSKY=1 && git commit -m x", []],
    ["HUSKY=0 git status; git commit -m x", []],
    ['echo "export HUSKY=0"; git commit -m x', []],
  ]) {
    assert.deepEqual(bypasses(command), found, command);
  }
});

test("reads a flag-like word inside a message as text", () => {
  for (const command of [
    'git commit -m "refuse --no-verify"',
    'git commit -m "-n is a flag"',
    "git commit -m-n",
    'git commit --message "-n is a flag"',
    "git commit -m 'it skips -n' && echo --no-verify",
    "git commit -m x # --no-verify",
    "git commit --no-verify --verify -m x",
    "git commit -m x -- --no-verify",
  ]) {
    assert.deepEqual(bypasses(command), [], command);
  }
});

test("skips a heredoc message, even inside a substitution", () => {
  const command = [
    `git commit -m "$(cat <<'EOF'`,
    "chore(ci): refuse --no-verify",
    "",
    'It reads "git commit -n" (and an unbalanced paren) as text.',
    "EOF",
    ')"',
  ].join("\n");
  assert.deepEqual(inspect(command), {
    commit: true,
    bypasses: [],
    unreadable: [],
  });
  assert.deepEqual(inspect(`${command} --no-verify`).bypasses, ["--no-verify"]);
});

test("ignores the target of a redirection", () => {
  assert.deepEqual(bypasses("git commit -m x 2>&1 > -n"), []);
});

test("reads past the options of a wrapper", () => {
  for (const [command, expected] of [
    ["env -i git commit --no-verify -m x", "--no-verify"],
    ["env -u HOME git commit -n", "-n"],
    ["env -uHOME git commit -n", "-n"],
    ["env --unset HOME git commit -n", "-n"],
    ["env --unset=HOME git commit -n", "-n"],
    ["env --ignore-e git commit -n", "-n"],
    ["env -0iv -C /tmp git commit -n", "-n"],
    ["env -- git commit -n", "-n"],
    ["env - git commit -n", "-n"],
    ["env -i HUSKY=0 git commit -m x", "HUSKY=0"],
    ["env -S 'git commit -n'", "-n"],
    ["env -iS'git commit' -n", "-n"],
    ["/usr/bin/env -i git commit -n", "-n"],
    ["command -p git commit -n", "-n"],
    ["command -- git commit -n", "-n"],
    ["nice -n 10 git commit -n", "-n"],
    ["nice -10 git commit -n", "-n"],
    ["nice --adjustment=5 git commit -n", "-n"],
    ["nohup git commit -n", "-n"],
    ["time git commit -n", "-n"],
    ["time -p git commit -n", "-n"],
    ["timeout 60 git commit -n", "-n"],
    ["timeout -s KILL -k 5 60 git commit -n", "-n"],
    ["timeout --signal=KILL --preserve-status 1m git commit -n", "-n"],
    ["sudo -u me git commit -n", "-n"],
    ["sudo -E HUSKY=0 git commit -m x", "HUSKY=0"],
    ["exec -a name git commit -n", "-n"],
    ["env -i nice -n 5 nohup git commit -n", "-n"],
  ]) {
    assert.deepEqual(bypasses(command), [expected], command);
  }
});

test("reads a command a shell or eval runs", () => {
  for (const [command, expected] of [
    ["eval git commit -n", ["-n"]],
    ['eval "git commit --no-verify -m x"', ["--no-verify"]],
    ["sh -c 'git commit -n'", ["-n"]],
    ["bash -lc 'git commit -n'", ["-n"]],
    ["/bin/bash -e -o pipefail -c 'git commit -n'", ["-n"]],
    ["zsh --login -c 'cd repo && git commit -n'", ["-n"]],
    ["HUSKY=0 bash -c 'git commit -m x'", ["HUSKY=0"]],
    ["sh -c \"eval 'git commit -n'\"", ["-n"]],
  ]) {
    assert.ok(inspect(command).commit, command);
    assert.deepEqual(bypasses(command), expected, command);
  }
});

test("sees a commit after a reserved word", () => {
  for (const command of [
    "{ git commit -n; }",
    "if git commit -n; then :; fi",
    "! git commit -n",
    "while true; do git commit -n; done",
    "until git commit -n; do :; done",
  ]) {
    assert.deepEqual(bypasses(command), ["-n"], command);
  }
});

test("marks a commit behind a wrapper it cannot read", () => {
  for (const [command, wrapper] of [
    ["git ls-files | xargs git commit -m x", "xargs"],
    ["xargs -0 sh -c 'git commit -m x'", "xargs"],
    ["env --frobnicate git commit -m x", "env --frobnicate"],
    ["env -X git commit -m x", "env -X"],
    ["env --ign git commit -m x", "env --ign"],
    ["sudo --bogus git commit -m x", "sudo --bogus"],
    ["timeout --frob 5 git commit -m x", "timeout --frob"],
    ["bash --frob -c 'git commit -m x'", "bash --frob"],
    ["sh -c 'git commit \"$@\"' sh -n", "sh -c with arguments"],
  ]) {
    assert.deepEqual(inspect(command).unreadable, [wrapper], command);
  }
});

test("resolves a git alias before reading the subcommand", () => {
  const aliases = () =>
    new Map([
      ["ci", "commit"],
      ["cin", "commit -n"],
      ["hp", "-c core.hooksPath=/dev/null commit"],
      ["st", "status"],
      ["c2", "cin"],
      ["sh", '!f() { git commit "$@"; }; f'],
      ["lg", "!git log --oneline"],
      ["run", "!git"],
    ]);
  const look = (command) => inspect(command, aliases);
  assert.deepEqual(look("git ci -n -m x").bypasses, ["-n"]);
  assert.deepEqual(look("git CI -n").bypasses, ["-n"]);
  assert.deepEqual(look("git -C repo cin -m x").bypasses, ["-n"]);
  assert.deepEqual(look("git hp -m x").bypasses, [
    "-c core.hooksPath=/dev/null",
  ]);
  assert.deepEqual(look("git -c alias.x='commit -n' x").bypasses, ["-n"]);
  assert.deepEqual(look("git ci -m x"), {
    commit: true,
    bypasses: [],
    unreadable: [],
  });
  for (const command of ["git st", "git lg", "git absorb", "git status"]) {
    assert.deepEqual(
      look(command),
      { commit: false, bypasses: [], unreadable: [] },
      command,
    );
  }
  assert.deepEqual(look("git sh -n").unreadable, ["the git alias sh"]);
  // A shell alias gets the words after it, so `!git` runs the commit they name.
  assert.deepEqual(look("git run commit -n -m x").unreadable, [
    "the git alias run",
  ]);
  assert.deepEqual(look("git run status").unreadable, []);
  assert.deepEqual(look("git c2 -m x").unreadable, [
    "the git alias c2, which names another alias",
  ]);
  const unreadable = inspect("git ci -n", () => null).unreadable;
  assert.deepEqual(unreadable, ["git ci, as git config could not be read"]);
  assert.deepEqual(inspect("git status", () => null).unreadable, []);
});

test("lets a wrapper through when it runs no commit", () => {
  for (const command of [
    "command -v git commit",
    "command -V git",
    "git diff --name-only | xargs git add",
    "xargs grep -l commit",
    "env -i git status",
    "env --frobnicate ls commit",
    "bash -c 'git status' commit",
    "bash script.sh commit",
    "eval echo git commit",
    "nice git log --grep commit",
    "sudo ls commit",
  ]) {
    assert.deepEqual(
      inspect(command),
      { commit: false, bypasses: [], unreadable: [] },
      command,
    );
  }
});
