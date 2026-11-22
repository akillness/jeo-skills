// The logic behind guard-commit.sh, which carries the why. Reads the PreToolUse
// payload on stdin; exits 2 with the reason on stderr to refuse the command.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HOOKS_PATH = ".husky/_";

// Splits a shell command into simple commands, each a list of words with
// quotes removed. Commands inside $( ) and backticks count as their own, and
// heredoc bodies are skipped: a commit message mentioning --no-verify is text,
// not a flag. Not a full shell parser; it errs toward seeing a commit.
export function simpleCommands(src) {
  const commands = [];
  let i = 0;

  function backticks() {
    let end = i;
    while (end < src.length && src[end] !== "`")
      end += src[end] === "\\" ? 2 : 1;
    commands.push(...simpleCommands(src.slice(i, end)));
    i = end + 1;
  }

  function doubleQuoted() {
    let text = "";
    while (i < src.length && src[i] !== '"') {
      if (src[i] === "\\" && '"\\$`\n'.includes(src[i + 1])) {
        text += src[i + 1];
        i += 2;
      } else if (src[i] === "$" && src[i + 1] === "(") {
        i += 2;
        parse(true);
        text += "$()";
      } else if (src[i] === "`") {
        i += 1;
        backticks();
        text += "``";
      } else {
        text += src[i];
        i += 1;
      }
    }
    i += 1;
    return text;
  }

  function parse(inSubstitution) {
    let words = [];
    let word = null;
    let dropNext = false;
    const heredocs = [];
    const endWord = () => {
      if (word !== null && !dropNext) words.push(word);
      if (word !== null) dropNext = false;
      word = null;
    };
    const endCommand = () => {
      endWord();
      if (words.length > 0) commands.push(words);
      words = [];
    };
    const skipHeredocs = () => {
      for (const { delimiter, tabs } of heredocs.splice(0)) {
        while (i < src.length) {
          let end = src.indexOf("\n", i);
          if (end < 0) end = src.length;
          const line = src.slice(i, end);
          i = end + 1;
          if ((tabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
        }
      }
    };
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") {
        if (src[i + 1] !== "\n") word = (word ?? "") + (src[i + 1] ?? "");
        i += 2;
      } else if (c === "'") {
        let end = src.indexOf("'", i + 1);
        if (end < 0) end = src.length;
        word = (word ?? "") + src.slice(i + 1, end);
        i = end + 1;
      } else if (c === '"') {
        i += 1;
        word = (word ?? "") + doubleQuoted();
      } else if (c === "$" && src[i + 1] === "(") {
        i += 2;
        parse(true);
        word = (word ?? "") + "$()";
      } else if (c === "`") {
        i += 1;
        backticks();
        word = (word ?? "") + "``";
      } else if (c === ")" && inSubstitution) {
        i += 1;
        endCommand();
        return;
      } else if (c === "#" && word === null) {
        while (i < src.length && src[i] !== "\n") i += 1;
      } else if (c === "\n") {
        endCommand();
        i += 1;
        skipHeredocs();
      } else if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
        endWord();
        i += 2;
        const tabs = src[i] === "-";
        if (tabs) i += 1;
        while (src[i] === " " || src[i] === "\t") i += 1;
        let delimiter = "";
        while (i < src.length && !/[\s;&|()<>]/.test(src[i])) {
          if (src[i] === "'" || src[i] === '"') {
            const quote = src[i];
            let end = src.indexOf(quote, i + 1);
            if (end < 0) end = src.length;
            delimiter += src.slice(i + 1, end);
            i = end + 1;
          } else {
            if (src[i] === "\\") i += 1;
            delimiter += src[i] ?? "";
            i += 1;
          }
        }
        heredocs.push({ delimiter, tabs });
      } else if (c === "<" || c === ">") {
        // A redirection target is a file name, never an option.
        endWord();
        while (src[i] === "<" || src[i] === ">") i += 1;
        if (src[i] === "&") i += 1;
        dropNext = true;
      } else if (";&|()".includes(c)) {
        endCommand();
        i += 1;
      } else if (/\s/.test(c)) {
        endWord();
        i += 1;
      } else {
        word = (word ?? "") + c;
        i += 1;
      }
    }
    endCommand();
  }

  parse(false);
  return commands;
}

// git's global options that take the next word as their value.
const GIT_WITH_VALUE = [
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--super-prefix",
];
// git commit's options that take the next word as their value, so a message
// that starts with "-n" is not read as the flag.
const SHORT_WITH_VALUE = "mFcCt";
const LONG_WITH_VALUE = [
  "--message",
  "--file",
  "--reedit-message",
  "--reuse-message",
  "--template",
  "--author",
  "--date",
  "--cleanup",
  "--fixup",
  "--squash",
  "--trailer",
  "--pathspec-from-file",
];
const overridesHooks = (setting) => /^core\.hookspath=/i.test(setting);
// git ignores an alias named after one of its own commands, so these need no
// alias lookup. A command missing here costs one read of git config.
const GIT_COMMANDS = [
  "add",
  "am",
  "apply",
  "bisect",
  "blame",
  "branch",
  "cat-file",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "commit-tree",
  "config",
  "describe",
  "diff",
  "fetch",
  "for-each-ref",
  "format-patch",
  "grep",
  "help",
  "init",
  "log",
  "ls-files",
  "ls-remote",
  "ls-tree",
  "merge",
  "merge-base",
  "mv",
  "notes",
  "pull",
  "push",
  "rebase",
  "reflog",
  "remote",
  "reset",
  "restore",
  "rev-list",
  "rev-parse",
  "revert",
  "rm",
  "shortlog",
  "show",
  "stash",
  "status",
  "submodule",
  "switch",
  "tag",
  "worktree",
];

// Commands that run the command after their options, with those options in
// getopt terms: flags, flags taking a value (attached or the next word), flags
// whose value can only be attached, long forms. A long option written with "="
// carries its value either way, and an unambiguous prefix of one counts, as
// getopt_long allows. An option missing here leaves the wrapped command unread.
const WRAPPERS = {
  command: { flags: "p", prints: "vV" },
  env: {
    flags: "0iv",
    values: "aCLPSUu",
    long: [
      "--ignore-environment",
      "--null",
      "--debug",
      "--block-signal",
      "--default-signal",
      "--ignore-signal",
      "--list-signal-handling",
    ],
    longValues: ["--unset", "--chdir", "--split-string", "--argv0"],
    dash: true,
  },
  exec: { flags: "cl", values: "a" },
  nice: { values: "n", longValues: ["--adjustment"], numeric: true },
  nohup: {},
  sudo: {
    flags: "AbBEeHiKklNnPSsVv",
    values: "aCcDgpRrTtUu",
    attached: "h",
    long: [
      "--askpass",
      "--background",
      "--bell",
      "--edit",
      "--help",
      "--list",
      "--login",
      "--no-update",
      "--non-interactive",
      "--preserve-env",
      "--preserve-groups",
      "--remove-timestamp",
      "--reset-timestamp",
      "--set-home",
      "--shell",
      "--stdin",
      "--validate",
      "--version",
    ],
    longValues: [
      "--auth-type",
      "--chdir",
      "--chroot",
      "--close-from",
      "--command-timeout",
      "--group",
      "--host",
      "--login-class",
      "--other-user",
      "--prompt",
      "--role",
      "--type",
      "--user",
    ],
  },
  time: {
    flags: "ahlpqvV",
    values: "fo",
    long: ["--append", "--portability", "--quiet", "--verbose"],
    longValues: ["--format", "--output"],
  },
  timeout: {
    flags: "fpv",
    values: "ks",
    long: ["--foreground", "--preserve-status", "--verbose"],
    longValues: ["--kill-after", "--signal"],
    operands: 1,
  },
};
const SHELLS = ["sh", "bash", "dash", "ksh", "mksh", "zsh"];
const SHELL_LONG = [
  "--debugger",
  "--dump-po-strings",
  "--dump-strings",
  "--login",
  "--noediting",
  "--noprofile",
  "--norc",
  "--posix",
  "--pretty-print",
  "--restricted",
  "--verbose",
];
const SHELL_LONG_VALUES = ["--init-file", "--rcfile"];
// Reserved words a command can follow.
const RESERVED = [
  "!",
  "{",
  "if",
  "then",
  "else",
  "elif",
  "while",
  "until",
  "do",
];

// Where the wrapped command starts: { k }, { unknown } naming an option the
// table lacks, or { prints } for command -v, which runs nothing. env -S splits
// its value into words, spliced into `words` after it.
function skipOptions(words, k, spec) {
  while (k < words.length) {
    const word = words[k];
    if (word === "--") {
      k += 1;
      break;
    }
    // A lone "-" is env's old spelling of -i.
    if (word === "-" && spec.dash) {
      k += 1;
      continue;
    }
    if (!word.startsWith("-") || word === "-") break;
    if (spec.numeric && /^--?\d+$/.test(word)) {
      k += 1;
      continue;
    }
    if (word.startsWith("--")) {
      const [given, value] = word.split(/=(.*)/s);
      const known = [...(spec.long ?? []), ...(spec.longValues ?? [])];
      const matches = known.filter((name) => name.startsWith(given));
      const name = known.includes(given)
        ? given
        : matches.length === 1
          ? matches[0]
          : null;
      if (!name) return { unknown: word };
      let split = value;
      if (value === undefined && spec.longValues?.includes(name)) {
        k += 1;
        split = words[k];
      }
      if (name === "--split-string") splitInto(words, k, split);
      k += 1;
      continue;
    }
    for (let p = 1; p < word.length; p += 1) {
      const flag = word[p];
      if (spec.prints?.includes(flag)) return { prints: true };
      if (spec.flags?.includes(flag)) continue;
      if (spec.attached?.includes(flag)) break;
      if (!spec.values?.includes(flag)) return { unknown: word };
      let value = word.slice(p + 1);
      if (value === "") {
        k += 1;
        value = words[k];
      }
      if (flag === "S" && spec.dash) splitInto(words, k, value);
      break;
    }
    k += 1;
  }
  return { k: k + (spec.operands ?? 0) };
}

function splitInto(words, k, value) {
  words.splice(k + 1, 0, ...simpleCommands(value ?? "").flat());
}

// The string a shell runs with -c: { src, k } with k at the word after it,
// { unknown } for an option missing from the lists, or null when the shell
// reads a script or stdin instead.
function shellString(words, k) {
  let c = false;
  for (; k < words.length; k += 1) {
    const word = words[k];
    if (word === "--" || word === "-") {
      k += 1;
      break;
    }
    if (!/^[-+]./.test(word)) break;
    if (word.startsWith("--")) {
      if (SHELL_LONG_VALUES.includes(word)) k += 1;
      else if (!SHELL_LONG.includes(word)) return { unknown: word };
      continue;
    }
    if (!/^[-+][A-Za-z]+$/.test(word)) return { unknown: word };
    if (word.includes("c")) c = true;
    // -o and -O name an option in the next word.
    if (/[oO]/.test(word)) k += 1;
  }
  return c ? { src: words[k] ?? "", k: k + 1 } : null;
}

// Whether words a wrapper would run may hold a git commit.
const mentionsCommit = (words) =>
  /(^|[\s/;&|(`])git\s[\s\S]*\bcommit\b/.test(words.join(" "));

// { commit, bypasses, unreadable }: whether the command runs git commit, every
// way it skips the hooks, and every wrapper the guard cannot read past that
// may run one. aliases() returns the git aliases as a Map from lowercase name
// to value, or null when git config cannot be read.
export function inspect(command, aliases = () => new Map()) {
  const result = { commit: false, bypasses: [], unreadable: [] };
  // A HUSKY=0 set as a command of its own reaches every command after it.
  const carried = [];
  for (const words of simpleCommands(command)) {
    inspectWords([...words], result, aliases, carried);
    const setting = setsHusky(words);
    if (setting && !carried.includes(setting)) carried.push(setting);
  }
  return result;
}

const DECLARES = ["export", "declare", "typeset", "readonly", "local"];

// The bypass a command sets for the rest of the shell: "export HUSKY=0" for a
// declaration, "HUSKY=0" for assignments alone (exported if HUSKY already is).
function setsHusky(words) {
  if (!words.includes("HUSKY=0")) return null;
  if (DECLARES.includes(words[0])) return `${words[0]} HUSKY=0`;
  const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;
  return words.every((word) => assignment.test(word)) ? "HUSKY=0" : null;
}

// Inspects src as a command run with the bypasses found around it.
function inspectNested(src, bypasses, result, aliases) {
  const inner = inspect(src, aliases);
  if (inner.commit) {
    result.commit = true;
    result.bypasses.push(...bypasses, ...inner.bypasses);
  }
  result.unreadable.push(...inner.unreadable);
  return inner.commit;
}

function inspectWords(words, result, aliases, carried = []) {
  const bypasses = [...carried];
  const unreadable = (what, rest) => {
    if (mentionsCommit(rest)) result.unreadable.push(what);
  };
  let k = 0;
  while (k < words.length) {
    const word = words[k];
    const name = word.replace(/^.*\//, "");
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      if (word === "HUSKY=0") bypasses.push("HUSKY=0");
      k += 1;
    } else if (RESERVED.includes(word)) {
      k += 1;
    } else if (name === "eval") {
      inspectNested(words.slice(k + 1).join(" "), bypasses, result, aliases);
      return;
    } else if (name === "xargs") {
      // xargs adds arguments read from stdin, which the guard never sees.
      unreadable("xargs", words.slice(k + 1));
      return;
    } else if (SHELLS.includes(name)) {
      const run = shellString(words, k + 1);
      if (run?.unknown) {
        unreadable(`${name} ${run.unknown}`, words.slice(k + 1));
      } else if (
        run &&
        inspectNested(run.src, bypasses, result, aliases) &&
        run.k < words.length
      ) {
        // Words after the string become $0, $1..., which it may expand.
        result.unreadable.push(`${name} -c with arguments`);
      }
      return;
    } else if (Object.hasOwn(WRAPPERS, name)) {
      const next = skipOptions(words, k + 1, WRAPPERS[name]);
      if (next.prints) return;
      if (next.unknown) {
        unreadable(`${name} ${next.unknown}`, words.slice(k + 1));
        return;
      }
      k = next.k;
    } else {
      break;
    }
  }
  if (!/(^|\/)git$/.test(words[k] ?? "")) return;
  // Aliases set with -c on this command line, by lowercase name. --config-env
  // takes the value from a variable, so it maps to undefined: unreadable.
  const inline = new Map();
  let expanded = null;
  for (;;) {
    for (k += 1; k < words.length && words[k].startsWith("-"); k += 1) {
      const [name, value] = words[k].split(/=(.*)/s);
      const setting =
        value ?? (GIT_WITH_VALUE.includes(name) ? words[++k] : undefined);
      if (name !== "-c" && name !== "--config-env") continue;
      if (overridesHooks(setting ?? "")) bypasses.push(`-c ${setting}`);
      const alias = /^alias\.([^=]+)=(.*)$/is.exec(setting ?? "");
      if (alias) {
        inline.set(
          alias[1].toLowerCase(),
          name === "-c" ? alias[2] : undefined,
        );
      }
    }
    const sub = words[k];
    if (sub === undefined || GIT_COMMANDS.includes(sub)) break;
    // Expand one alias as git would, then read the words it becomes.
    const key = sub.toLowerCase();
    const config = inline.has(key) ? inline : aliases();
    if (config === null) {
      result.unreadable.push(`git ${sub}, as git config could not be read`);
      return;
    }
    if (!config.has(key)) break;
    const value = config.get(key);
    if (expanded) {
      result.unreadable.push(
        `the git alias ${expanded}, which names another alias`,
      );
      return;
    }
    if (value === undefined || value.startsWith("!")) {
      // git appends the words after a shell alias to it: `!git` runs any of them.
      if (
        value === undefined ||
        /commit/.test([value, ...words.slice(k + 1)].join(" "))
      ) {
        result.unreadable.push(`the git alias ${sub}`);
      }
      return;
    }
    words.splice(k, 1, ...simpleCommands(value).flat());
    k -= 1;
    expanded = sub;
  }
  if (words[k] !== "commit") return;
  result.commit = true;
  let noVerify = null;
  for (let j = k + 1; j < words.length; j += 1) {
    const word = words[j];
    if (word === "--") break;
    if (word.startsWith("--")) {
      const name = word.split("=")[0];
      // git accepts any unambiguous prefix; --no-ve could still be --no-verbose.
      if (name.length >= "--no-veri".length && "--no-verify".startsWith(name)) {
        noVerify = word;
      } else if (name === "--verify") {
        noVerify = null;
      } else if (!word.includes("=") && LONG_WITH_VALUE.includes(name)) {
        j += 1;
      }
    } else if (word.startsWith("-")) {
      for (let p = 1; p < word.length; p += 1) {
        if (word[p] === "n") noVerify = "-n";
        if (SHORT_WITH_VALUE.includes(word[p])) {
          if (p === word.length - 1) j += 1;
          break;
        }
        // -S and -u take an optional value attached to the flag.
        if (word[p] === "S" || word[p] === "u") break;
      }
    }
  }
  if (noVerify) bypasses.push(noVerify);
  result.bypasses.push(...bypasses);
}

function hooksPath(dir) {
  try {
    return execFileSync("git", ["config", "--local", "core.hooksPath"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// The aliases git would use in dir, local and global: a Map from lowercase
// name to value, or null when git cannot read its config. Exit 1 means none.
function readAliases(dir) {
  const run = spawnSync("git", ["config", "-z", "--get-regexp", "^alias\\."], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (run.error || (run.status !== 0 && run.status !== 1)) return null;
  const aliases = new Map();
  for (const entry of run.stdout.split("\0")) {
    const match = /^alias\.([^\n]*)(?:\n([\s\S]*))?$/.exec(entry);
    if (match) aliases.set(match[1].toLowerCase(), match[2] ?? "");
  }
  return aliases;
}

function refuse(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const command = payload?.tool_input?.command;
  if (typeof command !== "string") {
    refuse("guard-commit: no command in the hook input, so it is refused.");
  }
  const dir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || ".";
  let aliases;
  const { commit, bypasses, unreadable } = inspect(command, () => {
    if (aliases === undefined) aliases = readAliases(dir);
    return aliases;
  });
  if (!commit && unreadable.length === 0) process.exit(0);
  if (bypasses.length > 0) {
    refuse(
      `git commit refused: ${bypasses.join(", ")} skips the husky hooks (commitlint and pnpm validate, the checks CI runs). Commit without it and fix what the hooks report. If a hook cannot run, run \`pnpm install\`.`,
    );
  }
  if (unreadable.length > 0) {
    refuse(
      `git commit refused: the guard cannot read past ${unreadable.join(", ")}, so it cannot tell whether the commit skips the husky hooks. Run git commit as a command of its own.`,
    );
  }
  const current = hooksPath(dir);
  if (current !== HOOKS_PATH) {
    const found = current === null ? "unset or unreadable" : `"${current}"`;
    refuse(
      `git commit refused: core.hooksPath is ${found}, not ${HOOKS_PATH}, so the husky hooks (commitlint and pnpm validate) would not run. Run \`pnpm install\` in ${dir}, then commit again.`,
    );
  }
}
