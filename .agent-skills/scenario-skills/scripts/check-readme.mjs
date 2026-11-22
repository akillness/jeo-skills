#!/usr/bin/env node
// Keeps the hand-maintained Skills tables in README.md in sync with both the
// skills/ directory and skills.sh.json (the single source of truth for
// grouping, which also generates the plugin marketplace manifest):
// - the "## Skills" section holds one "###" subsection per grouping, in the
//   same order, with the same title and description, and a table whose rows
//   are exactly the grouping's skills in the same order, so a grouping edit
//   in skills.sh.json cannot leave the README telling a different story
// - every skill directory has exactly one row linking its SKILL.md
//   (skills/<name>/SKILL.md, or the nested path of an expert tool), so a new
//   skill cannot ship without its human-facing index entry
// - every row points at an existing skill directory with a matching label,
//   so renames and removals cannot leave stale rows behind
// - every row carries a non-empty "Use it for" description
// - every `npx skills add scenario-labs/skills` command, in README.md,
//   INSTALL.md, and the expert-tools family READMEs, passes its names after one
//   --skill and names only existing skills; the default
//   command (the line after "# Every Scenario skill, without the expert tools")
//   lists exactly the core skills, and each family README's command lists
//   exactly its family, so a new skill cannot be left out of them
// - every core skill appears in at least one INSTALL.md role command, and
//   each role's and goal's "N skills." count matches its command
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills } from "./lib/skills.mjs";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const errors = [];
const bail = (message) => {
  for (const error of [...errors, message]) console.error(error);
  process.exit(1);
};

let readme;
try {
  readme = readFileSync("README.md", "utf8");
} catch (error) {
  bail(`README.md: cannot read (${error.message})`);
}

let skills;
try {
  skills = listSkills();
} catch (error) {
  bail(`skills/: cannot list skill directories (${error.message})`);
}
const dirOf = new Map(skills.map((skill) => [skill.name, skill.dir]));

// Grouping contents (titles, descriptions, membership) are validated by
// check-groupings.mjs; here the file is only the reference the README must
// mirror.
let groupings;
try {
  groupings = JSON.parse(readFileSync("skills.sh.json", "utf8")).groupings;
} catch (error) {
  bail(`skills.sh.json: cannot read (${error.message})`);
}
if (!Array.isArray(groupings)) {
  bail("skills.sh.json: groupings must be an array (see pnpm groupings)");
}

// Isolate the "## Skills" section so table rows elsewhere in the README
// (if any ever appear) are not mistaken for skill rows.
const lines = readme.split("\n");
const start = lines.findIndex((line) => line.trim() === "## Skills");
if (start === -1) {
  bail('README.md: no "## Skills" section found');
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith("## ")) {
    end = i;
    break;
  }
}

// Walk the section into "###" subsections, collecting each one's description
// paragraph and table rows. Skip each table's first two pipe rows (header and
// |---| separator) by position so a header copy-edit cannot make this check
// fail.
const rowPattern = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|(.*)\|$/;
const sections = [];
const rows = [];
let current = null;
let pipeRun = 0;
for (const raw of lines.slice(start + 1, end)) {
  const line = raw.trim();
  if (line.startsWith("### ")) {
    current = { title: line.slice(4).trim(), prose: [], labels: [] };
    sections.push(current);
    pipeRun = 0;
    continue;
  }
  if (!line.startsWith("|")) {
    pipeRun = 0;
    if (current !== null && line !== "" && current.labels.length === 0) {
      current.prose.push(line);
    }
    continue;
  }
  pipeRun += 1;
  if (pipeRun <= 2) continue;
  rows.push(line);
  if (current === null) {
    errors.push(
      `README.md: Skills table row before the first "###" heading: ${line.slice(0, 80)}`,
    );
    continue;
  }
  const match = line.match(rowPattern);
  if (match) current.labels.push(match[1]);
}

// The subsections mirror skills.sh.json: same groups, same order, same
// description, same rows. skills.sh.json is the source of truth, so on a
// mismatch edit README.md (or edit skills.sh.json first, then the README).
if (sections.length !== groupings.length) {
  errors.push(
    `README.md: the Skills section has ${sections.length} "###" subsections, skills.sh.json has ${groupings.length} groupings`,
  );
}
const pairs = Math.min(sections.length, groupings.length);
for (let i = 0; i < pairs; i++) {
  const section = sections[i];
  const group = groupings[i];
  const label = `Skills subsection ${i + 1} ("${section.title}")`;
  if (section.title !== group.title) {
    errors.push(
      `README.md: ${label} should be "${group.title}" (skills.sh.json grouping ${i + 1})`,
    );
    continue;
  }
  const prose = section.prose.join(" ").trim();
  if (typeof group.description === "string" && prose !== group.description) {
    errors.push(
      `README.md: ${label} description differs from the skills.sh.json grouping description`,
    );
  }
  const expected = Array.isArray(group.skills) ? group.skills : [];
  if (section.labels.join("\n") !== expected.join("\n")) {
    const missing = expected.filter((s) => !section.labels.includes(s));
    const extra = section.labels.filter((s) => !expected.includes(s));
    const detail =
      missing.length === 0 && extra.length === 0
        ? `rows out of order, expected: ${expected.join(", ")}`
        : [
            missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
            extra.length > 0 ? `unexpected: ${extra.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("; ");
    errors.push(
      `README.md: ${label} rows do not match the skills.sh.json grouping (${detail})`,
    );
  }
}

const rowFor = new Map();
for (const row of rows) {
  const match = row.match(rowPattern);
  if (!match) {
    errors.push(
      `README.md: Skills table row is not "| [name](skills/name/SKILL.md) | description |": ${row.slice(0, 80)}`,
    );
    continue;
  }
  const [, label, link, description] = match;
  if (dirOf.has(label) && link !== `${dirOf.get(label)}/SKILL.md`) {
    errors.push(
      `README.md: row "${label}" links ${link}, expected ${dirOf.get(label)}/SKILL.md`,
    );
  }
  if (rowFor.has(label)) {
    errors.push(`README.md: "${label}" has more than one Skills table row`);
  } else {
    rowFor.set(label, description.trim());
  }
  if (!dirOf.has(label)) {
    errors.push(
      `README.md: row "${label}" has no matching skill directory under skills/ (stale row?)`,
    );
  }
  if (description.trim() === "") {
    errors.push(`README.md: row "${label}" has an empty description cell`);
  }
}

for (const { name, dir } of skills) {
  if (!rowFor.has(name)) {
    errors.push(
      `${dir}: missing from the README.md Skills table (add a "| [${name}](${dir}/SKILL.md) | ... |" row)`,
    );
  }
}

// Install commands. A missing or renamed skill fails the whole install, and a
// skill added later would silently fall out of the all-in-one commands.
const DEFAULT_MARKER = "# Every Scenario skill, without the expert tools";
const installPattern = /^npx skills add scenario-labs\/skills\b(.*)$/;
// The CLI's --skill (-s) takes every argument up to the next flag, which is how
// the commands here pass all their names after a single --skill.
const skillsIn = (line) => {
  const names = [];
  let inSkills = false;
  for (const token of line.split(/\s+/)) {
    if (token === "--skill" || token === "-s") inSkills = true;
    else if (token.startsWith("-")) inSkills = false;
    else if (inSkills) names.push(token);
  }
  return names;
};
const compareSets = (label, listed, expected) => {
  const missing = expected.filter((name) => !listed.includes(name));
  const extra = listed.filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    errors.push(
      `${label}: ${[missing.length > 0 ? `missing ${missing.join(", ")}` : "", extra.length > 0 ? `unexpected ${extra.join(", ")}` : ""].filter(Boolean).join("; ")}`,
    );
  }
};
const installCommands = (file, text) => {
  const found = [];
  text.split("\n").forEach((raw, index, all) => {
    const line = raw.trim();
    if (!installPattern.test(line)) return;
    const names = skillsIn(line);
    if (
      line.split(/\s+/).filter((t) => t === "--skill" || t === "-s").length > 1
    ) {
      errors.push(
        `${file}:${index + 1}: install command repeats --skill (pass every name after one --skill)`,
      );
    }
    for (const name of names) {
      if (name !== "*" && !dirOf.has(name)) {
        errors.push(
          `${file}:${index + 1}: install command names "${name}", which is not a skill`,
        );
      }
    }
    found.push({ names, after: (all[index - 1] ?? "").trim() });
  });
  return found;
};

const defaults = installCommands("README.md", readme).filter(
  (command) => command.after === DEFAULT_MARKER,
);
if (defaults.length !== 1) {
  errors.push(
    `README.md: expected one install command right after "${DEFAULT_MARKER}", found ${defaults.length}`,
  );
} else {
  compareSets(
    "README.md: the default install command",
    defaults[0].names,
    skills.filter((skill) => !skill.expert).map((skill) => skill.name),
  );
}

// Until the skills CLI can install a group from the command line
// (https://github.com/scenario-labs/skills/issues/192), the INSTALL.md
// commands are the only scripted installs of a curated set. Roles ("## By
// role") are the complete taxonomy, so every core skill must land in one of
// them; goals ("## By goal") are shortcuts and need not cover everything. Each
// role's and goal's "N skills." line must count its command.
if (!existsSync("INSTALL.md")) {
  errors.push("INSTALL.md: missing (it holds one install command per role)");
} else {
  const install = readFileSync("INSTALL.md", "utf8");
  installCommands("INSTALL.md", install);
  const inRoles = new Set();
  let part = null;
  let entry = null;
  let stated = null;
  let previous = "";
  for (const raw of install.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^(##|###) (.+)$/);
    if (heading) {
      if (heading[1] === "##") part = heading[2];
      entry = heading[2];
      stated = null;
      previous = "";
      continue;
    }
    // Wrapped prose can put the number at the end of one line and "skills."
    // at the start of the next.
    const count = `${previous} ${line}`.match(/\b(\d+) skills\.$/);
    previous = line;
    if (count) stated = Number(count[1]);
    if (!installPattern.test(line)) continue;
    const names = new Set(skillsIn(line));
    if (part === "By role") for (const name of names) inRoles.add(name);
    if (stated === null) {
      errors.push(
        `INSTALL.md: "${entry}" has no "N skills." line before its command`,
      );
    } else if (stated !== names.size) {
      errors.push(
        `INSTALL.md: "${entry}" says ${stated} skills, its command installs ${names.size}`,
      );
    }
  }
  if (inRoles.size === 0) {
    errors.push('INSTALL.md: no install command under "## By role"');
  }
  for (const { name, dir } of skills.filter((skill) => !skill.expert)) {
    if (!inRoles.has(name)) {
      errors.push(
        `${dir}: in no INSTALL.md role command (add it, and the siblings it names, to the role it serves; required until #192 ships group installs)`,
      );
    }
  }
}

const families = new Map();
for (const skill of skills.filter((entry) => entry.expert)) {
  const readmePath = path.join(path.dirname(skill.dir), "README.md");
  if (!families.has(readmePath)) families.set(readmePath, []);
  families.get(readmePath).push(skill.name);
}
for (const [readmePath, members] of families) {
  if (!existsSync(readmePath)) continue; // pnpm skill-files reports the missing README
  const commands = installCommands(
    readmePath,
    readFileSync(readmePath, "utf8"),
  );
  if (commands.length !== 1) {
    errors.push(
      `${readmePath}: expected one install command for the family, found ${commands.length}`,
    );
  } else {
    compareSets(
      `${readmePath}: the install command`,
      commands[0].names,
      members,
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(
  `README.md Skills section mirrors skills.sh.json (${groupings.length} groups) and covers all ${skills.length} skills with no stale or duplicate rows`,
);
