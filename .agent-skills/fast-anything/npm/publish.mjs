// Publishes the npm packages from release binaries:
//   node npm/publish.mjs <version> <dir with bin-<rust target>/fast-anything[.exe]> [--dry-run]
// One package per platform (@el4cteo/fast-anything-<os>-<cpu>) plus the @el4cteo/fast-anything launcher.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [version, dist, flag] = process.argv.slice(2);
if (!version || !dist) throw new Error("usage: node npm/publish.mjs <version> <dist> [--dry-run]");
const dry = flag === "--dry-run";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.join(root, "target", "npm");
rmSync(out, { recursive: true, force: true });

const TARGETS = {
  "x86_64-pc-windows-msvc": ["win32", "x64"],
  "x86_64-unknown-linux-gnu": ["linux", "x64"],
  "aarch64-unknown-linux-gnu": ["linux", "arm64"],
  "aarch64-apple-darwin": ["darwin", "arm64"],
  "x86_64-apple-darwin": ["darwin", "x64"],
};
const main = JSON.parse(readFileSync(path.join(here, "fast-anything", "package.json"), "utf8"));
const publish = (dir) => {
  const provenance = process.env.GITHUB_ACTIONS ? ["--provenance"] : [];
  const args = ["publish", "--access", "public", ...(dry ? ["--dry-run"] : provenance)];
  execFileSync("npm", args, { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
};

for (const [target, [os, cpu]] of Object.entries(TARGETS)) {
  const exe = os === "win32" ? "fast-anything.exe" : "fast-anything";
  const src = path.join(dist, `bin-${target}`, exe);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  const name = `@el4cteo/fast-anything-${os}-${cpu}`;
  const dir = path.join(out, `fast-anything-${os}-${cpu}`);
  mkdirSync(path.join(dir, "bin"), { recursive: true });
  copyFileSync(src, path.join(dir, "bin", exe));
  chmodSync(path.join(dir, "bin", exe), 0o755);
  const pkg = {
    name,
    version,
    description: `The ${os}-${cpu} binary for fast-anything.`,
    repository: main.repository,
    license: "MIT",
    os: [os],
    cpu: [cpu],
    ...(os === "linux" ? { libc: ["glibc"] } : {}),
    files: ["bin"],
  };
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  publish(dir);
}

const dir = path.join(out, "fast-anything");
mkdirSync(path.join(dir, "bin"), { recursive: true });
copyFileSync(path.join(here, "fast-anything", "bin", "fast-anything.js"), path.join(dir, "bin", "fast-anything.js"));
copyFileSync(path.join(root, "README.md"), path.join(dir, "README.md"));
copyFileSync(path.join(root, "LICENSE"), path.join(dir, "LICENSE"));
main.version = version;
for (const dep of Object.keys(main.optionalDependencies)) main.optionalDependencies[dep] = version;
writeFileSync(path.join(dir, "package.json"), JSON.stringify(main, null, 2) + "\n");
publish(dir);
