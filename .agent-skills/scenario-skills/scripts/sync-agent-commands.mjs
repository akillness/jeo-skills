import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const commands = [
  {
    name: "skills-pr-handle",
    path: "skills/pr-handle.md",
    argumentHint: "<PR_number> [--plan-only] [--resolve]",
    explicitOnly: true,
  },
  {
    name: "skills-validate",
    path: "skills/validate.md",
    argumentHint:
      '<skill-name> [--pr <number>] [--plan-only] [--task "..."] [--no-post] [--keep]',
    explicitOnly: true,
  },
];

export function syncCommands(root, check = false) {
  const errors = [];
  const commandRoot = resolve(root, ".claude/commands");
  if (lstatSync(commandRoot, { throwIfNoEntry: false })) {
    for (const path of readdirSync(commandRoot, { recursive: true })) {
      if (
        path.endsWith(".md") &&
        !commands.some((command) => command.path === path)
      ) {
        errors.push(
          `${path}: no shared command mapping; add its canonical skill and mapping`,
        );
      }
    }
  }
  for (const command of commands) {
    const source = `.agents/skills/${command.name}/SKILL.md`;
    const target = resolve(root, ".claude/commands", command.path);
    try {
      // Codex ignores SKILL.md file symlinks, so the canonical file must be real.
      if (!lstatSync(resolve(root, source)).isFile()) {
        throw new Error(`${source}: expected a regular SKILL.md`);
      }
      const content = readFileSync(resolve(root, source), "utf8");
      const parts = content.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
      const metadata = parts ? parse(parts[1]) : null;
      if (
        metadata?.name !== command.name ||
        typeof metadata.description !== "string" ||
        !metadata.description.trim() ||
        metadata.license !== "MIT"
      ) {
        throw new Error(`${source}: invalid command skill metadata`);
      }
      if (
        command.argumentHint &&
        metadata["argument-hint"] !== command.argumentHint
      ) {
        throw new Error(
          `${source}: argument-hint must be ${command.argumentHint}`,
        );
      }
      if (command.explicitOnly) {
        if (metadata["disable-model-invocation"] !== true) {
          throw new Error(`${source}: disable-model-invocation must be true`);
        }
        const policyPath = `.agents/skills/${command.name}/agents/openai.yaml`;
        const config = parse(readFileSync(resolve(root, policyPath), "utf8"));
        if (config?.policy?.allow_implicit_invocation !== false) {
          throw new Error(
            `${policyPath}: policy.allow_implicit_invocation must be false`,
          );
        }
      }
      const expected = relative(dirname(target), resolve(root, source));
      const stat = lstatSync(target, { throwIfNoEntry: false });
      if (stat && !stat.isSymbolicLink()) {
        throw new Error(
          `${command.path}: refusing to overwrite a regular file or directory`,
        );
      }
      if (stat && readlinkSync(target) === expected) continue;
      if (check)
        throw new Error(
          `${command.path}: missing or incorrect symlink to ${source}`,
        );
      mkdirSync(dirname(target), { recursive: true });
      if (stat) unlinkSync(target);
      symlinkSync(expected, target);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) {
    console.error("Usage: node scripts/sync-agent-commands.mjs [--check]");
    process.exitCode = 1;
  } else {
    const errors = syncCommands(
      fileURLToPath(new URL("..", import.meta.url)),
      args.includes("--check"),
    );
    if (errors.length) {
      console.error(errors.join("\n"));
      console.error(
        "Fix command metadata errors, then run pnpm sync:agent-commands to repair links.",
      );
      process.exitCode = 1;
    }
  }
}
