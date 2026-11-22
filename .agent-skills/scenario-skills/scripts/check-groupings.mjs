#!/usr/bin/env node
// Keeps skills.sh.json (the skills.sh repo-page grouping config) in sync
// with the skills/ directory:
// - the file satisfies the constraints of the published schema at
//   https://skills.sh/schemas/skills.sh.schema.json (skills.sh silently
//   falls back to the ungrouped default list when the file is invalid)
// - every skill directory is listed in a grouping, so a new skill cannot
//   land in the automatic "Other skills" section unnoticed
// - expert-tool groupings hold expert tools only and come after every core
//   grouping, so the expert tools stay at the bottom of skills.sh and the
//   installer picker
// - every listed skill exists and is listed only once, so renames and
//   removals cannot leave stale entries behind
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills } from "./lib/skills.mjs";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const errors = [];
const bail = (message) => {
  for (const error of [...errors, message]) console.error(error);
  process.exit(1);
};
// JSON Schema length limits count code points, not UTF-16 code units
const codePoints = (value) => [...value].length;

let config;
try {
  config = JSON.parse(readFileSync("skills.sh.json", "utf8"));
} catch (error) {
  bail(`skills.sh.json: not valid JSON (${error.message})`);
}
if (config === null || typeof config !== "object" || Array.isArray(config)) {
  bail("skills.sh.json: the top-level value must be an object");
}

const allowedRootKeys = ["$schema", "schema", "notGrouped", "groupings"];
for (const key of Object.keys(config)) {
  if (!allowedRootKeys.includes(key)) {
    errors.push(`skills.sh.json: unknown top-level key "${key}"`);
  }
}
for (const key of ["$schema", "schema"]) {
  if (config[key] !== undefined && typeof config[key] !== "string") {
    errors.push(`skills.sh.json: ${key} must be a string URL`);
  }
}
if (
  config.notGrouped !== undefined &&
  !["top", "bottom"].includes(config.notGrouped)
) {
  errors.push(
    `skills.sh.json: notGrouped must be "top" or "bottom", got ${JSON.stringify(config.notGrouped)}`,
  );
}
if (!Array.isArray(config.groupings) || config.groupings.length === 0) {
  bail("skills.sh.json: groupings must be a non-empty array");
}
if (config.groupings.length > 50) {
  errors.push("skills.sh.json: at most 50 groupings are allowed");
}

let skills;
try {
  skills = listSkills();
} catch (error) {
  bail(`skills/: cannot list skill directories (${error.message})`);
}
const skillByName = new Map(skills.map((skill) => [skill.name, skill]));

const allowedGroupKeys = ["title", "description", "skills"];
const listedIn = new Map();
let firstExpertGroup = null;

config.groupings.forEach((group, index) => {
  if (group === null || typeof group !== "object" || Array.isArray(group)) {
    errors.push(`skills.sh.json: grouping ${index} must be an object`);
    return;
  }
  const label =
    typeof group.title === "string" && group.title !== ""
      ? `grouping "${group.title}"`
      : `grouping ${index}`;

  for (const key of Object.keys(group)) {
    if (!allowedGroupKeys.includes(key)) {
      errors.push(`skills.sh.json: ${label} has unknown key "${key}"`);
    }
  }
  if (
    typeof group.title !== "string" ||
    group.title === "" ||
    codePoints(group.title) > 120
  ) {
    errors.push(
      `skills.sh.json: ${label} needs a title of 1 to 120 characters`,
    );
  }
  if (
    group.description !== undefined &&
    (typeof group.description !== "string" ||
      codePoints(group.description) > 500)
  ) {
    errors.push(
      `skills.sh.json: ${label} description must be a string of at most 500 characters`,
    );
  }
  if (!Array.isArray(group.skills) || group.skills.length === 0) {
    errors.push(`skills.sh.json: ${label} needs a non-empty skills array`);
    return;
  }
  if (group.skills.length > 500) {
    errors.push(`skills.sh.json: ${label} lists more than 500 skills`);
  }

  for (const skill of group.skills) {
    if (typeof skill !== "string" || skill === "") {
      errors.push(
        `skills.sh.json: ${label} contains a skill entry that is not a non-empty string`,
      );
      continue;
    }
    if (codePoints(skill) > 120) {
      errors.push(
        `skills.sh.json: ${label} skill name "${skill.slice(0, 40)}..." exceeds 120 characters`,
      );
    }
    if (listedIn.has(skill)) {
      errors.push(
        `skills.sh.json: "${skill}" is listed in ${listedIn.get(skill)} and again in ${label} (skills.sh only uses the first)`,
      );
    } else {
      listedIn.set(skill, label);
    }
    if (!skillByName.has(skill)) {
      errors.push(
        `skills.sh.json: "${skill}" in ${label} has no matching skill directory under skills/`,
      );
    }
  }

  const known = group.skills.filter((skill) => skillByName.has(skill));
  const experts = known.filter((skill) => skillByName.get(skill).expert);
  if (experts.length > 0 && experts.length < known.length) {
    errors.push(
      `skills.sh.json: ${label} mixes expert tools (${experts.join(", ")}) with core skills; give the expert tools their own grouping`,
    );
  }
  if (experts.length > 0 && firstExpertGroup === null) {
    firstExpertGroup = label;
  } else if (experts.length === 0 && firstExpertGroup !== null) {
    errors.push(
      `skills.sh.json: ${label} is a core grouping after the first expert-tool grouping (${firstExpertGroup}); expert tools stay at the bottom`,
    );
  }
});

for (const skill of skills) {
  if (!listedIn.has(skill.name)) {
    errors.push(
      `${skill.dir}: missing from every skills.sh.json grouping (it would render under "Other skills" on skills.sh)`,
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(
  `skills.sh.json groupings cover all ${skills.length} skills with no stale or duplicate entries`,
);
