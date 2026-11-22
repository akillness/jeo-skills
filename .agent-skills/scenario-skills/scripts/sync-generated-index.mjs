#!/usr/bin/env node
// Post-commit step: re-syncs the real index with HEAD for the files the
// pre-commit hook generates or rewrites.
//
// A path-limited commit (`git commit REVIEW.md`) runs pre-commit on a
// temporary index. The hook stages the regenerated file there, so the commit
// is right, but git then restores the real index with the old entry: status
// shows a staged rollback plus an unstaged reapplication (MM). post-commit
// runs on the real index with no lock held, so it can set the entry back.
//
// The rollback shows as an index entry equal to HEAD^'s blob for a file the
// commit changed. Any other entry is the user's staged state and stays. The
// worktree is never written, so an unstaged edit survives (the manifest has
// several inputs, so its worktree copy may hold changes the commit left out).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

// Keep in step with the pre-commit steps that stage a file.
const GENERATED = [
  ".cursor/BUGBOT.md",
  ".claude-plugin/marketplace.json",
  "project-words.txt",
];

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const synced = [];
for (const file of GENERATED) {
  let head, parent, indexed;
  try {
    // "<mode> blob <sha>\t<path>", empty when the commit lacks the file.
    head = git("ls-tree", "HEAD", "--", file).split(/\s/);
    parent = git("ls-tree", "HEAD^", "--", file).split(/\s/);
    // "<mode> <sha> <stage>\t<path>", empty when the index lacks it.
    indexed = git("ls-files", "--stage", "--", file).split(/\s/);
  } catch {
    // Not a git repository, or a first commit with no parent.
    continue;
  }
  const [mode, , blob] = head;
  if (!blob || blob === parent[2] || indexed[1] !== parent[2]) continue;
  git("update-index", "--add", "--cacheinfo", `${mode},${blob},${file}`);
  synced.push(file);
}

if (synced.length > 0) {
  console.log(`Re-synced the index with the commit: ${synced.join(", ")}`);
}
