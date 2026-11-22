import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { commands, syncCommands } from "./sync-agent-commands.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "skills-commands-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const { name, argumentHint, explicitOnly } of commands) {
    const file = join(root, ".agents/skills", name, "SKILL.md");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `---\nname: ${name}\ndescription: Use when testing commands.\nlicense: MIT\n${argumentHint ? `argument-hint: ${argumentHint}\n` : ""}${explicitOnly ? "disable-model-invocation: true\n" : ""}---\n\nRun the requested task.\n`,
    );
    if (explicitOnly) {
      const policy = join(dirname(file), "agents/openai.yaml");
      mkdirSync(dirname(policy), { recursive: true });
      writeFileSync(policy, "policy:\n  allow_implicit_invocation: false\n");
    }
  }
  return {
    root,
    source: join(root, ".agents/skills/skills-validate/SKILL.md"),
    target: join(root, ".claude/commands/skills/validate.md"),
  };
}

test("check is read-only; sync creates all commands and is idempotent", (t) => {
  const { root, target } = fixture(t);
  assert.equal(syncCommands(root, true).length, 2);
  assert.equal(existsSync(dirname(target)), false);
  assert.deepEqual(syncCommands(root), []);
  assert.deepEqual(syncCommands(root, true), []);
  const content = readFileSync(target, "utf8");
  assert.deepEqual(syncCommands(root), []);
  assert.equal(readFileSync(target, "utf8"), content);
});

test("canonical edits appear immediately through every relative command link", (t) => {
  const { root, source, target } = fixture(t);
  syncCommands(root);
  writeFileSync(
    source,
    readFileSync(source, "utf8") + "Keep the user's arguments.\n",
  );
  assert.deepEqual(syncCommands(root, true), []);
  assert.match(readFileSync(target, "utf8"), /Keep the user's arguments/);
  for (const command of commands) {
    const link = join(root, ".claude/commands", command.path);
    const canonical = join(root, ".agents/skills", command.name, "SKILL.md");
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.ok(lstatSync(canonical).isFile());
    assert.equal(realpathSync(link), realpathSync(canonical));
    const prefix = command.path.includes("/") ? "../../../" : "../../";
    assert.equal(
      readlinkSync(link),
      `${prefix}.agents/skills/${command.name}/SKILL.md`,
    );
  }
});

test("handwritten commands and directories are never overwritten", (t) => {
  const { root, target } = fixture(t);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "User instructions\n");
  assert.match(syncCommands(root).join("\n"), /regular file or directory/);
  assert.equal(readFileSync(target, "utf8"), "User instructions\n");
  unlinkSync(target);
  mkdirSync(target);
  assert.match(syncCommands(root).join("\n"), /regular file or directory/);
  assert.ok(lstatSync(target).isDirectory());
});

test("incorrect and dangling command links are detected and repaired", (t) => {
  const { root, source, target } = fixture(t);
  syncCommands(root);
  for (const destination of ["missing.md", source]) {
    unlinkSync(target);
    symlinkSync(destination, target);
    assert.match(syncCommands(root, true).join("\n"), /incorrect symlink/);
    assert.deepEqual(syncCommands(root), []);
    assert.deepEqual(syncCommands(root, true), []);
    assert.equal(realpathSync(target), realpathSync(source));
  }
});

test("file symlinks, missing sources and invalid metadata fail checks", (t) => {
  const { root, source } = fixture(t);
  const original = readFileSync(source, "utf8");
  writeFileSync(
    source,
    original.replace("name: skills-validate", "name: wrong"),
  );
  assert.match(
    syncCommands(root, true).join("\n"),
    /invalid command skill metadata/,
  );
  unlinkSync(source);
  assert.ok(syncCommands(root, true).length > 0);
  const other = join(root, "instructions.md");
  writeFileSync(other, original);
  symlinkSync(other, source);
  assert.match(syncCommands(root, true).join("\n"), /regular SKILL.md/);
});

test("every command reads the complete canonical file", (t) => {
  const { root } = fixture(t);
  syncCommands(root);
  for (const command of commands) {
    const source = readFileSync(
      join(root, ".agents/skills", command.name, "SKILL.md"),
      "utf8",
    );
    const target = readFileSync(
      join(root, ".claude/commands", command.path),
      "utf8",
    );
    assert.equal(target, source);
  }
});

test("unmapped Claude commands are reported and preserved", (t) => {
  const { root, target } = fixture(t);
  mkdirSync(dirname(target), { recursive: true });
  const extra = join(dirname(target), "extra.md");
  writeFileSync(extra, "Keep this command.\n");
  assert.match(
    syncCommands(root, true).join("\n"),
    /no shared command mapping/,
  );
  assert.match(syncCommands(root).join("\n"), /no shared command mapping/);
  assert.equal(readFileSync(extra, "utf8"), "Keep this command.\n");
});

for (const name of ["skills-pr-handle", "skills-validate"]) {
  test(`${name} rejects missing or changed Claude argument hints`, (t) => {
    const { root } = fixture(t);
    assert.deepEqual(syncCommands(root), []);
    const source = join(root, ".agents/skills", name, "SKILL.md");
    const original = readFileSync(source, "utf8");
    for (const replacement of ["", "argument-hint: wrong\n"]) {
      const changed = original.replace(/^argument-hint:.*\n/m, replacement);
      writeFileSync(source, changed);
      for (const check of [true, false]) {
        assert.match(
          syncCommands(root, check).join("\n"),
          /argument-hint must be/,
        );
        assert.equal(readFileSync(source, "utf8"), changed);
      }
    }
  });

  test(`${name} requires the Claude boolean invocation guard`, (t) => {
    const { root } = fixture(t);
    assert.deepEqual(syncCommands(root), []);
    const source = join(root, ".agents/skills", name, "SKILL.md");
    const original = readFileSync(source, "utf8");
    for (const replacement of [
      "",
      "disable-model-invocation: false\n",
      'disable-model-invocation: "true"\n',
    ]) {
      writeFileSync(
        source,
        original.replace(/^disable-model-invocation:.*\n/m, replacement),
      );
      for (const check of [true, false]) {
        assert.match(
          syncCommands(root, check).join("\n"),
          /disable-model-invocation must be true/,
        );
      }
    }
  });

  test(`${name} requires the Codex boolean invocation guard`, (t) => {
    const { root } = fixture(t);
    assert.deepEqual(syncCommands(root), []);
    const policy = join(root, ".agents/skills", name, "agents/openai.yaml");
    for (const content of [
      "",
      "policy: {}\n",
      "policy:\n  allow_implicit_invocation: true\n",
      'policy:\n  allow_implicit_invocation: "false"\n',
      "interface:\n  allow_implicit_invocation: false\n",
    ]) {
      writeFileSync(policy, content);
      for (const check of [true, false]) {
        assert.match(
          syncCommands(root, check).join("\n"),
          /policy.allow_implicit_invocation must be false/,
        );
      }
    }
    unlinkSync(policy);
    assert.match(syncCommands(root, true).join("\n"), /openai.yaml/);
  });
}
