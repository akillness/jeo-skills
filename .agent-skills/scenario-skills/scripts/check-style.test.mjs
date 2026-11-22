import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
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
const REFERENCE = "skills/scenario-demo/references/notes.md";
const NOTICE = "Notice (not a failure): a table cell";

// Under a git hook, GIT_DIR and friends would point every call at this repo.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

function repo(t, { modules = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "skills-style-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The frontmatter check imports `yaml` from the repository root.
  if (modules) {
    symlinkSync(join(scripts, "../node_modules"), join(root, "node_modules"));
  }
  for (const file of ["check-style.sh", "lib/skills.mjs"]) {
    mkdirSync(dirname(join(root, "scripts", file)), { recursive: true });
    copyFileSync(join(scripts, file), join(root, "scripts", file));
  }
  // The em-dash rule greps these paths and fails when one is missing.
  for (const dir of [
    "docs",
    "tests",
    ".github",
    ".claude/commands",
    ".claude/agents",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of [
    "README.md",
    "INSTALL.md",
    "AGENTS.md",
    "REVIEW.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
  ]) {
    writeFileSync(join(root, file), "");
  }
  const write = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write(
    "skills/scenario-demo/SKILL.md",
    "---\nname: scenario-demo\ndescription: Use when testing.\nlicense: MIT\n---\n\nBody.\n",
  );
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
      {
        cwd: root,
        env,
        stdio: "pipe",
      },
    );
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  // Throws on a non-zero exit, so every passing test also proves the notice
  // never fails the check.
  const style = (extra = {}) =>
    execFileSync(join(root, "scripts/check-style.sh"), {
      cwd: root,
      env: { ...env, ...extra },
      encoding: "utf8",
      stdio: "pipe",
    });
  return { write, git, style };
}

const table = (...rows) =>
  ["| A | B |", "| --- | --- |", ...rows, ""].join("\n");
const cell = (length) => "x".repeat(length);

test("names a staged cell past 200 characters with its line", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `# Notes\n\n${table(`| ${cell(250)} | short |`)}`);
  git("add", REFERENCE);
  const out = style();
  assert.ok(out.includes(NOTICE), out);
  assert.ok(out.includes(`${REFERENCE}:5: a 250-character cell`), out);
});

test("stays quiet for a cell of exactly 200 characters", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, table(`| ${cell(200)} | short |`));
  git("add", REFERENCE);
  assert.ok(!style().includes(NOTICE));
});

test("stays quiet when the file is committed, not staged", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, table(`| ${cell(250)} | short |`));
  git("add", REFERENCE);
  git("commit", "-q", "-m", "table");
  assert.ok(!style().includes(NOTICE));
});

test("measures cells, not a row padded wide by many short cells", (t) => {
  const { write, git, style } = repo(t);
  const wide = `| ${Array(12).fill(cell(30)).join(" | ")} |`;
  write(REFERENCE, ["| h |", "| --- |", wide, ""].join("\n"));
  git("add", REFERENCE);
  assert.ok(wide.length > 200);
  assert.ok(!style().includes(NOTICE));
});

test("keeps an escaped pipe inside its cell", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, table(`| ${cell(120)} \\| ${cell(120)} | short |`));
  git("add", REFERENCE);
  assert.match(style(), /a 2\d\d-character cell/);
});

test("skips table rows inside fenced code", (t) => {
  const { write, git, style } = repo(t);
  write(
    REFERENCE,
    ["```text", `| ${cell(250)} | short |`, "```", ""].join("\n"),
  );
  git("add", REFERENCE);
  assert.ok(!style().includes(NOTICE));
});

test("only reads skill markdown", (t) => {
  const { write, git, style } = repo(t);
  write("docs/notes.md", table(`| ${cell(250)} | short |`));
  git("add", "docs/notes.md");
  assert.ok(!style().includes(NOTICE));
});

const SENTENCE =
  "Notice (not a failure): staged skill markdown adds a sentence";
const TERM = 'Notice (not a failure): staged skill markdown adds "workflow"';
const words = (count) =>
  Array.from({ length: count }, (_, i) => `w${i}`).join(" ");
// Prettier wraps prose, so a sentence usually spans lines.
const wrapped = (count) => {
  const all = words(count).split(" ");
  return `${all.slice(0, 20).join(" ")}\n${all.slice(20).join(" ")}.`;
};

test("names an added sentence past 40 words by its first line", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `# Notes\n\n${wrapped(41)}\n`);
  git("add", REFERENCE);
  const out = style();
  assert.ok(out.includes(SENTENCE), out);
  assert.ok(out.includes(`${REFERENCE}:3: a 41-word sentence`), out);
});

test("stays quiet for a sentence of exactly 40 words", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `${wrapped(40)}\n`);
  git("add", REFERENCE);
  assert.ok(!style().includes(SENTENCE));
});

test("ignores a long sentence on lines the change does not add", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `${wrapped(60)}\n`);
  git("add", REFERENCE);
  git("commit", "-q", "-m", "notes");
  write(REFERENCE, `${wrapped(60)}\n\nA short new line.\n`);
  git("add", REFERENCE);
  assert.ok(!style().includes(SENTENCE));
});

test("names a long sentence when one of its lines is added", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `${wrapped(60)}\n`);
  git("add", REFERENCE);
  git("commit", "-q", "-m", "notes");
  write(REFERENCE, `${wrapped(60).replace("w59", "changed")}\n`);
  git("add", REFERENCE);
  assert.ok(style().includes(`${REFERENCE}:1: a 60-word sentence`));
});

test("ends a sentence at each list item", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `- ${words(25)}\n- ${words(25)}\n1. ${words(25)}\n`);
  git("add", REFERENCE);
  assert.ok(!style().includes(SENTENCE));
});

test("reads e.g. as part of a sentence", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `${words(20)} e.g. ${words(20)}.\n`);
  git("add", REFERENCE);
  assert.ok(style().includes(`${REFERENCE}:1: a 41-word sentence`));
});

test("reads etc. before a lowercase word as part of a sentence", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `${words(20)} etc.)\n${words(20)}.\n`);
  git("add", REFERENCE);
  assert.ok(style().includes(`${REFERENCE}:1: a 41-word sentence`));
});

test("ends a sentence at etc. before a capital", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, `${words(30)} etc. Next ${words(30)}.\n`);
  git("add", REFERENCE);
  assert.ok(!style().includes(SENTENCE));
});

test("skips frontmatter, fenced code, and tables for sentences", (t) => {
  const { write, git, style } = repo(t);
  write(
    "skills/scenario-demo/SKILL.md",
    [
      "---",
      "name: scenario-demo",
      `description: Use when ${words(50)}.`,
      "license: MIT",
      "---",
      "",
      "```text",
      words(50),
      "```",
      "",
      `| ${words(50)} |`,
      "",
    ].join("\n"),
  );
  git("add", "-A");
  assert.ok(!style().includes(SENTENCE));
});

test("names an added workflow outside the workflow skills", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, "# Notes\n\nFollow this Workflow.\n\n## WORKFLOW\n");
  git("add", REFERENCE);
  const out = style();
  assert.ok(out.includes(TERM), out);
  assert.ok(out.includes(`  ${REFERENCE}:3\n  ${REFERENCE}:5\n`), out);
});

test("leaves workflow alone in the workflow skills", (t) => {
  const { write, git, style } = repo(t);
  const skill = "skills/scenario-workflows/SKILL.md";
  write(
    skill,
    "---\nname: scenario-workflows\ndescription: Use when testing.\nlicense: MIT\n---\n\nRun a workflow.\n",
  );
  git("add", skill);
  assert.ok(!style().includes(TERM));
});

test("ignores workflow in code, link targets, and skill names", (t) => {
  const { write, git, style } = repo(t);
  write(
    REFERENCE,
    [
      'Call `workflow_run`, or `search` with `target="workflows"`.',
      "Read [the docs](https://example.com/workflows).",
      "See scenario-workflows.",
      "```text",
      "workflow",
      "```",
      "",
    ].join("\n"),
  );
  git("add", REFERENCE);
  assert.ok(!style().includes(TERM));
});

test("ignores workflow on lines the change does not add", (t) => {
  const { write, git, style } = repo(t);
  write(REFERENCE, "Follow this workflow.\n");
  git("add", REFERENCE);
  git("commit", "-q", "-m", "notes");
  write(REFERENCE, "Follow this workflow.\n\nA new line.\n");
  git("add", REFERENCE);
  assert.ok(!style().includes(TERM));
});

const AGENTS_CAP = "Codex reads by default";

test("fails when AGENTS.md passes 32 KiB", (t) => {
  const { write, style } = repo(t);
  write("AGENTS.md", "x".repeat(32769));
  assert.throws(style, (error) => {
    assert.ok(error.stdout.includes(`AGENTS.md is 32769 bytes`), error.stdout);
    assert.ok(error.stdout.includes(AGENTS_CAP), error.stdout);
    return true;
  });
});

test("accepts AGENTS.md of exactly 32 KiB", (t) => {
  const { write, style } = repo(t);
  write("AGENTS.md", "x".repeat(32768));
  assert.ok(!style().includes(AGENTS_CAP));
});

const AGENTS_NOTICE = "Notice (not a failure): AGENTS.md is";

test("notices AGENTS.md past 30 KiB without failing", (t) => {
  const { write, style } = repo(t);
  write("AGENTS.md", "x".repeat(30721));
  const out = style();
  assert.ok(out.includes(`${AGENTS_NOTICE} 30721 bytes`), out);
  assert.ok(!out.includes(AGENTS_CAP), out);
});

test("stays quiet for AGENTS.md of exactly 30 KiB", (t) => {
  const { write, style } = repo(t);
  write("AGENTS.md", "x".repeat(30720));
  assert.ok(!style().includes(AGENTS_NOTICE));
});

test("fails past 32 KiB without the early notice", (t) => {
  const { write, style } = repo(t);
  write("AGENTS.md", "x".repeat(32769));
  assert.throws(style, (error) => {
    assert.ok(!error.stdout.includes(AGENTS_NOTICE), error.stdout);
    return true;
  });
});

const SKILL = "skills/scenario-demo/SKILL.md";
const skill = (body) =>
  `---\nname: scenario-demo\ndescription: Use when testing.\nlicense: MIT\n---\n\n${body}\n`;
const WORD_CAP = "over the 2500-word hard cap";

test("accepts a body of exactly 2500 words", (t) => {
  const { write, style } = repo(t);
  write(SKILL, skill(words(2500)));
  assert.ok(!style().includes(WORD_CAP));
});

test("fails a body of 2501 words", (t) => {
  const { write, style } = repo(t);
  write(SKILL, skill(words(2501)));
  assert.throws(style, (error) => {
    assert.ok(
      error.stdout.includes(`${SKILL}: body is 2501 words`),
      error.stdout,
    );
    return true;
  });
});

// GNU wc under LC_ALL=C skips a word made only of non-ASCII bytes, so this
// body read 2500 words there and 2501 on macOS before the count pinned a locale.
test("counts a non-ASCII word whatever the caller's locale", (t) => {
  const { write, style } = repo(t);
  write(SKILL, skill(`${words(2500)} \u2192`));
  for (const LC_ALL of ["C", "C.UTF-8"]) {
    assert.throws(
      () => style({ LC_ALL }),
      (error) => {
        assert.ok(
          error.stdout.includes(`${SKILL}: body is 2501 words`),
          error.stdout,
        );
        return true;
      },
    );
  }
});

test("fails on an em dash in SUPPORT.md", (t) => {
  const { write, style } = repo(t);
  write("SUPPORT.md", `Ask here ${String.fromCodePoint(0x2014)} or there.\n`);
  assert.throws(style, (error) => {
    assert.ok(error.stdout.includes("SUPPORT.md:1:10:"), error.stdout);
    return true;
  });
});

test("fails on an em dash in REVIEW.md", (t) => {
  const { write, style } = repo(t);
  write("REVIEW.md", `Report it ${String.fromCodePoint(0x2014)} or not.\n`);
  assert.throws(style, (error) => {
    assert.ok(error.stdout.includes("REVIEW.md:1:11:"), error.stdout);
    return true;
  });
});

const INSTALL = "must not carry an install command";

test("fails on an install command in a skill file", (t) => {
  for (const command of [
    "npx skills add scenario-labs/skills --skill <name>",
    "npx skills@1.7.4 add scenario-labs/skills#abc --skill <name>",
  ]) {
    const { write, style } = repo(t);
    write(REFERENCE, `Install it:\n\n${command}\n`);
    assert.throws(style, (error) => {
      assert.ok(error.stdout.includes(INSTALL), error.stdout);
      assert.ok(error.stdout.includes(`${REFERENCE}:3:`), error.stdout);
      return true;
    });
  }
});

test("allows install commands in a family README outside every skill", (t) => {
  const { write, style } = repo(t);
  write(
    "skills/dcc/demo/README.md",
    "npx skills add scenario-labs/skills --skill scenario-demo\n",
  );
  assert.ok(!style().includes(INSTALL));
});

const NEAR_CAP = "Notice (not a failure): a skill body is within 100 words";

test("notices a body within 100 words of the cap without failing", (t) => {
  const { write, style } = repo(t);
  write(SKILL, skill(words(2400)));
  const out = style();
  assert.ok(out.includes(NEAR_CAP), out);
  assert.ok(out.includes(`  ${SKILL}: 2400 words\n`), out);
});

test("stays quiet for a body of 2399 words", (t) => {
  const { write, style } = repo(t);
  write(SKILL, skill(words(2399)));
  assert.ok(!style().includes(NEAR_CAP));
});

test("fails past the cap without the near-cap notice", (t) => {
  const { write, style } = repo(t);
  write(SKILL, skill(words(2501)));
  assert.throws(style, (error) => {
    assert.ok(!error.stdout.includes(NEAR_CAP), error.stdout);
    return true;
  });
});

const FRONTMATTER =
  "Frontmatter holds name, description, and license: MIT only";
const EXPERT = "skills/dcc/demo/scenario-demo-expert/SKILL.md";
const frontmatter = (name, lines) =>
  ["---", `name: ${name}`, ...lines, "---", "", "Body.", ""].join("\n");
// "Use when " is 9 characters. The astral character is one code point but two
// UTF-16 units, and four UTF-8 bytes, so only a code-point count reads n.
const description = (n) =>
  `description: "Use when ${"x".repeat(n - 10)}\u{1F3A8}"`;
const failsWith = (style, ...expected) =>
  assert.throws(style, (error) => {
    assert.ok(error.stdout.includes(FRONTMATTER), error.stdout);
    for (const text of expected) {
      assert.ok(error.stdout.includes(text), error.stdout);
    }
    return true;
  });

test("accepts a core description of 499 code points", (t) => {
  const { write, style } = repo(t);
  write(
    SKILL,
    frontmatter("scenario-demo", [description(499), "license: MIT"]),
  );
  assert.ok(!style().includes(FRONTMATTER));
});

test("fails a core description of 500 code points", (t) => {
  const { write, style } = repo(t);
  write(
    SKILL,
    frontmatter("scenario-demo", [description(500), "license: MIT"]),
  );
  failsWith(style, `${SKILL}: description is 500 characters`);
});

test("allows an expert description up to the spec's 1024", (t) => {
  const { write, style } = repo(t);
  write(
    EXPERT,
    frontmatter("scenario-demo-expert", [description(1024), "license: MIT"]),
  );
  assert.ok(!style().includes(FRONTMATTER));
});

test("fails an expert description of 1025 code points", (t) => {
  const { write, style } = repo(t);
  write(
    EXPERT,
    frontmatter("scenario-demo-expert", [description(1025), "license: MIT"]),
  );
  failsWith(style, `${EXPERT}: description is 1025 characters`);
});

test("fails a frontmatter key beyond name, description, and license", (t) => {
  const { write, style } = repo(t);
  write(
    SKILL,
    frontmatter("scenario-demo", [
      "description: Use when testing.",
      "license: MIT",
      "compatibility: any",
    ]),
  );
  failsWith(style, `${SKILL}: frontmatter key "compatibility"`);
});

test("fails a license other than MIT", (t) => {
  const { write, style } = repo(t);
  write(
    SKILL,
    frontmatter("scenario-demo", [
      "description: Use when testing.",
      "license: Apache-2.0",
    ]),
  );
  failsWith(style, `${SKILL}: frontmatter needs license: MIT`);
});

test("fails a frontmatter it cannot parse", (t) => {
  const { write, style } = repo(t);
  write(
    SKILL,
    frontmatter("scenario-demo", [
      'description: "Use when testing.',
      "license: MIT",
    ]),
  );
  failsWith(style, `${SKILL}: frontmatter is not valid YAML`);
});

test("fails a SKILL.md with no frontmatter", (t) => {
  const { write, style } = repo(t);
  write(SKILL, "Use when testing.\n");
  failsWith(style, `${SKILL}: no frontmatter mapping`);
});

test("fails when the YAML parser cannot load", (t) => {
  const { style } = repo(t, { modules: false });
  failsWith(style, "Cannot find package 'yaml'");
});

test("leaves the repository's own dev skills alone", (t) => {
  const { write, style } = repo(t);
  write(
    ".agents/skills/demo/SKILL.md",
    frontmatter("demo", [
      "description: Use when testing.",
      "argument-hint: <name>",
    ]),
  );
  assert.ok(!style().includes(FRONTMATTER));
});
