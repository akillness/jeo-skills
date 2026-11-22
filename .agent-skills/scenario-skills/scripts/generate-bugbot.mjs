#!/usr/bin/env node
// Generates .cursor/BUGBOT.md as a byte-identical copy of REVIEW.md, the one
// file people edit. Cursor Bugbot reads a symlink as a file holding its target
// path ("../REVIEW.md", 12 characters), so the copy must be a regular file.
// By default rewrites the copy in place and, for the pre-commit hook, stages it
// from the staged REVIEW.md. --check verifies without rewriting, for
// `pnpm validate` and CI.
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const SOURCE = "REVIEW.md";
const COPY = ".cursor/BUGBOT.md";
const FIX = `edit ${SOURCE}, never the copy, then run pnpm bugbot`;

const bail = (message) => {
  console.error(message);
  process.exit(1);
};

let source;
try {
  source = readFileSync(SOURCE, "utf8");
} catch {
  bail(`${SOURCE} is missing; it is the source of ${COPY}`);
}
const stat = lstatSync(COPY, { throwIfNoEntry: false });
const inSync = stat?.isFile() === true && readFileSync(COPY, "utf8") === source;

if (process.argv.includes("--check")) {
  if (!stat) bail(`${COPY} is missing; ${FIX}`);
  if (!stat.isFile()) {
    bail(
      `${COPY} must be a regular file: Bugbot reads a symlink as its target path; ${FIX}`,
    );
  }
  if (!inSync) bail(`${COPY} differs from ${SOURCE}; ${FIX}`);
  console.log(`${COPY} matches ${SOURCE}`);
  process.exit(0);
}

if (!inSync) {
  // Writing through a symlink would rewrite REVIEW.md itself.
  if (stat && !stat.isFile()) unlinkSync(COPY);
  mkdirSync(path.dirname(COPY), { recursive: true });
  writeFileSync(COPY, source);
}

// The commit ships the index, so the staged copy points at the staged
// REVIEW.md blob: an unstaged REVIEW.md edit never reaches the commit.
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
let blob;
try {
  blob = git("rev-parse", `:${SOURCE}`);
} catch {
  // Not in a git repository, or REVIEW.md is not tracked yet.
}
if (blob) {
  const entry = `100644 ${blob} 0\t${COPY}`;
  if (git("ls-files", "--stage", "--", COPY) !== entry) {
    git("update-index", "--add", "--cacheinfo", `100644,${blob},${COPY}`);
  }
}

console.log(
  inSync
    ? `${COPY} already matches ${SOURCE}`
    : `${COPY} regenerated from ${SOURCE}`,
);
