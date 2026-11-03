// Locates the installed @zvec/zvec-grep package and imports its internal
// modules by file URL. The package `exports` map only exposes the root entry,
// so deep imports go through absolute file URLs; the version is pinned and a
// mismatch fails closed because the managed daemon depends on internals.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const PACKAGE_NAME = "@zvec/zvec-grep";
export const SUPPORTED_VERSION = "0.2.2";

export function locatePackageDirs(env = process.env) {
  const candidates = [];
  if (env.ZVEC_GREP_PACKAGE_DIR) {
    candidates.push(resolve(env.ZVEC_GREP_PACKAGE_DIR));
  }
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    // A relative PATH entry would make the loaded code depend on the cwd.
    if (!directory || !isAbsolute(directory)) continue;
    const executable = join(directory, "zg");
    if (!existsSync(executable)) continue;
    try {
      // <pkg>/dist/cli/index.js -> <pkg>
      candidates.push(dirname(dirname(dirname(realpathSync(executable)))));
    } catch {
      // Broken symlink: try the next PATH entry.
    }
  }
  const found = [];
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8"));
      if (manifest.name === PACKAGE_NAME) found.push({ dir: realpathSync(candidate), version: manifest.version });
    } catch {
      // Not a package directory.
    }
  }
  return found;
}

export function loadPackage(env = process.env) {
  const found = locatePackageDirs(env);
  const match = found.find((candidate) => candidate.version === SUPPORTED_VERSION);
  if (!match) {
    throw new Error(
      found.length === 0
        ? `${PACKAGE_NAME}@${SUPPORTED_VERSION} not found; set ZVEC_GREP_PACKAGE_DIR or put zg on PATH`
        : `managed daemon supports ${PACKAGE_NAME}@${SUPPORTED_VERSION} only; found ${found.map((candidate) => candidate.version).join(", ")}`,
    );
  }
  const { dir } = match;
  const manifest = { version: match.version };
  const requireFromPackage = createRequire(join(dir, "package.json"));
  return {
    dir,
    version: manifest.version,
    distUrl: (relative) => pathToFileURL(join(dir, "dist", relative)).href,
    importInternal: (relative) => import(pathToFileURL(join(dir, "dist", relative)).href),
    requireFromPackage,
  };
}
