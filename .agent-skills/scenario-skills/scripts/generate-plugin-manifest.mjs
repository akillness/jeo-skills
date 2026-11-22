#!/usr/bin/env node
// Generates .claude-plugin/marketplace.json from skills.sh.json, keeping the
// repo-page groupings the single source of truth for skill grouping:
// - the skills CLI (npx skills add) groups its installer picker by the plugin
//   entries in .claude-plugin/marketplace.json and never reads skills.sh.json,
//   which only drives the repo page on skills.sh
// - each grouping becomes one plugin entry (title lowercased and hyphenated as
//   the plugin name, same description, one path per skill, nested for the
//   expert tools under skills/<category>/<family>/),
//   which also makes the repo installable as a Claude Code plugin marketplace,
//   one plugin per grouping
// - plugin names carry a two-digit position prefix (01.-getting-started,
//   displayed by the picker as "01. Getting Started") because the picker sorts
//   group names alphabetically, so the prefix is what makes it follow
//   skills.sh.json order; inserting or merging a grouping renumbers the plugin
//   identifiers on the next regeneration
// Never edit the manifest by hand; edit skills.sh.json and run `pnpm manifest`.
// By default regenerates the file in place and, for the pre-commit hook, its
// staged copy from the staged skills.sh.json and skill folders. --check
// verifies without rewriting, for `pnpm validate` and CI. Grouping contents are
// validated by check-groupings.mjs.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills, listSkillsFromPaths } from "./lib/skills.mjs";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const MANIFEST_PATH = ".claude-plugin/marketplace.json";

const bail = (message) => {
  console.error(message);
  process.exit(1);
};

const pluginNameOf = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// `source` names the skills.sh.json being read in error messages.
function render(source, read, skills) {
  let config;
  try {
    config = JSON.parse(read());
  } catch (error) {
    bail(`${source}: not valid JSON (${error.message})`);
  }
  if (!Array.isArray(config.groupings) || config.groupings.length === 0) {
    bail(`${source}: groupings must be a non-empty array (see pnpm groupings)`);
  }

  const skillDirOf = new Map(skills.map((skill) => [skill.name, skill.dir]));
  const seen = new Map();
  const plugins = config.groupings.map((group, index) => {
    if (group === null || typeof group !== "object" || Array.isArray(group)) {
      bail(
        `${source}: grouping ${index} must be an object (see pnpm groupings)`,
      );
    }
    const title = String(group.title ?? "");
    const slug = pluginNameOf(title);
    if (slug === "") {
      bail(`${source}: grouping "${title}" produces an empty plugin name`);
    }
    if (seen.has(slug)) {
      bail(
        `${source}: groupings "${seen.get(slug)}" and "${title}" both map to plugin name "${slug}"`,
      );
    }
    seen.set(slug, title);
    if (!Array.isArray(group.skills)) {
      bail(
        `${source}: grouping "${title}" needs a skills array (see pnpm groupings)`,
      );
    }
    const name = `${String(index + 1).padStart(2, "0")}.-${slug}`;
    const plugin = { name };
    if (group.description) plugin.description = group.description;
    plugin.source = "./";
    plugin.strict = false;
    plugin.skills = group.skills.map((skill) => {
      if (!skillDirOf.has(skill)) {
        bail(
          `${source}: "${skill}" in grouping "${title}" has no skill directory (see pnpm groupings)`,
        );
      }
      return `./${skillDirOf.get(skill)}`;
    });
    return plugin;
  });

  const manifest = {
    name: "scenario-skills",
    owner: { name: "Scenario", url: "https://scenario.com" },
    metadata: {
      description:
        "Agent Skills for creating production-ready images, video, audio, 3D, and custom models with Scenario, plus expert tools for DCC software and game engines",
    },
    plugins,
  };
  return {
    rendered: `${JSON.stringify(manifest, null, 2)}\n`,
    groups: plugins.length,
  };
}

const { rendered, groups } = render(
  "skills.sh.json",
  () => readFileSync("skills.sh.json", "utf8"),
  listSkills(),
);

const existing = existsSync(MANIFEST_PATH)
  ? readFileSync(MANIFEST_PATH, "utf8")
  : null;

if (process.argv.includes("--check")) {
  if (existing !== rendered) {
    bail(
      `${MANIFEST_PATH} is out of sync with skills.sh.json; run pnpm manifest`,
    );
  }
  console.log(
    `${MANIFEST_PATH} is in sync with skills.sh.json (${groups} plugin groups)`,
  );
  process.exit(0);
}

if (existing !== rendered) {
  mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, rendered);
}

// The commit ships the index, not the working tree the check reads, so the
// staged copy is rendered from the staged skills.sh.json and skill folders: a
// staged skill move or grouping edit reaches the commit, an unstaged one never
// does.
const git = (args, input) =>
  execFileSync("git", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
let index;
try {
  index = {
    config: git(["show", ":skills.sh.json"]),
    paths: git(["ls-files", "-z", "--", "skills"]).split("\0"),
  };
} catch {
  // Not in a git repository, or skills.sh.json is not tracked yet.
}
if (index) {
  const staged = render(
    "staged skills.sh.json",
    () => index.config,
    listSkillsFromPaths(index.paths),
  ).rendered;
  let indexed = null;
  try {
    indexed = git(["show", `:${MANIFEST_PATH}`]);
  } catch {
    // The manifest is not tracked yet.
  }
  if (staged !== indexed) {
    const blob = git(["hash-object", "-w", "--stdin"], staged).trim();
    git([
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${blob},${MANIFEST_PATH}`,
    ]);
  }
}

console.log(
  existing !== rendered
    ? `${MANIFEST_PATH} regenerated from skills.sh.json (${groups} plugin groups)`
    : `${MANIFEST_PATH} already in sync with skills.sh.json (${groups} plugin groups)`,
);
