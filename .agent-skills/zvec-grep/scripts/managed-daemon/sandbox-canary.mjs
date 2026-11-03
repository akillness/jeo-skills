// Disposable preflight objects; no real index is used for destructive probes.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, realpathSync, rmSync, rmdirSync, renameSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxUnavailableError } from "./os-sandbox.mjs";

export function createCanary() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "zvec-boundary-")));
  const existing = join(root, "existing", ".zvec-grep");
  const missing = join(root, "missing", ".zvec-grep");
  try {
    mkdirSync(existing, { recursive: true, mode: 0o700 });
    mkdirSync(missing, { recursive: true, mode: 0o700 });
    mkdirSync(join(root, "new"), { mode: 0o700 });
    mkdirSync(join(existing, "index.zvec"));
    mkdirSync(join(existing, "files.zvec"));
    writeFileSync(join(existing, "manifest.json"), "canary", { mode: 0o600 });
    const info = lstatSync(root);
    return { root, indexHomes: [existing, missing], identity: `${info.dev}:${info.ino}` };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function removeCanary(canary) {
  const info = lstatSync(canary.root);
  if (!info.isDirectory() || info.uid !== process.getuid() || `${info.dev}:${info.ino}` !== canary.identity) {
    throw new Error("refusing to remove replaced sandbox canary");
  }
  rmSync(canary.root, { recursive: true });
}

export function proveFilesystemAndExec(root) {
  const existing = join(root, "existing", ".zvec-grep");
  const missing = join(root, "missing", ".zvec-grep");
  const manifest = join(existing, "manifest.json");
  const original = [existing, manifest, join(existing, "index.zvec"), join(existing, "files.zvec")]
    .map((path) => { const st = lstatSync(path); return `${st.dev}:${st.ino}`; });
  const deny = (name, action) => {
    try { action(); } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") return;
      throw new SandboxUnavailableError(`${name} produced ${error.code ?? "error"}, not a sandbox denial`);
    }
    throw new SandboxUnavailableError(`${name} was not denied`);
  };
  deny("new index home", () => mkdirSync(join(root, "new", ".zvec-grep"), { recursive: true }));
  deny("remove index home", () => rmdirSync(missing));
  deny("rename index home", () => renameSync(existing, join(root, "existing", "moved")));
  for (const name of ["index.zvec", "files.zvec"]) {
    deny(`create ${name}`, () => mkdirSync(join(missing, name)));
    deny(`remove ${name}`, () => rmdirSync(join(existing, name)));
    deny(`rename ${name}`, () => renameSync(join(existing, name), join(existing, `${name}.moved`)));
  }
  const replacement = join(existing, "replacement-canary");
  mkdirSync(replacement);
  deny("replace native store", () => renameSync(replacement, join(existing, "index.zvec")));
  rmSync(replacement, { recursive: true });
  const replacementManifest = join(existing, "replacement-manifest-canary");
  writeFileSync(replacementManifest, "replacement", { flag: "wx" });
  deny("replace manifest", () => renameSync(replacementManifest, manifest));
  unlinkSync(replacementManifest);
  deny("create manifest", () => writeFileSync(join(missing, "manifest.json"), "bad", { flag: "wx" }));
  deny("remove manifest", () => unlinkSync(manifest));
  deny("rename manifest", () => renameSync(manifest, join(existing, "manifest.moved")));
  writeFileSync(manifest, "canary");
  const after = [existing, manifest, join(existing, "index.zvec"), join(existing, "files.zvec")]
    .map((path) => { const st = lstatSync(path); return `${st.dev}:${st.ino}`; });
  if (original.some((value, index) => value !== after[index]) || readFileSync(manifest, "utf8") !== "canary") {
    throw new SandboxUnavailableError("sandbox canary identity or contents changed");
  }
  const internal = join(existing, "index.zvec", "update-canary");
  writeFileSync(internal, "updated", { flag: "wx" });
  if (readFileSync(internal, "utf8") !== "updated") throw new SandboxUnavailableError("sandbox blocked ordinary store updates");
  unlinkSync(internal);
  const exec = spawnSync("/usr/bin/true", [], { stdio: "ignore" });
  if (!["EPERM", "EACCES"].includes(exec.error?.code)) {
    throw new SandboxUnavailableError("sandbox did not deny unapproved exec");
  }
}
