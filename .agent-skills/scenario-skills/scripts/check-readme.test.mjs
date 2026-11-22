import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
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
const COMMAND =
  "npx skills add scenario-labs/skills --skill scenario scenario-demo";

const README = `## Skills

### Getting started

Connect and generate.

| Skill | Use it for |
| --- | --- |
| [scenario](skills/scenario/SKILL.md) | Connect. |
| [scenario-demo](skills/scenario-demo/SKILL.md) | Generate. |

## Install

\`\`\`bash
# Every Scenario skill, without the expert tools
${COMMAND}
\`\`\`
`;

// A minimal repository that passes check-readme.mjs with the given role
// paragraph above the one INSTALL.md command.
function check(t, paragraph) {
  const root = mkdtempSync(join(tmpdir(), "skills-readme-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["check-readme.mjs", "lib/skills.mjs"]) {
    mkdirSync(dirname(join(root, "scripts", file)), { recursive: true });
    copyFileSync(join(scripts, file), join(root, "scripts", file));
  }
  for (const name of ["scenario", "scenario-demo"]) {
    mkdirSync(join(root, "skills", name), { recursive: true });
    writeFileSync(join(root, "skills", name, "SKILL.md"), "");
  }
  writeFileSync(
    join(root, "skills.sh.json"),
    JSON.stringify({
      groupings: [
        {
          title: "Getting started",
          description: "Connect and generate.",
          skills: ["scenario", "scenario-demo"],
        },
      ],
    }),
  );
  writeFileSync(join(root, "README.md"), README);
  writeFileSync(
    join(root, "INSTALL.md"),
    `## By role\n\n### Everyone\n\n${paragraph}\n\n\`\`\`bash\n${COMMAND}\n\`\`\`\n`,
  );
  try {
    execFileSync("node", ["scripts/check-readme.mjs"], {
      cwd: root,
      stdio: "pipe",
    });
    return "";
  } catch (error) {
    return error.stderr.toString();
  }
}

test("reads a count on one line", (t) => {
  assert.equal(check(t, "Connection and generation. 2 skills."), "");
});

test("reads a count that wrapping split across two lines", (t) => {
  assert.equal(check(t, "Connection and generation. 2\nskills."), "");
});

test("still catches a wrong count split across two lines", (t) => {
  assert.match(
    check(t, "Connection and generation. 3\nskills."),
    /"Everyone" says 3 skills, its command installs 2/,
  );
});

test("does not borrow a number from across a heading", (t) => {
  assert.match(
    check(t, "Connection and generation. 2\n### Later\nskills."),
    /"Later" has no "N skills\." line before its command/,
  );
});
