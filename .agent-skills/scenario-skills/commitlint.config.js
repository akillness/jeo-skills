import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills } from "./scripts/lib/skills.mjs";

// Scopes stay in sync with the published skills automatically: every skill
// name is a valid scope, plus the cross-cutting ones below.
const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");
const skillScopes = listSkills(skillsDir)
  .map((skill) => skill.name)
  .sort();

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow longer headers than the 100-char default (matches the PR-title lint).
    "header-max-length": [2, "always", 120],
    // Disabled: tooling commit bodies and release notes wrap long URLs.
    "body-max-line-length": [0, "always", 200],
    // Disabled: long trailers (Co-Authored-By, Signed-off-by) exceed line caps.
    "footer-max-line-length": [0, "always", 200],
    // Warn (not fail) when a scope is omitted: scopes are encouraged, not required.
    "scope-empty": [1, "never"],
    "scope-enum": [
      2,
      "always",
      [
        ...skillScopes,
        "skills", // changes spanning several skills
        "agents", // .claude/ and .agents/ tooling (commands, agents, vendored dev skills)
        "ci", // GitHub Actions, hooks, validation scripts
        "deps", // dependency updates
        "docs", // README, AGENTS.md
        "tooling", // commitlint, cspell, husky, package.json
      ],
    ],
  },
};
