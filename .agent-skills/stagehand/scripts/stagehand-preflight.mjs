#!/usr/bin/env node

import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);

function valueFor(flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(flag) {
  return argv.includes(flag);
}

function run(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
    windowsHide: true,
  });

  if (result.error) {
    return { ok: false, output: "", error: result.error.code || result.error.message };
  }

  return {
    ok: result.status === 0,
    output: (result.stdout || "").trim(),
    error: result.status === 0 ? undefined : `exit-${result.status}`,
  };
}

function versionParts(version) {
  const match = String(version || "").match(/\d+(?:\.\d+){0,2}/);
  return (match ? match[0] : "0")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function atLeast(version, minimum) {
  const actual = versionParts(version);
  const required = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if ((actual[index] || 0) !== (required[index] || 0)) {
      return (actual[index] || 0) > (required[index] || 0);
    }
  }
  return true;
}

function firstCommand(commands) {
  for (const command of commands) {
    const result = run(command, ["--version"]);
    if (result.ok || result.output) return { command, version: result.output };
  }
  return { command: null, version: null };
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function check(checks, name, ok, detail, required = false) {
  checks.push({ name, ok: Boolean(ok), required, detail });
}

async function readProjectFiles(project) {
  if (!(await isDirectory(project))) return [];
  const names = ["package.json", "pyproject.toml", "requirements.txt", "go.mod"];
  const present = [];
  for (const name of names) {
    if (await exists(path.join(project, name))) present.push(name);
  }
  return present;
}

function printHuman(result) {
  console.log(`Stagehand preflight: ${result.status}`);
  console.log(`target=${result.target} language=${result.language} project=${result.project}`);
  for (const item of result.checks) {
    const marker = item.ok ? "PASS" : item.required ? "BLOCK" : "WARN";
    console.log(`${marker} ${item.name}: ${item.detail}`);
  }
  if (result.blockers.length > 0) {
    console.log(`blockers=${result.blockers.length}`);
  }
  if (result.warnings.length > 0) {
    console.log(`warnings=${result.warnings.length}`);
  }
}

const project = path.resolve(valueFor("--project") || process.cwd());
const projectFiles = await readProjectFiles(project);
const language = valueFor("--language") || (
  projectFiles.includes("package.json")
    ? "ts"
    : projectFiles.includes("pyproject.toml") || projectFiles.includes("requirements.txt")
      ? "python"
      : projectFiles.includes("go.mod")
        ? "go"
        : "ts"
);
const target = hasFlag("--remote") ? "remote" : hasFlag("--local") ? "local" : "unspecified";
const checks = [];

const nodeVersion = process.versions.node;
const nodeRequired = language === "ts" || language === "all";
check(
  checks,
  "node",
  atLeast(nodeVersion, "22.18.0"),
  `${nodeVersion} (SDK requires >=22.18.0)`,
  nodeRequired,
);

if (language === "cli" || language === "all") {
  const major = versionParts(nodeVersion)[0] || 0;
  const cliNodeOk = atLeast(nodeVersion, "22.12.0") || (major === 20 && atLeast(nodeVersion, "20.19.0"));
  check(checks, "browse-cli-node", cliNodeOk, `${nodeVersion} (CLI accepts ^20.19.0 or >=22.12.0)`, true);
}

if (language === "ts" || language === "cli" || language === "all") {
  const packageManager = firstCommand(["pnpm", "npm"]);
  check(
    checks,
    "node-package-manager",
    Boolean(packageManager.command),
    packageManager.command ? `${packageManager.command} ${packageManager.version}` : "pnpm/npm not found",
    true,
  );
}

if (language === "python" || language === "all") {
  const python = firstCommand(["python3", "python"]);
  check(
    checks,
    "python",
    Boolean(python.command) && atLeast(python.version, "3.11.0"),
    python.command ? `${python.command} ${python.version} (SDK requires >=3.11)` : "python3/python not found",
    true,
  );
}

if (language === "go" || language === "all") {
  const go = firstCommand(["go"]);
  check(
    checks,
    "go",
    Boolean(go.command) && atLeast(go.version, "1.26.0"),
    go.command ? `${go.command} ${go.version} (SDK requires >=1.26)` : "go not found",
    true,
  );
}

if (target === "local" || hasFlag("--local")) {
  const browserCandidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "google-chrome",
        "chromium",
      ]
    : process.platform === "win32"
      ? [
          process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe") : "",
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe") : "",
          "chrome",
          "chromium",
        ]
      : ["google-chrome", "chromium", "chromium-browser"];
  let browser = null;
  for (const candidate of browserCandidates.filter(Boolean)) {
    if (candidate.includes(path.sep) ? await exists(candidate) : run(candidate, ["--version"]).ok) {
      browser = candidate;
      break;
    }
  }
  check(checks, "local-chromium", Boolean(browser), browser || "Chrome/Chromium not found", true);
}

if (target === "remote" || hasFlag("--remote")) {
  check(
    checks,
    "browserbase-api-key",
    Boolean(process.env.BROWSERBASE_API_KEY),
    `present=${Boolean(process.env.BROWSERBASE_API_KEY)} (value not printed)`,
    true,
  );
}

if (hasFlag("--model")) {
  const modelKeyNames = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
  ];
  const present = modelKeyNames.filter((name) => Boolean(process.env[name]));
  check(
    checks,
    "model-api-key",
    present.length > 0,
    present.length > 0 ? `present=${present.join(",")} (values not printed)` : "no supported model key found",
    true,
  );
}

check(
  checks,
  "project-manifest",
  projectFiles.length > 0,
  projectFiles.length > 0 ? projectFiles.join(", ") : "no package.json, pyproject.toml, requirements.txt, or go.mod",
  Boolean(valueFor("--project")),
);

const blockers = checks.filter((item) => item.required && !item.ok);
const warnings = checks.filter((item) => !item.required && !item.ok);
const result = {
  status: blockers.length === 0 ? "ready-to-continue" : "blocked",
  target,
  language,
  project,
  host: { platform: os.platform(), arch: os.arch() },
  checks,
  blockers: blockers.map((item) => item.name),
  warnings: warnings.map((item) => item.name),
};

if (hasFlag("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

process.exitCode = blockers.length > 0 || (hasFlag("--strict") && warnings.length > 0) ? 1 : 0;
